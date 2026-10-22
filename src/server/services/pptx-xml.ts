import path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { DocumentError } from "./document-error";

export const P = ["http://schemas.openxmlformats.org/presentationml/2006/main", "http://purl.oclc.org/ooxml/presentationml/main"];
export const A = ["http://schemas.openxmlformats.org/drawingml/2006/main", "http://purl.oclc.org/ooxml/drawingml/main"];
export const C = ["http://schemas.openxmlformats.org/drawingml/2006/chart", "http://purl.oclc.org/ooxml/drawingml/chart"];
const R = ["http://schemas.openxmlformats.org/officeDocument/2006/relationships", "http://purl.oclc.org/ooxml/officeDocument/relationships"];
const PACKAGE = "http://schemas.openxmlformats.org/package/2006/relationships";
export const is = (el: Element, namespaces: string[], name: string) => namespaces.includes(el.namespaceURI ?? "") && el.localName === name;
export const children = (el?: Element): Element[] => el ? Array.from(el.childNodes).filter((node): node is Element => node.nodeType === 1) : [];
export const child = (el: Element | undefined, ns: string[], name: string) => children(el).find((node) => is(node, ns, name));
export const relationId = (el: Element, name = "id") => R.map((ns) => el.getAttributeNS(ns, name)).find((id): id is string => Boolean(id));
export const invalidPptx = () => new DocumentError("This PPTX contains missing or invalid slide data. Export a new PPTX and try again.");

export function descendants(root: Element | undefined, ns: string[], name: string): Element[] {
  const result: Element[] = [], stack = children(root).reverse();
  let visited = 0;
  while (stack.length) {
    const el = stack.pop()!;
    if (++visited > 100_000) throw new DocumentError("This PPTX part is too complex. Simplify it and upload it again.");
    // Alternate representations and extension payloads are not independent content.
    if (el.localName === "extLst" || (el.localName === "AlternateContent" && el.namespaceURI === "http://schemas.openxmlformats.org/markup-compatibility/2006")) continue;
    if (is(el, ns, name)) result.push(el);
    for (const next of children(el).reverse()) stack.push(next);
  }
  return result;
}

// All relationships resolve to members of the bounded in-memory archive, never
// filesystem paths or URLs. Cache XML shared by many slides (masters/themes).
export class PptxPackage {
  private roots = new Map<string, Element>();
  private links = new Map<string, Map<string, Element>>();
  constructor(readonly files: Record<string, Uint8Array>) {}
  read(name: string): Element {
    const cached = this.roots.get(name);
    if (cached) return cached;
    if (!this.files[name]) throw invalidPptx();
    const xml = Buffer.from(this.files[name]).toString("utf8");
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw invalidPptx();
    const root = new DOMParser({ errorHandler: () => { throw invalidPptx(); } }).parseFromString(xml, "application/xml").documentElement;
    if (!root) throw invalidPptx();
    this.roots.set(name, root);
    return root;
  }
  relationships(part: string) {
    const cached = this.links.get(part);
    if (cached) return cached;
    const name = path.posix.join(path.posix.dirname(part), "_rels", path.posix.basename(part) + ".rels");
    const links = new Map<string, Element>();
    if (this.files[name]) {
      const root = this.read(name);
      if (!is(root, [PACKAGE], "Relationships")) throw invalidPptx();
      for (const rel of children(root).filter((el) => is(el, [PACKAGE], "Relationship"))) {
        const id = rel.getAttribute("Id");
        if (!id || links.has(id)) throw invalidPptx();
        links.set(id, rel);
      }
    }
    this.links.set(part, links);
    return links;
  }
  resolve(part: string, id: string | undefined, type: string): string | undefined {
    const rel = id ? this.relationships(part).get(id) : undefined;
    if (!rel || rel.getAttribute("TargetMode") === "External" || !R.some((ns) => rel.getAttribute("Type") === `${ns}/${type}`)) return;
    let target: string;
    try { target = decodeURIComponent(rel.getAttribute("Target") ?? ""); } catch { throw invalidPptx(); }
    if (!target || /[\\:#?\u0000]/.test(target) || target.startsWith("//")) throw invalidPptx();
    const member = path.posix.normalize(target.startsWith("/") ? target.slice(1) : `${path.posix.dirname(part)}/${target}`);
    if (member.startsWith("../") || !this.files[member]) throw invalidPptx();
    return member;
  }
  related(part: string, type: string): string | undefined {
    const entry = [...this.relationships(part)].find(([, rel]) => R.some((ns) => rel.getAttribute("Type") === `${ns}/${type}`));
    return this.resolve(part, entry?.[0], type);
  }
}

export function paragraphText(paragraph: Element): string {
  return children(paragraph).map((run) => {
    if (is(run, A, "br")) return "\n";
    if (!is(run, A, "r") && !is(run, A, "fld")) return "";
    return children(run).filter((el) => is(el, A, "t")).map((el) => el.textContent ?? "").join("");
  }).join("").trim();
}
