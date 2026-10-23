import type { AnalysisResult, AnalysisRun } from "./analysis";
import type { SessionDocument } from "./documents";
import type { Preference, PreferenceStatus } from "./preferences";

export type WorkspaceState = {
  documents: SessionDocument[];
  preferences: Preference[];
  analyses: AnalysisRun[];
  selectedIds: string[];
};

export function emptyWorkspace(): WorkspaceState {
  return { documents: [], preferences: [], analyses: [], selectedIds: [] };
}

const ruleKey = (purpose: Preference["purpose"], rule: string) => `${purpose}:${rule.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "")}`;

export function completeAnalysis(state: WorkspaceState, id: string, result: AnalysisResult): WorkspaceState {
  // A reset or removed run must never be repopulated by a late response.
  if (!state.analyses.some((run) => run.id === id && run.status === "running")) return state;
  const known = new Set(state.preferences.map((preference) => ruleKey(preference.purpose, preference.suggestedRule)));
  const added: Preference[] = [];
  for (const suggestion of result.suggestions) {
    const key = ruleKey(suggestion.purpose, suggestion.rule);
    if (known.has(key)) continue;
    known.add(key);
    added.push({ ...suggestion, analysisId: id, status: "pending" });
  }
  return {
    ...state,
    documents: state.documents.map((document) => {
      const classification = result.classifications.find((item) => item.documentId === document.id);
      return classification ? { ...document, classification } : document;
    }),
    preferences: [...state.preferences, ...added],
    selectedIds: [],
    analyses: state.analyses.map((run) => run.id === id
      ? { ...run, status: "completed", suggestionCount: added.length, rejectedCount: result.rejectedCount } : run),
  };
}

export function decidePreference(state: WorkspaceState, id: string, status: PreferenceStatus, rule?: string): WorkspaceState {
  const current = state.preferences.find((item) => item.id === id);
  if (!current) throw new Error("This preference is no longer in this session.");
  const nextRule = rule?.trim() ?? current.rule;
  if (nextRule.length < 10 || nextRule.length > 500) throw new Error("Use 10–500 characters for a preference.");
  return { ...state, preferences: state.preferences.map((item) => item.id === id ? { ...item, status, rule: nextRule } : item) };
}

export function deletePreference(state: WorkspaceState, id: string): WorkspaceState {
  const removed = state.preferences.find((item) => item.id === id);
  const preferences = state.preferences.filter((item) => item.id !== id);
  return { ...state, preferences, analyses: state.analyses.filter((run) =>
    run.id !== removed?.analysisId || preferences.some((item) => item.analysisId === run.id)) };
}

export function deleteDocument(state: WorkspaceState, id: string): WorkspaceState {
  if (state.preferences.some((item) => item.evidence.some((source) => source.documentId === id))) {
    throw new Error("This document supports existing preferences. Delete those preferences before removing it.");
  }
  if (state.analyses.some((run) => run.status === "running" && run.sources.some((source) => source.id === id))) {
    throw new Error("Wait for the analysis to finish before removing this document.");
  }
  return { ...state, documents: state.documents.filter((item) => item.id !== id),
    selectedIds: state.selectedIds.filter((item) => item !== id),
    analyses: state.analyses.filter((run) => !run.sources.some((source) => source.id === id)) };
}
