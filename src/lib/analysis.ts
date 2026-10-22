import { z } from "zod";
import type { Preference } from "./preferences";
import { documentSectionSchema, imageAssetsSchema, type DocumentSection } from "./documents";

export const MAX_ANALYSIS_DOCUMENTS = 5;
export const MAX_ANALYSIS_CHARACTERS = 400_000;
export const ANALYSIS_TIMEOUT_MS = 180_000;
export const MAX_ANALYSIS_REQUEST_BYTES = 3_500_000;
// Allow the server to validate the result or return a model timeout before the browser aborts.
export const ANALYSIS_REQUEST_TIMEOUT_MS = ANALYSIS_TIMEOUT_MS + 30_000;
export const analysisInputSchema = z.object({
  documents: z.array(z.object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(255),
    warnings: z.array(z.string().max(500)).max(20).optional(),
    assets: imageAssetsSchema.optional(),
    sections: z.array(documentSectionSchema.extend({
      location: z.string().trim().min(1).max(100),
      text: z.string().max(MAX_ANALYSIS_CHARACTERS),
    })).min(1).max(5000),
  })).min(1).max(MAX_ANALYSIS_DOCUMENTS),
});
export type AnalysisInput = z.infer<typeof analysisInputSchema>;
export type SourcePassage = DocumentSection & { sourceId: string; documentId: string; document: string; imageDataUrl?: string; extractionWarnings?: string[] };

// The model needs ordered text and citation IDs. Resolve names and locations from
// SourcePassage after generation instead of repeating that metadata for every paragraph.
// Use this same serialization for preflight and the actual model request.
export function serializeAnalysisSources(sources: SourcePassage[]): string {
  const documents = new Map<string, { document: string; extractionWarnings?: string[]; passages: { sourceId: string; text: string; kind?: DocumentSection["kind"]; location?: string }[] }>();
  for (const source of sources) {
    let document = documents.get(source.documentId);
    if (!document) {
      document = { document: source.document, ...(source.extractionWarnings?.length ? { extractionWarnings: source.extractionWarnings } : {}), passages: [] };
      documents.set(source.documentId, document);
    }
    document.passages.push({ sourceId: source.sourceId, text: source.text, ...(source.kind ? { kind: source.kind } : {}),
      // Keep slide locations so attached notes/charts are not mistaken for extra slides.
      ...(source.location.startsWith("Slide ") ? { location: source.location } : {}),
    });
  }
  return JSON.stringify([...documents.values()]);
}

// The request contains all source text. Nothing is retained between requests.
export function prepareAnalysisSources(input: AnalysisInput): SourcePassage[] {
  const parsed = analysisInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Provide one to five documents with extracted text.");
  const { documents } = parsed.data;
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength > MAX_ANALYSIS_REQUEST_BYTES) {
    throw new Error("This selection contains too much text and image data for one request. Choose fewer documents; no content has been sent.");
  }
  for (const document of documents) for (const section of document.sections) {
    if ((section.kind === "image") !== Boolean(section.imageId) || (section.imageId && !document.assets?.[section.imageId])) {
      throw new Error("An image reference is missing its source. Upload the document again.");
    }
  }
  if (new Set(documents.map((document) => document.id)).size !== documents.length) {
    throw new Error("Select different documents.");
  }
  if (documents.some((document) => !document.sections.some((section) => section.text.trim()))) {
    throw new Error("Each document needs readable text.");
  }
  const sources: SourcePassage[] = documents.flatMap((document, documentIndex) => document.sections.map((section, index) => ({
    sourceId: `d${documentIndex + 1}s${index + 1}`, documentId: document.id, document: document.name, ...section,
    ...(section.imageId ? { imageDataUrl: document.assets![section.imageId] } : {}),
    ...(document.warnings?.length ? { extractionWarnings: document.warnings } : {}),
  }))).filter((source) => source.text.trim());
  if (new Set(sources.flatMap((source) => source.imageDataUrl ? [source.imageDataUrl] : [])).size > 40) {
    throw new Error("Select documents with at most 40 distinct images per analysis; no content has been sent.");
  }
  if (serializeAnalysisSources(sources).length > MAX_ANALYSIS_CHARACTERS) {
    throw new Error(`This selection exceeds ${MAX_ANALYSIS_CHARACTERS.toLocaleString("en-US")} characters including source references. Choose fewer or smaller documents; no text has been sent.`);
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
