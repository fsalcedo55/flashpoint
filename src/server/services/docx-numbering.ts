import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const children = (node: Element, name: string): Element[] => Array.from(node.childNodes)
  .filter((child): child is Element => child.nodeType === 1 && (child as Element).namespaceURI === W && (child as Element).localName === name);
const child = (node: Element | undefined, name: string) => node && children(node, name)[0];
const attr = (node: Element | undefined, name: string) => node?.getAttributeNS(W, name) || undefined;
const value = (node: Element | undefined, name: string) => attr(child(node, name), "val");

function parse(bytes: Uint8Array): Document {
  const xml = Buffer.from(bytes).toString("utf8");
  // Word parts do not need DTDs. Never resolve custom or external entities.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsupported DOCX XML declaration.");
  return new DOMParser({ errorHandler: () => { throw new Error("Malformed DOCX XML."); } }).parseFromString(xml, "application/xml");
}

function marker(number: number, format: string): string | undefined {
  if (format === "decimal") return String(number);
  if (number < 1) return;
  if (format === "lowerLetter" || format === "upperLetter") {
    let letters = "";
    for (let n = number; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(97 + (n - 1) % 26) + letters;
    return format === "upperLetter" ? letters.toUpperCase() : letters;
  }
  if ((format === "lowerRoman" || format === "upperRoman") && number < 4000) {
    let roman = "";
    for (const [n, symbol] of [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]] as const) {
      while (number >= n) { roman += symbol; number -= n; }
    }
    return format === "lowerRoman" ? roman.toLowerCase() : roman;
  }
}

// Mammoth preserves list membership but drops the displayed codes, starts and
// overrides. Materialize supported top-level markers before its text conversion.
// Unsupported list definitions stay unnumbered with a warning, never guessed.
export function preserveDocxNumbering(files: Record<string, Uint8Array>): string[] {
  const warnings = new Set<string>();
  const document = parse(files["word/document.xml"]);
  const numbering = files["word/numbering.xml"] ? parse(files["word/numbering.xml"]) : undefined;
  const styles = files["word/styles.xml"] ? parse(files["word/styles.xml"]) : undefined;
  const elements = (doc: Document | undefined, name: string) => doc ? Array.from(doc.getElementsByTagNameNS(W, name)) : [];
  // Revisions and alternate representations can change which list items Word
  // counts. Do not render plausible but incorrect codes for those documents.
  if (elements(document, "del").length || elements(document, "moveFrom").length || elements(document, "txbxContent").length ||
    document.getElementsByTagNameNS("http://schemas.openxmlformats.org/markup-compatibility/2006", "AlternateContent").length) {
    return ["Automatic list markers were not reconstructed because the document contains revisions or alternate text layouts. Check response codes in the original."];
  }
  const nums = new Map(elements(numbering, "num").map((el) => [attr(el, "numId"), el]));
  const abstracts = new Map(elements(numbering, "abstractNum").map((el) => [attr(el, "abstractNumId"), el]));
  const styleMap = new Map(elements(styles, "style").map((el) => [attr(el, "styleId"), el]));
  const defaultStyle = elements(styles, "style").find((el) => attr(el, "type") === "paragraph" && attr(el, "default") === "1");
  const counts = new Map<string, number>();

  for (const paragraph of elements(document, "p")) {
    const properties = child(paragraph, "pPr");
    const direct = child(properties, "numPr");
    let numId = value(direct, "numId"), level = value(direct, "ilvl");
    let styleId = value(properties, "pStyle") ?? attr(defaultStyle, "styleId");
    const seen = new Set<string>();
    while (styleId && !seen.has(styleId)) {
      seen.add(styleId);
      const style = styleMap.get(styleId);
      const inherited = child(child(style, "pPr"), "numPr");
      numId ??= value(inherited, "numId"); level ??= value(inherited, "ilvl");
      styleId = value(style, "basedOn");
    }
    if (!numId || numId === "0") continue;
    const unresolved = () => warnings.add("Some automatic list markers could not be resolved. Do not infer response codes from option positions; check the original document.");
    const num = nums.get(numId);
    const abstract = abstracts.get(value(num, "abstractNumId"));
    if (!num || !abstract || (level ?? "0") !== "0" || child(abstract, "numStyleLink") ||
      Array.from(abstract.attributes).some((a) => a.localName === "restartNumberingAfterBreak" && a.value !== "0")) { unresolved(); continue; }
    const override = children(num, "lvlOverride").find((el) => attr(el, "ilvl") === "0");
    const definition = child(override, "lvl") ?? children(abstract, "lvl").find((el) => attr(el, "ilvl") === "0");
    const format = value(definition, "numFmt"), template = value(definition, "lvlText");
    const start = Number(value(override, "startOverride") ?? value(definition, "start") ?? "0");
    const current = counts.has(numId) ? counts.get(numId)! + 1 : start;
    counts.set(numId, current);
    if (!definition || !format || !template || !Number.isSafeInteger(current) || current < 0 || current > 1_000_000 ||
      child(definition, "lvlRestart") || /%[2-9]/.test(template)) { unresolved(); continue; }
    // Bullet glyphs can depend on a symbol font; they are never response codes.
    if (format === "bullet" || format === "none") continue;
    const rendered = marker(current, format);
    if (rendered === undefined || !template.includes("%1")) { unresolved(); continue; }
    const run = document.createElementNS(W, "w:r"), text = document.createElementNS(W, "w:t");
    text.setAttribute("xml:space", "preserve");
    text.appendChild(document.createTextNode(template.replaceAll("%1", rendered) + " "));
    run.appendChild(text);
    paragraph.insertBefore(run, properties ? properties.nextSibling : paragraph.firstChild);
  }
  files["word/document.xml"] = Buffer.from(new XMLSerializer().serializeToString(document));
  return [...warnings];
}
