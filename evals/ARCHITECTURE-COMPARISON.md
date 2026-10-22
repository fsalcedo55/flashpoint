# Architecture comparison

Follow-up: [document structure and evaluation refinement](EXTRACTION-REFINEMENT.md) records the subsequent single-call improvements and remaining failures. The historical results below retain their original rubrics and code snapshots.

2026-10-21–22. Twenty-four analysis results: eighteen on fictional cases and six on three private team questionnaires. All runs completed without operational errors; all final quotes passed deterministic verification. Every approach still produced semantic quality failures.

## Team-document follow-up, October 22

The same three prototypes each analyzed all three questionnaires twice: 967 extracted passages and 69,900 serialized source characters. Extraction used GPT-6 Luna with medium reasoning, embeddings used OpenAI text-embedding-3-small, and the separate evaluator used GPT-6.1 Sol, all through Vercel AI Gateway. The evaluator passed its six calibration examples before the comparison.

| Approach | Analysis time | Suggestions judged strong / returned, run 1; run 2 | Curated targets, run 1; run 2 | Estimated USD / analysis |
| --- | --- | --- | --- | --- |
| Full context | 24–31 s | 3/4; 3/4 | 4/5; 1/5 | $0.0036–0.0040 |
| Per-document reconciliation | 86–92 s | 7/8; 5/6 | 2/5; 1/5 | $0.0097–0.0103 |
| Per-document + embedding retrieval | 85–102 s | 8/9; 6/7 | 2/5; 1/5 | $0.0106–0.0118 |

“Strong” means the evaluator judged a suggestion supported, appropriately scoped and reusable. It is not measured precision. The five curated targets are not exhaustive: the staged approaches also found valid patterns outside that checklist. The evaluator inconsistently treated response-format coverage, so these scores cannot establish a quality ranking. All six results contained at least one scope or citation defect.

Source checks found a recurring failure: numeric follow-up thresholds appeared in a rule without the scale that made those thresholds meaningful. Another rule cited a response code without enough evidence of its meaning. The confidentiality-before-later-messages pattern was missing from every final result. Retrieval supplied 448–499 of 967 passages to reconciliation, versus 133–136 without retrieval, and included the confidentiality and message headings in both runs; more available evidence did not ensure discovery or correct use.

**Decision:** retain full context as the demo baseline. The synthetic coverage advantage of per-document reconciliation did not establish a similar advantage on these real questionnaires. It produced more useful suggestions, but took substantially longer and retained scope problems. Retrieval has not demonstrated enough added value to justify adding it or a vector database. Before changing the architecture, improve preservation of question/answer/routing structure, tighten scope and complete citations, and make coverage grading consistent. Keep the staged prototype for further size and incremental-update tests.

This follow-up tests only three related questionnaires and two repetitions. It does not test a real fourth document, an arbitrary 600-paragraph customer report, PPTX, or SOWs. Customer text, filenames, outputs and detailed source checks remain in ignored local artifacts; only aggregate findings are recorded here.

## Controlled fixtures, October 21

Each cell shows curated targets recovered out of seven, then analysis latency. Ranges cover two repetitions, not a confidence interval. Grades come from a separate, calibrated GPT-6.1 Sol evaluator and are not ground truth.

| Input | Full context | Per-document reconciliation | Per-document + embedding retrieval |
| --- | --- | --- | --- |
| Three questionnaires | 3/7 · 31–45 s | 4–5/7 · 126–139 s | 3–5/7 · 135–138 s |
| Add conflicting fourth | 1–2/7 · 24–56 s | 3–4/7 · 70–72 s | 3–4/7 · 70–78 s |
| Add 600-paragraph tracker | 1–3/7 · 29–41 s | 4/7 · 208–211 s | 3–4/7 · 205–219 s |

The larger fixture adds a generated 600-paragraph tracker to the original three questionnaires: 775 passages and 170,879 serialized source characters in total. This is deliberately repetitive controlled load, not representative customer prose. Full context processed it successfully even though it exceeded the app's then-current 80,000-character limit. Fitting the context did not guarantee comprehensive or correctly scoped output.

The incremental fourth-document case reuses all three earlier document analyses and their vectors. Full context submits the entire collection again. The staged approaches need only one new document analysis plus reconciliation, but remain slower on this input.

## Interpretation

- **Full context is the simplest and fastest baseline.** Its target coverage was lower in this experiment, but a large model context makes it viable for these input sizes. The app's current cap is not evidence that the model needs chunking.
- **Per-document reconciliation is the strongest candidate for improved coverage.** It recovered more curated targets in each matched run. Its cold runs took about two to three and a half minutes, with two concurrent discovery calls. Coverage improved without eliminating scope and citation problems.
- **Retrieval has not earned its complexity here.** It matched or underperformed plain per-document reconciliation on target coverage in every matched run. On the initial three documents it selected every source passage; on the long case it selected 506 and 524 of 775 passages, versus 240 and 229 for plain reconciliation. This variant tests retrieval after discovery, not every possible RAG design. Embeddings were kept in memory; no vector database was used.

These synthetic results motivated the team-document follow-up above. They do not establish a production architecture or a need for a vector database on their own.

## Cost and timing

Estimated extraction/indexing cost per analysis, across these cases:

| Approach | Estimated USD range |
| --- | --- |
| full | $0.0023–0.0070 |
| per-document | $0.0050–0.0233 |
| retrieval | $0.0053–0.0255 |

These use starting list prices checked on 2026-10-21: [GPT-6 Luna](https://vercel.com/ai-gateway/models/gpt-6-luna) at $0.10/M input and $0.50/M output tokens, and [text-embedding-3-small](https://vercel.com/ai-gateway/models/text-embedding-3-small) at $0.02/M tokens. They exclude evaluator cost, provider routing differences and cache discounts; they are not billed totals. Output counts include reasoning. Shared discovery is executed once but charged to each architecture in its comparison. Incremental rows charge only new work, not prior analysis.

Timings cover model/embedding stages, excluding document parsing, upload, UI and offline grading. Strategy order alternated between repetitions. Discovery/indexing concurrency was two; this is a small prototype, not a throughput benchmark or an optimized queue/worker implementation. Provider prompt caching was uncontrolled.

## Quality limitations

Seven targets are a curated checklist, not exhaustive recall or author-confirmed preferences. Two runs are insufficient to establish reliability. Manual spot checks found an inconsistent scope grade on nearly equivalent multi-select randomization rules, so small score differences should not be overinterpreted.

Other failures were concrete: a sequence rule's citations omitted the question wording it claimed; one staged result omitted the client's seven-point exception from a five-point rule; another used a 1–3 follow-up threshold without identifying the seven-point scale. Real quotes alone did not make those rules supported and reusable.

The rubric was frozen before extraction and never sent to discovery or retrieval. The extraction model was GPT-6 Luna with medium reasoning, the production evidence rules, a 12-suggestion final limit and 10,000 output tokens per generation call. Staged approaches use additional prompts/calls; this is a comparison of complete implementations, not equal aggregate compute budgets. The judge passed six calibration examples, but remains fallible.

The private comparison used a separate frozen five-target rubric and the same model settings. Its real questionnaires are related versions from one client, not independent confirmation of stable preferences across clients. No customer source text or generated rules are included in this repository report.

## Reproduce

Run `pnpm eval:compare --plan` to inspect the inputs and call budget, or `pnpm eval:compare` for two repetitions with paid API calls. See [evaluation instructions](README.md#architecture-comparison). Local raw results, intermediate observations, retrieval context, manual checks and an exact code snapshot are under `.data/comparisons/2026-10-21T21-10-42-879Z-hAVDt0` (ignored by Git).

Benchmark code hash: `b2edb197db3f00a2614e59986b58d38ab1565e99213ac12f40eb0ff96cf58869`. A subsequent guard rejects blank exception quotations; all 58 retained exception citations from this run also pass that guard. Automatic code-snapshot saving was added after this run; its matching snapshot was saved manually.

Private follow-up artifacts: `.data/comparisons/2026-10-22T19-31-42-459Z-ItxH9S` (ignored), including `findings.md` with source checks and the exact code snapshot. Code hash: `8aca7f9a8b0a55e1720f8ee9b3b49324322232fbc762ecffc0e90172c1577caf`. The private input is intentionally not part of the repository.

Validation: 45 local tests pass; TypeScript, ESLint and diff whitespace checks pass. The three prototypes live only in the evaluation harness.
