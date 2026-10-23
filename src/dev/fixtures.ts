// Dev-only worst-case workspaces for stress-testing the UI (the break-ui pass).
// Every value is realistic or at a schema limit (analysis.ts, preference-extraction.ts).
// Loaded only from the development branch in workspace-provider, so it never ships.
import type { AnalysisRun } from "@/lib/analysis";
import type { DocumentPurpose, PreferencePurpose } from "@/lib/document-purpose";
import type { SessionDocument } from "@/lib/documents";
import type { Preference, PreferenceStatus } from "@/lib/preferences";
import type { WorkspaceState } from "@/lib/workspace";

export const fixtureStates = ["worst", "empty", "one", "many"] as const;
export type FixtureState = (typeof fixtureStates)[number];

let counter = 0;
const id = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

function doc(name: string, fileType: SessionDocument["fileType"], extra: Partial<SessionDocument> & { purpose?: DocumentPurpose } = {}): SessionDocument {
  const { purpose, ...rest } = extra;
  const documentId = rest.id ?? id();
  return {
    id: documentId, name, fileType, byteSize: 39_000, file: new File([""], name), url: "#",
    status: "ready", sections: [{ location: "Paragraph 1", text: "Fixture text." }], warnings: [],
    characterCount: 1_284, sectionCount: 26,
    ...(purpose ? { classification: { documentId, purpose, rationale: "The document is a structured instrument with screener, main section and closing classification questions.", evidence: [{ location: "Paragraph 1", quote: "Fixture text." }] } } : {}),
    ...rest,
  };
}

function preference(purpose: PreferencePurpose, category: string, title: string, rule: string, status: PreferenceStatus, evidence: Preference["evidence"], rationale = "Three instruments use the same pattern, and the one exception is explicitly client-imposed."): Preference {
  return { id: id(), analysisId: "analysis-1", purpose, category, title, suggestedRule: rule, rule, rationale, status, evidence };
}

const LONG_RULE = "For standalone bipolar appeal, satisfaction, ease, relevance, clarity or likelihood ratings in concept, onboarding and recent-experience questionnaires, use five fully verbalised scale points ordered from negative to positive with an explicit neutral midpoint, keep any “I cannot remember” or “Not applicable” option visually separate from the scale, and retain a legacy seven-point grid only where the client requires comparability with earlier tracker waves or published benchmarks.";
const LONG_QUOTE = "Q5. Thinking about the whole delivery, from placing the order to unpacking it, how satisfied or dissatisfied were you with each of the following?\nSelect one per row: Very dissatisfied; Somewhat dissatisfied; Neither satisfied nor dissatisfied; Somewhat satisfied; Very satisfied; I cannot remember.\nRows: The time slot options available; How easy it was to change the order after placing it; Whether every item you ordered arrived; The condition of chilled and frozen items; The condition of fresh produce; How well substitutions matched what you ordered; How the driver handled the handover; The communication you received about the order's progress; The accuracy of the estimated arrival time; The overall value for money of the delivery charge.\nProgramming: Keep the five scale labels in this order on every row. Keep “I cannot remember” visually separate from the midpoint. Randomise the row order, but keep “The overall value for money of the delivery charge” last. Do not show a progress bar on this screen. On mobile, show one row per screen and keep the scale labels visible above the options, never abbreviated or replaced by numbers.";
const LONG_LOCATION = "Slide 47 – Speaker notes – Appendix B: Methodology, sampling frame and weighting scheme";

function worst(): WorkspaceState {
  counter = 0;
  const deck = doc("Q3 Board Deck — FINAL (revised) v12 [approved by legal].pptx", "pptx", { purpose: "research_report", byteSize: 4_400_000, sectionCount: 128, characterCount: 1_284_000 });
  const tracker = doc("Northwind_Industries_Holdings_Customer_Experience_Tracker_Wave_14_Questionnaire_FINAL_v3_clean.docx", "docx", { purpose: "questionnaire" });
  const tiny = doc("a.pdf", "pdf", { purpose: "uncertain", byteSize: 1_000, sectionCount: 1, characterCount: 12 });
  const vietnamese = doc("Đặng Thị Ngọc Hân – phỏng vấn người dùng.docx", "docx", { status: "processing", sectionCount: 0, sections: [] });
  const japanese = doc("研究計画書_最終版_クライアント確認済み_2026年10月.pdf", "pdf", { status: "failed", sectionCount: 0, sections: [], error: "This PDF has no extractable text. It may be a scanned document; export it again with selectable text, or upload the original DOCX." });
  const german = doc("Leistungsbeschreibung_Marktforschung_Kundenzufriedenheitsbefragung.docx", "docx", { purpose: "research_plan" });
  const plain = doc("sow.docx", "docx");
  const documents = [deck, tracker, tiny, vietnamese, japanese, german, plain];
  const cite = (d: SessionDocument, quote = "Q3. How appealing or unappealing is this service to you?", location = "Paragraph 22 – Paragraph 23") => ({ documentId: d.id, document: d.name, location, quote });
  const preferences = [
    preference("questionnaire", "Answer formats", "Use five-point bipolar scales with a separate “cannot remember” option across tracker waves", LONG_RULE, "pending",
      [cite(tracker, LONG_QUOTE, LONG_LOCATION), cite(tracker), cite(deck, "<script>alert(1)</script> &amp; **bold** stays literal text", "Slide 3"), cite(tiny, "Q1. Open text. Optional.", "Page 1")],
      "The non-tracker instruments repeatedly use fully labelled, negative-to-positive five-point bipolar scales. The onboarding usefulness scale is unipolar and therefore outside this rule. The tracker’s seven-point grid is an explicit client-imposed exception, not evidence of a competing author preference. Two further instruments use the same separation of “I cannot remember” from the midpoint, and one deck summarises the convention as house style in its methodology appendix, which supports treating it as a deliberate, repeated choice rather than a template artefact copied between projects."),
    preference("questionnaire", "Tone & language", "NPS", "Ask NPS last.", "pending", [cite(tracker)]),
    preference("research_plan", "Scope & deliverables", "Pair each alternative scope with its price and the research phases it includes", "In research plans/SOWs offering full-program and reduced-phase alternatives, include a summary that pairs each scenario's price with its included research phases.", "pending", [cite(german, "Leistungsbeschreibung_Marktforschung_Kundenzufriedenheitsbefragung_Phase1_bis_Phase4_inklusive_Berichtslegung", "Paragraph 4")]),
    preference("research_report", "Report structure", "Lead with the answer", "Open each report section with the finding, then the evidence that supports it.", "pending", [cite(deck, "Executive summary", "Slide 2")]),
    preference("questionnaire", "Question order", "Capture first reactions before ratings", "In single-concept evaluations, ask an optional first-reaction open-text question before any ratings.", "confirmed", [cite(tracker)]),
    preference("research_plan", "Project planning", "Make interphase alignment explicit", "Name the decision each phase hands to the next, and who signs it off.", "denied", [cite(german), cite(german)]),
  ];
  const analyses: AnalysisRun[] = [
    { id: "analysis-3", key: "3", status: "failed", suggestionCount: 0, rejectedCount: 0, sources: [{ id: japanese.id, name: japanese.name }],
      error: "The model returned evidence that could not be matched to the extracted text, so no suggestions were kept. Try again, or analyze fewer documents at once.", startedAt: 1, finishedAt: 209_001 },
    { id: "analysis-2", key: "2", status: "completed", suggestionCount: 0, rejectedCount: 1, sources: [{ id: tiny.id, name: tiny.name }], startedAt: 1, finishedAt: 1_001 },
    { id: "analysis-1", key: "1", status: "completed", suggestionCount: 1, rejectedCount: 12, sources: [deck, tracker, tiny, german, plain].map(({ id, name }) => ({ id, name })), startedAt: 1, finishedAt: 209_001 },
  ];
  return { documents, preferences, analyses, selectedIds: [] };
}

function one(): WorkspaceState {
  counter = 0;
  const tracker = doc("tracker.docx", "docx", { purpose: "questionnaire", sectionCount: 1 });
  return {
    documents: [tracker],
    preferences: [
      preference("questionnaire", "Answer formats", "Use five-point scales", "Use fully labelled five-point scales.", "pending", [{ documentId: tracker.id, document: tracker.name, location: "Paragraph 1", quote: "Very dissatisfied … Very satisfied" }]),
      preference("questionnaire", "Question order", "Ask NPS last", "Ask the NPS question last.", "confirmed", [{ documentId: tracker.id, document: tracker.name, location: "Paragraph 2", quote: "How likely are you to recommend…" }]),
    ],
    analyses: [{ id: "analysis-1", key: "1", status: "completed", suggestionCount: 1, rejectedCount: 1, sources: [{ id: tracker.id, name: tracker.name }], startedAt: 1, finishedAt: 1_001 }],
    selectedIds: [],
  };
}

// The realistic upper bound for an unpaginated session: many analyses' worth of suggestions.
function many(): WorkspaceState {
  counter = 0;
  const documents = Array.from({ length: 40 }, (_, index) => doc(`Customer experience questionnaire wave ${index + 1}.docx`, "docx", { purpose: "questionnaire" }));
  const categories = ["Question order", "Answer formats", "Tone & language", "Survey structure"];
  const preferences = Array.from({ length: 150 }, (_, index) => preference("questionnaire", categories[index % 4], `Suggestion ${index + 1} about consistent scale labels`,
    `Rule ${index + 1}: keep scale labels identical across every wave of the tracker.`, index < 128 ? "pending" : "confirmed",
    [{ documentId: documents[index % 40].id, document: documents[index % 40].name, location: "Paragraph 3", quote: "Very dissatisfied … Very satisfied" }]));
  return { documents, preferences, analyses: [], selectedIds: [] };
}

export function fixtureWorkspace(state: FixtureState): WorkspaceState {
  if (state === "empty") return { documents: [], preferences: [], analyses: [], selectedIds: [] };
  return state === "worst" ? worst() : state === "one" ? one() : many();
}
