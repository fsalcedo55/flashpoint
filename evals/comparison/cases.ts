import { readFile } from "node:fs/promises";
import { z } from "zod";
import { cases, type EvalCase } from "../cases";
import { loadCase } from "../fixtures";
import { extractDocument } from "../../src/server/services/document-extraction";
import { docxFixture } from "../../tests/document-fixtures";
import { MAX_ANALYSIS_REQUEST_BYTES, serializeAnalysisSources, type SourcePassage } from "../../src/lib/analysis";
import { documentSectionSchema, imageDataUrlSchema } from "../../src/lib/documents";
import { chunks, SETTINGS } from "./strategies";

export type ComparisonCase = { rubric: EvalCase; sources: SourcePassage[]; reusePrevious: boolean };

// A controlled load fixture, not an authentic 600-paragraph customer survey.
// The changing service/topic values are project facts; the repeated design
// constraints are deliberately consistent with the fourth legacy questionnaire.
export function longQuestionnaire(): string[] {
  const topics = ["booking", "arrival", "service explanation", "issue resolution", "payment", "follow-up"];
  return Array.from({ length: 100 }, (_, i) => {
    const n = i + 1;
    const topic = topics[i % topics.length];
    return [
      `Module ${n}. Client-mandated continuity tracker: retain seven-point endpoint-only ratings, fixed option order, and classification before the experience questions for comparison with earlier waves. These are client requirements, not the researcher's preferred design.`,
      `S${n}. Before the experience questions, identify the service location used for ${topic}: North / South / East / West / I cannot recall. [Single response; fixed displayed order for tracker continuity.]`,
      `Q${n}. Thinking only about your most recent ${topic} interaction at the location identified above, how satisfied were you with the way that interaction was handled? [Single response.]`,
      `Responses for Q${n}: 1 Very dissatisfied / 2 / 3 / 4 / 5 / 6 / 7 Very satisfied. Programming: display in this fixed order with endpoint labels only. Put I cannot remember outside the numeric scale; it is not the midpoint.`,
      `F${n}. [Ask only if Q${n} is 1, 2 or 3.] What specifically could have improved this ${topic} interaction? [Open end.] Programming: make this follow-up optional, allow up to 500 characters, and do not require an answer to continue.`,
      `Routing note for module ${n}: if the respondent selects I cannot remember at Q${n}, skip F${n} and continue to the next module. Never interpret this response as satisfied or dissatisfied. Preserve these tracker rules across waves.`,
    ];
  }).flat();
}

export function validateSources(sources: SourcePassage[]) {
  if (sources.some((source) => source.kind === "image" || source.imageDataUrl)) throw new Error("Architecture comparison supports text sources only. Use eval:ai for image-inclusive cases.");
  if (!sources.length || new Set(sources.map((source) => source.sourceId)).size !== sources.length) throw new Error("Missing or duplicate source IDs.");
  if (new Set(sources.map((source) => source.documentId)).size > 10 || serializeAnalysisSources(sources).length > SETTINGS.maxSourceCharacters) throw new Error("Comparison input exceeds its explicit safety budget.");
  if (chunks(sources, SETTINGS.mapCharacters).length > 12) throw new Error("Comparison would require too many discovery calls.");
  chunks(sources, SETTINGS.retrievalCharacters);
}

export async function fictionalCases(): Promise<ComparisonCase[]> {
  const recurring = cases.find((item) => item.id === "recurring")!;
  const contradictions = cases.find((item) => item.id === "contradictions")!;
  const initial = (await loadCase(recurring)).sources;
  const four = (await loadCase(contradictions)).sources;
  const long = await extractDocument(docxFixture(longQuestionnaire()), "docx");
  const longSources = long.sections.map((section, i) => ({ sourceId: `d4s${i + 1}`, documentId: "00000000-0000-4000-8000-000000000004",
    document: "controlled-600-paragraph-tracker.docx", ...section }));
  return [
    { rubric: { ...recurring, id: "three-documents" }, sources: initial, reusePrevious: false },
    { rubric: { ...contradictions, id: "add-fourth", patterns: recurring.patterns }, sources: four, reusePrevious: true },
    { rubric: { ...contradictions, id: "long-document", patterns: recurring.patterns,
      description: "Three fictional questionnaires plus a generated 600-paragraph legacy tracker. Controlled load, not representative customer prose." }, sources: [...initial, ...longSources], reusePrevious: false },
  ];
}

const criterion = z.object({ id: z.string(), description: z.string() });
const inputSchema = z.object({ sources: z.array(documentSectionSchema.extend({
  sourceId: z.string(), documentId: z.string(), document: z.string(), text: z.string().min(1),
  imageDataUrl: imageDataUrlSchema.optional(), extractionWarnings: z.array(z.string().max(500)).max(20).optional(),
}).refine((source) => (source.kind === "image") === Boolean(source.imageDataUrl), "Image sources must include their image data; other sources cannot attach images.")),
  rubric: z.object({ id: z.string(), description: z.string(), criteria: z.array(criterion), patterns: z.array(criterion) }),
});

// Local, already-extracted inputs and their predeclared rubric can be supplied
// without putting customer material or paths in the repository.
export async function loadPrivateCase(path: string): Promise<ComparisonCase> {
  const input = inputSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const names = new Map<string, string>();
  for (const source of input.sources) {
    if (names.has(source.documentId) && names.get(source.documentId) !== source.document) {
      throw new Error("Each document ID must refer to one document name.");
    }
    names.set(source.documentId, source.document);
  }
  const images = new Set(input.sources.flatMap((source) => source.imageDataUrl ? [source.imageDataUrl] : []));
  if (images.size > 40 || Buffer.byteLength(serializeAnalysisSources(input.sources)) + [...images].reduce((sum, data) => sum + data.length, 0) > MAX_ANALYSIS_REQUEST_BYTES) {
    throw new Error("Private input exceeds the text/image analysis budget.");
  }
  return { ...input, rubric: { ...input.rubric, files: [] }, reusePrevious: false };
}
