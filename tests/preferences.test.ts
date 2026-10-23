import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnalysisResult } from "../src/lib/analysis";
import type { SessionDocument } from "../src/lib/documents";
import { completeAnalysis, decidePreference, deleteDocument, deletePreference, emptyWorkspace, swapFixtureWorkspace } from "../src/lib/workspace";

const originalRule = "Use fully labeled five-point satisfaction scales.";
function pendingWorkspace() {
  const state = emptyWorkspace();
  state.documents.push({ id: "document", name: "Survey.docx", fileType: "docx", byteSize: 4,
    file: new File(["test"], "Survey.docx"), url: "blob:test", status: "ready",
    sections: [{ location: "Paragraph 1", text: "How satisfied are you?" }], warnings: [], characterCount: 22, sectionCount: 1 } satisfies SessionDocument);
  state.selectedIds.push("document");
  state.analyses.push({ id: "analysis", key: "selection", sources: [{ id: "document", name: "Survey.docx" }],
    status: "running", suggestionCount: 0, rejectedCount: 0 });
  return state;
}
function result(id = "preference", rule = originalRule): AnalysisResult {
  return { classifications: [{ documentId: "document", purpose: "questionnaire", rationale: "Respondent-ready questions.", evidence: [{ location: "Paragraph 1", quote: "How satisfied are you?" }] }], rejectedCount: 1, suggestions: [{ id, purpose: "questionnaire", category: "Scales", title: "Labeled scales", rule,
    suggestedRule: rule, rationale: "The questionnaire uses labeled scales.", status: "pending",
    evidence: [{ documentId: "document", document: "Survey.docx", location: "Paragraph 1", quote: "How satisfied are you?" }] }] };
}

test("fixture switches preserve real sessions and reject only entry during real work", () => {
  const running = pendingWorkspace();
  const processing = { ...running, analyses: [], documents: running.documents.map((item) => ({ ...item, status: "processing" as const })) };
  const fixture = emptyWorkspace();
  assert.equal(swapFixtureWorkspace(running, null, fixture), null);
  assert.equal(swapFixtureWorkspace(processing, null, fixture), null);
  assert.equal(swapFixtureWorkspace(running, null, null)?.state, running);

  const real = completeAnalysis(running, "analysis", result());
  const entered = swapFixtureWorkspace(real, null, processing)!;
  assert.equal(entered.state, processing);
  assert.equal(entered.realSession, real);
  const changed = swapFixtureWorkspace(entered.state, entered.realSession, fixture)!;
  assert.equal(changed.state, fixture);
  assert.equal(changed.realSession, real);
  const restored = swapFixtureWorkspace(entered.state, entered.realSession, null)!;
  assert.equal(restored.state, real);
  assert.equal(restored.realSession, null);
  assert.equal(restored.state.preferences.length, 1);
});

test("confirm, edit, deny and return to review preserve source evidence and the original suggestion", () => {
  const pending = completeAnalysis(pendingWorkspace(), "analysis", result());
  const confirmed = decidePreference(pending, "preference", "confirmed", "  Use labeled scales for every satisfaction question.  ");
  assert.equal(pending.preferences[0].status, "pending");
  assert.equal(confirmed.preferences[0].rule, "Use labeled scales for every satisfaction question.");
  assert.equal(confirmed.preferences[0].suggestedRule, originalRule);
  assert.deepEqual(confirmed.preferences[0].evidence, pending.preferences[0].evidence);
  const denied = decidePreference(confirmed, "preference", "denied");
  assert.equal(denied.preferences[0].status, "denied");
  const returned = decidePreference(denied, "preference", "pending");
  assert.equal(returned.preferences.filter((item) => item.status === "confirmed").length, 0);
  for (const rule of ["short", " ".repeat(20), "x".repeat(501)]) {
    assert.throws(() => decidePreference(pending, "preference", "confirmed", rule), /10–500/);
  }
  assert.throws(() => decidePreference(pending, "missing", "confirmed"), /no longer/);
});

test("later analyses do not replace reviewed preferences or duplicate suggestions", () => {
  let state = decidePreference(completeAnalysis(pendingWorkspace(), "analysis", result()), "preference", "denied");
  state = { ...state, analyses: [...state.analyses, { ...state.analyses[0], id: "next", status: "running" }] };
  const completed = completeAnalysis(state, "next", result("new", originalRule.toUpperCase()));
  assert.equal(completed.preferences.length, 1);
  assert.equal(completed.preferences[0].status, "denied");
  assert.equal(completed.analyses[1].suggestionCount, 0);
  assert.equal(completed.analyses[1].rejectedCount, 1);
  assert.deepEqual(completed.selectedIds, []);
  assert.equal(completeAnalysis(completed, "next", result("late")), completed);
});

test("classifications stay in the session and identical rules remain separate across purposes", () => {
  const first = completeAnalysis(pendingWorkspace(), "analysis", result());
  assert.equal(first.documents[0].classification?.purpose, "questionnaire");
  const confirmed = decidePreference(first, "preference", "confirmed");
  const next = { ...confirmed, analyses: [...confirmed.analyses, { ...confirmed.analyses[0], id: "next", status: "running" as const }] };
  const differentPurpose = result("plan");
  differentPurpose.suggestions[0].purpose = "research_plan";
  const completed = completeAnalysis(next, "next", differentPurpose);
  assert.equal(completed.preferences.length, 2);
  assert.equal(completed.preferences[0].status, "confirmed");
  assert.equal(completed.preferences[0].purpose, "questionnaire");
  assert.equal(emptyWorkspace().documents.length, 0);
});

test("a new or cleared session cannot recover an old analysis response", () => {
  const first = completeAnalysis(pendingWorkspace(), "analysis", result());
  const second = emptyWorkspace();
  assert.equal(completeAnalysis(second, "analysis", result()), second);
  assert.deepEqual(second, { documents: [], preferences: [], analyses: [], selectedIds: [] });
  assert.equal(first.preferences.length, 1);
  assert.notEqual(second.documents, emptyWorkspace().documents);
});

test("documents remain available while cited or analyzed; deleting the last suggestion permits reanalysis", () => {
  const running = pendingWorkspace();
  assert.throws(() => deleteDocument(running, "document"), /analysis to finish/);
  const completed = completeAnalysis(running, "analysis", result());
  assert.throws(() => deleteDocument(completed, "document"), /supports existing preferences/);
  const withoutPreference = deletePreference(completed, "preference");
  assert.equal(withoutPreference.analyses.length, 0);
  const withoutDocument = deleteDocument(withoutPreference, "document");
  assert.deepEqual(withoutDocument, emptyWorkspace());
});
