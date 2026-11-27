# The seal

`SEAL.json` holds a SHA-256 of every file that can change a result. It is made (`node scripts/seal.mjs`) before a
sealed round is run. `test/seal.test.mjs` fails on every push if any sealed byte has changed since, and a sealed round
counts only when its harvest and its verdict record the SHA-256 of the seal that was in force for it. There are now
two seals: [the second](#the-second-seal-27-november-2026) mends how a round is run, and changes nothing that is asked or judged.

## What is sealed

- **The kernels**, `src/*.mjs`: which problems are held out, what may be trained on, how a cold reply is read, the
  adoption rule and the test of a person's grant, what the loop may do next, the six claims, and the judge.
- **The engine it harvests with**, `vendor/crystal/`: The Crystal's kernels and The Climb's inside them, byte for byte
  as their own seals froze them.
- **The model's hands**, `py/llm.py`, `py/serve.py`, `py/train.py`, `py/cold.py`: loading, generating, training.
- **The scripts that make a round's records**, `scripts/harvest.mjs`, `scripts/build.mjs`, `scripts/judge.mjs`,
  `scripts/round.mjs`.
- **The settings**, `data/settings.json`: the weights' SHA-256, every round's two seeds (four rounds), the token
  limits, the training settings, the two bars, the most rounds, the spend wall.
- **The claims**, `CLAIMS.md`.

Not sealed, because they decide nothing: the page, `scripts/check.mjs` and `scripts/publish.mjs` (which only derive
again what the records give), and the trained adapters (which are not in this repository; each is named by its
SHA-256 in its round's verdict).

## What was decided before the seal, and when

**The bars first.** The two bars (a lift of at least 5 points with p < 0.05, and no more confident wrong answers) were
committed in `data/settings.json` with the kernels and `CLAIMS.md` before any model had been trained
(commit `47affe9`).

**Then a development round**, on problems made from other seeds (`data/dev/`). It is published and it is not a claim.
Every problem it touched, harvested or held out, is struck from every sealed held-out block. It shaped four things:

1. *One try is allowed 256 tokens, not 128.* The Climb's sealed one-try allows 128. The verified working of a hard
   problem runs past that (the longest in the development harvest is over twenty lines), and a model trained to
   write such working would be cut off before its answer. Both models get the same 256.
2. *A working of more than 24 lines is verified but not trained on*, so that every reply the model is trained to
   write fits inside the limit it will be tested under.
3. *The speed of the model's hands.* Three changes, none of which changes what is measured, each checked:
   a conversation that only grows keeps the work already done on it; a conversation whose reply has ended leaves the
   batch; and in training, the opening every example shares is worked out once a step and examples of like length
   are batched together. The generation changes are checked against the library's plain one-at-a-time generation
   ([data/parity.json](data/parity.json)); the trainer checks its loss and every gradient against working each
   example out whole, before every training run, and records the check in the round's `train-log.json`.
4. *What a record must say to be evidence.* The judge was made to refuse a harvest, a trainer's log or a cold test
   that does not itself say it was made on the sealed weights with the sealed settings.

**What the development round found**, so that nobody has to wonder what was seen before the seal
([data/dev/verdict.json](data/dev/verdict.json)): 163 of 169 harvested problems finished under the checker, giving
158 verified training examples. Cold, on 89 held-out problems, the base model was right on 31 and the trained model
on 44 (15 gained, 2 lost; exact McNemar p = 0.002); confident wrong answers went from 53 to 41. All of the gain was
in the middle tier (13 to 27 of 48). The hardest tier did not move (1 of 24 before, 0 of 24 after). The rule would
have adopted it. None of this is a claim: the sealed rounds are run on other problems, and the number of problems, the
seeds, the bars and the training settings of those rounds were all committed before this result existed. Its weights
are used by no sealed round.

## The weights

The model is Llama 3.2 1B Instruct. The weights file (`model.safetensors`, 2,471,645,608 bytes) was fetched from a
public copy of the model on Hugging Face, not from its maker's own gated repository. Its SHA-256 is in
`data/settings.json`, and the harvest refuses to run on any other file.

**The plain check failed.** The file's SHA-256 is not the one listed for the maker's own file, though the size is the
same. A file saved again by another tool has another hash even when every weight in it is identical, so this failure
does not show the weights differ, and it does not show they are the same. It is recorded here as failed.

**The check that was done instead.** This machine already held a separate copy of the same model: Ollama's own 8-bit
build, made independently. `py/verify_weights.py` reads both files tensor by tensor and measures how far each weight
of the fetched file lies from the 8-bit copy, in units of that copy's own rounding step. Weights that are the same
must lie within about half a step (plus the rounding of the stored step size); the bar was set at 0.6. Other weights
miss by hundreds of steps: while the check was being written, tensors compared in the wrong row order did exactly
that. The result ([data/weights.json](data/weights.json)): 146 of the 147 tensors compared, 1,235,814,400 weights,
largest miss 0.586 of a step. The one tensor not compared is a table of rotation frequencies that the 8-bit file
carries and the full-precision file does not.

What this does not exclude: a change smaller than 8-bit rounding in some weights. Nothing here suggests one, and
nothing here could detect one.

## Precision and runtime

The weights are stored at 16 bits and run here at 32-bit floating point, in PyTorch, on a laptop processor, always
taking the likeliest next token. The Climb and The Crystal run a 4-bit build of the same model in a browser tab.
The numbers on this page are therefore not those pages' numbers, and the base model's cold score here should not be
read against the one-try score there.

Replies are recorded, and every verdict is worked out from the records. The same weights on another processor can
round a near-tie the other way, so a re-run may differ from the published records by a reply here and there.

## A round under the seal

`scripts/round.mjs` runs a sealed round only if `SEAL.json` exists and `src/rounds.mjs` says the round may run. The
harvest writes the seal's hash into its record at the start. The judge takes a harvest as evidence only if that hash
is this repository's, and writes the same hash into the verdict, with the SHA-256 of each of the round's files.
`scripts/check.mjs` then decides the round again from those files on every push: every harvested crystal grown again
from its recorded replies, the training file and the questions built again to the same bytes, the verdict judged
again to the same verdict.

## The second seal (27 November 2026)

**Why there is one.** In round 1 the trainer saved its adapter and its log whole, and then its process ended with an
error and no message. The runner stopped. The round was carried on by hand, and the hand's work is published
([data/rounds/1/run-note.json](data/rounds/1/run-note.json)). A sealed file may not change quietly, so the mend is a
new seal, made between rounds: after round 1's verdict and the owner's grant, before round 2 was shown one problem.

**What changed: four files, each with its reason in [SEAL.json](SEAL.json).**

- `src/steps.mjs` (new): the rule for a step whose process ended badly. Its exit is always written down. The round
  carries on only from a record that was checked whole after the process ended. Anything else stops the round.
  Mutation-gated, 17 of 17.
- `scripts/round.mjs`: writes every step's exit, signal, seconds and last error lines into the round's `run.json`,
  asks `src/steps.mjs` whether to go on, and does not train again when the trainer's own log already names this
  training file and this adapter by SHA-256.
- `scripts/judge.mjs`: reads the seal a round was made under from the chain of seals. Round 1 is still judged under
  the first seal; round 2 onward under this one.
- `py/train.py`: one added line (`faulthandler.enable()`), so a process brought down from below Python says where it
  was. What is trained, and how, is unchanged.

**What did not change, and cannot.** The claims, the settings (bars, seeds, the most rounds, the spend wall), the
vendored engine and every kernel the first seal froze are the same bytes in both seals. `scripts/seal.mjs --next`
refuses a later seal that touches any of them, and `test/seal.test.mjs` checks on every push that the files with a
written reason are exactly the files whose bytes differ.

**The chain.** The first seal is kept byte for byte as [seals/1.json](seals/1.json) (SHA-256 `8fd3edc4e1d9…`, the
hash round 1's harvest and verdict record). `SEAL.json` names it, and says it begins at round 2. A round's seal is the
newest one that begins at or before that round.

**What is still not known.** Why round 1's trainer ended badly. A 16-example run of the same trainer on the same
machine ended with exit 0, so the fault is not in every exit. If it happens again, `run.json` will hold the exit
number and what the process said last.
