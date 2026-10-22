import type { DocumentSection } from "../../lib/documents";
import { DocumentError } from "./document-error";
import { A, C, P, child, children, descendants, invalidPptx, is, paragraphText, PptxPackage, relationId } from "./pptx-xml";
import { chartContent, PptxImages, speakerNotes } from "./pptx-content";
import { slideFormatting } from "./pptx-formatting";

function tableText(table: Element, warnings: Set<string>): string {
  return children(table).filter((el) => is(el, A, "tr")).map((row) =>
    children(row).filter((el) => is(el, A, "tc")).map((cell) => {
      if (["gridSpan", "rowSpan", "hMerge", "vMerge"].some((attr) => cell.hasAttribute(attr))) {
        warnings.add("Merged table cells require checking against the original; do not infer column relationships from flattened cells.");
      }
      return children(cell).filter((el) => is(el, A, "txBody")).flatMap((body) =>
        children(body).filter((el) => is(el, A, "p")).map(paragraphText)).join("\n");
    }).join("\t")
  ).join("\n");
}

function slideText(root: Element, warnings: Set<string>): string {
  const common = children(root).find((el) => is(el, P, "cSld"));
  const shapes = common && children(common).find((el) => is(el, P, "spTree"));
  if (!shapes) throw invalidPptx();
  const blocks: string[] = [];
  const stack = [shapes];
  let visited = 0;
  // Iterative traversal also handles grouped shapes without trusting nesting depth.
  while (stack.length) {
    const el = stack.pop()!;
    if (++visited > 100_000) throw new DocumentError("This PPTX slide is too complex. Simplify it and upload it again.");
    if (is(el, A, "tbl")) blocks.push(tableText(el, warnings));
    else if (is(el, A, "p")) blocks.push(paragraphText(el));
    else if (el.namespaceURI === "http://schemas.openxmlformats.org/markup-compatibility/2006" && el.localName === "AlternateContent") {
      // Choosing both representations would duplicate text; neither is reliable without rendering.
      warnings.add("Some alternate slide content was omitted. Check the original presentation for missing text.");
    } else if (el.localName !== "extLst") for (const next of children(el).reverse()) stack.push(next);
  }
  return blocks.filter((text) => text.trim()).join("\n\n");
}

export async function extractPptx(files: Record<string, Uint8Array>) {
  const pkg = new PptxPackage(files);
  const presentation = pkg.read("ppt/presentation.xml");
  if (!is(presentation, P, "presentation")) throw invalidPptx();
  const slides = children(child(presentation, P, "sldIdLst")).filter((el) => is(el, P, "sldId"));
  if (!slides.length) throw new DocumentError("This PPTX contains no slides.");
  if (slides.length > 200) throw new DocumentError("Presentations are limited to 200 slides. Split this deck into smaller files.");
  const warnings = new Set<string>();
  const sections: DocumentSection[] = [];
  const images = new PptxImages();
  const seen = new Set<string>();
  let hidden = 0, empty = 0, hasContent = false;
  for (const [index, slide] of slides.entries()) {
    const member = pkg.resolve("ppt/presentation.xml", relationId(slide), "slide");
    if (!member || seen.has(member)) throw invalidPptx();
    seen.add(member);
    const root = pkg.read(member);
    if (!is(root, P, "sld")) throw invalidPptx();
    const location = `Slide ${index + 1}`;
    if (["0", "false"].includes(root.getAttribute("show") ?? "")) {
      hidden++;
      sections.push({ location: `${location} (hidden)`, text: "" });
      continue; // Do not read hidden-slide notes, charts, images or formatting either.
    }
    const text = slideText(root, warnings);
    sections.push({ location, text });
    const before = sections.length;
    const notes = speakerNotes(pkg, member);
    if (notes) sections.push({ location: `${location} · Speaker notes`, kind: "notes", text: notes });
    for (const [i, ref] of descendants(root, C, "chart").entries()) {
      const part = pkg.resolve(member, relationId(ref), "chart");
      if (part) sections.push({ location: `${location} · Chart ${i + 1}`, kind: "chart", text: chartContent(pkg.read(part)) });
      else warnings.add("An external or unsupported chart was not read. Linked workbooks and URLs are never opened.");
    }
    const layoutPart = pkg.related(member, "slideLayout");
    const masterPart = layoutPart ? pkg.related(layoutPart, "slideMaster") : undefined;
    const showMasterShapes = !["0", "false"].includes(root.getAttribute("showMasterSp") ?? "") &&
      !(layoutPart && ["0", "false"].includes(pkg.read(layoutPart).getAttribute("showMasterSp") ?? ""));
    const imageParts = [member, layoutPart, showMasterShapes ? masterPart : undefined].filter((part): part is string => Boolean(part));
    let imageNumber = 0;
    for (const part of imageParts) for (const blip of descendants(pkg.read(part), A, "blip")) {
      const imagePart = pkg.resolve(part, relationId(blip, "embed"), "image");
      if (!imagePart) { warnings.add("An external image was not fetched. Embed it in the presentation to include it in analysis."); continue; }
      const imageId = await images.add(files[imagePart], warnings);
      if (imageId) sections.push({ location: `${location} · Image ${++imageNumber}`, kind: "image", imageId,
        text: `Embedded image${part !== member ? " inherited from the slide template" : ""}. Inspect the attached image; its pixels do not establish placement on the slide.` });
    }
    if (text.trim() || sections.length > before) hasContent = true;
    else empty++;
    const formatting = slideFormatting(pkg, member, root);
    if (formatting) sections.push({ location: `${location} · Formatting`, kind: "formatting", text: formatting });
  }
  if (!hasContent) throw new DocumentError("No readable text or images were found in the visible slides.");
  if (hidden) warnings.add(`${hidden} hidden slides were omitted from analysis. Slide references retain their original positions.`);
  if (empty) warnings.add(`${empty} visible slides have no readable content.`);
  warnings.add("Formatting is read from PowerPoint properties, not a rendered slide. Complex effects, animations and automatic bullet numbering may be incomplete. Chart values use embedded caches; linked workbooks are not refreshed.");
  if (Object.keys(images.assets).length) warnings.add("Images are resized for analysis; animated images use their first frame. Image interpretations require visual review.");
  return { sections, warnings: [...warnings], slideCount: slides.length, assets: images.assets };
}
