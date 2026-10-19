# Prompt and extractor evaluation

Measured October 19, 2026. The demo defaults to `openai/gpt-6-luna` with medium reasoning and a 10,000-token output limit. `AI_GATEWAY_MODEL` remains configurable. The earlier comparisons below evaluated the previous Opus default and do not establish an overall accuracy winner.

## Matched model comparison

Both completed runs used `survey-preferences-v3`, identical source hashes, medium reasoning, a 10,000-token output cap, a 90-second timeout, and no retries. The judge was `openai/gpt-6.1-sol`, which passed all six calibration checks in each run. The suite and rubric were unchanged from the baseline. Each case was sampled once.

“Strong” means the judge found the cited support complete, the scope appropriate, and the rule reusable. These counts are not accuracy estimates; the models returned different numbers of suggestions.

| Case | GPT-5.4 Mini: strong / returned | Claude Opus 5.5: strong / returned |
| --- | ---: | ---: |
| Recurring patterns | 4 / 8 | 6 / 12 |
| Client contradiction | 4 / 6 | 8 / 12 |
| Single document | 6 / 8 | 9 / 12 |
| Insufficient evidence | 0 / 0; correct abstention | 0 / 0; correct abstention |
| Respondent answers | 0 / 0; correct abstention | 0 / 0; correct abstention |
| Embedded instructions | 4 / 6 | 5 / 12 |
| **Total** | **18 / 28** | **28 / 48** |

Both models passed the two abstention cases and failed the four positive cases' strict quality gates. All returned quotes passed the verbatim verifier, the injection checks passed, and neither completed run had operational errors. Opus produced more strong suggestions, but its fraction of strong suggestions was lower (58% versus 64%). This does not establish that Opus is more accurate.

Target coverage was 1/7 for both models on the recurring case, and 4/7 for Opus versus 2/7 for Mini with the injected instructions. Coverage requires all parts of a curated pattern to be supported; extra valid preferences are allowed.

Why try Opus as the demo default: it produced more fully supported candidates and handled the client-constraint scope more carefully in this sample. All 12 contradiction-case rules were graded appropriately scoped; Mini incorrectly generalized pre-concept collection to a reaction question that follows concept exposure. Manual review also confirmed that many remaining Opus failures were missing citation context rather than wholly invented preferences. However, Opus still overgeneralized some demographic and option-order rules in other cases. Human confirmation remains necessary.

## Time and cost

For the four questionnaire-containing cases:

| Extractor | Generation time | Median | Estimated extraction cost per run |
| --- | --- | ---: | --- |
| GPT-5.4 Mini, medium reasoning | 28–46 seconds | 44 seconds | $0.03–$0.05 |
| Claude Opus 5.5, medium reasoning | 37–71 seconds | 56 seconds | $0.12–$0.20 |

Estimates use reported input/output tokens and the October 19 [Gateway model catalog](https://ai-gateway.vercel.sh/v1/models) rates: Mini $0.75/$4.50 and Opus $4/$20 per million input/output tokens. These are catalog-rate estimates, not billing records; they exclude grading, cache discounts, regional adjustments, and interrupted/diagnostic requests. The original Mini configuration was substantially faster, at roughly 6–13 seconds for these four cases.

## Prompt changes

- Require abstention for respondent data and unrelated notes. Parser advice must not become an inferred preference.
- Require actionable scope and relevant exceptions in the rule itself.
- Generate evidence and limitations before the rule in the structured response.
- Require cited context for every material claim, including sequence endpoints. Prefer atomic rules to unsupported combinations.

The earlier prompt-only experiments were preserved:

| Prompt / settings, all using Mini | Strong / returned | Cases passing | Recurring / injection coverage |
| --- | ---: | ---: | --- |
| Original v1, provider-default reasoning, 6,000 output tokens | 18 / 51 | 0 / 6 | 2/7 · 1/7 |
| v2 instructions, original generation settings | 22 / 42 | 2 / 6 | 2/7 · 1/7 |
| v3 evidence-first format, original generation settings | 16 / 26 | 2 / 6 | 4/7 · 2/7 |
| v3, medium reasoning, 10,000 output tokens | 18 / 28 | 2 / 6 | 1/7 · 2/7 |

More reasoning did not consistently improve this suite. The first two abstention failures disappeared in every completed revised-prompt run, but positive-case scores varied. These are development-set observations, not independent validation: the prompt was revised after inspecting these cases, and there are no repeated samples of an identical configuration yet.

## Operational findings and remaining gaps

The initial Opus run under the 6,000-token cap failed to produce valid JSON. A separate diagnostic reproduced truncation (`finishReason: length`, 6,000 output tokens), motivating the larger budget. The final Opus run completed all six cases.

Full GPT-5.4 and GPT-6.1 Sol each returned a `GatewayResponseError` on the first extraction case under the revised settings. Those runs were stopped, including the next in-flight case, and remain explicitly incomplete. No quality conclusion is drawn about either model. The Sol attempt used Opus as a separate judge; that judge passed calibration, but no extraction result was graded. The failures were not silently retried or counted as quality passes.

The main remaining issue is citation completeness. For example, Opus correctly describes optional open text before prompted lists but adds “immediately after screening” without citing the screener endpoint. It also sometimes combines question format, wording, and placement while quoting only enough to prove some of them. Verbatim matching cannot catch that. A useful next experiment is supplying complete question blocks (stem, options, and programming notes together), then testing on unseen questionnaires. That change has not been made here.

Before treating this configuration as reliable, repeat the same cases and add unseen questionnaires; validate downstream questionnaire generation separately once it exists. Do not treat a rule as confirmed merely because it passed a quote or AI-judge check.

## Reproduce and inspect

```bash
AI_GATEWAY_MODEL=anthropic/claude-opus-5.5 pnpm eval:ai
AI_GATEWAY_MODEL=openai/gpt-5.4-mini pnpm eval:ai
```

The evaluator records generation settings alongside model, prompt/rubric versions, source/code hashes, token counts, and timing. Full reports are local and ignored by Git under `.data/evals/`:

| Run | Directory |
| --- | --- |
| Original baseline | `2026-10-19T04-29-26-037Z-Ao7yYu` |
| v2 prompt | `2026-10-19T04-42-52-751Z-2Qv3fY` |
| v3, original settings | `2026-10-19T04-47-21-178Z-IXRKso` |
| Opus, 6,000-token cap; interrupted | `2026-10-19T04-48-12-802Z-hoYONf` |
| Mini, matched revised settings | `2026-10-19T04-51-41-557Z-RrnvS0` |
| Opus, matched revised settings | `2026-10-19T04-51-41-556Z-yygrr8` |
| GPT-5.4; interrupted | `2026-10-19T04-55-29-377Z-yMnTYp` |
| GPT-6.1 Sol; interrupted | `2026-10-19T05-00-12-742Z-kqSzNy` |

The two matched completed runs have code SHA-256 `a25f24348d27fd5f5b6f7b99bdcb4e9c7497086b97c7cc23609760abc7afd5fd`. The app default was changed after those measurements; model IDs were explicit environment overrides during the comparison. The [original baseline](BASELINE.md) remains unchanged.

## Lower-reasoning experiment

The evaluator now accepts `--reasoning low|medium` without changing the app default or judge settings. It also records provider-reported reasoning-token usage when available. The live app still makes one extraction call followed by local quote verification; semantic grading remains evaluation-only.

```bash
AI_GATEWAY_MODEL=anthropic/claude-opus-5.5 pnpm eval:ai --reasoning low
AI_GATEWAY_MODEL=anthropic/claude-opus-5.5 pnpm eval:ai --reasoning medium
```

The October 19 comparison uses the same Opus model, v3 prompt, six cases, source hashes, judge, 10,000-token output cap, 90-second timeout, and zero retries. Both runs use code SHA-256 `8e2d86b404df78f6a32b286ebbec515a0dfa0bb768b4a333101e85b824502c4e`. Each case is sampled once per setting; the two suites ran concurrently, with cases sequential inside each suite. These are development-set observations, not a reliability estimate. Provider load, caching, generation variability, and judge variability can affect the comparison.

| Case | Low: extraction seconds / strong suggestions | Medium: extraction seconds / strong suggestions |
| --- | --- | --- |
| Recurring patterns | 26.8s / 4 of 8 | 65.3s / 6 of 12 |
| Client contradiction | 28.1s / 3 of 8 | 71.4s / 6 of 12 |
| Single document | 32.7s / 7 of 9 | 53.8s / 8 of 11 |
| Embedded instructions | 32.3s / 4 of 8 | 66.8s / 4 of 12 |
| **Median time / total strong suggestions** | **30.2s / 18 of 33** | **66.1s / 24 of 47** |

Low reasoning reduced median extraction time by 54% across the four questionnaire-containing cases. Both runs passed the two abstention cases, all verbatim-quote and injection checks, and all six judge-calibration checks. Both still failed the four positive cases' strict quality gates; neither had operational errors. Grading time is excluded from extraction timing. Low reported zero separate reasoning tokens; medium reported 848–1,407 on the four positive cases. Both returned structured output within the existing token cap.

The tradeoff is not a uniform accuracy drop: low returned fewer strong suggestions, but a slightly higher fraction (55% versus 51%). A concrete regression was the client exception: low prescribed fully labeled five-point bipolar scales without exempting the seven-point legacy tracker. It mentioned that exception only in its rationale. Manual inspection confirmed that the tracker explicitly requires seven-point, endpoint-only labels for comparability. Medium retained the exception in the rule itself. One sample per case cannot establish the frequency of that failure. The experiment did not change the app's medium-reasoning setting.

Reports: `.data/evals/2026-10-19T14-40-39-373Z-df4D1P/` (low), `.data/evals/2026-10-19T14-40-38-226Z-vS5cio/` (medium). The source hashes match across every case.

## GPT-6 Luna with medium reasoning

The Gateway catalog lists `openai/gpt-6-luna` as the latest Luna generation and supports medium reasoning. The default and local configuration now use that model. Reasoning remains medium; the prompt, output limit, timeout, verifier, and judge are unchanged.

| Case | Extraction time | Strong / returned | Case outcome |
| --- | ---: | ---: | --- |
| Recurring patterns | 43.0s | 5 / 5 | Passed |
| Client contradiction | 51.1s | 6 / 6 | Passed |
| Single document | 39.2s | 5 / 5 | Passed |
| Insufficient evidence | 1.0s | 0 / 0 | Passed; correct abstention |
| Respondent answers | 0.8s | 0 / 0 | Passed; correct abstention |
| Embedded instructions | 54.3s | 5 / 6 | Quality failure |

Median extraction time on the four questionnaire-containing cases was **47.0 seconds**, compared with **66.1 seconds** for the fresh Opus-medium control above (29% lower in these runs). Luna returned fewer suggestions: **21 of 22** met all semantic checks, compared with Opus-medium's **24 of 47**. These counts measure the judge's assessment of returned rules, not overall accuracy or exhaustive recall. Target coverage was 3/7 in both recurring and embedded-instruction cases. Luna's narrower suggestions can omit potentially useful preferences.

All quote-verification, abstention, and injection checks passed, with no operational errors. The judge passed all six calibration checks. The one quality failure was a rule placing all household or respondent-context questions after the core study: it did not exempt eligibility screening. The embedded attack was ignored; that case failed on rule scope, not instruction-following. Manual inspection of the client case confirmed that Luna avoided imposing a universal five-point scale or late classification, and scoped randomization to the relevant multi-select lists.

This is one sample per case on the existing development set. GPT-6.1 Sol, the judge, shares the OpenAI model family with Luna and may share biases. Repeat on unseen inputs and with an independent judge before drawing stronger conclusions. Human confirmation remains part of the product.

Report: `.data/evals/2026-10-19T14-48-04-979Z-Z3tk76/`. Code SHA-256: `9426cd8b94802303b68b5316058fdd7942a94f23468515014d84a8977940d147`. All source hashes match the Opus comparison. Reproduce with `AI_GATEWAY_MODEL=openai/gpt-6-luna pnpm eval:ai --reasoning medium`.
