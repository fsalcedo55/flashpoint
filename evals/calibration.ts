import type { SourcePassage } from "../src/lib/analysis";
import type { LanguageModel } from "ai";
import type { VerifiedSuggestion } from "../src/server/ai/preference-extraction";
import { gradeSuggestions, type Check } from "./grading";

// Independent labeled examples sanity-check the judge before it grades model outputs.
const texts = [
  "Q4. How satisfied are you? Very dissatisfied; Somewhat dissatisfied; Neither satisfied nor dissatisfied; Somewhat satisfied; Very satisfied.",
  "Legacy client tracker: the agreement scale must use seven points with endpoint labels only. Preserve this client requirement.",
  "This project note contains commercial facts only; no questionnaire or research design is included.",
  "Q11. How likely are you to order again?",
  "Q12. What is the one change that would most improve your next delivery?",
  "Programming: Keep the concept description available above the rating question.",
  "Q20. Which device do you use most? [Single response] Phone / Tablet / Laptop.",
  "Q21. How likely are you to request a brochure? [Single response] 1 Very unlikely / 2 Unlikely / 3 Neither / 4 Likely / 5 Very likely.",
  "Q22. [If Q21=4 or 5] Why are you likely? [Open ended] [If Q21=1, 2 or 3] Why are you not likely? [Open ended]",
  "Q23. [If Q20=8] Why did you select this option? [Open ended]",
];
const sources: SourcePassage[] = texts.map((text, i) => ({ sourceId: `d1s${i + 1}`, documentId: "calibration", document: "Calibration.docx", location: `Paragraph ${i + 1}`, text }));
const item = (rule: string, indices: number[], rationale = "This is a tentative observation from this document, which may not generalize."): VerifiedSuggestion => ({ category: "Survey structure", title: "Calibration candidate", rule, rationale,
  evidence: indices.map((i) => ({ documentId: sources[i].documentId, location: sources[i].location, quote: sources[i].text })) });
const suggestions = [
  item("For five-point satisfaction items, label every response option.", [0]),
  item("Place demographics at the end of every questionnaire.", [0]),
  item("Treat documents without questionnaire design as insufficient evidence for preference inference.", [2]),
  item("Always use five-point scales in every questionnaire.", [0]),
  item("Ask for one improvement idea after the likelihood-to-order question.", [3, 4]),
  item("Keep the concept description visible above its rating question.", [5]),
  item("For a most-used-device question, ask respondents to choose a single answer.", [6]),
  item("Use a single-response format when asking which device a respondent uses most.", [6]),
  item("For brochure-interest questions, ask a positive open-ended reason for ratings 4–5 and a negative reason for ratings 1–3.", [7, 8]),
  item("For a five-point brochure-interest scale running from 1 Very unlikely to 5 Very likely, use a likely open-ended reason for 4–5 and a not-likely reason for 1–3.", [7, 8]),
  item("When a respondent selects a laptop as their main device, ask why they chose it.", [6, 9]),
];
export async function calibrateJudge(model: LanguageModel) {
  const result = await gradeSuggestions(model, { id: "calibration", description: "Judge calibration", files: [], patterns: [
    { id: "response-format", description: "Specify a single-choice OR multiple-choice OR open-ended response format for an appropriate question. Any one format suffices; exact wording is not required." },
    { id: "scoped-routing", description: "On a five-point brochure-interest scale, route 4–5 to a likely reason and 1–3 to a not-likely reason, preserving the scale context." },
  ], criteria: [] }, sources, suggestions);
  const grades = new Map(result.grade.suggestions.map((entry) => [entry.id, entry]));
  const strong = (id: number) => { const grade = grades.get(id)!; return grade.support === "supported" && grade.scope === "appropriate" && grade.reusable; };
  const checks: Check[] = [
    { name: "Supported scoped scale", passed: strong(1), detail: grades.get(1)!.reason },
    { name: "Real but irrelevant quote", passed: grades.get(2)!.support === "unsupported", detail: grades.get(2)!.reason },
    { name: "Parser advice is not a learned preference", passed: !grades.get(3)!.reusable, detail: grades.get(3)!.reason },
    { name: "Contradicted universal rule", passed: grades.get(4)!.scope === "overgeneralized", detail: grades.get(4)!.reason },
    { name: "Sequence demonstrated by question order", passed: strong(5), detail: grades.get(5)!.reason },
    { name: "Explicit survey screen instruction", passed: strong(6), detail: grades.get(6)!.reason },
    { name: "Equivalent response-format wording", passed: strong(7) && strong(8), detail: `${grades.get(7)!.reason} ${grades.get(8)!.reason}` },
    { name: "Numeric routing requires scale scope", passed: grades.get(9)!.scope === "overgeneralized" && strong(10), detail: `${grades.get(9)!.reason} ${grades.get(10)!.reason}` },
    { name: "Code-to-answer mapping cannot be guessed", passed: grades.get(11)!.support !== "supported", detail: grades.get(11)!.reason },
    ...result.grade.patterns.map((pattern) => ({ name: `Coverage: ${pattern.id}`, passed: pattern.suggestionIds.length > 0 && pattern.suggestionIds.every((id) => strong(id)) &&
      (pattern.id !== "scoped-routing" || pattern.suggestionIds.includes(10)), detail: pattern.reason })),
  ];
  return { ...result, checks, passed: checks.every((check) => check.passed) };
}
