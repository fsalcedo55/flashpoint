# Prompt and extractor evaluation

Measured October 19, 2026. The demo now defaults to `anthropic/claude-opus-5.5` through Vercel AI Gateway, with medium reasoning and a 10,000-token output limit. `AI_GATEWAY_MODEL` remains configurable. This is a provisional choice for generating more useful candidates for human review, not a demonstrated overall accuracy win.

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
