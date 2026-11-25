# serve.py — the model behind a local door, for the harvest. The sealed Crystal engine (JavaScript) asks one cell at a
# time per problem; several problems are grown side by side, and the calls waiting at the same moment are answered in
# one batch. Listens on 127.0.0.1 only. It answers a conversation with the model's greedy reply and decides nothing.
#   python py/serve.py <model dir> [port] [adapter dir ...]
#   POST /ask   {"messages": [...], "max_tokens": 24}  →  {"text", "ms", "prompt", "reply", "cut"}
#   GET  /info  →  what is loaded (model folder, weights sha256, each merged adapter's sha256 in order, calls answered)
import json, queue, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from llm import LLM, sha256_file

model_dir = sys.argv[1]
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8850
adapters = sys.argv[3:]
BATCH, WINDOW = 16, 0.08

llm = LLM(model_dir, adapters)
info = {"model": model_dir.replace("\\", "/").rstrip("/").split("/")[-1], "weights_sha256": sha256_file(f"{model_dir}/model.safetensors"), "adapters": [sha256_file(f"{a}/adapter_model.safetensors") for a in adapters], "calls": 0, "batches": 0}
jobs = queue.Queue()


def worker():
    while True:
        first = jobs.get()
        batch, deadline = [first], time.time() + WINDOW
        while len(batch) < BATCH:
            try:
                batch.append(jobs.get(timeout=max(0.0, deadline - time.time())))
            except queue.Empty:
                break
        # one batch shares one token limit: calls with another limit go back to the queue
        same = [j for j in batch if j["max"] == first["max"]]
        for j in batch:
            if j["max"] != first["max"]:
                jobs.put(j)
        t0 = time.time()
        try:
            outs = llm.generate([j["messages"] for j in same], first["max"], keep=True)   # a problem's conversation only grows: keep it
        except Exception as e:                      # a failed batch answers every caller with the error, never hangs them
            outs = [{"error": str(e)} for _ in same]
        ms = (time.time() - t0) * 1000.0
        info["calls"] += len(same); info["batches"] += 1; info["tokens_taken_over"], info["tokens_worked_out"] = llm.reused, llm.worked
        for j, o in zip(same, outs):
            j["out"] = {"text": o.get("text", ""), "ms": ms / len(same), "prompt": o.get("prompt"), "reply": o.get("tokens"), "cut": o.get("cut", False), **({"error": o["error"]} if "error" in o else {})}
            j["done"].set()


class Door(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"               # connections are kept open; every reply carries its length

    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        self._send(200, info) if self.path == "/info" else self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/ask":
            return self._send(404, {"error": "not found"})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))).decode("utf-8"))
            job = {"messages": req["messages"], "max": int(req.get("max_tokens", 24)), "done": threading.Event()}
        except Exception as e:
            return self._send(400, {"error": str(e)})
        jobs.put(job); job["done"].wait()
        self._send(500 if "error" in job["out"] else 200, job["out"])


threading.Thread(target=worker, daemon=True).start()
print(f"serving {info['model']} (+{len(adapters)} adapters) on http://127.0.0.1:{port}  weights {info['weights_sha256'][:12]}", flush=True)
ThreadingHTTPServer.request_queue_size = 128      # many problems knock at once; the stock queue holds five
ThreadingHTTPServer(("127.0.0.1", port), Door).serve_forever()
