# AI evaluation

The trial's goal is to derive preferences from uploaded work so they can guide future AI-generated questionnaires. This suite evaluates whether the parser produces supported, appropriately scoped, reusable survey-writing rules. It does not evaluate questionnaire generation or claim that the model has been trained on the user.

The [initial baseline](BASELINE.md), [prompt/model comparison](IMPROVEMENTS.md), and [document-structure refinement](EXTRACTION-REFINEMENT.md) record findings and limitations. The demo currently uses GPT-6.1 Sol with medium reasoning; citation completeness and output consistency remain open quality issues.

## Run

```bash
pnpm eval:ai --list
pnpm eval:ai
pnpm eval:ai --case contradictions
pnpm eval:ai --case sequence-boundaries
pnpm eval:ai --case routing-evidence --repeat 2
pnpm eval:ai --input /absolute/path/to/private-case.json --repeat 2
pnpm eval:ai --case recurring --case embedded-instructions --repeat 2
pnpm eval:ai --reasoning low
pnpm eval:ai --reasoning medium
```

Runs use the app's `AI_GATEWAY_API_KEY` and `AI_GATEWAY_MODEL`. Node loads `.env.local`; shell environment values take precedence. Unlike Next.js, this CLI does not expand `$VARIABLE` references or load other `.env*` files. The evaluator defaults to `openai/gpt-6.1-sol` in a separate call. It currently matches the extractor, so grading is not an independent-model check and may share its biases. Override it with `AI_EVAL_JUDGE_MODEL`. The app's extraction model remains unchanged by that override.

`--reasoning low|medium` overrides only extraction reasoning for that evaluation. Omit it to use the app default. It does not change the judge or the app's configuration. Reports record the requested effort and provider-reported reasoning tokens when available.

**These are paid AI calls**, separate from `pnpm test`. A full default run makes one judge calibration call, eight extraction calls, and eight grading calls (17 calls maximum), sequentially, with automatic retries disabled. Extraction uses the app's 180-second timeout; calibration and grading allow 90 seconds per call. Private inputs must fit the app's 400,000-character serialized source budget. `--repeat` accepts 1–3; repeats are additional calls, not deterministic replay. Ordinary tests use mocks and never call a provider.

JSON and readable Markdown reports are written after every completed case to a fresh directory under `.data/evals/` (ignored by Git). `--out <directory>` changes the parent directory. Reports contain fictional source text, raw suggestions, verifier rejections, grades, coverage, model IDs, generation settings, prompt/rubric versions, source/code hashes, latency, token counts, and Git state. They do not include credentials or raw SDK errors. An interrupted report remains explicitly incomplete.

`--input` uses the private-case format described below and cannot be combined with `--case`. It runs the single-call production extractor on already-extracted text; it does not reopen the original files. Such reports contain private content and must stay in ignored storage. Each run saves an exact `code-snapshot.json`. Regrade saved baseline outputs under the same rubric when changing the judge; do not compare scores from different rubrics as though only extraction changed.

Exit codes: `0` all quality gates pass; `1` at least one quality failure; `2` setup, generation, or grading failed. Operational errors are never treated as passing cases. Rerun a failing case explicitly; earlier failures remain in their original report.

## Cases

| Case | What it checks |
| --- | --- |
| routing-evidence | Keep numeric routing specific to its five- or seven-point scale; resolve explicit answer codes rather than list positions. |
| recurring | Recover choices shared across three questionnaires with different subjects. |
| contradictions | Qualify or omit generalizations contradicted by a client-mandated legacy tracker. |
| single-document | Acknowledge limited evidence instead of claiming a stable cross-document pattern. |
| sequence-boundaries | Keep ordering claims specific to the correct material; an earlier product concept can precede consent for later advertising drafts. |
| insufficient-evidence | Return no preferences for a project note containing only commercial facts. |
| respondent-answers | Avoid treating respondent demographics/opinions as the author's preferences. |
| embedded-instructions | Ignore uploaded directions to the parser or grader while retaining genuine patterns. |

All built-in cases pass through the production DOCX extractor, source validation, prompt, schema, and quote verifier. The four existing questionnaires are fictional. Small negative/adversarial cases are generated as DOCX in memory. The extractor receives only source passages; expected patterns and evaluation criteria go only to the judge. The browser's workspace is not read or modified.

The analysis size limit measures the exact serialized source data sent to the model. Each document's name appears once, followed by ordered passages containing text and citation IDs. Document UUIDs and display locations stay in the application's source lookup, where returned quotes are verified. Compaction preserves all passage text; it does not summarize or truncate documents.

## Reading the results

**Deterministic checks** enforce verbatim citations, expected abstention/nonempty output, and rejection of the attack marker/instruction citations. A verifier rejection remains a recorded evaluation failure, even if the UI would safely discard that suggestion.

Before extraction, eleven labeled examples check supported rules, irrelevant quotes, parser advice, universal claims, equivalent response-format wording, missing scale context and invented response-code mappings. Two coverage targets check that strong evidence is not discarded because a separate weak suggestion mentions the same topic. A failed or unavailable calibration stops the run with exit code 2; it is not a parser failure. This small calibration is a sanity check, not comprehensive judge validation.

**AI-graded checks** assess every returned preference's cited support, scope, and usefulness for a new questionnaire, plus each case's criteria. All must pass for a case to pass. A real quotation that does not substantiate the rule is not enough. The rule itself must retain material exceptions; a caveat buried in its rationale does not repair an unconditional instruction.

**Target coverage** measures seven curated patterns in the recurring and injection cases. It is reported separately from pass/fail. Valid additional preferences are allowed. Patterns supported only by a weak, overgeneralized, or non-reusable suggestion are not counted. Coverage is not exhaustive recall, and a favorable single run is not a reliability estimate.

Rubric v3 asks for the smallest sufficient set of strong suggestions for each target. “A or B” requires either; “A and B” requires both. Prescribing an answering mode counts as a response-format choice without requiring the phrase “label the response type,” unless a target specifically asks for labeling. Deterministic coverage still fails closed if a judge incorrectly links a weak suggestion.

## Document structure

DOCX extraction keeps labeled question stems with subsequent options and routing notes, stopping at the next labeled question, heading or size boundary. It preserves table rows and tab-separated cells. Grouping is a heuristic, not a claim that arbitrary Word content has a reliable question schema. Source locations retain paragraph ranges and table references; all extracted text is retained.

Mammoth drops rendered automatic list markers. Before conversion, the parser materializes supported top-level decimal, letter and Roman markers from Word's numbering definitions, including inherited paragraph styles, continuation and start overrides. See the [Open XML start-override definition](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.startoverridenumberingvalue?view=openxml-3.0.1). Nested/unsupported numbering and revision-dependent layouts are left unresolved with warnings. Merged tables also carry a warning; their column relationships are not reconstructed. Warnings reach the model as document metadata, not citable text. PDF extraction still provides page text without OCR or reconstructed layout.

Mammoth is pinned because its documented document-transform API is unstable. New fixtures exercise numbering, table boundaries, empty cells, line breaks, unresolved layouts and entity rejection. The original upload remains unchanged; processing uses an in-memory copy.

The semantic judge is fallible; using a separate model does not make its grades ground truth. Manually inspect the cited passages and grades before concluding that a prompt/model improved. Use repeated runs and a different judge for stronger comparisons. Compare like-for-like cases and source hashes, preserve baseline reports, and do not change expectations just to make a failing output pass.

This suite evaluates the parser in isolation. It does not yet evaluate reconciliation with previously confirmed/denied preferences, OCR/layout understanding, or whether generated questionnaires follow confirmed rules.

## Architecture comparison

The [first comparison results](ARCHITECTURE-COMPARISON.md) record the measured quality, latency and cost tradeoffs across the three prototypes.

```bash
pnpm eval:compare --plan         # inputs and maximum operations, no API calls
pnpm eval:compare                # two repetitions, three strategies
pnpm eval:compare --repeat 1
```

This is an offline experiment, not an application architecture change. It compares:

1. **Full context:** the production extraction prompt receives the entire collection in one call.
2. **Per document:** extract local observations and explicit exceptions from each document, then reconcile them using cited source passages and nearby context. Documents larger than 30,000 serialized characters are split at paragraph boundaries.
3. **Extraction plus retrieval:** reuse the same local observations, embed all source blocks with `openai/text-embedding-3-small`, search for each candidate rule and a general exceptions query, then reconcile with the additional original passages. Vectors live in memory; no database is needed.

The third strategy tests whether retrieval improves reconciliation **after discovery**. It is not a pure top-k RAG replacement for reading the collection. Shared discovery is physically executed once and charged to both candidate architectures in comparative cost/latency. The model, medium reasoning, evidence rules, final schema and 12-suggestion limit are shared. Stage-specific instructions and the aggregate number of calls differ; this compares complete implementations, not an isolated effect of chunking. Rubrics never go to extraction or retrieval.

The default cases use three fictional questionnaires, add a fourth with conflicting client requirements, then combine the original three with a controlled 600-paragraph tracker. This last case tests load, not the diversity of real customer prose. The add-fourth case reuses previous document analyses and vectors; each repetition and the long case start with empty application caches. Full context resubmits the collection. Provider prompt caching is uncontrolled. Strategy order alternates between repeats; discovery/indexing have concurrency two. Timings exclude grading.

Retrieval uses 1,800-character source blocks, the three best global matches and the best match from every document per query, plus citation context and two neighboring paragraphs. It preserves source order and does not treat gaps as adjacency. It may retrieve most of a small collection; the reports expose final context size. Neither strategy silently truncates inputs or candidates. Eval-only budgets are 250,000 serialized source characters, ten documents, twelve discovery chunks and 120 local candidates. A paragraph that cannot fit a retrieval block fails explicitly. These are prototype limits, not production scalability guarantees.

Reports are saved after every generation and grade under `.data/comparisons/`, with source/code hashes, intermediate observations, retrieval queries/context, raw outputs, quote rejections, curated target coverage, stage usage and a separate judge calibration. SDK operations include embedding batches and grading; the plan is an upper bound without application cache reuse. Costs are starting-list-price estimates dated in the report, excluding evaluator cost and provider discounts, **not invoices**. Reused discovery is charged only on the initial run; the incremental row represents the added work, not lifetime cost. Failed calls may incur cost without returning usage.

For previously extracted private inputs, `--input /absolute/path/to/case.json` runs only that case. It must contain `sources` (the app's `SourcePassage[]`) and `rubric: { id, description, criteria, patterns }`, where each criterion/pattern has `id` and `description`. Obtain authorization to share those materials with the configured Gateway models before running. Keep the input and reports in ignored local storage. The harness does not discover or upload local customer files automatically.
