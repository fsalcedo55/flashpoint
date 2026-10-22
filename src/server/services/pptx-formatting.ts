import { A, P, child, children, descendants, type PptxPackage } from "./pptx-xml";

const value = (el: Element | undefined, name: string) => el?.hasAttribute(name) ? el.getAttribute(name)! : undefined;
const firstValue = (els: (Element | undefined)[], name: string) => els.map((el) => value(el, name)).find((v) => v !== undefined);
const points = (value: string) => `${Number(value) / 100}pt`;
const inch = (value: string) => (Number(value) / 914400).toFixed(2);

export function slideFormatting(pkg: PptxPackage, part: string, slide: Element): string {
  const layoutPart = pkg.related(part, "slideLayout");
  const layout = layoutPart ? pkg.read(layoutPart) : undefined;
  const masterPart = layoutPart ? pkg.related(layoutPart, "slideMaster") : undefined;
  const master = masterPart ? pkg.read(masterPart) : undefined;
  const themePart = masterPart ? pkg.related(masterPart, "theme") : undefined;
  const theme = themePart ? pkg.read(themePart) : undefined;
  const colors = descendants(theme, A, "clrScheme")[0];
  const fontScheme = descendants(theme, A, "fontScheme")[0];
  const colorMap = descendants(slide, A, "overrideClrMapping")[0] ?? descendants(layout, A, "overrideClrMapping")[0] ?? child(master, P, "clrMap");
  function color(fill: Element | undefined): string | undefined {
    const spec = children(fill)[0];
    if (!spec) return;
    let color = spec.getAttribute("val") || "";
    if (spec.localName === "schemeClr") {
      const role = value(colorMap, color) ?? color;
      const themeColor = children(child(colors, A, role))[0];
      color = themeColor?.getAttribute("lastClr") || themeColor?.getAttribute("val") || `theme:${role}`;
    } else if (spec.localName === "sysClr") color = spec.getAttribute("lastClr") || color;
    if (/^[0-9A-Fa-f]{6}$/.test(color)) color = `#${color.toUpperCase()}`;
    const modifiers = children(spec).map((el) => `${el.localName}=${el.getAttribute("val")}`);
    return color + (modifiers.length ? ` (${modifiers.join(",")}; base color)` : "");
  }
  function font(typeface: string | undefined) {
    if (typeface === "+mj-lt" || typeface === "+mn-lt") return value(child(child(fontScheme, A, typeface === "+mj-lt" ? "majorFont" : "minorFont"), A, "latin"), "typeface");
    return typeface;
  }
  const lines: string[] = [];
  const bg = child(child(child(slide, P, "cSld"), P, "bg"), P, "bgPr") ??
    child(child(child(layout, P, "cSld"), P, "bg"), P, "bgPr") ?? child(child(child(master, P, "cSld"), P, "bg"), P, "bgPr");
  const bgColor = color(child(bg, A, "solidFill"));
  if (bgColor) lines.push(`Background fill: ${bgColor}`);
  const layoutName = value(child(layout, P, "cSld"), "name") || value(layout, "type");
  if (layoutName) lines.push(`Layout template: ${layoutName} (template name, not proof of usage preferences)`);
  const styles = new Map<string, number>();
  for (const shape of descendants(slide, P, "sp")) {
    const ph = descendants(shape, P, "ph")[0];
    const inherited = descendants(layout, P, "sp").find((candidate) => {
      const other = descendants(candidate, P, "ph")[0];
      return ph && other && (value(ph, "idx") ?? "0") === (value(other, "idx") ?? "0");
    });
    const role = value(ph, "type") ?? value(descendants(inherited, P, "ph")[0], "type") ?? (ph ? "body" : "other");
    const masterStyle = child(child(master, P, "txStyles"), P, /title/i.test(role) ? "titleStyle" : role === "body" ? "bodyStyle" : "otherStyle");
    const body = child(shape, P, "txBody");
    for (const paragraph of children(body).filter((el) => el.localName === "p")) {
      const paraProps = child(paragraph, A, "pPr");
      const level = Number(value(paraProps, "lvl") ?? 0) + 1;
      const inheritedBody = child(inherited, P, "txBody");
      const defaults = [child(paraProps, A, "defRPr"), child(child(child(body, A, "lstStyle"), A, `lvl${level}pPr`), A, "defRPr"),
        child(child(child(inheritedBody, A, "p"), A, "pPr"), A, "defRPr"),
        child(child(child(child(inherited, P, "txBody"), A, "lstStyle"), A, `lvl${level}pPr`), A, "defRPr"), child(child(masterStyle, A, `lvl${level}pPr`), A, "defRPr")];
      for (const run of children(paragraph).filter((el) => ["r", "fld"].includes(el.localName))) {
        if (!child(run, A, "t")?.textContent?.trim()) continue;
        const cascade = [child(run, A, "rPr"), ...defaults];
        const fontName = font(cascade.map((el) => value(child(el, A, "latin"), "typeface")).find(Boolean));
        const size = firstValue(cascade, "sz"), bold = firstValue(cascade, "b"), italic = firstValue(cascade, "i");
        const textColor = cascade.map((el) => color(child(el, A, "solidFill"))).find(Boolean);
        const properties = [fontName && `font=${fontName}`, size && `size=${points(size)}`, bold !== undefined && `bold=${["1", "true"].includes(bold)}`, italic !== undefined && `italic=${["1", "true"].includes(italic)}`, textColor && `color=${textColor}`].filter(Boolean);
        if (properties.length) {
          const key = `${ph ? `Placeholder ${role}` : "Text"}: ${properties.join(", ")}`;
          styles.set(key, (styles.get(key) ?? 0) + 1);
        }
      }
    }
    // Only report slide-coordinate bounds for ungrouped shapes. Group transforms
    // change the coordinate space and require a renderer to resolve accurately.
    if (shape.parentNode && (shape.parentNode as Element).localName === "spTree") {
      const transform = child(child(shape, P, "spPr"), A, "xfrm") ?? child(child(inherited, P, "spPr"), A, "xfrm");
      const off = child(transform, A, "off"), ext = child(transform, A, "ext");
      if (ph && off && ext && [value(off, "x"), value(off, "y"), value(ext, "cx"), value(ext, "cy")].every((v) => v !== undefined && Number.isFinite(Number(v)))) {
        lines.push(`Placeholder ${role} bounds (inches): x=${inch(off.getAttribute("x")!)}, y=${inch(off.getAttribute("y")!)}, width=${inch(ext.getAttribute("cx")!)}, height=${inch(ext.getAttribute("cy")!)}`);
      }
    }
  }
  for (const [style, count] of styles) lines.push(`${style} (${count} text runs)`);
  return lines.length ? "PowerPoint formatting properties; not a rendered slide. Theme/template defaults alone do not establish author preference.\n" + lines.join("\n") : "";
}
