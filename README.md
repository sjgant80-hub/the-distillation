**Live page: https://sjgant80-hub.github.io/the-distillation/**

# The Distillation

A small AI model, trained on nothing but its own verified working, then tested cold on problems it never saw.
The loop proposes a better model. A person decides whether it stands.

| | |
| --- | --- |
| **50.7% → 50.7%** | round 2: right, cold, on 229 held-out problems, before and after training on 539 verified examples ([the verdict](data/rounds/2/verdict.json)) |
| **4 of 6** | of round 2's claims passed. The rule says dissolve: round 2's weights are dropped, and the loop stops. Round 1's stand: 24.7% → 48.9%, granted by a person on 27 November 2026 ([the grant](data/grants/round-1.json)) |
| **6** | claims and their pass marks, written down before any model was trained ([CLAIMS.md](CLAIMS.md)) |
| **294 / 294** | planted bugs caught in the nine gated files ([the record](data/gates.json)) |
| **100 / 100** | replies identical to plain one-at-a-time generation ([the record](data/parity.json)) |
| **0** | changes to the model without a person's recorded yes |

## Round 2, as measured

- **No lift.** Right, cold, on 229 held-out problems: 116 before and 116 after. Round 2 started from round 1's
  model, as granted, and trained it again on 539 examples of its own verified working.
- **12 problems gained, 12 lost** (exact McNemar test, p = 1.000): what moved cancelled out. By kind, before → after:
  one-step problems 6 → 6 of 6; several-step problems 108 → 108 of 153; the hardest problems 2 → 2 of 70.
- **Confident wrong answers did not change, 113 → 113 of 229.** None was left blank, before or after.
- **The rule says dissolve.** Lift (K1) and the fail-wall moving (K3) failed, and they stay on the page in red.
  Round 2's weights are not used, so no person's grant was asked for. The loop's own rule then stops: the gains have
  flattened. It starts no round 3.
- **Every step ended cleanly.** Round 1's trainer crash did not happen again. 5.9 hours of a laptop processor, of a
  cap of 12 ([how each step ended](data/rounds/2/run.json)).

## Round 1, as measured

- **The gain is not even.** Right, before → after: one-step problems 6 → 6 of 6; several-step problems 49 → 105 of
  152; the hardest problems 2 → 2 of 73.
- **Confident wrong answers fell overall, 160 → 117 of 231.** On the hardest problems they rose, 57 → 70 of 73: it
  left fewer blank (14 → 1) and answered wrong instead.
- **61 problems gained, 5 lost** (exact McNemar test, p = 2.6e-13). 9.3 hours of a laptop processor, of a cap of 12.
- **Resumed once by hand.** The trainer saved what it had learned, and its log. Then its process ended with an error
  and no message. Nothing was trained twice and no record was edited. [The note](data/rounds/1/run-note.json).
- **Granted.** A person granted round 1's weights on 27 November 2026, in their own words. Before round 2, a second
  seal mended how a round is run and written down, and changed nothing that is asked or judged ([SEAL.md](SEAL.md)).

## Run it yourself

```
node --test test/*.test.mjs                               # the tests, the page build, the house standard
node scripts/check.mjs                                    # decide every round on file again, with no model
node scripts/round.mjs dev --model <folder with weights>  # the development round, end to end, on your machine
```

<details><summary>What you need to run a round</summary>

Node 22 or newer. Python 3.11 or newer with `torch`, `transformers`, `peft`, `accelerate` and `safetensors`. Meta's
Llama 3.2 1B Instruct in one folder (you accept the Llama 3.2 Community Licence with Meta when you fetch it; it is not
in this repository). The harvest refuses any weights file but the one whose SHA-256 is in
[data/settings.json](data/settings.json). Everything runs on one machine; nothing is sent anywhere. Your replies may
differ from the published ones by a near-tie here and there; the verdict is always worked out from your own records.

</details>

<details><summary>One round, six moves</summary>

1. **Harvest.** The Crystal's sealed engine, run wide: one step at a time, each checked by exact arithmetic.
2. **Build.** Only finished, verified working becomes a training example, and it is verified again from its own text.
3. **Train.** A small adapter, on that file and nothing else.
4. **Test cold.** Before and after, one try, no checker, on a block never harvested or trained on.
5. **Decide.** Code: better and no more confidently wrong, or the weights are dropped. Published either way.
6. **Grant.** Adopted weights wait for a person's recorded yes before any round may start from them.

</details>

<details><summary>What is in here</summary>

| Where | What |
| --- | --- |
| `src/` | eight kernels that decide everything: `split`, `trace`, `cold`, `adopt`, `rounds`, `steps`, `claims`, `judge` |
| `vendor/crystal/` | The Crystal's engine and The Climb's checker, as their seals froze them |
| `vendor/house/` | the house kit: the crystal hero, the token sheet, the ship gate |
| `py/` | the model's hands: generate, serve, train, test cold. They decide nothing; they write records |
| `scripts/` | `round` runs a round, `judge` writes its verdict, `check` decides every round again, `live` shows a round as it runs, `grant` records a person's yes, `seal` freezes what can change a result |
| `data/` | the sealed settings and every round's records |
| `seals/` | every earlier seal, kept byte for byte, and the written reasons for the seal after it |

</details>

<details><summary>What this does not prove</summary>

One measured round is one measured round, for this model, on this kind of problem. A cold answer is still not a
checked answer. The live page lists every limit, and [SEAL.md](SEAL.md) records how the weights were checked and what
was decided before the seal.

</details>

MIT licence (holder Simon Gant). Built by Kar. Supplied by [AI Native Solutions](https://www.ai-nativesolutions.com).
See [NOTICE](NOTICE) for what it stands on.

Powered by the Konomi architecture, created by Thomas Frumkin.
