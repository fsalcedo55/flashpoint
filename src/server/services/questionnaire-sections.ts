import type { DocumentSection } from "../../lib/documents";

type Block = DocumentSection & { heading?: boolean };
// Labeled question stems are boundaries; numeric-only lines may be answer codes.
const question = /^[A-Z]{1,4}\d+[a-z]?(?:[._-]\d+)?[.):]\s/;
const section = /^[A-Z][A-Z /&-]{2,40}(?:[.:]\s|$)/;

export function groupQuestionSections(blocks: Block[]): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let group: Block[] = [];
  const flush = () => {
    if (!group.length) return;
    sections.push({ location: group.length === 1 ? group[0].location : `${group[0].location} – ${group.at(-1)!.location}`,
      text: group.map((block) => block.text).join("\n") });
    group = [];
  };
  for (const block of blocks) {
    const startsQuestion = question.test(block.text);
    if (startsQuestion || block.heading || section.test(block.text) || group.reduce((n, item) => n + item.text.length + 1, 0) + block.text.length > 8000) flush();
    if (startsQuestion || group.length) group.push(block);
    else sections.push({ location: block.location, text: block.text });
  }
  flush();
  return sections;
}
