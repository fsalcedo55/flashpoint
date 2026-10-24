import type { SourcePassage } from "../src/lib/analysis";
import type { DocumentPurpose } from "../src/lib/document-purpose";

export function classificationFixture(sources: SourcePassage[], purpose: DocumentPurpose = "questionnaire") {
  return [...new Set(sources.map((source) => source.documentId))].map((documentId) => {
    const source = sources.find((item) => item.documentId === documentId && item.kind !== "image")!;
    return { documentId, purpose, rationale: "The supplied content establishes the document's primary purpose.",
      evidence: source ? [{ sourceId: source.sourceId, quote: source.text.slice(0, 500) }] : [] };
  });
}

// Keep existing provider/transport fixtures aligned with the request's document IDs.
// Classification behavior itself is covered with explicit outputs in classification.test.ts.
export function classifiedFixture(output: object, prompt: { role: string; content: unknown }[], purpose: DocumentPurpose = "questionnaire") {
  const user = prompt.find((message) => message.role === "user")!;
  const text = (user.content as { type: string; text: string }[]).find((part) => part.type === "text")!.text;
  const json = JSON.parse(text.slice(text.indexOf("[")));
  const sources: SourcePassage[] = json.flatMap((document: { documentId: string; document: string; passages: SourcePassage[] }) =>
    document.passages.map((source) => ({ ...source, documentId: document.documentId, document: document.document })));
  return { classifications: classificationFixture(sources, purpose), ...output };
}
