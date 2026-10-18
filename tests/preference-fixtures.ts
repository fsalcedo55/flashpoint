import type { createDatabase } from "../src/server/db";
import { documents, evidence, preferences } from "../src/server/db/schema";

type Database = ReturnType<typeof createDatabase>["db"];

// Four pending suggestions over two documents with seven source quotes, inserted directly.
export async function seedPreferences(db: Database) {
  const [brand, customer] = await db.insert(documents).values([
    { name: "Brand tracker.docx", status: "ready", fileType: "docx" },
    { name: "Customer research.pdf", status: "ready", fileType: "pdf" },
  ]).returning({ id: documents.id });
  const fixtures = [
    { category: "Question order", title: "Ask unaided questions first", rule: "Begin brand awareness sections with an open-ended question before listing brands.",
      evidence: [{ documentId: brand.id, location: "Paragraph 2", quote: "Which brands come to mind when you think of sparkling water?" }, { documentId: brand.id, location: "Paragraph 3", quote: "Which of these brands do you recognize?" }] },
    { category: "Answer formats", title: "Label all scale points", rule: "Use fully labeled five-point scales for satisfaction questions.",
      evidence: [{ documentId: brand.id, location: "Paragraph 8", quote: "Very dissatisfied / Dissatisfied / Neutral / Satisfied / Very satisfied" }, { documentId: customer.id, location: "Page 2", quote: "Please rate your satisfaction from 1 to 5." }] },
    { category: "Tone", title: "Keep questions neutral", rule: "Avoid leading language that implies a preferred answer in concept questions.",
      evidence: [{ documentId: customer.id, location: "Page 1", quote: "What is your first impression of this concept?" }, { documentId: customer.id, location: "Page 3", quote: "How appealing is this idea to you?" }] },
    { category: "Structure", title: "Group questions by topic", rule: "Keep questions about the same topic together under one heading.",
      evidence: [{ documentId: brand.id, location: "Paragraph 12", quote: "Section 3: Purchase behavior" }] },
  ];
  for (const [position, fixture] of fixtures.entries()) {
    const [saved] = await db.insert(preferences).values({ category: fixture.category, title: fixture.title,
      suggestedRule: fixture.rule, rule: fixture.rule, rationale: "Inferred from the questionnaire; needs confirmation.", position }).returning({ id: preferences.id });
    await db.insert(evidence).values(fixture.evidence.map((source, index) => ({ ...source, preferenceId: saved.id, position: index })));
  }
}
