import { z } from "zod";
import type { Preference } from "./preferences";

export const MAX_ANALYSIS_DOCUMENTS = 5;
export const MAX_ANALYSIS_CHARACTERS = 80_000;
export const analysisInputSchema = z.object({
  documents: z.array(z.object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(255),
    sections: z.array(z.object({
      location: z.string().trim().min(1).max(100),
      text: z.string().max(MAX_ANALYSIS_CHARACTERS),
    })).min(1).max(5000),
  })).min(1).max(MAX_ANALYSIS_DOCUMENTS),
});
export type AnalysisInput = z.infer<typeof analysisInputSchema>;
export type SourcePassage = { sourceId: string; documentId: string; document: string; location: string; text: string };

// The request contains all source text. Nothing is retained between requests.
export function prepareAnalysisSources(input: AnalysisInput): SourcePassage[] {
  const parsed = analysisInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Provide one to five documents with extracted text.");
  const { documents } = parsed.data;
  if (new Set(documents.map((document) => document.id)).size !== documents.length) {
    throw new Error("Select different documents.");
  }
  if (documents.some((document) => !document.sections.some((section) => section.text.trim()))) {
    throw new Error("Each document needs readable text.");
  }
  const sources: SourcePassage[] = documents.flatMap((document, documentIndex) => document.sections.map((section, index) => ({
    sourceId: `d${documentIndex + 1}s${index + 1}`, documentId: document.id, document: document.name, ...section,
  }))).filter((source) => source.text.trim());
  if (JSON.stringify(sources).length > MAX_ANALYSIS_CHARACTERS) {
    throw new Error("This selection exceeds 80,000 characters including source references. Choose fewer or smaller documents; no text has been sent.");
  }
  return sources;
}

export type AnalysisResult = {
  suggestions: Omit<Preference, "analysisId">[];
  rejectedCount: number;
};
export type AnalysisRun = {
  id: string;
  key: string;
  sources: { id: string; name: string }[];
  status: "running" | "completed" | "failed";
  suggestionCount: number;
  rejectedCount: number;
  error?: string;
  // The model's reasoning summary, streamed while the run is in flight and kept afterwards.
  notes?: string;
  startedAt?: number;
  finishedAt?: number;
};

// tRPC streams notes and the verified result; failures use its standard error handling.
export type AnalysisStreamEvent =
  | { type: "note"; text: string }
  | { type: "result"; result: AnalysisResult };
