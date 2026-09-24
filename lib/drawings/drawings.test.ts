import { describe, expect, test } from "bun:test";

import { getProjects } from "@/content";
import { PLAN_CUT, planSvg, sectionSvg } from "@/lib/drawings";
import { formatLevel } from "@/lib/format";
import { openingExtent, verticalExtent } from "@/lib/house/derive";
import type { House, Opening, Rect } from "@/lib/house/schema";

/** The drawings are asserted on the geometry read back from the SVG, never on its markup. */
type Node = { tag: string; attrs: Record<string, string>; text: string; parent?: Node };

function parse(svg: string): Node[] {
  const nodes: Node[] = [];
  const stack: Node[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-z]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>([^<]*)/g)) {
    const [, closing, tag, attrs, selfClosing, text] = m;
    if (closing) {
      stack.pop();
      continue;
    }
    const node: Node = {
      tag,
      attrs: Object.fromEntries([...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])),
      text,
      parent: stack.at(-1),
    };
    nodes.push(node);
    if (!selfClosing) stack.push(node);
  }
  return nodes;
}

const parts = (nodes: Node[], part: string) => nodes.filter((n) => n.attrs["data-part"] === part);
const named = (nodes: Node[], part: string, name: string) => {
  const found = parts(nodes, part).filter((n) => n.attrs["data-name"] === name);
  expect(found).toHaveLength(1);
  return found[0];
};

type Box = { h0: number; h1: number; v0: number; v1: number };

/** Each rectangular subpath of a path, back in drawing metres (v up). */
function boxes(node: Node): Box[] {
  return node.attrs.d
    .split("M")
    .filter(Boolean)
    .map((sub) => {
      const [h0, top, h1, bottom] = sub.match(/-?[\d.]+/g)!.map(Number);
      return { h0, h1, v0: -bottom, v1: -top };
    });
}

function segment(node: Node): [[number, number], [number, number]] {
  const n = (k: string) => Number(node.attrs[k]);
  return [
    [n("x1"), -n("y1")],
    [n("x2"), -n("y2")],
  ];
}

const planBox = (r: Rect): Box => ({ h0: r.x0, h1: r.x1, v0: r.y0, v1: r.y1 });

function expectBox(actual: Box, expected: Box) {
  for (const k of ["h0", "h1", "v0", "v1"] as const) expect(actual[k]).toBeCloseTo(expected[k], 3);
}

const isPoche = (n: Node) => n.attrs.fill === "currentColor" && n.attrs.stroke === "none";
const isDashed = (n: Node) => n.attrs["stroke-dasharray"] !== undefined;

/** Where the glass of an opening sits in plan, written out face by face. */
function glassLine(house: House, o: Opening): [[number, number], [number, number]] {
  const { x0, y0, x1, y1 } = house.volumes.find((v) => v.name === o.volume)!.rect;
  const [a0, a1, d] = [o.at, o.at + o.width, o.depth];
  switch (o.face) {
    case "front":
      return [[x0 + a0, y0 + d], [x0 + a1, y0 + d]];
    case "back":
      return [[x1 - a0, y1 - d], [x1 - a1, y1 - d]];
    case "left":
      return [[x0 + d, y1 - a0], [x0 + d, y1 - a1]];
    case "right":
      return [[x1 - d, y0 + a0], [x1 - d, y0 + a1]];
  }
}

/** What the plan should cut at each House, read off the records by hand. */
const expected: Record<string, { cut: string[]; glazing: string[]; seenBelow: string[] }> = {
  lyngen: { cut: ["wing", "main", "lower"], glazing: ["hall-front", "living-front", "dining-front"], seenBelow: [] },
  senja: { cut: ["bar"], glazing: ["bar-end", "bar-side"], seenBelow: ["ledge-east", "ledge-west"] },
  kvaloya: {
    cut: ["living", "sleeping", "studio"],
    glazing: ["living-front", "living-court", "studio-front", "sleeping-side"],
    seenBelow: [],
  },
  reine: { cut: ["base"], glazing: ["kitchen-front", "stair"], seenBelow: [] },
};

for (const { slug, name, house } of getProjects()) {
  const want = expected[slug];

  describe(`${name} plan`, () => {
    const nodes = parse(planSvg(house));

    test("cuts the entrance Level's volumes as poché, and outlines the rest (overhead dashed)", () => {
      const volumes = parts(nodes, "volume");
      expect(volumes.map((v) => v.attrs["data-name"]).sort()).toEqual(house.volumes.map((v) => v.name).sort());
      expect(volumes.filter(isPoche).map((v) => v.attrs["data-name"]).sort()).toEqual([...want.cut].sort());
      for (const v of house.volumes) {
        const node = named(nodes, "volume", v.name);
        expectBox(boxes(node)[0], planBox(v.rect));
        if (!isPoche(node)) expect(isDashed(node)).toBe(verticalExtent(house, v).bottom >= PLAN_CUT);
      }
    });

    test("draws one glazing line per Glazing Face cut at the entrance Level, where its glass sits", () => {
      const lines = parts(nodes, "glazing");
      expect(lines.map((l) => l.attrs["data-name"]).sort()).toEqual([...want.glazing].sort());
      for (const glazingName of want.glazing) {
        const opening = house.openings.find((o) => o.name === glazingName)!;
        const [z0, z1] = openingExtent(house, opening).z;
        expect(z0 < PLAN_CUT && z1 > PLAN_CUT).toBe(true);
        const [p, q] = segment(named(nodes, "glazing", glazingName));
        const [ep, eq] = glassLine(house, opening);
        for (const [a, b] of [
          [p, ep],
          [q, eq],
        ]) {
          expect(a[0]).toBeCloseTo(b[0], 3);
          expect(a[1]).toBeCloseTo(b[1], 3);
        }
      }
    });

    test("leaves each cut opening's recess open in its volume's poché", () => {
      for (const v of want.cut) {
        const cutHere = house.openings.filter((o) => {
          const [z0, z1] = openingExtent(house, o).z;
          return o.volume === v && z0 < PLAN_CUT && z1 > PLAN_CUT;
        });
        expect(boxes(named(nodes, "volume", v))).toHaveLength(1 + cutHere.length);
      }
    });

    test("hatches the stone mass inside its outline", () => {
      const stone = named(nodes, "stone", house.stone.name);
      const outline = nodes.find((n) => n.parent === stone && n.attrs["data-part"] === "outline")!;
      const box = planBox(house.stone.rect);
      expectBox(boxes(outline)[0], box);
      const hatch = nodes.filter((n) => n.parent === stone && n.attrs["data-part"] === "hatch");
      expect(hatch.length).toBeGreaterThan(3);
      for (const line of hatch) {
        const [p, q] = segment(line);
        expect(q[1] - p[1]).toBeCloseTo(q[0] - p[0], 3);
        for (const [h, v] of [p, q]) {
          expect(h).toBeGreaterThanOrEqual(box.h0 - 1e-3);
          expect(h).toBeLessThanOrEqual(box.h1 + 1e-3);
          expect(v).toBeGreaterThanOrEqual(box.v0 - 1e-3);
          expect(v).toBeLessThanOrEqual(box.v1 + 1e-3);
        }
      }
    });

    test("dashes the slabs overhead, so their overhangs read past the volumes", () => {
      for (const s of house.slabs) {
        const node = named(nodes, "slab", s.name);
        expectBox(boxes(node)[0], planBox(s.rect));
        expect(isDashed(node)).toBe(!want.seenBelow.includes(s.name));
      }
    });

    test("marks the section's cut plane", () => {
      const [marker] = parts(nodes, "section-line");
      expect(marker.attrs["data-axis"]).toBe(house.section.axis);
      const [p, q] = segment(nodes.find((n) => n.parent === marker && n.tag === "line")!);
      const i = house.section.axis === "x" ? 0 : 1;
      expect(p[i]).toBeCloseTo(house.section.at, 3);
      expect(q[i]).toBeCloseTo(house.section.at, 3);
    });
  });

  describe(`${name} section`, () => {
    const nodes = parse(sectionSvg(house));

    test("marks ±0.00 and each Level at its elevation", () => {
      const marks = parts(nodes, "level");
      expect(marks.map((m) => m.attrs["data-level"]).sort()).toEqual(house.levels.map((l) => l.name).sort());
      for (const l of house.levels) {
        const mark = marks.find((m) => m.attrs["data-level"] === l.name)!;
        const [p, q] = segment(nodes.find((n) => n.parent === mark && n.tag === "line")!);
        expect(p[1]).toBeCloseTo(l.elevation, 3);
        expect(q[1]).toBeCloseTo(l.elevation, 3);
        const label = nodes.find((n) => n.parent === mark && n.tag === "text")!;
        expect(label.text).toBe(`${formatLevel(l.elevation)} ${l.name}`);
        expect(-Number(label.attrs.y)).toBeGreaterThan(l.elevation);
      }
      const datum = marks.filter((m) => nodes.some((n) => n.parent === m && n.tag === "text" && n.text.startsWith("±0.00")));
      expect(datum).toHaveLength(1);
      expect(Number(datum[0].attrs["data-elevation"])).toBe(0);
    });

    test("cuts at least one volume as poché, within the Levels' height", () => {
      const cut = parts(nodes, "volume").filter(isPoche);
      expect(cut.length).toBeGreaterThan(0);
      for (const node of cut) {
        const v = house.volumes.find((x) => x.name === node.attrs["data-name"])!;
        const [x0, x1] = house.section.axis === "x" ? [v.rect.x0, v.rect.x1] : [v.rect.y0, v.rect.y1];
        expect(x0 < house.section.at && x1 > house.section.at).toBe(true);
        const { bottom, top } = verticalExtent(house, v);
        const [outer] = boxes(node);
        expect(outer.v0).toBeCloseTo(bottom, 3);
        expect(outer.v1).toBeCloseTo(top, 3);
      }
    });
  });

  test(`${name}: the same House draws the same SVG`, () => {
    expect(planSvg(structuredClone(house))).toBe(planSvg(house));
    expect(sectionSvg(structuredClone(house))).toBe(sectionSvg(house));
  });
}

test("Lyngen's section looks toward +x, with the front on the right", () => {
  const lyngen = getProjects().find((p) => p.slug === "lyngen")!.house;
  const nodes = parse(sectionSvg(lyngen));
  // main runs from y −4.4 (front) to 5.0 (back), so across the sheet from −5.0 to 4.4
  expectBox(boxes(named(nodes, "volume", "main"))[0], { h0: -5, h1: 4.4, v0: 0, v1: 6.8 });
  // the double-height glazing sits 0.3 m in from the front face
  const [p, q] = segment(named(nodes, "glazing", "living-front"));
  for (const [[h, v], [eh, ev]] of [
    [p, [4.1, 0]],
    [q, [4.1, 6.8]],
  ]) {
    expect(h).toBeCloseTo(eh);
    expect(v).toBeCloseTo(ev);
  }
  // the wing and the chimney lie behind the viewer
  expect(parts(nodes, "volume").map((v) => v.attrs["data-name"])).not.toContain("wing");
  expect(parts(nodes, "stone")).toHaveLength(0);
});
