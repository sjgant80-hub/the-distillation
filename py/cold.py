# cold.py — the cold test's model work: one greedy reply to each conversation, with no climb and no checker. It writes
# down every reply; src/cold.mjs reads them. Run once for the base and once for the distilled model, on the same file.
# A stopped run carries on from what it has written.
#   python py/cold.py <model dir> <asks.json> <out.json> <max tokens> <batch> [adapter dir ...]
import json, os, sys, time
from llm import LLM, sha256_file

model_dir, asks_path, out_path, max_tokens, batch = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
adapters = sys.argv[6:]
asks = json.load(open(asks_path, encoding="utf-8"))
ident = {"model": os.path.basename(model_dir.rstrip("/\\")), "weightsSha256": sha256_file(os.path.join(model_dir, "model.safetensors")),
         "adapters": [sha256_file(os.path.join(a, "adapter_model.safetensors")) for a in adapters], "maxTokens": max_tokens, "batch": batch}
out = {"v": "the-distillation-cold/1", **ident, "seconds": 0, "rows": []}
if os.path.exists(out_path):
    prior = json.load(open(out_path, encoding="utf-8"))
    if all(prior.get(k) == v for k, v in ident.items()):
        out = prior
done = {r["id"] for r in out["rows"]}
todo = [a for a in asks if a["id"] not in done]
print(f"{len(asks)} conversations, {len(done)} answered already, {len(todo)} to answer", flush=True)
llm = LLM(model_dir, adapters)
t0, base = time.time(), out["seconds"]
for i in range(0, len(todo), batch):
    chunk = todo[i: i + batch]
    t1 = time.time()
    replies = llm.generate([c["messages"] for c in chunk], max_tokens)
    ms = (time.time() - t1) * 1000.0 / len(chunk)
    for c, r in zip(chunk, replies):
        out["rows"].append({"id": c["id"], "text": r["text"], "tokens": r["tokens"], "prompt": r["prompt"], "cut": r["cut"], "ms": round(ms)})
    out["seconds"] = base + round(time.time() - t0)
    json.dump(out, open(out_path, "w", encoding="utf-8", newline="\n"))
    print(f"{len(out['rows'])} of {len(asks)} · {out['seconds']} s", flush=True)
order = {a["id"]: n for n, a in enumerate(asks)}
out["rows"].sort(key=lambda r: order[r["id"]])
out["complete"] = len(out["rows"]) == len(asks)
json.dump(out, open(out_path, "w", encoding="utf-8", newline="\n"))
print(f"done: {len(out['rows'])} replies in {out['seconds']} s", flush=True)
