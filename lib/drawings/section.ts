import { type Box, CHAIN, el, hatched, line, num, outline, poche, sheet, text, union } from "@/lib/drawings/svg";
import { level, levelElevations, openingExtent, openingRecess, verticalExtent } from "@/lib/house/derive";
import type { House, Rect } from "@/lib/house/schema";
import { formatLevel } from "@/lib/format";

type View = "cut" | "beyond";

/** Room in the left margin for the Level marks. */
const MARK_MARGIN = 4.8;

/**
 * The section at the House's authored cut, the plane `axis = at`. It
 * always looks along +x or +y: cut across x, toward +x with the front on
 * the right; cut across y, toward the back with x to the right, like the
 * front elevation. What the plane cuts is poché (the stone mass hatched)
 * with the recesses of cut openings left open and a thin line where each
 * fill sits; what lies beyond is outlined, including the rest of each cut
 * volume, which shows through a void; what lies behind the viewer is left
 * out. Each Level is marked on the left, ±0.00 at the entrance Level.
 */
export function sectionSvg(house: House): string {
  const { axis, at } = house.section;
  /** The part's extent through the plane, and across the sheet. */
  const through = (r: Rect) => (axis === "x" ? [r.x0, r.x1] : [r.y0, r.y1]);
  const across = (r: Rect) => (axis === "x" ? [-r.y1, -r.y0] : [r.x0, r.x1]);
  const viewOf = (r: Rect): View | undefined => {
    const [a, b] = through(r);
    if (a < at && b > at) return "cut";
    return a >= at ? "beyond" : undefined;
  };
  const box = (r: Rect, v0: number, v1: number): Box => {
    const [h0, h1] = across(r);
    return { h0, h1, v0, v1 };
  };

  const beyond: string[] = [];
  const mass: string[] = [];
  const fills: string[] = [];
  const boxes: Box[] = [];

  // openings in the faces the plane crosses
  const crossed = axis === "x" ? ["front", "back"] : ["left", "right"];
  const cutOpenings = house.openings.filter((o) => {
    if (!crossed.includes(o.face)) return false;
    const [a, b] = through(openingRecess(house, o).rect);
    return a < at && b > at;
  });

  for (const v of house.volumes) {
    const seen = viewOf(v.rect);
    if (!seen) continue;
    const { bottom, top } = verticalExtent(house, v);
    const b = box(v.rect, bottom, top);
    const attrs = { "data-part": "volume", "data-name": v.name, "data-view": seen };
    boxes.push(b);
    beyond.push(outline(seen === "cut" ? { "data-part": "elevation", "data-name": v.name } : attrs, b));
    if (seen === "beyond") continue;
    const openings = cutOpenings.filter((o) => o.volume === v.name);
    const holes = openings.map((o) => {
      const [z0, z1] = openingExtent(house, o).z;
      return box(openingRecess(house, o).rect, z0, z1);
    });
    mass.push(poche(attrs, b, holes));
    for (const o of openings.filter((o) => o.fill !== "void")) {
      const [z0, z1] = openingExtent(house, o).z;
      const [p] = openingRecess(house, o).back;
      const h = axis === "x" ? -p[1] : p[0];
      fills.push(line({ "data-part": o.fill, "data-name": o.name }, [h, z0], [h, z1]));
    }
  }

  const { stone } = house;
  const stoneView = viewOf(stone.rect);
  if (stoneView) {
    const { bottom, top } = verticalExtent(house, stone);
    const b = box(stone.rect, bottom, top);
    const attrs = { "data-part": "stone", "data-name": stone.name, "data-view": stoneView };
    boxes.push(b);
    if (stoneView === "cut") mass.push(hatched(attrs, b));
    else beyond.push(outline(attrs, b));
  }

  for (const s of house.slabs) {
    const seen = viewOf(s.rect);
    if (!seen) continue;
    const { elevation, height } = level(house, s.level);
    const b = box(s.rect, elevation + height, elevation + height + s.thickness);
    const attrs = { "data-part": "slab", "data-name": s.name, "data-view": seen };
    boxes.push(b);
    // a slab with no thickness is only its fascia line
    if (seen === "cut" && s.thickness > 0) mass.push(poche(attrs, b));
    else beyond.push(outline(attrs, b));
  }

  const extent = union(boxes);
  const markAt = extent.h0 - 0.9;
  const marks = levelElevations(house).map(({ name, floor }) =>
    el(
      "g",
      { "data-part": "level", "data-level": name, "data-elevation": floor },
      [
        line({ "stroke-dasharray": CHAIN }, [markAt, floor], [extent.h1 + 0.6, floor]),
        el("path", {
          d: `M${num(markAt - 0.18)} ${num(-floor - 0.3)}H${num(markAt + 0.18)}L${num(markAt)} ${num(-floor)}Z`,
          "vector-effect": "non-scaling-stroke",
        }),
        text({ "text-anchor": "end" }, [markAt - 0.35, floor + 0.12], `${formatLevel(floor)} ${name}`),
      ].join(""),
    ),
  );

  return sheet(extent, [...marks, ...beyond, ...mass, ...fills], { marginLeft: MARK_MARGIN });
}
