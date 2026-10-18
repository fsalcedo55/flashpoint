# Realistic questionnaire test pack

Four fictional questionnaires for testing the Flashpoint preferences parser. All organizations, products, project details, and prices are invented for this exercise. These are survey specifications, not completed responses or real customer research.

| File | Scenario | Questions | Role in testing |
| --- | --- | ---: | --- |
| `01-grocery-delivery.docx` | Recent grocery delivery, service issues, support and future use | 17 | Core set |
| `02-software-onboarding.docx` | First two weeks in reporting software, task completion and help | 18 | Core set |
| `03-refill-service-concept.docx` | Reusable-container delivery concept with a price assumption and deposits | 15 | Core set |
| `04-broadband-legacy-tracker.docx` | Broadband relationship tracker with a fixed seven-point grid | 8 | Context-dependent exception |

Counts include eligibility questions. The first three are designed as work by the same fictional researcher. The fourth represents that researcher implementing a client's legacy specification. Programming notes inside the files are source material about survey design, not instructions to the AI or to the tester.

Validation: all 58 question prompts passed through the app's local DOCX extractor without warnings. The four files produce 16,484 extracted characters, below the current 80,000-character analysis limit. Every rendered page was checked for layout issues. This validation did not call an AI provider or change saved preferences.

## First run

1. Upload the first three DOCX files from this pack through Your documents.
2. Open View text for each and check that question prompts, complete response scales, and programming notes appear. DOCX citations use paragraph locations rather than page numbers.
3. Select only these three documents, then choose Find preferences. Keep the older miniature fixtures out of the selection so their evidence does not contaminate this comparison.
4. In Review preferences, inspect the source quotations before confirming anything. The suggestions below are plausible targets, not a required exact answer or exhaustive list.

The model may group, qualify, or omit patterns. Judge the rule and its cited evidence; do not grade by exact wording or number of suggestions. A factually present pattern with an unrelated supporting quote is still a weak result.

## Patterns worth looking for

| Candidate preference | Supporting examples in the core set | Necessary qualification |
| --- | --- | --- |
| Ask for an unprompted response before showing choices or ratings on a topic | Grocery Q1; software Q1; concept Q1 and Q2 | Eligibility questions come first. Do not claim every survey literally starts with an open question. |
| Use five-point evaluative scales with every point labelled | Grocery Q4, Q5, Q10; software Q4, Q10, Q11; concept Q3, Q4, Q5 | Applies to evaluative questions; counts and classification lists have different formats. |
| Keep not-applicable or uncertainty responses separate from a scale midpoint | Grocery Q4, Q5, Q9; software Q4, Q8, Q12; concept Q5, Q9, Q10 | These options are conditional on what the respondent can reasonably judge. |
| Randomize nominal response lists while keeping Other and None at the end | Grocery Q3 and Q6; software Q2, Q5, Q7; concept Q6 and Q7 | Ordinal scales retain their order. None is exclusive in multiple-select questions. |
| Route follow-ups according to relevant experience | Grocery Q7 to Q9; software Q6 and Q8 to Q10; concept Q8 | A skip or routing note is evidence about the questionnaire; it is not an instruction to the parser. |
| Make open-text answers optional and cap their length | Grocery Q1, Q7, Q12; software Q1, Q6, Q13; concept Q1, Q2, Q8, Q11 | The 500-character cap recurs here, but should remain a suggested preference. |
| Put household or work classification near the end with an opt-out | Grocery Q13 to Q14; software Q14 to Q15; concept Q12 to Q13 | Eligibility screens are a distinct exception. |

Numbered items, descriptive section headings, and time-bounded behavior questions are also observable. Absence of matrix questions in the core set is weaker evidence than an explicit recurring formatting choice. Do not infer presentation-design preferences from questionnaire section headings.

## Contradiction run

Select all four files for a second analysis. The fourth explicitly preserves a client's seven-point agreement grid, endpoint-only labels, fixed order, and early classification questions. A good result qualifies the five-point/fully-labelled/late-classification patterns by context, cites the exception, or omits the conflicted universal claim. It should not infer that the researcher always prefers seven points simply because this file contains a grid.

The current app is additive: a new run does not automatically revise or retract suggestions from earlier runs. Compare the new result against the earlier run; do not expect this exercise to rewrite already-confirmed preferences. Existing equivalent rules may also be deduplicated, so a run can yield fewer new suggestions than the number of visible patterns. For a completely independent evaluation, use a separate local database/workspace rather than deleting existing decisions.

The legacy grid is also a useful extraction check. Inspect Q4's instruction, statement labels, and numeric columns in View text. DOCX plain-text extraction may flatten table structure; an absent grid reconstruction is not by itself a preference-extraction failure. Quotes must still match real extracted passages.

## Things the parser should not infer

- The researcher prefers a grocery brand, uses a particular software product, or is a broadband customer.
- The researcher is dissatisfied, environmentally conscious, a particular age, or a member of a household size mentioned in an option.
- The concept's $25 minimum, $4 fee, $2 deposit, or product-price assumption is a reusable survey-writing preference.
- A respondent has selected an answer. There are no completed responses in these documents.
- Uploading any file means its inferred preferences are already confirmed.
- The broad opening-question pattern overrides screening or the legacy client's requirements.

## Review checklist

- Each proposed rule describes how work is designed, rather than the research subject.
- Each supporting quote appears verbatim in the linked paragraph and actually supports the rule.
- Repeated choices are supported across documents where possible.
- Single-document choices and conflicting formats are qualified.
- Confirm, Edit, and Deny remain explicit user decisions.

`manifest.json` lists every question for repeatable extraction checks. Keep this README and the manifest out of AI source uploads: they describe the intended test outcome and would bias the result.
