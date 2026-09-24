import { type Box, CHAIN, el, hatched, line, outline, poche, sheet, text, union } from "@/lib/drawings/svg";
import { level, openingExtent, openingRecess, verticalExtent } from "@/lib/house/derive";
import type { House, Rect, Volume } from "@/lib/house/schema";

/** The plan cuts the entrance Level this far above ±0.00. */
export const PLAN_CUT = 1.2;

type View = "cut" | "above" | "below";

const box = (r: Rect): Box => ({ h0: r.x0, h1: r.x1, v0: r.y0, v1: r.y1 });

const view = (bottom: number, top: number): View =>
  bottom >= PLAN_CUT ? "above" : top <= PLAN_CUT ? "below" : "cut";

/**
 * The massing plan, cut at the entrance Level: cut volumes as poché with
 * their openings' recesses left open, a thin line where each fill sits, the
 * stone mass hatched, and what is overhead (slabs and upper volumes)
 * dashed. The front faces down the sheet. The chain line marks the cut of
 * the section, A–A.
 */
export function planSvg(house: House): string {
  const solidView = (part: Volume) => {
    const { bottom, top } = verticalExtent(house, part);
    return view(bottom, top);
  };
  const cut = house.openings.filter((o) => {
    const volume = house.volumes.find((v) => v.name === o.volume)!;
    const [z0, z1] = openingExtent(house, o).z;
    return solidView(volume) === "cut" && z0 < PLAN_CUT && z1 > PLAN_CUT;
  });

  const below: string[] = [];
  const mass: string[] = [];
  const overhead: string[] = [];

  for (const v of house.volumes) {
    const at = solidView(v);
    const attrs = { "data-part": "volume", "data-name": v.name, "data-view": at };
    if (at === "cut") {
      const holes = cut.filter((o) => o.volume === v.name).map((o) => box(openingRecess(house, o).rect));
      mass.push(poche(attrs, box(v.rect), holes));
    } else {
      (at === "above" ? overhead : below).push(outline(attrs, box(v.rect), at === "above"));
    }
  }

  const { stone } = house;
  const stoneView = solidView(stone);
  const stoneAttrs = { "data-part": "stone", "data-name": stone.name, "data-view": stoneView };
  if (stoneView === "cut") mass.push(hatched(stoneAttrs, box(stone.rect)));
  else (stoneView === "above" ? overhead : below).push(outline(stoneAttrs, box(stone.rect), stoneView === "above"));

  for (const s of house.slabs) {
    const { elevation, height } = level(house, s.level);
    const underside = elevation + height;
    const at = view(underside, underside + s.thickness);
    const attrs = { "data-part": "slab", "data-name": s.name, "data-view": at };
    (at === "below" ? below : overhead).push(outline(attrs, box(s.rect), at !== "below"));
  }

  const fills = cut
    .filter((o) => o.fill !== "void")
    .map((o) => line({ "data-part": o.fill, "data-name": o.name }, ...openingRecess(house, o).back));

  const extent = union([...house.volumes, house.stone, ...house.slabs].map((p) => box(p.rect)));
  const reach = 0.8;
  const { axis, at } = house.section;
  const [start, end]: [number, number][] =
    axis === "x"
      ? [
          [at, extent.v0 - reach],
          [at, extent.v1 + reach],
        ]
      : [
          [extent.h0 - reach, at],
          [extent.h1 + reach, at],
        ];
  const label = (p: [number, number], dh: number, dv: number) =>
    text({ "text-anchor": "middle" }, [p[0] + dh, p[1] + dv], "A");
  const sectionLine = el(
    "g",
    { "data-part": "section-line", "data-axis": axis, "data-at": at },
    [
      line({ "stroke-dasharray": CHAIN }, start, end),
      axis === "x" ? label(start, 0, -0.55) : label(start, -0.4, -0.15),
      axis === "x" ? label(end, 0, 0.25) : label(end, 0.4, -0.15),
    ].join(""),
  );

  const drawn = union([extent, { h0: start[0], h1: end[0], v0: start[1], v1: end[1] }]);
  return sheet(drawn, [...below, ...mass, ...fills, ...overhead, sectionLine]);
}
