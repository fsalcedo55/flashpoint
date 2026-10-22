import sharp from "sharp";
import { createHash } from "node:crypto";
import { DocumentError } from "./document-error";
import { A, C, P, child, children, descendants, is, paragraphText, type PptxPackage } from "./pptx-xml";

export function speakerNotes(pkg: PptxPackage, slide: string) {
  const part = pkg.related(slide, "notesSlide");
  if (!part) return "";
  return descendants(pkg.read(part), P, "sp").filter((shape) => {
    const role = descendants(shape, P, "ph")[0]?.getAttribute("type");
    return !role || role === "body"; // Exclude thumbnail, slide number, date and footer placeholders.
  }).flatMap((shape) => descendants(shape, A, "p").map(paragraphText)).filter(Boolean).join("\n");
}

export function chartContent(root: Element): string {
  const chart = child(root, C, "chart");
  const plot = child(chart, C, "plotArea");
  const lines = ["Chart metadata and cached data (not a rendered chart)."];
  const title = descendants(child(chart, C, "title"), A, "p").map(paragraphText).join(" ");
  if (title) lines.push(`Title: ${title}`);
  const chartTypes = children(plot).filter((el) => C.includes(el.namespaceURI ?? "") && el.localName.endsWith("Chart"));
  for (const type of chartTypes) {
    const settings = ["barDir", "grouping", "scatterStyle", "radarStyle", "holeSize"].flatMap((key) => {
      const value = child(type, C, key)?.getAttribute("val");
      return value ? [`${key}=${value}`] : [];
    });
    lines.push(`Chart type: ${type.localName.replace(/Chart$/, "")}${settings.length ? ` (${settings.join(", ")})` : ""}`);
    for (const series of children(type).filter((el) => is(el, C, "ser"))) {
      const name = descendants(child(series, C, "tx"), C, "v").map((el) => el.textContent).join(" ");
      lines.push(`Series: ${name || "unnamed"}`);
      for (const key of ["cat", "val", "xVal", "yVal", "bubbleSize"]) {
        const data = child(series, C, key);
        if (!data) continue;
        // Keep explicit point indices: missing cache entries must not shift categories or values.
        const points = descendants(data, C, "pt").map((pt) => `${pt.getAttribute("idx")}: ${child(pt, C, "v")?.textContent ?? ""}`);
        lines.push(`${key}: ${points.length ? points.join("; ") : "No cached values; linked workbooks are not opened."}`);
      }
      const labels = child(series, C, "dLbls") ?? child(type, C, "dLbls");
      const labelFlags = children(labels).filter((el) => /^(show|dLblPos)/.test(el.localName)).map((el) => `${el.localName}=${el.getAttribute("val")}`);
      if (labelFlags.length) lines.push(`Data labels: ${labelFlags.join(", ")}`);
    }
  }
  const legend = child(chart, C, "legend");
  if (legend) lines.push(`Legend position: ${child(legend, C, "legendPos")?.getAttribute("val") || "unspecified"}`);
  if (!chartTypes.length) lines.push("Chart type is unsupported; do not infer its visual appearance.");
  return lines.join("\n");
}

// Normalize embedded raster images once per distinct asset. No SVG/external URL
// is rendered, no EXIF metadata is forwarded, and decoding has a pixel limit.
export class PptxImages {
  readonly assets: Record<string, string> = {};
  private ids = new Map<string, string | undefined>();
  private total = 0;
  async add(bytes: Uint8Array, warnings: Set<string>): Promise<string | undefined> {
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (this.ids.has(digest)) return this.ids.get(digest);
    const buffer = Buffer.from(bytes);
    const raster = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
      buffer.subarray(0, 3).equals(Buffer.from([255,216,255])) || /^GIF8[79]a/.test(buffer.subarray(0, 6).toString()) ||
      (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP");
    if (!raster) {
      warnings.add("Some embedded images use unsupported formats (such as SVG, EMF or WMF). Their pixels were not analyzed; export those images as PNG or JPEG.");
      this.ids.set(digest, undefined); return;
    }
    let encoded: Buffer;
    try {
      encoded = await sharp(buffer, { limitInputPixels: 20_000_000, animated: false, failOn: "error" })
        .rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 75 }).toBuffer();
    } catch { throw new DocumentError("An embedded image could not be decoded safely. Replace it with a smaller PNG or JPEG and retry."); }
    const dataUrl = `data:image/jpeg;base64,${encoded.toString("base64")}`;
    this.total += dataUrl.length;
    if (dataUrl.length > 350_000 || this.total > 2_400_000 || Object.keys(this.assets).length >= 40) {
      throw new DocumentError("This presentation has too much image content for one upload. Split it into smaller decks; no images were silently dropped.");
    }
    const id = `image${Object.keys(this.assets).length + 1}`;
    this.assets[id] = dataUrl; this.ids.set(digest, id);
    return id;
  }
}
