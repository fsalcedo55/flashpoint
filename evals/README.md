# AI evaluation

The trial's goal is to derive preferences from uploaded work so they can guide future AI-generated questionnaires. This suite evaluates whether the parser produces supported, appropriately scoped, reusable survey-writing rules. It does not evaluate questionnaire generation or claim that the model has been trained on the user.

The [initial baseline](BASELINE.md) and [prompt/model comparison](IMPROVEMENTS.md) record findings and limitations. The demo currently uses Claude Opus 5.5 provisionally; citation completeness remains an open quality issue.

## Run

```bash
pnpm eval:ai --list
pnpm eval:ai
pnpm eval:ai --case contradictions
pnpm eval:ai --case recurring --case embedded-instructions --repeat 2
```

Runs use the app's `AI_GATEWAY_API_KEY` and `AI_GATEWAY_MODEL`. Node loads `.env.local`; shell environment values take precedence. Unlike Next.js, this CLI does not expand `$VARIABLE` references or load other `.env*` files. The evaluator defaults to `openai/gpt-6.1-sol` as a separate judge. Override it with `AI_EVAL_JUDGE_MODEL`. The app's extraction model remains unchanged.

**These are paid AI calls**, separate from `pnpm test`. A full default run makes one judge calibration call, six extraction calls, and six grading calls (13 calls maximum), sequentially, with automatic retries disabled and a 90-second timeout per call. `--repeat` accepts 1–3; repeats are additional calls, not deterministic replay. Ordinary tests use mocks and never call a provider.

JSON and readable Markdown reports are written after every completed case to a fresh directory under `.data/evals/` (ignored by Git). `--out <directory>` changes the parent directory. Reports contain fictional source text, raw suggestions, verifier rejections, grades, coverage, model IDs, generation settings, prompt/rubric versions, source/code hashes, latency, token counts, and Git state. They do not include credentials or raw SDK errors. An interrupted report remains explicitly incomplete.

Exit codes: `0` all quality gates pass; `1` at least one quality failure; `2` setup, generation, or grading failed. Operational errors are never treated as passing cases. Rerun a failing case explicitly; earlier failures remain in their original report.

## Cases

| Case | What it checks |
| --- | --- |
| recurring | Recover choices shared across three questionnaires with different subjects. |
| contradictions | Qualify or omit generalizations contradicted by a client-mandated legacy tracker. |
| single-document | Acknowledge limited evidence instead of claiming a stable cross-document pattern. |
| insufficient-evidence | Return no preferences for a project note containing only commercial facts. |
| respondent-answers | Avoid treating respondent demographics/opinions as the author's preferences. |
| embedded-instructions | Ignore uploaded directions to the parser or grader while retaining genuine patterns. |

All cases pass through the production DOCX extractor, source validation, prompt, schema, and quote verifier. The four existing questionnaires are fictional. Small negative/adversarial cases are generated as DOCX in memory. The extractor receives only source passages; expected patterns and evaluation criteria go only to the judge. The browser's workspace is not read or modified.

## Reading the results

**Deterministic checks** enforce verbatim citations, expected abstention/nonempty output, and rejection of the attack marker/instruction citations. A verifier rejection remains a recorded evaluation failure, even if the UI would safely discard that suggestion.

Before extraction, six labeled examples check that the judge accepts supported rules and rejects irrelevant quotes, parser advice, and contradicted universal claims. A failed or unavailable calibration stops the run with exit code 2; it is not a parser failure. This small calibration is a sanity check, not comprehensive judge validation.

**AI-graded checks** assess every returned preference's cited support, scope, and usefulness for a new questionnaire, plus each case's criteria. All must pass for a case to pass. A real quotation that does not substantiate the rule is not enough. The rule itself must retain material exceptions; a caveat buried in its rationale does not repair an unconditional instruction.

**Target coverage** measures seven curated patterns in the recurring and injection cases. It is reported separately from pass/fail. Valid additional preferences are allowed. Patterns supported only by a weak, overgeneralized, or non-reusable suggestion are not counted. Coverage is not exhaustive recall, and a favorable single run is not a reliability estimate.

The semantic judge is fallible; using a separate model does not make its grades ground truth. Manually inspect the cited passages and grades before concluding that a prompt/model improved. Use repeated runs and a different judge for stronger comparisons. Compare like-for-like cases and source hashes, preserve baseline reports, and do not change expectations just to make a failing output pass.

This suite evaluates the parser in isolation. It does not yet evaluate reconciliation with previously confirmed/denied preferences, OCR/layout understanding, or whether generated questionnaires follow confirmed rules.
