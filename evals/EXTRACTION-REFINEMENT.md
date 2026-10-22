# Extraction and evaluation refinement

October 22, 2026. The initial experiments below used GPT-6 Luna with medium reasoning. The app now defaults to GPT-6.1 Sol with medium reasoning; the model comparison below records that change. It retains one extraction call. No runtime judge, embeddings or database were added.

## Changes

- DOCX processing preserves supported automatic list markers, including starts, continuation, overrides and inherited paragraph styles. Unknown numbering is flagged rather than reconstructed from list position.
- Labeled questions retain following options and programming notes. Tables keep rows, cell separators and empty edge cells. Merged layouts carry an explicit limitation; document warnings reach analysis as metadata, not citable text.
- Prompt v6 requires scale context and complete numeric-branch evidence, distinguishes separate sequence events, and asks for exact source IDs alongside contiguous quotations. The quote verifier continues to reject errors rather than silently repair them.
- Rubric v3 clarifies equivalent response-format wording, OR versus AND targets, and the smallest sufficient set of strong suggestions. Eleven labeled calibration examples also check numerical scope and code mappings. The old outputs were regraded under this same rubric before comparison.

## Real-text results

At the time of this comparison, the original three DOCX files were blocked by macOS file permissions. It therefore used the previously extracted private text. Grouping retained every extracted character, reducing 967 fragments to 179 sections and the serialized payload from 69,900 to 46,378 characters. It cannot recover numbering or table layout already lost by the old reader. The new DOCX reader was verified separately with local fixtures. The later original-file verification below closes that access gap.

| Version | Repeat | Suggestions judged strong / returned after verification | Curated targets | Analysis time | Result |
| --- | --- | --- | --- | --- | --- |
| Original v4, regraded with rubric v3 | 1 | 2/4 | 3/5 | 23.6 s | Semantic defects |
| Original v4, regraded with rubric v3 | 2 | 3/4 | 1/5 | 31.2 s | Semantic defects |
| Final v6, grouped text | 1 | 5/5 | 5/5 | 34.6 s | Passed |
| Final v6, grouped text | 2 | 2/3 | 1/5 | 51.2 s | One rejected quote; one scope defect |

The second v6 run initially generated four suggestions. One quotation omitted intervening programming instructions and was rejected by the exact-text verifier. A retained numeric-routing rule omitted the applicable five-point scale, despite that scale being present in its evidence. Both final runs correctly distinguished confidentiality before later advertising material from earlier product information; the original baseline omitted this pattern.

These two runs do not establish an overall quality improvement or reliability rate. The first result is encouraging; the second shows continued variation. The refined calls were slower in this sample. “Strong” is an advisory evaluator judgment, not measured precision, and five curated targets are not exhaustive recall. The baseline was regraded, not regenerated concurrently. Provider timing/cache effects are uncontrolled. Grouping and prompt changes were tested together, so their individual effects are not isolated.

## Controls and intermediate failures

The first v5 iteration produced two private quality failures: one discarded quote in each, plus an overbroad sequence claim in the second. A fictional routing control also failed because otherwise useful quotations were paired with the wrong source IDs. Those failures remain in the original artifacts.

After the targeted v6 citation and sequence clarification:

| Fictional control | Repetitions | Outcome |
| --- | --- | --- |
| Numeric routing and explicit answer codes | 2 | Both passed; 2/2 targets each |
| Earlier concept versus later advertising sequence | 2 | Both passed; 1/1 target each |

The earlier v5 injection and insufficient-evidence controls passed. They were not rerun under v6; these results should not be represented as final-v6 coverage. Calibration passed before each live run. No operational API failures occurred.

## Verification and limits

53 local tests, TypeScript, ESLint and the production build pass. Tests cover numbering, inherited styles, overrides, unresolved/revision-dependent numbering, tables, empty cells, line breaks, XML entity rejection, warning propagation, HTTP uploads and the existing review workflow.

The reader does not implement every Word numbering/layout convention. Nested/unsupported lists and revision-dependent layouts require checking against the original. Grouping is a bounded heuristic; it preserves text but cannot guarantee semantic question boundaries. PDFs remain page-text extraction without OCR.

## Original-file verification

Later on October 22, all three original DOCX files were recovered through the existing browser session's **Download original** controls. The production session was preserved. Originals, hashes, extracted text, renders and evaluation artifacts remain in ignored local storage.

The production reader returned 57, 58 and 67 sections respectively, with no extraction warnings. All 967 nonempty body paragraphs were retained in order in a comparison against OOXML text that ignores whitespace. The reader restored 559 automatic numeric or letter markers. This check establishes body-text preservation, not fidelity of every Word feature. All three originals were rendered, and six representative pages were visually checked for answer numbering, descending scales, routing and an ascending rating grid. This was not an exhaustive layout audit.

The resulting source payload is 48,342 serialized characters, within the 80,000-character production limit. The original files contain two tables; the extracted text retains row/cell separators and the empty leading header cells. No input was truncated. The original-file source hash is `3b39ebb3d18bf4212b97853c655fe4f72fe671d7b0593b3d53067a80c14ea65a`.

Two new single-call evaluations used the unchanged v6 prompt, medium reasoning, v3 rubric and the same five curated targets. Judge calibration passed.

| Repeat | Generated / verified | Suggestions judged strong | Curated targets | Analysis time | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | 4 / 2 | 2/2 | 2/5 | 33.6 s | Two rejected quotations |
| 2 | 4 / 4 | 4/4 | 3/5 | 36.0 s | Quality gates passed |

Manual inspection of the two rejections found wording copied from a similar passage in a different document, and a quotation extended into a separate source passage. The exact-text verifier rejected both. Neither run recovered the confidentiality-order target; neither retained the complete two-branch routing target. Passing quality gates does not require exhaustive target coverage. These results do not establish reliable recall or a measured improvement over the earlier inputs; source structure, numbering and the model's stochastic output all differ.

The local browser flow also completed: upload three originals → extract 182 sections → analyze in 36 seconds → display five suggestions with source evidence → edit and confirm → show only the confirmed preference in the profile → deny another suggestion → return both to review. The original wording and all five pending statuses were restored after the test. No browser warnings or errors were captured. This separate UI run used a different document order and was not graded by the offline judge. The production deployment was not changed.

The next quality experiment should target citation selection across similar documents and missing patterns. Restored document structure alone has not solved those issues. Reference patterns remain review targets, not preferences confirmed by the document author.

Private reproduction artifacts:

- `.data/collegewell-originals/extract.ts` and `check-structure.ts`
- `.data/collegewell-originals/provenance.json` and `structure-check.json`
- `.data/collegewell-originals/evals/2026-10-22T20-29-21-466Z-0UEoLm/`
- `.data/collegewell-originals/review-verification.jpg`

## GPT-6.1 Sol comparison

At the user's request, the extractor default and local environment were switched to `openai/gpt-6.1-sol`. The live Gateway catalog confirmed support for medium reasoning and structured output. The running local server's configuration endpoint returned that model and `configured: true`; no browser refresh was required. The production deployment and its environment were not changed.

Two evaluations reused the original-file input above. Source hashes, prompt v6, rubric v3, medium reasoning, 10,000-output-token budget, 90-second timeout and judge model are identical to the preceding Luna runs. Comparing code snapshots confirmed that only `src/server/ai/provider.ts` changed. Judge calibration passed.

| Extractor | Repeat | Generated / verified | Suggestions judged strong | Curated targets | Analysis time | Result |
| --- | --- | --- | --- | --- | --- | --- |
| GPT-6 Luna | 1 | 4 / 2 | 2/2 | 2/5 | 33.6 s | Two rejected quotations |
| GPT-6 Luna | 2 | 4 / 4 | 4/4 | 3/5 | 36.0 s | Passed |
| GPT-6.1 Sol | 1 | 11 / 11 | 11/11 | 3/5 | 71.0 s | Passed |
| GPT-6.1 Sol | 2 | 11 / 11 | 11/11 | 4/5 | 79.4 s | Passed |

Sol produced no rejected quotations in these two runs. Manual inspection confirmed complete, scale-specific evidence for both numeric follow-up branches in each run. The second run also cited both endpoints for profiling after message evaluation, and correctly mapped the restored non-saving response codes to their follow-ups. Both runs omitted the confidentiality-before-messages target. The first described the final profiling transition without making the ordering claim, so it did not receive that target. More suggestions alone are not proof of better coverage or author preference accuracy.

The two runs support trying Sol for the demo, with a latency tradeoff: approximately twice as long in this sample. These are sequential samples, not a randomized benchmark; provider load and cache behavior are uncontrolled. The judge is now the same model as the extractor, in a separate call, so shared biases may favor its output. The deterministic quote checks are independent of that grading, but two passing runs do not establish reliability.

The [Gateway catalog](https://ai-gateway.vercel.sh/v1/models), checked October 22, lists Sol at $2 per million input tokens and $10 per million output tokens at this context size, versus Luna at $0.10/$0.50. At the recorded usage, the two Sol extraction calls estimate to $0.074 and $0.082 before cache discounts, excluding evaluation calls. These are list-price estimates, not invoices. Existing API-key budgets were not changed.

Validation for this configuration change: 21 focused analysis/evaluation tests, TypeScript, provider-file ESLint and diff checks passed. The previous full UI verification used Luna; this switch was verified through the running configuration endpoint and live batch evaluations. Existing browser suggestions were not regenerated or replaced.

Private results and exact code snapshots: `.data/collegewell-originals/sol-evals/2026-10-22T20-41-57-706Z-7r6BIA/`. The verified catalog snapshot is under `.data/model-switch/`. The next evaluation should exercise the fourth-document and long-document cases with Sol before increasing production input limits.

## Sol input-size and deadline checks

Two further cases kept the same three original questionnaires and added either the small fictional legacy tracker or a generated 600-paragraph version of that tracker. The extra document is a controlled cross-project conflict fixture, not an additional work product by the CollegeWell author. Its repeated client requirements must not become inferred author preferences. The five existing CollegeWell targets were retained, with an additional client-constraint criterion declared before generation.

| Input | Serialized source characters | Sections | App preflight |
| --- | ---: | ---: | --- |
| Three originals + small fourth document | 51,298 | 197 | Accepted |
| Three originals + 600-paragraph fourth document | 190,525 | 483 | Rejected at the existing 80,000-character limit |

The long document's 600 paragraphs were preserved in order after grouping into 301 sections, comparing text with whitespace normalized. Neither case produced extraction warnings. The corresponding analysis input JSON was approximately 55 KB and 200 KB, below the route's 2 MB body limit. This was a local serialization check, not an HTTP or deployment test.

The long case was then tested **offline only**, with an explicit 200,000-character safety cap. It used the unmodified extraction call: complete input, prompt v6, Sol medium, 10,000 maximum output tokens, 90-second timeout, and no automatic retries. No production guard was relaxed. The separate Sol judge passed calibration before the four planned extraction runs.

| Input | Repeat | Analysis time | Generated / verified | Judged strong | Curated targets | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| Small fourth document | 1 | 90.0 s | — | — | — | Gateway response error at the configured deadline; no output or grade |
| Small fourth document | 2 | 71.3 s | 10 / 10 | 10/10 | 4/5 | Passed |
| 600-paragraph fourth document | 1 | 65.4 s | 9 / 9 | 9/9 | 5/5 | Passed |
| 600-paragraph fourth document | 2 | 66.9 s | 9 / 9 | 9/9 | 5/5 | Passed |

All completed extractions had valid quotations and passed the client-constraint criterion. The smaller case missed the late-profiling target: its suggestion described the final-section introduction without establishing its position after message evaluation. Both long-case outputs cited the relevant ordering endpoints and the scale plus both numeric follow-up branches. Manual inspection agreed with those specific findings. The long-case outputs did not turn the repeated tracker mandates into author preferences.

The long requests used **46,506 input tokens**, about 4.4% of the 1,050,000-token context window listed in the Gateway catalog checked on October 22. Output usage was 3,934 and 3,926 tokens, including 516 reasoning tokens in each. The smaller completed request used 15,954 input tokens and 4,524 output tokens. These measurements distinguish the app's character allowance from the model's context capacity. The separate evaluation calls took another 33–35 seconds; they are not part of the application's analysis flow.

These results support retaining a single extraction call for this workload. There is no observed context-capacity failure here, and no evidence from this test that chunking or vector retrieval is necessary. They motivated an app allowance around the tested 200,000 serialized characters, together with a deliberate review of the 90-second model deadline and 120-second route duration. Those are product/runtime budgets, not the model's context limit. They were left unchanged during this experiment; the subsequent implementation is recorded below.

This is not a capacity or reliability guarantee: two long runs used repetitive synthetic material appended after the original documents, not heterogeneous long customer reports or randomized source positions. The targets mostly concern the originals, so this tests their recovery in the presence of added material, not exhaustive discovery throughout a long document. Shared extractor/judge biases, uncontrolled provider load and cache effects remain. Larger input did not imply longer elapsed time in these samples, and the smaller input's deadline failure must not be excluded from the results. No concurrency or deployed streaming test was performed.

Private inputs, fixture generator, preflight plan, text-preservation check, rubrics, outputs and exact code snapshot remain under `.data/sol-load/`, excluded from Git. Results: `.data/sol-load/runs/2026-10-22T20-56-45-449Z-g6cNyd/`. Code SHA-256: `4158cb535f2e277d5c05e3c506c622973fe5dcf778a8744822a3ff3c793b8923`. Source hashes: `b8d18715d6fb8a88b37eebb9d99b91e58968b2741670591457830eb7ed37f48d` (small fourth document), `550b8640927b52579ee93b0bfc9d367cf4de3365db2a951f07eb5ca026d8c7ef` (600-paragraph fourth document). No application code, environment settings or deployment changed during these checks.

## Larger-input implementation and browser check

Following the load experiment, the app's shared client/server preflight now accepts up to 200,000 serialized source characters, including escaped text and references. Oversized selections are still rejected before a model call; input is never truncated. The model deadline is 180 seconds, the browser deadline is 210 seconds, and the tRPC route allows 240 seconds. Next.js's production functions manifest confirms `maxDuration: 240` for that route. The route value remains a literal so Next.js can extract it at build time. [Vercel documents a 300-second Hobby limit with Fluid Compute](https://vercel.com/docs/functions/configuring-functions/duration).

The application still uses one Sol-medium extraction call, with the existing output budget and no automatic retries. There is no runtime evaluator, chunking, retrieval or database. The new deadlines add room for response variability; they do not promise completion of every allowed input.

All 54 automated tests pass, including an exact escaped-payload boundary, rejection before AI, full larger-input delivery through the typed streaming transport, upstream cancellation, and a mock-clock check that survives the old 90-second cutoff but aborts at 180 seconds with a sanitized error. The upload integration test required permission to bind localhost after the sandbox initially blocked it. TypeScript and the production build pass. ESLint reports no errors; two pre-existing unused-variable warnings remain in ignored local evaluation scripts.

A separate local browser workspace uploaded the three original questionnaires plus the same 600-paragraph tracker, producing 483 sections. The selection was accepted, streamed through the app, and completed in **1m 11s** with **10 pending suggestions** visible on the review page alongside source evidence. No browser errors or warnings were captured. This verifies the upload → preflight → streaming API → review path. Source order differed from the offline runs because the UI sorts session document IDs; this integration run was not graded by the semantic evaluator and is not another quality benchmark.

Screenshot: `.data/sol-load/app-review-verification.jpg`. Existing user workspaces were preserved. These changes and verification are local; the production deployment was not updated.

## Reproduce and inspect

Use `pnpm eval:ai --case routing-evidence --case sequence-boundaries --repeat 2` for the focused public controls. Private inputs use `--input` and must remain outside Git. See [evaluation instructions](README.md).

Ignored artifacts under `.data/collegewell-refinement/` include the preserved input/provenance, baseline regrading, intermediate v5 failures and final v6 results:

- `regraded-baseline.json`
- `runs/2026-10-22T19-58-34-192Z-RbGLn3/`
- `controls/2026-10-22T20-00-56-962Z-FljQz1/`
- `final/2026-10-22T20-04-27-423Z-8EW50n/`
- `final-controls/2026-10-22T20-04-29-971Z-3pbulT/`

Each run includes an exact code snapshot. Final private run code hash: `1b3cc2675882fe05e969559fd72e8c75ce983bec886991623b07bcf2d6193acb`. Customer source text, filenames, quotations and generated rules are excluded from this repository report.
