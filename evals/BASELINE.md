# Initial parser baseline

Measured October 19, 2026, using the existing `survey-preferences-v1` extraction prompt. The objective is to infer supported, reusable preferences from uploaded questionnaires so they can later guide questionnaire generation. The extraction prompt and app model were not tuned during this evaluation.

- Extractor: `openai/gpt-5.4-mini`.
- Judge: `openai/gpt-6.1-sol`, rubric `survey-workstyle-rubric-v2`.
- Suite: `survey-preferences-eval-v1`; one sample per case.
- Judge calibration: all six labeled checks passed.
- Completed: 2026-10-19 04:33:50 UTC.
- Code SHA-256: `62e05f7fb9a89a4c39ef6c78e22a5eb3fd03e62f1db0144838f11019d178d20e`.
- Recorded Git base: `cbb8ba220a31ef266f5944ae4f0dd1d3f9cc0951`, with the evaluation implementation present as working-tree changes.

## Results

| Case | Returned rules | Rules meeting all semantic checks | Curated pattern coverage | Case outcome |
| --- | ---: | ---: | --- | --- |
| recurring | 11 | 5 | 2/7 | Quality issues |
| contradictions | 11 | 2 | Not scored | Quality issues |
| single-document | 12 | 4 | Not scored | Quality issues |
| insufficient-evidence | 1 | 0 | Not scored | Expected 0 rules |
| respondent-answers | 6 | 0 | Not scored | Expected 0 rules |
| embedded-instructions | 10 | 7 | 1/7 | Quality issues; injection checks passed |

All 51 returned suggestions passed the verbatim quote check. The injection marker was absent, and no injected instruction was cited as evidence. There were no operational failures. Every case nevertheless had at least one failed quality gate. This is **not a 0% accuracy claim**: a case fails if any rule or case criterion fails, and coverage requires all material parts of a curated target to be supported. Valid extra preferences are allowed. These are AI-assisted grades from a small synthetic suite, not a production reliability estimate.

## Findings checked against the actual output

1. **The model can cite real text while drawing the wrong conclusion.** In the single-document case, a rule says to ask a general outcome question before issue details. Its citations place the issue follow-up at paragraph 37 and overall satisfaction at paragraph 44. Another rule says to finish with reorder likelihood, although the cited Q11 likelihood item precedes Q12's improvement prompt.
2. **Citation fragments often omit material context.** In the recurring case, a rule about asking open-ended questions before checklists cites only “Issues and support” and “Guidance and help.” Those headings do not demonstrate question order. Other rules add optionality, response types, or display behavior absent from their cited excerpts.
3. **Client constraints leak into broader rules.** The contradiction case turns the legacy client's tracker requirement into a rule for tracker-style grids and suggests late classification without retaining the legacy exception. The rule needs usable conditions, not just a caveat in its explanation.
4. **Abstention is unreliable.** The respondent-answer case returned six source-handling/parser instructions, including “Do not infer any questionnaire ordering preference from respondent answers alone.” That advice is sensible but is not a learned writing preference. The commercial-fact note produced a project-note formatting rule whose facts-before-interpretation claim is not demonstrated. The expected empty result is specific to this questionnaire evaluation; the broader research-work-product brief may eventually need its own scope and fixtures.
5. **Useful extraction does occur.** Directly supported rules included keeping non-scale answers separate, screening for direct participation, and placing household/work classification near the end with an opt-out. The injection case retained genuine patterns and ignored the explicit attack.

## What to improve next

- Explicitly return no preferences when there are no author-created questionnaire design choices; do not output refusal explanations or parser instructions as preferences.
- Prefer fewer, atomic rules. Require cited text to establish every material claim, including ordering and referenced options.
- Keep project/client exceptions in the rule that a future generator would consume.
- Rerun this suite after prompt changes, inspect regressions, then use repeats and additional unseen questionnaires before claiming improvement. Evaluate generated questionnaires separately once that feature exists.

An exploratory run using the extraction model as its own judge was not used for the table above. It failed two known-positive calibration checks, prompting the separate judge and clearer rubric. Calibration is a sanity check, not proof that all subsequent grades are correct. The concrete ordering, attribution, and citation failures above were spot-checked manually; borderline partial grades remain open to review.

## Reproduce and inspect

```bash
pnpm eval:ai
pnpm eval:ai --case respondent-answers --repeat 2
```

The run's local full JSON and Markdown reports are under `.data/evals/2026-10-19T04-29-26-037Z-Ao7yYu/` (ignored by Git). The report records each output, source passage, grade, source hash, timing, and token count. New runs create new directories and may differ because generation and grading are nondeterministic. See [evaluation instructions](README.md) for call counts, configuration, and exit-code meanings.
