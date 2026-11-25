**Live page: https://sjgant80-hub.github.io/the-distillation/**

# The Distillation

A small AI model is held to a checker until every step of its working is right. Then it is trained on that verified
working and on nothing else, and asked again **cold**: one try, no checker, on problems it has never seen. If it is
right more often and no more confidently wrong, the trained weights are kept. If not, they are thrown away and that is
published. A later round can start from kept weights only when a person grants it.

The live page shows every number, measured against six claims written down first ([CLAIMS.md](CLAIMS.md)), and lets
you judge each round again in your browser with the same code that made the verdict.

It is built on [The Climb](https://sjgant80-hub.github.io/the-climb/) and
[The Crystal](https://sjgant80-hub.github.io/the-crystal/): the harvest is The Crystal's sealed engine, byte for
byte, run wide.

## What is in here

| Where | What |
| --- | --- |
| `src/` | Seven small kernels that decide everything: which problems are held out (`split`), what may be trained on (`trace`), how a cold reply is read (`cold`), adopt or dissolve and the person's grant (`adopt`), what the loop may do next (`rounds`), the six claims (`claims`), and the verdict of a round from its records (`judge`). Each is mutation-gated: [data/gates.json](data/gates.json). |
| `vendor/crystal/` | The Crystal's engine and The Climb's checker, as their seals froze them. |
| `py/` | The model's hands: load and generate (`llm.py`), a local door for the harvest (`serve.py`), the LoRA fine-tune (`train.py`), the cold test (`cold.py`). They decide nothing; they write records. |
| `scripts/` | `round.mjs` runs a round end to end. `judge.mjs` writes its verdict. `check.mjs` decides every round again from its files. `publish.mjs` writes what the page reads. `seal.mjs` freezes everything that can change a result. |
| `data/` | The sealed settings, and every round's records: the harvest, the training file, the held-out questions, both models' cold replies, the trainer's log, the verdict. |
| `index.html` | The page, built by `scripts/make-page.mjs` with the kernels inlined byte for byte. |

## Run it yourself

Everything runs on one machine. Nothing is sent anywhere.

1. **Node 22 or newer**, and **Python 3.11 or newer** with `torch`, `transformers`, `peft`, `accelerate` and
   `safetensors`.
2. **The weights.** Meta's Llama 3.2 1B Instruct (`model.safetensors`, the tokenizer and the config files) in one
   folder. You accept the Llama 3.2 Community Licence with Meta when you fetch them. They are not in this repository.
   The SHA-256 of the weights file this build used is in [data/settings.json](data/settings.json); the harvest refuses
   to run on any other.
3. **Decide every published round again, with no model:**

   ```
   node --test test/*.test.mjs
   node scripts/check.mjs
   ```

4. **Run the development round end to end** (about an hour on a laptop processor):

   ```
   node scripts/round.mjs dev --model <folder with the weights> --python <your python>
   ```

5. **Run a sealed round.** `node scripts/round.mjs 1 --model <folder>`. It runs only if the loop's own rule allows it
   (`src/rounds.mjs`): round 1 always; a later round only when the one before was adopted by the rule **and** a person
   granted it in `data/grants/`. Your replies may differ from the published ones by a near-tie here and there (another
   processor rounds differently); the verdict is always worked out from your own records.

## The rules it keeps

- **Only verified work trains the model.** A training example is the finished, verified working of one problem, and
  it is verified again from its own text before it is used and again when the round is judged.
- **Held out, or it is memorising.** Every round's held-out block is struck from every round's harvest pool. A
  problem's identity is its calculation, not its wording.
- **The loop proposes; a person disposes.** Code decides adopt or dissolve. Adopted weights wait for a person's
  recorded yes, naming the round and the weights' SHA-256, before any round may start from them.
- **A failure is a result.** A round that does not clear its bar is dissolved and published as dissolved. The loop
  then stops.

## What this does not prove

One measured round is one measured round, for this model, on this kind of problem. A cold answer is still not a
checked answer. The page lists every limit plainly, and [SEAL.md](SEAL.md) records how the weights were checked and
what was decided before the seal.

## Licence and credit

Code: MIT (holder Simon Gant). Built by Kar. Supplied by [AI Native Solutions](https://www.ai-nativesolutions.com).
See [NOTICE](NOTICE) for what it stands on.

Powered by the Konomi architecture, created by Thomas Frumkin.
