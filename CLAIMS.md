# The Distillation: the claims, registered before a sealed round is run

This file is committed, with the seal (`SEAL.json`, [SEAL.md](SEAL.md)), before the model is shown one problem of a
sealed round. The verdicts are worked out by `src/claims.mjs` from each round's published records, and the bars in
that file are the bars below, word for word (`test/claims.test.mjs` checks that on every push). A claim that fails
stays on the page, failed, in red. No bar is moved after a round. The same six claims, with the same bars, are ruled on
for every round.

## The question

The Climb and The Crystal make a small model reliable by checking it: every step it writes is tested by exact
arithmetic, a wrong step is dissolved, and only a finished, checked calculation gives an answer. That reliability
lives in the checker, not in the model. Take the checker away and the model is as it was.

Can the checked work be taught back into the model? Take only the working that was verified, train the model on it,
and then ask the trained model **cold**: one try, no checker, no second attempt, on problems it has never seen. Is it
right more often than it was, without becoming more confidently wrong? If it is, the gain is kept: it becomes the
model the next round starts from. If it is not, the trained weights are thrown away, and that is published too.

And when the round is run again and again, each from the last kept model, where does it stop?

## What is run

One model: Llama 3.2 1B Instruct, at full 32-bit precision, on a laptop processor, always choosing its likeliest next
word. The problems are the kind The Climb and The Crystal are sealed on (`vendor/crystal/`, byte for byte as their
seals froze them): word problems whose answer is an exact calculation, made by code from a seed, in three tiers (easy,
climb, wall). No dataset is used.

**One round** is five steps, each with its own published record:

1. **Harvest.** Every problem of the round's harvest pool is grown by The Crystal's own sealed engine, each on its
   own, with no memory shared between problems. The model writes one step at a time; exact arithmetic rules on each;
   a wrong step is never kept.
2. **Build.** A training example is made only from a crystal that finished and reached the problem's answer: the
   problem as The Climb asks it for one try, and the reply to learn, which is the verified steps in the order they
   bonded and then `ANSWER:` and the answer. Every example is then verified again, from its own text, by exact
   arithmetic (`src/trace.mjs`). Nothing else is ever trained on: no unverified text, no dissolved step, no answer
   that was not reached.
3. **Train.** A LoRA adapter is trained on that file and on nothing else, on top of the round's starting model.
4. **Cold test.** The starting model and the trained model are each asked every problem of the round's **held-out
   block** once: The Climb's own sealed one-try conversation, one reply, no checker, no second try. Each reply is read
   by The Climb's sealed rule: **right**, **wrong** (an answer given, and wrong: a confident wrong answer), or **no
   answer**.
5. **The rule.** `src/adopt.mjs`: the trained weights are adopted only if K1 and K2 both pass. Otherwise they are
   dissolved: not used again, and the failure is published in red.

The **held-out block** of a round is made from its own seed. No problem in it is ever harvested or trained on, in any
round: every round's held-out block is struck from every round's harvest pool before anything runs
(`src/split.mjs`). Two problems are the same problem when they are the same calculation, however they are worded.

**Round after round.** An adopted model does not become the next round's starting model on the loop's own word. The
loop proposes; a person disposes. A round may start only from weights that the rule adopted **and** that a person
granted, in a record that keeps the person's own words and names that round and the SHA-256 of those exact weights
(`data/grants/`). Without the grant the loop waits. It stops when a round's lift falls below the bar (the gains have flattened: this is the
expected end, not a fault), or at the most rounds the seal allows, or at the spend wall: a cap on the hours of model
work for one round and for all of them (`data/settings.json`, sealed).

The numbers that are sealed, in `data/settings.json`: the seed of every round's harvest pool and held-out block (four
rounds), the token limits, the training settings, the two bars, the most rounds, and the spend wall.

## The claims

**K1 · Lift.** On the held-out block, cold, one try each: the distilled model is right on at least 5 points in a
hundred more than the base, it solves more of the problems the base failed than it loses of the ones the base solved,
and the difference is significant (exact two-sided McNemar test, p < 0.05).

**K2 · Still honest.** On the same block the distilled model gives no more confident wrong answers than the base.

**K3 · The fail-wall moved.** More held-out problems go from failed (base) to solved (distilled) than the other way.
The problems are published by name, both ways.

**K4 · Verify-or-dissolve at the weights.** The outcome published for the round is the one the rule gives (adopted
only if K1 and K2 both pass, dissolved otherwise), and the round stands only on weights adopted by the rule and
granted by a person.

**K5 · Clean training data.** Every training example is a complete crystal's verified working, checked again by exact
arithmetic; none is unverified; the trainer read that file, byte for byte.

**K6 · Held-out integrity.** No held-out problem is in the training set, and no held-out problem was harvested.

"The base" is the model the round starts from: in round 1 the model as published by its maker; in a later round, the
last adopted and granted model. "The distilled model" is the base with the round's trained adapter.

## What is not claimed

- **One measured round is one measured round.** A round that passes shows that this model, on this kind of problem,
  got better cold after being trained on its own verified working. It is not a claim about other models, other kinds
  of problem, or what further rounds will do. Each further round is measured and sealed on its own.
- **The gain is inside the checker's reach.** The only check here is exact arithmetic. Nothing is learned, or
  claimed, about anything exact arithmetic cannot rule on.
- **A cold answer is not a checked answer.** The distilled model, asked cold, still gives confident wrong answers.
  K2 says only that it gives no more of them than before. An answer that must be right still needs the checker.
- **The model does not improve itself without limit.** The loop stops: at the reach of the check, at what a model of
  this size can hold, and at the hours a laptop has. Where it stops is published as the result.
- **Nothing here changes weights on its own.** Every adopted model is a change a person granted, recorded with their
  words.

## The development round

Before the seal, a development round was run on problems made from other seeds, to shape the engineering: the token
limits, the longest working that is trained on, the speed of the model's hands. Every problem it touched, harvested
or held out, is struck from every sealed held-out block, so no sealed claim is measured on a problem the settings
were shaped on. Its records are published in `data/dev/` and it is not a claim: no sealed bar is decided by it, and
the two bars above were fixed in `data/settings.json` before its model was trained.
