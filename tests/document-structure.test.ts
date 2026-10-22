import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDocument } from "../src/server/services/document-extraction";
import { groupQuestionSections } from "../src/server/services/questionnaire-sections";
import { docxXmlFixture } from "./document-fixtures";

const namespace = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const p = (text: string, properties = "") => `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`;
const num = (id: number, level = 0) => `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${id}"/></w:numPr>`;
const parts = {
  "word/numbering.xml": `<w:numbering ${namespace}>
    <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>
    <w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:start w:val="2"/><w:numFmt w:val="upperLetter"/><w:lvlText w:val="%1)"/></w:lvl></w:abstractNum>
    <w:num w:numId="7"><w:abstractNumId w:val="1"/></w:num>
    <w:num w:numId="8"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="9"/></w:lvlOverride></w:num>
    <w:num w:numId="9"><w:abstractNumId w:val="2"/></w:num>
  </w:numbering>`,
  "word/styles.xml": `<w:styles ${namespace}>
    <w:style w:type="paragraph" w:styleId="Base"><w:pPr>${num(7)}</w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="Option"><w:basedOn w:val="Base"/></w:style>
  </w:styles>`,
};

test("DOCX preserves displayed numbering, continuation, overrides and inherited styles", async () => {
  const result = await extractDocument(docxXmlFixture(
    p("Q1. Pick one.") + p("First option", num(7)) + p("Second option", num(7)) +
    p("Programming: keep these options in order.") + p("Third option", '<w:pStyle w:val="Option"/>') +
    p("Q2. Pick a second answer.") + p("None", num(8)) +
    p("Q3. Pick a letter.") + p("Letter option", num(9)), parts), "docx");
  assert.equal(result.sections.length, 3);
  assert.equal(result.sections[0].location, "Paragraph 1 – Paragraph 5");
  assert.match(result.sections[0].text, /3\. First option\n4\. Second option\nProgramming: keep these options in order\.\n5\. Third option/);
  assert.match(result.sections[1].text, /9\. None/);
  assert.match(result.sections[2].text, /B\) Letter option/);
  assert.equal(result.characterCount, result.sections.reduce((n, s) => n + s.text.length, 0));
  assert.deepEqual(result.warnings, []);
});

test("DOCX table rows, empty cells and line breaks stay with their question", async () => {
  const row = (cells: string[]) => `<w:tr>${cells.map((text) => `<w:tc>${p(text)}</w:tc>`).join("")}</w:tr>`;
  const table = `<w:tbl>${row(["Code", "Label", "Notes"])}${row(["7", "None", ""])}${row(["8", "Other", "Specify"])}</w:tbl>`;
  const result = await extractDocument(docxXmlFixture(p("Q1. Choose an option.") + table +
    p("Q2. [If Q1=7] Why?") + '<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r></w:p>'), "docx");
  assert.equal(result.sections.length, 2);
  assert.equal(result.sections[0].location, "Paragraph 1 – Table 1");
  assert.equal(result.sections[0].text, "Q1. Choose an option.\nCode\tLabel\tNotes\n7\tNone\t\n8\tOther\tSpecify");
  assert.match(result.sections[1].text, /Line one\nLine two/);
});

test("unknown and multilevel numbering is flagged instead of guessed", async () => {
  const result = await extractDocument(docxXmlFixture(p("Q1. Choose.") + p("Unknown", num(404)) + p("Nested", num(7, 1)), parts), "docx");
  assert.equal(result.sections[0].text, "Q1. Choose.\nUnknown\nNested");
  assert.ok(result.warnings.some((warning) => warning.includes("list markers could not be resolved")));
});

test("DOCX XML never accepts DTDs or external entity declarations", async () => {
  const malicious = { ...parts, "word/numbering.xml": '<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x>&secret;</x>' };
  await assert.rejects(extractDocument(docxXmlFixture(p("Q1. Example"), malicious), "docx"), /Unsupported DOCX XML/);
});

test("revisions do not cause guessed list counters and merged tables carry a warning", async () => {
  const body = p("Q1. Choose.") + `<w:del>${p("Removed option", num(7))}</w:del>` + p("Remaining option", num(7)) +
    `<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${p("Spans two columns")}</w:tc></w:tr></w:tbl>`;
  const result = await extractDocument(docxXmlFixture(body, parts), "docx");
  assert.ok(result.warnings.some((w) => w.includes("revisions or alternate text layouts")));
  assert.ok(result.warnings.some((w) => w.includes("Merged table cells")));
  assert.doesNotMatch(result.sections.map((s) => s.text).join("\n"), /\d\. Remaining option/);
});

test("empty edge cells survive table normalization", async () => {
  const table = `<w:tbl><w:tr><w:tc>${p("")}</w:tc><w:tc>${p("Heading")}</w:tc></w:tr><w:tr><w:tc>${p("Value")}</w:tc><w:tc>${p("")}</w:tc></w:tr></w:tbl>`;
  const result = await extractDocument(docxXmlFixture(table), "docx");
  assert.equal(result.sections[0].text, "\tHeading\nValue\t");
});

test("grouping preserves every block and stops at headings and subsequent questions", () => {
  const sections = [
    { location: "Paragraph 1", text: "Q1. First question" },
    { location: "Paragraph 3", text: "1. Yes\n2. No" },
    { location: "Paragraph 4", text: "Background", heading: true },
    { location: "Paragraph 5", text: "Introductory prose" },
    { location: "Paragraph 6", text: "Q2. Next question" },
    { location: "Paragraph 7", text: "[If Q1=2] Follow-up instruction" },
  ];
  const result = groupQuestionSections(sections);
  assert.equal(result.length, 4);
  assert.equal(result.map((s) => s.text).join("\n"), sections.map((s) => s.text).join("\n"));
  assert.equal(result[3].location, "Paragraph 6 – Paragraph 7");
});
