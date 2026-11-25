# verify_weights.py — are these Llama-3.2-1B weights the model they say they are? The file's SHA-256 is not the one
# its maker lists (the public copy it came from was saved again by whoever mirrored it), so that comparison fails and
# proves nothing either way. This is the check that was done instead: read a SEPARATE copy of the same model (Ollama's
# own 8-bit build, made independently from the maker's weights) tensor by tensor, and check that every weight of this
# file lies within 8-bit rounding of it. Other weights (another fine-tune, a tampered file) would miss by hundreds of
# rounding steps. It reads two local files and writes one small record.
#   python py/verify_weights.py <model.safetensors> <ollama models folder> [out.json]
import hashlib, json, os, struct, sys
import numpy as np
from safetensors import safe_open

HF = sys.argv[1]
OLLAMA = sys.argv[2]
OUT = sys.argv[3] if len(sys.argv) > 3 else None
man = json.load(open(os.path.join(OLLAMA, "manifests", "registry.ollama.ai", "library", "llama3.2", "1b")))
digest = next(l["digest"] for l in man["layers"] if l["mediaType"].endswith("image.model"))
GGUF = os.path.join(OLLAMA, "blobs", digest.replace(":", "-"))
print("ollama blob", os.path.getsize(GGUF), "bytes", digest)

f = open(GGUF, "rb")
rd = lambda fmt: struct.unpack("<" + fmt, f.read(struct.calcsize("<" + fmt)))[0]
def rstr(): n = rd("Q"); return f.read(n).decode("utf-8", "replace")
SCALAR = {0: "B", 1: "b", 2: "H", 3: "h", 4: "I", 5: "i", 6: "f", 7: "?", 10: "Q", 11: "q", 12: "d"}
def rval(t):
    if t in SCALAR: return rd(SCALAR[t])
    if t == 8: return rstr()
    if t == 9:
        et, n = rd("I"), rd("Q")
        return [rval(et) for _ in range(n)]
    raise ValueError(f"gguf value type {t}")
assert f.read(4) == b"GGUF"; version = rd("I"); n_tensors, n_kv = rd("Q"), rd("Q")
meta = {}
for _ in range(n_kv):
    k = rstr(); t = rd("I"); meta[k] = rval(t)
infos = []
for _ in range(n_tensors):
    name = rstr(); nd = rd("I"); dims = [rd("Q") for _ in range(nd)]; typ = rd("I"); off = rd("Q")
    infos.append((name, dims, typ, off))
align = meta.get("general.alignment", 32)
base = (f.tell() + align - 1) // align * align
print("gguf v", version, "tensors", n_tensors, "| arch", meta.get("general.architecture"), "| name", meta.get("general.name"), "| file_type", meta.get("general.file_type"))

def hf_name(n):
    if n == "token_embd.weight": return "model.embed_tokens.weight"
    if n == "output_norm.weight": return "model.norm.weight"
    if n == "output.weight": return "lm_head.weight"
    p = n.split(".")
    if p[0] != "blk": return None
    i, rest = p[1], ".".join(p[2:])
    m = {"attn_q.weight": "self_attn.q_proj.weight", "attn_k.weight": "self_attn.k_proj.weight", "attn_v.weight": "self_attn.v_proj.weight", "attn_output.weight": "self_attn.o_proj.weight",
         "ffn_gate.weight": "mlp.gate_proj.weight", "ffn_up.weight": "mlp.up_proj.weight", "ffn_down.weight": "mlp.down_proj.weight",
         "attn_norm.weight": "input_layernorm.weight", "ffn_norm.weight": "post_attention_layernorm.weight"}.get(rest)
    return None if m is None else f"model.layers.{i}.{m}"

worst, checked, elems, bad, unmapped, types = 0.0, 0, 0, [], [], {}
with safe_open(HF, framework="pt") as st:
    keys = set(st.keys())
    for name, dims, typ, off in infos:
        h = hf_name(name)
        types[typ] = types.get(typ, 0) + 1
        if h is None or h not in keys: unmapped.append(name); continue
        n = int(np.prod(dims))
        f.seek(base + off)
        t = st.get_tensor(h).float().numpy()
        # the converter that made the gguf stores q and k with the two halves of each head's rows interleaved
        if name.endswith('attn_q.weight') or name.endswith('attn_k.weight'):
            nh = meta['llama.attention.head_count'] if name.endswith('attn_q.weight') else meta['llama.attention.head_count_kv']
            t = t.reshape(nh, 2, t.shape[0] // nh // 2, t.shape[1]).swapaxes(1, 2).reshape(t.shape)
        a = t.reshape(-1)
        if a.size != n: bad.append((name, "size", a.size, n)); continue
        if typ == 0: g = np.frombuffer(f.read(4 * n), dtype="<f4").astype(np.float32); d = None
        elif typ == 1: g = np.frombuffer(f.read(2 * n), dtype="<f2").astype(np.float32); d = None
        elif typ == 8:  # Q8_0: blocks of (f16 scale, 32 x int8)
            nb = n // 32
            blk = np.frombuffer(f.read(34 * nb), dtype=np.dtype([("d", "<f2"), ("q", "i1", (32,))]))
            d = blk["d"].astype(np.float32); g = (d[:, None] * blk["q"].astype(np.float32)).reshape(-1)
        else: bad.append((name, "type", typ)); continue
        if d is None:
            err = float(np.max(np.abs(a - g))); tol = 1e-3 * (float(np.max(np.abs(g))) + 1e-9)
            norm = err / (float(np.max(np.abs(g))) + 1e-9)
            ok = err <= tol
        else:
            e = np.abs(a - g).reshape(-1, 32) / (d[:, None] + 1e-12)   # error in units of the block's own step
            norm = float(e.max()); ok = norm <= 0.6
        worst = max(worst, norm if d is not None else 0.0)
        checked += 1; elems += n
        if not ok: bad.append((name, "differs", round(norm, 4)))
print("tensor types in the gguf (0=f32,1=f16,8=q8_0):", types)
print(f"tensors compared: {checked} of {n_tensors} · weights compared: {elems:,}")
print(f"largest miss on any 8-bit tensor: {worst:.3f} of one rounding step (the bar is 0.6: half a step, plus the rounding of the stored step size; other weights miss by hundreds of steps)")
print("not mapped:", unmapped[:6], "| hf tensors:", len(keys))
print("VERDICT:", "SAME WEIGHTS, to within 8-bit rounding, on every tensor compared" if checked > 100 and not bad else f"NOT VERIFIED: {bad[:8]}")

if OUT:
    h = hashlib.sha256()
    with open(HF, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 22), b""):
            h.update(b)
    json.dump({"v": "the-distillation-weights/1", "file": os.path.basename(HF), "bytes": os.path.getsize(HF), "sha256": h.hexdigest(),
               "against": {"what": "Ollama's llama3.2:1b, its own 8-bit (Q8_0) build", "blob": digest, "bytes": os.path.getsize(GGUF)},
               "tensorsCompared": checked, "tensorsInTheOtherCopy": n_tensors, "weightsCompared": elems,
               "largestMissInRoundingSteps": round(worst, 4), "sameWeightsMustStayUnder": 0.6, "notMatched": bad, "notMapped": unmapped,
               "verdict": "same weights, to within 8-bit rounding, on every tensor compared" if checked > 100 and not bad else "NOT VERIFIED"},
              open(OUT, "w", encoding="utf-8", newline=chr(10)), indent=1)
    print("wrote", OUT)
