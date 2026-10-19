import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extractDocument, validateUpload } from "../src/server/services/document-extraction";
import { prepareAnalysisSources } from "../src/server/services/analyses";
import { docxFixture } from "../tests/document-fixtures";
import type { EvalCase } from "./cases";

export async function loadCase(testCase: EvalCase) {
  const files = await Promise.all(testCase.files.map(async (name) => ({ name,
    buffer: await readFile(new URL(`../tests/fixtures/questionnaires/${name}`, import.meta.url)) })));
  if (testCase.paragraphs) files.push({ name: `${testCase.id}.docx`, buffer: docxFixture(testCase.paragraphs) });
  const documents = await Promise.all(files.map(async ({ name, buffer }, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name,
    ...await extractDocument(buffer, validateUpload(name, buffer)),
  })));
  const sources = prepareAnalysisSources({ documents });
  return { sources, sourceHash: createHash("sha256").update(JSON.stringify(sources)).digest("hex") };
}
