import { strToU8, zipSync } from "fflate";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function pptxFixture(slides: { paragraphs?: string[]; body?: string; hidden?: boolean }[], options: {
  order?: number[]; parts?: Record<string, string | Uint8Array>;
} = {}) {
  const order = options.order ?? slides.map((_, i) => i + 1);
  const parts: Record<string, string | Uint8Array> = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    "ppt/presentation.xml": `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst>${order.map((n) => `<p:sldId id="${255 + n}" r:id="rId${n}"/>`).join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    // Deliberately differs from slide order: relationships are an unordered lookup.
    "ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/slide" Target="slides/slide${i + 1}.xml"/>`).reverse().join("")}</Relationships>`,
  };
  slides.forEach((slide, i) => {
    const body = slide.body ?? `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${(slide.paragraphs ?? []).map((text) => `<a:p><a:r><a:t>${escape(text)}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp>`;
    parts[`ppt/slides/slide${i + 1}.xml`] = `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"${slide.hidden ? ' show="0"' : ""}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${body}</p:spTree></p:cSld></p:sld>`;
  });
  return Buffer.from(zipSync(Object.fromEntries(Object.entries({ ...parts, ...options.parts }).map(([name, data]) => [name, typeof data === "string" ? strToU8(data) : data]))));
}

// Synthetic report covering linked notes/charts, theme inheritance, repeated
// images and a hidden slide whose related parts must never be read.
export function richPptxFixture(image: Uint8Array) {
  const C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
  const rels = (items: [string, string, string][]) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`).join("")}</Relationships>`;
  const picture = '<p:pic><p:blipFill><a:blip r:embed="image"/></p:blipFill></p:pic>';
  const title = (text: string) => `<p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr b="0"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
  return pptxFixture([
    { body: title("Faster delivery increases repeat usage") + picture + `<p:graphicFrame><a:graphic><a:graphicData><c:chart xmlns:c="${C}" r:id="chart"/></a:graphicData></a:graphic></p:graphicFrame>` },
    { body: title("Clearer tracking reduces support requests") + picture },
    { paragraphs: ["HIDDEN PRIVATE DRAFT"], hidden: true },
  ], { parts: {
    "ppt/slides/_rels/slide1.xml.rels": rels([["notes", "notesSlide", "../notesSlides/notes1.xml"], ["chart", "chart", "../charts/chart1.xml"], ["image", "image", "../media/picture.png"], ["layout", "slideLayout", "../slideLayouts/layout1.xml"]]),
    "ppt/slides/_rels/slide2.xml.rels": rels([["notes", "notesSlide", "../notesSlides/notes1.xml"], ["image", "image", "../media/duplicate.png"], ["layout", "slideLayout", "../slideLayouts/layout1.xml"]]),
    "ppt/slides/_rels/slide3.xml.rels": "invalid hidden relationships must never be parsed",
    "ppt/media/picture.png": image,
    "ppt/media/duplicate.png": image,
    "ppt/notesSlides/notes1.xml": `<p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Presenter note: Explain the implication first, then the supporting figures. Keep technical detail in speaker notes.</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>SLIDE NUMBER PLACEHOLDER</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
    "ppt/charts/chart1.xml": `<c:chartSpace xmlns:c="${C}" xmlns:a="${A}"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Repeat usage by delivery speed</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:ser><c:tx><c:v>Repeat usage</c:v></c:tx><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Same day</c:v></c:pt><c:pt idx="4"><c:v>Next day</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>72</c:v></c:pt><c:pt idx="4"><c:v>54</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:dLbls><c:showVal val="1"/><c:dLblPos val="outEnd"/></c:dLbls></c:barChart></c:plotArea><c:legend><c:legendPos val="b"/></c:legend></c:chart></c:chartSpace>`,
    "ppt/slideLayouts/layout1.xml": `<p:sldLayout xmlns:p="${P}" xmlns:a="${A}" type="titleOnly"><p:cSld name="Finding headline"><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph idx="1" type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="457200"/><a:ext cx="9144000" cy="914400"/></a:xfrm></p:spPr><p:txBody><a:lstStyle/><a:p/></p:txBody></p:sp></p:spTree></p:cSld></p:sldLayout>`,
    "ppt/slideLayouts/_rels/layout1.xml.rels": rels([["master", "slideMaster", "../slideMasters/master1.xml"]]),
    "ppt/slideMasters/master1.xml": `<p:sldMaster xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg><p:spTree/></p:cSld><p:clrMap tx1="dk1"/><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3450" b="1"><a:latin typeface="+mj-lt"/><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr></p:titleStyle></p:txStyles></p:sldMaster>`,
    "ppt/slideMasters/_rels/master1.xml.rels": rels([["theme", "theme", "../theme/theme1.xml"]]),
    "ppt/theme/theme1.xml": `<a:theme xmlns:a="${A}"><a:themeElements><a:clrScheme name="Test"><a:dk1><a:srgbClr val="17365D"/></a:dk1></a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont></a:fontScheme></a:themeElements></a:theme>`,
  } });
}
