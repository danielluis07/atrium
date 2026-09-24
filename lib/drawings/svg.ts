/**
 * The small SVG writer the plan and the section share. Drawing space is in
 * metres with `v` pointing up, so a box reads like the House it comes from;
 * the writer flips it into SVG's y-down space. Numbers are rounded to the
 * millimetre so the same House always writes the same markup.
 */

/** A rectangle in drawing space: `h` across the sheet, `v` up. */
export type Box = { h0: number; h1: number; v0: number; v1: number };

/** Drawings print at this many CSS pixels per metre, shrinking to fit. */
export const PIXELS_PER_METRE = 28;

/** Pitch of the stone hatch, measured along `h`. */
export const HATCH_PITCH = 0.35;

const MARGIN = 1.5;

/** Metres to millimetre precision, never `-0`. */
export function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded === 0 ? 0 : rounded);
}

type Attrs = Record<string, string | number | undefined>;

/** Strokes stay one pixel wide (and dashes keep their length) at any size. */
const hairline = { "vector-effect": "non-scaling-stroke" };

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function el(tag: string, attrs: Attrs, content?: string): string {
  const written = Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}="${typeof value === "number" ? num(value) : escape(value!)}"`)
    .join(" ");
  const open = written ? `${tag} ${written}` : tag;
  return content === undefined ? `<${open}/>` : `<${open}>${content}</${tag}>`;
}

/** A closed rectangular subpath. A box with no height writes a line. */
export function boxPath({ h0, h1, v0, v1 }: Box): string {
  return `M${num(h0)} ${num(-v1)}H${num(h1)}V${num(-v0)}H${num(h0)}Z`;
}

export function line(attrs: Attrs, [h0, v0]: readonly [number, number], [h1, v1]: readonly [number, number]): string {
  return el("line", { ...attrs, x1: h0, y1: -v0, x2: h1, y2: -v1, ...hairline });
}

/** How dark the poché is: a concrete tone of ink, so the glazing lines on its edges still read. */
export const POCHE_OPACITY = 0.2;

/** Solid mass cut by the drawing, with the recesses of its openings left as paper. */
export function poche(attrs: Attrs, box: Box, holes: Box[] = []): string {
  return el("path", {
    ...attrs,
    d: [box, ...holes].map(boxPath).join(""),
    fill: "currentColor",
    "fill-opacity": POCHE_OPACITY,
    "fill-rule": "evenodd",
    stroke: "none",
  });
}

export function outline(attrs: Attrs, box: Box, dashed = false): string {
  return el("path", { ...attrs, d: boxPath(box), "stroke-dasharray": dashed ? "4 3" : undefined, ...hairline });
}

/**
 * The stone mass cut by the drawing: its outline and 45° hatch lines
 * clipped to it, on a grid shared by every drawing so they line up.
 */
export function hatched(attrs: Attrs, box: Box): string {
  const { h0, h1, v0, v1 } = box;
  const lines: string[] = [];
  // each line is v = h + c
  const first = Math.ceil((v0 - h1) / HATCH_PITCH);
  const last = Math.floor((v1 - h0) / HATCH_PITCH);
  for (let i = first; i <= last; i++) {
    const c = i * HATCH_PITCH;
    const [a, b] = [Math.max(h0, v0 - c), Math.min(h1, v1 - c)];
    if (b - a > 1e-3) lines.push(line({ "data-part": "hatch" }, [a, a + c], [b, b + c]));
  }
  return el("g", attrs, [outline({ "data-part": "outline" }, box), ...lines].join(""));
}

export function union(boxes: Box[]): Box {
  return {
    h0: Math.min(...boxes.map((b) => b.h0)),
    h1: Math.max(...boxes.map((b) => b.h1)),
    v0: Math.min(...boxes.map((b) => b.v0)),
    v1: Math.max(...boxes.map((b) => b.v1)),
  };
}

/**
 * The drawing sheet: hairline strokes in ink that stay one pixel at any
 * size, sized at a fixed scale so the plan and the section match.
 */
export function sheet(extent: Box, body: string[], { marginLeft = MARGIN } = {}): string {
  const h0 = extent.h0 - marginLeft;
  const top = -extent.v1 - MARGIN;
  const width = extent.h1 - extent.h0 + marginLeft + MARGIN;
  const height = extent.v1 - extent.v0 + 2 * MARGIN;
  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `${num(h0)} ${num(top)} ${num(width)} ${num(height)}`,
      width: Math.round(width * PIXELS_PER_METRE),
      height: Math.round(height * PIXELS_PER_METRE),
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1,
    },
    body.join(""),
  );
}

/** Mono type set in the drawing, at a size that reads 12px at print scale. */
export function text(attrs: Attrs, [h, v]: readonly [number, number], content: string): string {
  return el(
    "text",
    { ...attrs, x: h, y: -v, fill: "currentColor", stroke: "none", "font-size": 0.42, style: "font-family:var(--font-mono)" },
    escape(content),
  );
}

/** The chain line of a cut plane. */
export const CHAIN = "10 3 2 3";
