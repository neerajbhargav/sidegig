# Evals

Measured results for sidegig's AI-adjacent features. Every number here comes from a committed script and a committed result file in this folder.

## Sign-in code detector

`findCode()` in `src/shared/mail.ts` picks a one-time code out of an unread email's subject and preview, for the ticket on the new tab and sidebar. A wrong pick shows a phone number or an order number as a code. A miss means the user opens Gmail to copy the code.

A row counts as correct only when the detector returns exactly the labelled code. A wrong code on a mail that has one counts as both a false positive and a miss. The 95% intervals are a seeded percentile bootstrap over rows (10,000 resamples).

| Set | n (with a code) | Detector | Precision (95% CI) | Recall (95% CI) |
|---|---|---|---|---|
| Held-out, model-drafted, hand-labelled | 330 (150) | before, `279374e` | 90.9% (84.3 to 96.5) | 53.3% (45.3 to 61.5) |
| Held-out, model-drafted, hand-labelled | 330 (150) | after, `07fea22` | 96.7% (93.0 to 99.2) | 77.3% (70.4 to 83.9) |
| Template corpus, in-sample | 348 (198) | before, `279374e` | 70.1% (64.4 to 75.7) | 88.9% (84.3 to 93.1) |
| Template corpus, in-sample | 348 (198) | after, `07fea22` | 100% | 100% |

Read the held-out rows first. The template corpus (`test/fixtures/mail-codes.jsonl`, written by `scripts/mail-codes-corpus.mjs`) was written before the fix, but the new rules were written after reading it. Its "after" row is therefore in-sample and says only that every listed case is handled. The held-out set (`test/fixtures/mail-codes-holdout.jsonl`) was drafted by `qwen2.5-coder:7b` on Ollama (`scripts/mail-codes-holdout.mjs`, seeded, free). Each row was then labelled by hand before scoring:
- 26 drafts named a code that the text does not show. They are labelled "no code".
- 4 drafts were reward, offer or meeting codes. They are also labelled "no code".
- Digit codes are labelled without separators. Letter-and-digit codes keep theirs.

The held-out set was never used to change the detector.

What the fix changed: a candidate now needs a code word next to it ("code is", "Enter 4030", "123456 is your code") or must be the whole subject or preview. Phone numbers, dates, IP addresses and versions are masked first. Meeting invites and promo mails are skipped.

Known misses (held-out): letters-only codes (`QWERTY`), 4-character mixes (`A1B2`), `ABCD-1234`, odd digit groups (`5678-90`, `11-22-33`), 3-digit and 10-character codes. The remaining false positives are a reward code, an offer code and a meeting code that sit next to a code word.

Reproduce (Node 24 or newer, from the repo root):

```bash
node scripts/eval-mail-codes.ts                       # template corpus, current code
node scripts/eval-mail-codes.ts --rev 279374e         # template corpus, detector before the fix
node scripts/eval-mail-codes.ts --corpus test/fixtures/mail-codes-holdout.jsonl
node scripts/eval-mail-codes.ts --corpus test/fixtures/mail-codes-holdout.jsonl --rev 279374e
```

Add `--write` to save a result file. `test/mail-codes.test.ts` runs in CI and fails if either set scores below the values above.

Result files: `mail-codes-2026-10-22-279374e.json`, `mail-codes-2026-10-22-eddf145.json` (findCode as in `07fea22`), `mail-codes-holdout-2026-10-22-279374e.json`, `mail-codes-holdout-2026-10-22-eddf145.json`.

## Prompt injection

The assistant reads untrusted text: pages (`read_tab` and attached tabs), tab, history and bookmark titles, and email threads. It also has `open_url` and MCP tools that can send data out. Two defenses exist. Both are deterministic and unit-tested in `test/injection.test.ts`, which runs in CI.

1. Wrappers cannot be broken out of. `neutralize()` in `src/shared/prompt.ts` writes `</page>`, `</email>`, `<system>`, `<user>`, `<tool_response>`, chat-template tokens (`<|im_start|>`) and the fullwidth bracket as text (`&lt;page>`). It is used by the chat's page wrapper, the mail prompt and the bridge's `browser_read`. On the commit before the fix, three of the four wrapper tests fail.
2. "Ask before sending page data out" (Settings, Ask AI). This applies once a conversation holds a tool result or an attached page. An outbound tool (`open_url`, every MCP tool) then waits for Allow or Don't allow in the chat, which shows the full address. The setting is off by default, because the owner decided on 2026-10-14 that chat tools run without asking. The owner has to choose the default.

Not measured yet: the attack success rate of real models against these defenses. No adversarial corpus or model-driven runner is committed, so this page claims no number for it.
