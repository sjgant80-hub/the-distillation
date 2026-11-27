# train.py — the distillation: a LoRA fine-tune of the model on one file of training examples, and nothing else. Every
# example in that file was built and verified by src/trace.mjs; this script trains on exactly the file it is given and
# writes down the file's hash, so the claim "only verified traces trained it" can be checked against the record.
#
# The loss is taken on the reply only (the conversation before it is not learned). Two things make a step cheaper
# without changing what is learned from it, and both are checked before training starts:
#   · the opening every example shares (the system line and the worked examples) is worked out once a step. What each
#     half of the batch asks of it is added up and passed back through it once. The check: the loss and every
#     gradient are those of working each example out whole.
#   · examples of like length are batched together, so little of a batch is padding. Which examples meet in a batch
#     is still drawn from the seed: the examples are shuffled, cut into blocks, and only then sorted inside a block.
#   python py/train.py <model dir> <train.jsonl> <out dir> <settings.json> [adopted adapter dir ...]
import faulthandler, hashlib, json, math, os, sys, time
faulthandler.enable()                                  # if the process is brought down from below Python, say where it was
import torch
from peft import LoraConfig, get_peft_model
from transformers import DynamicCache
from llm import LLM, render, sha256_file, PAD_ID

model_dir, train_path, out_dir, settings_path = sys.argv[1:5]
adopted = sys.argv[5:]
S = json.load(open(settings_path, encoding="utf-8"))["train"]
EOT = 128009
BLOCK = 8                                             # batches to a block: examples are sorted by length inside one
torch.manual_seed(int(S["seed"]))

raw = open(train_path, "rb").read()
examples = [json.loads(l) for l in raw.decode("utf-8").split("\n") if l.strip()]
llm = LLM(model_dir, adopted)
rows = []
for ex in examples:
    prompt = llm.ids(render(ex["messages"]))
    target = llm.ids(ex["reply"]) + [EOT]
    rows.append((prompt, target))
# the opening all examples share, cut back to the end of a whole turn
P = min(len(p) for p, _ in rows) - 1
for i in range(P):
    if any(p[i] != rows[0][0][i] for p, _ in rows):
        P = i
        break
while P > 0 and rows[0][0][P - 1] != EOT:
    P -= 1
prefix = torch.tensor([rows[0][0][:P]])
own = [len(p) - P + len(t) for p, t in rows]          # each example's own tokens, past the shared opening

model = get_peft_model(llm.model, LoraConfig(r=int(S["rank"]), lora_alpha=int(S["alpha"]), target_modules=list(S["targets"]), lora_dropout=0.0, task_type="CAUSAL_LM"))
model.train()
params = [p for p in model.parameters() if p.requires_grad]
BATCH = int(S["batch"])
HALF = BATCH // 2                                     # two half-batches a step: the same step, in half the memory
steps_per_epoch = math.ceil(len(rows) / BATCH)
total_steps = steps_per_epoch * int(S["epochs"])
opt = torch.optim.AdamW(params, lr=float(S["learningRate"]), weight_decay=0.0)
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: max(0.1, 1.0 - s / max(1, total_steps)))


def batch_tensors(batch):
    tails = [p[P:] + t for p, t in batch]
    L = max(len(x) for x in tails)
    ids = torch.full((len(batch), L), PAD_ID, dtype=torch.long)
    mask = torch.zeros((len(batch), L), dtype=torch.long)
    labels = torch.full((len(batch), L), -100, dtype=torch.long)
    for i, (p, t) in enumerate(batch):
        n_prompt = len(p) - P
        ids[i, : len(tails[i])] = torch.tensor(tails[i])
        mask[i, : len(tails[i])] = 1
        labels[i, n_prompt: len(tails[i])] = torch.tensor(t)
    return ids, mask, labels


def halves_of(chunk):
    return [chunk[:HALF], chunk[HALF:]] if len(chunk) > HALF else [chunk]


def backward_shared(chunk):
    """one step's loss, with its gradients left on the parameters: the opening worked out once"""
    out = model(input_ids=prefix, use_cache=True)
    made = [(layer.keys, layer.values) for layer in out.past_key_values.layers]
    held = [(k.detach().requires_grad_(True), v.detach().requires_grad_(True)) for k, v in made]
    total = 0.0
    for half in halves_of(chunk):
        ids, mask, labels = batch_tensors(half)
        n = len(half)
        past = DynamicCache(ddp_cache_data=[(k.expand(n, -1, -1, -1), v.expand(n, -1, -1, -1)) for k, v in held])
        full_mask = torch.cat([torch.ones((n, P), dtype=torch.long), mask], dim=1)
        pos = (P + torch.arange(ids.shape[1])).unsqueeze(0).expand(n, -1)
        loss = model(input_ids=ids, attention_mask=full_mask, position_ids=pos, past_key_values=past, labels=labels).loss * (n / len(chunk))
        loss.backward()                               # onto the parameters, and onto the held opening
        total += float(loss)
    # what the halves asked of the opening, passed back through it once
    torch.autograd.backward([t for kv in made for t in kv], grad_tensors=[t.grad for kv in held for t in kv])
    return total


def backward_whole(chunk):
    """the same step with nothing shared: every example worked out whole. Only the check uses it."""
    total = 0.0
    for half in halves_of(chunk):
        ids, mask, labels = batch_tensors(half)
        n = len(half)
        pre = prefix.expand(n, -1)
        loss = model(input_ids=torch.cat([pre, ids], dim=1), attention_mask=torch.cat([torch.ones((n, P), dtype=torch.long), mask], dim=1), labels=torch.cat([torch.full((n, P), -100, dtype=torch.long), labels], dim=1)).loss * (n / len(chunk))
        loss.backward()
        total += float(loss)
    return total


def batches(order):
    """a shuffled order of examples → the epoch's batches: blocks of the order, each sorted by length and cut up, then the batches shuffled"""
    out = []
    for i in range(0, len(order), BATCH * BLOCK):
        block = sorted(order[i: i + BATCH * BLOCK], key=lambda j: (own[j], j))
        out += [block[b: b + BATCH] for b in range(0, len(block), BATCH)]
    return [out[i] for i in torch.randperm(len(out), generator=g).tolist()]


# the check, on the first batch the training will see, before anything is learned. LoRA starts with one of its two
# matrices at nought, so the other has no gradient yet; the first is nudged so that every parameter has one to compare.
g = torch.Generator().manual_seed(int(S["seed"]))
first = [rows[j] for j in batches(torch.randperm(len(rows), generator=g).tolist())[0]]
g = torch.Generator().manual_seed(int(S["seed"]))    # the training itself begins from the seed, as if no check had run
state = [p.detach().clone() for p in params]
with torch.no_grad():
    for p in params:
        p.add_(0.01 * torch.randn(p.shape, generator=torch.Generator().manual_seed(7)))
a = backward_shared(first); ga = [p.grad.detach().clone() for p in params]; opt.zero_grad()
b = backward_whole(first); gb = [p.grad.detach().clone() for p in params]; opt.zero_grad()
with torch.no_grad():
    for p, s in zip(params, state):
        p.copy_(s)
worst = max(float((x - y).abs().max()) for x, y in zip(ga, gb)); largest = max(float(y.abs().max()) for y in gb)
print(f"{len(rows)} examples, shared opening {P} tokens, {total_steps} steps; check: loss shared {a:.6f} whole {b:.6f}; largest gradient {largest:.3e}, largest difference {worst:.3e}", flush=True)
assert abs(a - b) < 1e-4 and worst < 1e-3 * largest and largest > 0, "working the opening out once does not give the loss and gradients of working each example out whole"
del ga, gb, state

log = {"v": "the-distillation-train/1", "model": os.path.basename(model_dir.rstrip("/\\")), "weightsSha256": sha256_file(os.path.join(model_dir, "model.safetensors")),
       "standsOn": [sha256_file(os.path.join(a_, "adapter_model.safetensors")) for a_ in adopted], "trainFileSha256": hashlib.sha256(raw).hexdigest(), "examples": len(rows),
       "replyTokens": sum(len(t) for _, t in rows), "settings": S, "sharedOpeningTokens": P, "check": {"lossShared": a, "lossWhole": b, "largestGradient": largest, "largestDifference": worst}, "steps": [], "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
t0, step = time.time(), 0
for epoch in range(int(S["epochs"])):
    for batch in batches(torch.randperm(len(rows), generator=g).tolist()):
        total = backward_shared([rows[j] for j in batch])
        torch.nn.utils.clip_grad_norm_(params, 1.0)
        opt.step(); sched.step(); opt.zero_grad()
        step += 1
        log["steps"].append({"epoch": epoch, "step": step, "loss": round(total, 5), "seconds": round(time.time() - t0)})
        print(f"epoch {epoch} step {step}/{total_steps} loss {total:.4f} elapsed {time.time() - t0:.0f} s", flush=True)

os.makedirs(out_dir, exist_ok=True)
model.save_pretrained(out_dir)
log["seconds"] = round(time.time() - t0)
log["adapterSha256"] = sha256_file(os.path.join(out_dir, "adapter_model.safetensors"))
log["adapterBytes"] = os.path.getsize(os.path.join(out_dir, "adapter_model.safetensors"))
log["finished"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
json.dump(log, open(os.path.join(out_dir, "train-log.json"), "w", encoding="utf-8", newline="\n"), indent=1)
print(f"saved {out_dir}: adapter {log['adapterSha256'][:12]} {log['adapterBytes']} bytes, {log['seconds']} s", flush=True)
