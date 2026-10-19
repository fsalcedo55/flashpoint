import type { LanguageModel } from "ai";
import type { SourcePassage, VerifiedSuggestion } from "../src/server/ai/preference-extraction";
import { gradeSuggestions, type Check } from "./grading";

// Independent labeled examples sanity-check the judge before it grades model outputs.
const texts = [
  "Q4. How satisfied are you? Very dissatisfied; Somewhat dissatisfied; Neither satisfied nor dissatisfied; Somewhat satisfied; Very satisfied.",
  "Legacy client tracker: the agreement scale must use seven points with endpoint labels only. Preserve this client requirement.",
  "This project note contains commercial facts only; no questionnaire or research design is included.",
  "Q11. How likely are you to order again?",
  "Q12. What is the one change that would most improve your next delivery?",
  "Programming: Keep the concept description available above the rating question.",
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
];
export async function calibrateJudge(model: LanguageModel) {
  const result = await gradeSuggestions(model, { id: "calibration", description: "Judge calibration", files: [], patterns: [], criteria: [] }, sources, suggestions);
  const grades = new Map(result.grade.suggestions.map((entry) => [entry.id, entry]));
  const strong = (id: number) => { const grade = grades.get(id)!; return grade.support === "supported" && grade.scope === "appropriate" && grade.reusable; };
  const checks: Check[] = [
    { name: "Supported scoped scale", passed: strong(1), detail: grades.get(1)!.reason },
    { name: "Real but irrelevant quote", passed: grades.get(2)!.support === "unsupported", detail: grades.get(2)!.reason },
    { name: "Parser advice is not a learned preference", passed: !grades.get(3)!.reusable, detail: grades.get(3)!.reason },
    { name: "Contradicted universal rule", passed: grades.get(4)!.scope === "overgeneralized", detail: grades.get(4)!.reason },
    { name: "Sequence demonstrated by question order", passed: strong(5), detail: grades.get(5)!.reason },
    { name: "Explicit survey screen instruction", passed: strong(6), detail: grades.get(6)!.reason },
  ];
  return { ...result, checks, passed: checks.every((check) => check.passed) };
}
