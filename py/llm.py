# llm.py — the model, and nothing else: load it (with any adopted adapters merged in), render a conversation in the
# plain Llama-3 format the browser tab used (no date line: the stock template writes today's date into every prompt),
# and generate greedily, several conversations at once. No decision is made here: every reply is judged by the
# mutation-gated kernels in src/, from the records.
#
# Generation is batched, and work already done is kept: the part every conversation of a batch shares (the system line
# and the worked examples) is worked out once, and — for the harvest, where each problem's conversation only grows — a
# conversation worked out for one call is kept, so the next call for that problem works out only its new turn. A row
# takes over the kept work for as many opening tokens as it shares, exactly; the rest is padded on the RIGHT and masked.
# A conversation whose reply has ended leaves the batch, so no work is spent on it while the others finish.
# Attention is causal, so a real token never sees padding, and each token is given the position its own conversation
# has reached. py/parity.py checks all of this against the library's plain one-at-a-time generation.
import hashlib
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, DynamicCache

STOP_IDS = (128001, 128008, 128009)          # end_of_text, eom_id, eot_id: the tab's own stop tokens
PAD_ID = 128004                               # <|finetune_right_pad_id|>, never attended to


def render(messages, generation_prompt=True):
    """the conversation as one string: begin_of_text, then each turn, then (to ask for a reply) an open assistant turn"""
    out = ["<|begin_of_text|>"]
    for m in messages:
        out.append(f"<|start_header_id|>{m['role']}<|end_header_id|>\n\n{m['content']}<|eot_id|>")
    if generation_prompt:
        out.append("<|start_header_id|>assistant<|end_header_id|>\n\n")
    return "".join(out)


def sha256_file(path, chunk=1 << 22):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(chunk), b""):
            h.update(b)
    return h.hexdigest()


class LLM:
    def __init__(self, model_dir, adapters=(), threads=None, kept_tokens=12000):
        if threads:
            torch.set_num_threads(int(threads))
        torch.manual_seed(0)
        self.tok = AutoTokenizer.from_pretrained(model_dir)
        model = AutoModelForCausalLM.from_pretrained(model_dir, dtype=torch.float32)
        for a in adapters:                       # each adopted round's adapter, merged in the order it was adopted
            from peft import PeftModel
            model = PeftModel.from_pretrained(model, a).merge_and_unload()
        self.model = model.eval()
        self.model_dir, self.adapters = model_dir, list(adapters)
        c = self.model.config
        self._shape = (c.num_hidden_layers, c.num_key_value_heads, c.hidden_size // c.num_attention_heads)
        self._kept = []                          # conversations already worked out, the most recently used last
        self._kept_cap = int(kept_tokens)        # ...and how many tokens of them may be held (about 65 KB a token)
        self.reused = self.worked = 0            # tokens taken over from kept work, and tokens worked out afresh

    def ids(self, text):
        return self.tok(text, add_special_tokens=False)["input_ids"]

    @staticmethod
    def _shared(a, b):
        """how many opening tokens two token sequences share"""
        n = min(a.shape[0], b.shape[0])
        d = (a[:n] != b[:n]).nonzero()
        return int(d[0, 0]) if d.shape[0] else n

    def _best(self, s):
        """the kept conversation sharing the longest opening with s → (it or None, tokens shared); a tie goes to the newest"""
        best, n = None, 0
        for e in self._kept:
            m = self._shared(e["ids"], s)
            if m > 0 and m >= n:
                best, n = e, m
        return best, n

    def _keep(self, ids, kv):
        self._kept.append({"ids": ids, "kv": kv})
        total = sum(e["ids"].shape[0] for e in self._kept)
        while len(self._kept) > 1 and total > self._kept_cap:
            total -= self._kept.pop(0)["ids"].shape[0]

    def _drop(self, e):
        self._kept = [k for k in self._kept if k is not e]

    def _forward(self, seqs):
        """work out a batch of token sequences, each from the kept conversation it shares most with → (output, layout)"""
        B, (layers, heads, dim) = len(seqs), self._shape
        found = [self._best(s) for s in seqs]
        took = [min(n, s.shape[0] - 1) for (_, n), s in zip(found, seqs)]   # every row works out at least its last token
        P = max(took)
        lens = torch.tensor([s.shape[0] - n for s, n in zip(seqs, took)])
        L = int(lens.max())
        ids = torch.full((B, L), PAD_ID, dtype=torch.long)
        mask = torch.zeros((B, P + L), dtype=torch.long)
        for i, s in enumerate(seqs):
            ids[i, : int(lens[i])] = s[took[i]:]
            mask[i, : took[i]] = 1
            mask[i, P: P + int(lens[i])] = 1
        pos = torch.tensor(took).unsqueeze(1) + torch.arange(L).unsqueeze(0)
        past = None
        if P > 0:
            data = []
            for l in range(layers):
                K, V = torch.zeros((B, heads, P, dim)), torch.zeros((B, heads, P, dim))
                for i, (e, _) in enumerate(found):
                    if took[i] > 0:
                        K[i, :, : took[i]] = e["kv"][l][0][:, : took[i]]
                        V[i, :, : took[i]] = e["kv"][l][1][:, : took[i]]
                data.append((K, V))
            past = DynamicCache(ddp_cache_data=data)
        for e, n in found:                       # what was used is the most recently used
            if e is not None and any(k is e for k in self._kept):
                self._drop(e); self._kept.append(e)
        self.reused += sum(took); self.worked += int(lens.sum())
        out = self.model(input_ids=ids, attention_mask=mask, position_ids=pos, past_key_values=past, use_cache=True)
        return out, {"found": found, "took": took, "P": P, "lens": lens, "L": L, "mask": mask}

    @staticmethod
    def _row(past, i, took, P, n, L, g):
        """one row's own work out of a batch cache: what it took over, n tokens of its own, and g tokens it then wrote"""
        cut = lambda t: torch.cat([t[i, :, :took], t[i, :, P: P + n], t[i, :, P + L: P + L + g]], dim=1)
        return [(cut(layer.keys), cut(layer.values)) for layer in past.layers]

    @torch.no_grad()
    def generate(self, conversations, max_new_tokens, keep=False):
        """conversations: a list of message lists. → [{text, tokens, prompt, cut}], greedy, one reply each.
        keep=True also keeps each conversation as worked out (with its reply), for the call that carries it on."""
        seqs = [torch.tensor(self.ids(render(m)), dtype=torch.long) for m in conversations]
        B = len(seqs)
        if B > 1:
            # the opening they all share, cut back to the end of a whole turn: if any row would have to work part of
            # it out, it is worked out once, alone, and kept, so that no row works it out again
            S = min(min(s.shape[0] for s in seqs) - 1, min(self._shared(seqs[0], s) for s in seqs[1:]))
            while S > 0 and int(seqs[0][S - 1]) != 128009:
                S -= 1
            if S > 0 and min(self._best(s)[1] for s in seqs) < S:
                o, lay = self._forward([seqs[0][:S]])
                self._keep(seqs[0][:S].clone(), self._row(o.past_key_values, 0, lay["took"][0], lay["P"], int(lay["lens"][0]), lay["L"], 0))
        out, lay = self._forward(seqs)
        took, P, lens, L, mask = lay["took"], lay["P"], lay["lens"], lay["L"], lay["mask"]
        base = torch.tensor(took) + lens
        nxt = out.logits[torch.arange(B), lens - 1].argmax(dim=-1)
        past = out.past_key_values
        done = [False] * B
        written = [[] for _ in range(B)]
        kept = {}                                # row → its own work, taken the moment it stops writing
        stop = torch.tensor(STOP_IDS)
        rows = list(range(B))                    # the conversations still being written, in batch order
        for step in range(max_new_tokens):
            hit = torch.isin(nxt, stop).tolist()
            for j, i in enumerate(rows):
                if hit[j]:
                    done[i] = True
                else:
                    written[i].append(int(nxt[j]))
            last = step == max_new_tokens - 1
            if keep:
                # a row that has stopped has had every token it wrote fed back; a row cut off at the limit has not
                # had its last one. Either way, what is worked out is taken before the row leaves the batch.
                for j, i in enumerate(rows):
                    if hit[j] or last:
                        g = len(written[i]) - (0 if hit[j] else 1)
                        kept[i] = (g, self._row(past, j, took[i], P, int(lens[i]), L, g))
            stay = [j for j in range(len(rows)) if not hit[j]]
            if not stay or last:
                break
            if len(stay) < len(rows):            # a finished conversation is not worked on any further
                pick = torch.tensor(stay)
                past.batch_select_indices(pick)
                mask, base, nxt = mask[pick], base[pick], nxt[pick]
                rows = [rows[j] for j in stay]
            mask = torch.cat([mask, torch.ones((len(rows), 1), dtype=torch.long)], dim=1)
            out = self.model(input_ids=nxt.unsqueeze(1), attention_mask=mask, position_ids=(base + step).unsqueeze(1), past_key_values=past, use_cache=True)
            past = out.past_key_values
            nxt = out.logits[:, -1].argmax(dim=-1)
        if keep:
            for i in range(B):
                g, kv = kept[i]
                e, n = lay["found"][i]
                if e is not None and n == e["ids"].shape[0]:
                    self._drop(e)                # this conversation carries that one on whole: the older one is not needed
                self._keep(torch.cat([seqs[i], torch.tensor(written[i][:g], dtype=torch.long)]), kv)
        return [{"text": self.tok.decode(written[i], skip_special_tokens=True), "tokens": len(written[i]), "prompt": int(seqs[i].shape[0]), "cut": not done[i]} for i in range(B)]

    @torch.no_grad()
    def generate_plain(self, messages, max_new_tokens):
        """one conversation, the library's own generate: what the batched path is checked against"""
        ids = torch.tensor([self.ids(render(messages))])
        out = self.model.generate(input_ids=ids, attention_mask=torch.ones_like(ids), max_new_tokens=max_new_tokens, do_sample=False, eos_token_id=list(STOP_IDS), pad_token_id=PAD_ID)
        new = out[0][ids.shape[1]:].tolist()
        cut = not (len(new) > 0 and new[-1] in STOP_IDS)
        new = [t for t in new if t not in STOP_IDS]
        return {"text": self.tok.decode(new, skip_special_tokens=True), "tokens": len(new), "prompt": ids.shape[1], "cut": cut}
