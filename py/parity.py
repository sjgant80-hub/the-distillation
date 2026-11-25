# parity.py — the batched generation (right-padded, kept work taken over) against the library's own one-at-a-time
# generation, on the same conversations. They must write the same replies. Three kinds: single cells, cold one-tries,
# and whole problems grown call by call the way the harvest asks them (each round one call from every problem, the
# conversations kept between rounds).
#   python py/parity.py <model dir> <convos.json> [cells] [cold] [grown problems]
import importlib, json, os, sys, time
LLM = importlib.import_module(os.environ.get("LLM_MODULE", "llm")).LLM   # the module under test (the sealed one unless another is named)

model_dir, path = sys.argv[1], sys.argv[2]
n_cells, n_cold = int(sys.argv[3]) if len(sys.argv) > 3 else 24, int(sys.argv[4]) if len(sys.argv) > 4 else 8
n_grown = int(sys.argv[5]) if len(sys.argv) > 5 else 12
data = json.load(open(path, encoding="utf-8"))
llm = LLM(model_dir)
report = {}
for kind, rows, batch in (("cells", data["cells"][:n_cells], 8), ("cold", data["cold"][:n_cold], 8)):
    t0 = time.time(); plain = [llm.generate_plain(r["messages"], r["max"]) for r in rows]; t_plain = time.time() - t0
    t0 = time.time(); batched = []
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        batched += llm.generate([r["messages"] for r in chunk], chunk[0]["max"])
    t_batch = time.time() - t0
    same = sum(1 for a, b in zip(plain, batched) if a["text"] == b["text"] and a["cut"] == b["cut"])
    diff = [(r["id"], a["text"][:80], b["text"][:80]) for r, a, b in zip(rows, plain, batched) if a["text"] != b["text"]][:4]
    report[kind] = {"n": len(rows), "same": same, "plain_s": round(t_plain, 1), "batched_s": round(t_batch, 1), "plain_per": round(t_plain / len(rows), 2), "batched_per": round(t_batch / len(rows), 2), "first_differences": diff, "sample": [b["text"][:70] for b in batched[:3]]}
    print(kind, json.dumps(report[kind], ensure_ascii=False), flush=True)

problems = data.get("grown", [])[:n_grown]
if problems:
    rounds = max(len(p["calls"]) for p in problems)
    same = n = 0; t_plain = t_batch = 0.0; diff = []
    r0, w0 = llm.reused, llm.worked
    for r in range(rounds):
        rows = [(p["id"], p["calls"][r]) for p in problems if r < len(p["calls"])]
        t0 = time.time(); batched = llm.generate([m for _, m in rows], 24, keep=True); t_batch += time.time() - t0
        t0 = time.time(); plain = [llm.generate_plain(m, 24) for _, m in rows]; t_plain += time.time() - t0
        for (pid, _), a, b in zip(rows, plain, batched):
            n += 1; ok = a["text"] == b["text"] and a["cut"] == b["cut"]; same += ok
            if not ok and len(diff) < 4:
                diff.append((pid, r, a["text"][:80], b["text"][:80]))
    reused, worked = llm.reused - r0, llm.worked - w0
    print("grown", json.dumps({"problems": len(problems), "rounds": rounds, "n": n, "same": same, "plain_per": round(t_plain / n, 2), "batched_per": round(t_batch / n, 2), "tokens_taken_over": reused, "tokens_worked_out": worked, "kept": len(llm._kept), "kept_tokens": sum(e["ids"].shape[0] for e in llm._kept), "first_differences": diff}, ensure_ascii=False), flush=True)
