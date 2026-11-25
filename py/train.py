# train.py — the distillation: a LoRA fine-tune of the model on one file of training examples, and nothing else. Every
# example in that file was built and verified by src/trace.mjs; this script trains on exactly the file it is given and
# writes down the file's hash, so the claim "only verified traces trained it" can be checked against the record.
# The loss is taken on the reply only (the conversation before it is not learned). The opening every example shares
# is worked out once a step and shared by the batch; a check at the start shows that gives the same loss as working
# each example out whole.
#   python py/train.py <model dir> <train.jsonl> <out dir> <settings.json> [adopted adapter dir ...]
import hashlib, json, math, os, sys, time
import torch
from peft import LoraConfig, get_peft_model
from llm import LLM, render, sha256_file, PAD_ID

model_dir, train_path, out_dir, settings_path = sys.argv[1:5]
adopted = sys.argv[5:]
S = json.load(open(settings_path, encoding="utf-8"))["train"]
EOT = 128009
torch.manual_seed(int(S["seed"]))

raw = open(train_path, "rb").read()
examples = [json.loads(l) for l in raw.decode("utf-8").split("\n") if l.strip()]
llm = LLM(model_dir, adopted)
tok = llm.tok
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

model = get_peft_model(llm.model, LoraConfig(r=int(S["rank"]), lora_alpha=int(S["alpha"]), target_modules=list(S["targets"]), lora_dropout=0.0, task_type="CAUSAL_LM"))
model.train()
params = [p for p in model.parameters() if p.requires_grad]
B, ACC = int(S["batch"]) // 2, 2                      # two half-batches a step: the same step, in half the memory
steps_per_epoch = math.ceil(len(rows) / (B * ACC))
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


def loss_shared(batch):
    ids, mask, labels = batch_tensors(batch)
    n = len(batch)
    past = model(input_ids=prefix, use_cache=True).past_key_values
    past.batch_repeat_interleave(n)
    full_mask = torch.cat([torch.ones((n, P), dtype=torch.long), mask], dim=1)
    pos = (P + torch.arange(ids.shape[1])).unsqueeze(0).expand(n, -1)
    return model(input_ids=ids, attention_mask=full_mask, position_ids=pos, past_key_values=past, labels=labels).loss


def loss_whole(batch):
    ids, mask, labels = batch_tensors(batch)
    n = len(batch)
    pre = prefix.expand(n, -1)
    return model(input_ids=torch.cat([pre, ids], dim=1), attention_mask=torch.cat([torch.ones((n, P), dtype=torch.long), mask], dim=1), labels=torch.cat([torch.full((n, P), -100, dtype=torch.long), labels], dim=1)).loss


with torch.no_grad():
    a, b = float(loss_shared(rows[:2])), float(loss_whole(rows[:2]))
print(f"{len(rows)} examples, shared opening {P} tokens, {total_steps} steps; loss check: shared {a:.5f} whole {b:.5f}", flush=True)
assert abs(a - b) < 1e-3, "the shared-opening loss is not the whole-example loss"

log = {"v": "the-distillation-train/1", "model": os.path.basename(model_dir.rstrip("/\\")), "weightsSha256": sha256_file(os.path.join(model_dir, "model.safetensors")),
       "standsOn": [sha256_file(os.path.join(a_, "adapter_model.safetensors")) for a_ in adopted], "trainFileSha256": hashlib.sha256(raw).hexdigest(), "examples": len(rows),
       "replyTokens": sum(len(t) for _, t in rows), "settings": S, "sharedOpeningTokens": P, "lossCheck": {"shared": a, "whole": b}, "steps": [], "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
g = torch.Generator().manual_seed(int(S["seed"]))
t0, step = time.time(), 0
for epoch in range(int(S["epochs"])):
    order = torch.randperm(len(rows), generator=g).tolist()
    for i in range(0, len(order), B * ACC):
        chunk = [rows[j] for j in order[i: i + B * ACC]]
        halves = [chunk[:B], chunk[B:]] if len(chunk) > B else [chunk]
        total = 0.0
        for half in halves:
            loss = loss_shared(half) * (len(half) / len(chunk))
            loss.backward()
            total += float(loss)
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
