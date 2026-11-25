**Live page: https://sjgant80-hub.github.io/the-distillation/**

# The Distillation

A small AI model, trained on nothing but its own verified working, then tested cold on problems it never saw.
The loop proposes a better model. A person decides whether it stands.

| | |
| --- | --- |
| **sealing now** | round 1's cold result: it appears on the live page when it lands, pass or fail |
| **6** | claims and their pass marks, written down before any model was trained ([CLAIMS.md](CLAIMS.md)) |
| **277 / 277** | planted bugs caught in the eight gated kernels ([the record](data/gates.json)) |
| **100 / 100** | replies identical to plain one-at-a-time generation ([the record](data/parity.json)) |
| **0** | changes to the model without a person's recorded yes |

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
| `src/` | seven kernels that decide everything: `split`, `trace`, `cold`, `adopt`, `rounds`, `claims`, `judge` |
| `vendor/crystal/` | The Crystal's engine and The Climb's checker, as their seals froze them |
| `vendor/house/` | the house kit: the crystal hero, the token sheet, the ship gate |
| `py/` | the model's hands: generate, serve, train, test cold. They decide nothing; they write records |
| `scripts/` | `round` runs a round, `judge` writes its verdict, `check` decides every round again, `live` shows a round as it runs, `grant` records a person's yes, `seal` freezes what can change a result |
| `data/` | the sealed settings and every round's records |

</details>

<details><summary>What this does not prove</summary>

One measured round is one measured round, for this model, on this kind of problem. A cold answer is still not a
checked answer. The live page lists every limit, and [SEAL.md](SEAL.md) records how the weights were checked and what
was decided before the seal.

</details>

MIT licence (holder Simon Gant). Built by Kar. Supplied by [AI Native Solutions](https://www.ai-nativesolutions.com).
See [NOTICE](NOTICE) for what it stands on.

Powered by the Konomi architecture, created by Thomas Frumkin.
