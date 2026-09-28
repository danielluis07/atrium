import {
  faceNormal,
  facePoint,
  level,
  openingExtent,
  rectBetween,
  verticalExtent,
} from "@/lib/house/derive";
import type { Face, House, Rect, SitePath, SiteSteps, SiteWall, SiteWorks } from "@/lib/house/schema";

/**
 * A House's Site Works (ADR 0006) resolved to plan pieces, as the builder
 * JSON carries them (`derived.site`) and `validateHouse` checks them. The
 * builder gives them their height, their snow and the Snow Shrubs.
 */

/** How wide each cheek beside a flight of steps is. */
export const CHEEK_WIDTH = 0.25;
/** A cheek's top above the flight's top, where no wall meets it, and above its last tread, at its foot. */
export const CHEEK_RISE = 0.45;
export const CHEEK_FOOT = 0.25;
/** A door's thickness at the back of its recess: an apron reaches in to it. Mirrors `DOOR_THICKNESS` in the builder. */
export const DOOR_THICKNESS = 0.06;
/** How far out from a Glazing Face no Snow Shrub may stand. */
export const GLAZING_CLEARANCE = 3;
/** How far out from a wall's long face a Snow Shrub would break its base line. */
export const WALL_BASE = 1;
/** How close to a wall's end, or a gap's edge, a Snow Shrub may stand in front of it. */
export const WALL_END_REACH = 0.9;

/** A value at each corner of a plan rectangle: x0y0, x1y0, x1y1, x0y1. */
export type Corners = [number, number, number, number];

export type SitePlan = {
  terrace?: { rect: Rect; level: number; snow?: Rect };
  /** Each wall, and the boxes it stands as between its gaps. */
  walls: { name: string; rect: Rect; top: number; axis: "x" | "y"; segments: Rect[]; lower?: number }[];
  /**
   * Each flight: its treads from the top, each with its level, and its two
   * cheeks with their tops at each corner. `wall` is the wall it passes
   * through, when it does.
   */
  steps: {
    name: string;
    rect: Rect;
    down: Face;
    treads: { rect: Rect; top: number }[];
    cheeks: { rect: Rect; tops: Corners }[];
    lights: boolean;
    wall?: string;
  }[];
  /** Each path as its straight runs and corner squares, with the path's level at each corner. */
  paths: { name: string; runs: { rect: Rect; tops: Corners }[] }[];
  aprons: { opening: string; rect: Rect; level: number }[];
};

const EPS = 1e-6;
const corners = (r: Rect): [number, number][] => [
  [r.x0, r.y0],
  [r.x1, r.y0],
  [r.x1, r.y1],
  [r.x0, r.y1],
];

/** How much two plan rectangles overlap, as the smaller of their overlaps across and along. */
export const planOverlap = (a: Rect, b: Rect) =>
  Math.min(Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** The axis a wall runs along: its plan's longer side. */
export const wallAxis = (r: Rect): "x" | "y" => (r.x1 - r.x0 >= r.y1 - r.y0 ? "x" : "y");

/** A wall's boxes between its gaps. */
export function wallSegments(wall: SiteWall): Rect[] {
  const axis = wallAxis(wall.rect);
  const [lo, hi] = axis === "x" ? [wall.rect.x0, wall.rect.x1] : [wall.rect.y0, wall.rect.y1];
  const cuts = [...(wall.gaps ?? [])].sort((a, b) => a.from - b.from);
  const spans: [number, number][] = [];
  let at = lo;
  for (const g of cuts) {
    if (g.from > at + EPS) spans.push([at, Math.min(g.from, hi)]);
    at = Math.max(at, g.to);
  }
  if (hi > at + EPS) spans.push([at, hi]);
  return spans.map(([a, b]) => (axis === "x" ? { ...wall.rect, x0: a, x1: b } : { ...wall.rect, y0: a, y1: b }));
}

/**
 * A flight's frame: `u` runs down it from its upper edge (0) to its foot
 * (`length`), `v` across it from one side (0) to the other (`width`).
 */
function flightFrame({ rect, down }: SiteSteps) {
  const along = down === "front" || down === "back" ? "y" : "x";
  const [lo, hi] = along === "y" ? [rect.y0, rect.y1] : [rect.x0, rect.x1];
  const [a0, a1] = along === "y" ? [rect.x0, rect.x1] : [rect.y0, rect.y1];
  // descending toward −y or −x starts at the high edge
  const falls = down === "front" || down === "left";
  const at = (u: number) => (falls ? hi - u : lo + u);
  const box = (u0: number, u1: number, v0: number, v1: number): Rect => {
    const [p, q] = [at(u0), at(u1)];
    return along === "y"
      ? rectBetween([a0 + v0, p], [a0 + v1, q])
      : rectBetween([p, a0 + v0], [q, a0 + v1]);
  };
  // a plan point's distance down the flight
  const uOf = ([x, y]: readonly [number, number]) => (falls ? hi - (along === "y" ? y : x) : (along === "y" ? y : x) - lo);
  return { length: hi - lo, width: a1 - a0, box, uOf };
}

/** The wall a flight passes through, and how far down the flight that wall's lower face is. */
function flightWall(steps: SiteSteps, walls: SiteWall[]): { wall: SiteWall; u: number } | undefined {
  const frame = flightFrame(steps);
  const wall = walls.find((w) => planOverlap(w.rect, steps.rect) > EPS);
  if (!wall) return undefined;
  return { wall, u: Math.max(...corners(wall.rect).map((p) => frame.uOf(p))) };
}

function flight(steps: SiteSteps, walls: SiteWall[]): SitePlan["steps"][number] {
  const { length, width, box, uOf } = flightFrame(steps);
  const n = steps.risers;
  const rise = (steps.top - steps.foot) / n;
  const treads = Array.from({ length: n }, (_, k) => ({
    rect: box((k * length) / n, ((k + 1) * length) / n, 0, width),
    top: steps.top - k * rise,
  }));
  // the cheeks run from the wall the flight passes through, or its upper edge, down to its foot
  const through = flightWall(steps, walls);
  const from = through ? Math.min(Math.max(through.u, 0), length) : 0;
  const upper = through ? through.wall.top : steps.top + CHEEK_RISE;
  const lower = treads[n - 1].top + CHEEK_FOOT;
  const cheek = (v0: number, v1: number) => {
    const rect = box(from, length, v0, v1);
    const tops = corners(rect).map((p) => {
      const t = length - from > EPS ? (uOf(p) - from) / (length - from) : 0;
      return upper + (lower - upper) * Math.min(Math.max(t, 0), 1);
    }) as Corners;
    return { rect, tops };
  };
  return {
    name: steps.name,
    rect: steps.rect,
    down: steps.down,
    treads,
    cheeks: [cheek(-CHEEK_WIDTH, 0), cheek(width, width + CHEEK_WIDTH)],
    lights: steps.lights ?? false,
    wall: through?.wall.name,
  };
}

/** The path's level at a plan point on or beside it: even along its centre line, from `from` to `to`. */
export function pathLevel(path: SitePath, [x, y]: readonly [number, number]): number {
  const pts = path.line;
  const lengths = pts.slice(1).map((b, i) => Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  let best = { d: Infinity, run: 0 };
  let run = 0;
  lengths.forEach((n, i) => {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const t = Math.min(Math.max(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (n * n), 0), 1);
    const d = Math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t));
    if (d < best.d - EPS) best = { d, run: run + t * n };
    run += n;
  });
  return path.from + ((path.to - path.from) * best.run) / total;
}

/**
 * A path's slabs: one to each straight run of its centre line, and one to
 * each corner square where it turns, so no joint breaks a run into slivers
 * and every slab meets the next corner to corner.
 */
export function pathRuns(path: SitePath): Rect[] {
  const h = path.width / 2;
  const pts = path.line;
  const last = pts.length - 2;
  const out: Rect[] = [];
  for (let i = 0; i <= last; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const alongX = Math.abs(b[1] - a[1]) < EPS;
    const sign = alongX ? Math.sign(b[0] - a[0]) : Math.sign(b[1] - a[1]);
    // a turn at either end leaves its corner square to its own slab
    const start = (alongX ? a[0] : a[1]) + (i > 0 ? sign * h : 0);
    const end = (alongX ? b[0] : b[1]) - (i < last ? sign * h : 0);
    const run = alongX
      ? rectBetween([start, a[1] - h], [end, a[1] + h])
      : rectBetween([a[0] - h, start], [a[0] + h, end]);
    if (Math.abs(end - start) > EPS) out.push(run);
    if (i < last) out.push(rectBetween([b[0] - h, b[1] - h], [b[0] + h, b[1] + h]));
  }
  return out;
}

/** An apron's plan: across its door, from out in front up to the door in its recess. */
export function apronRect(house: House, apron: SiteWorks["aprons"][number]): Rect | undefined {
  const opening = house.openings.find((o) => o.name === apron.opening);
  const volume = opening && house.volumes.find((v) => v.name === opening.volume);
  if (!opening || !volume) return undefined;
  const { along } = openingExtent(house, opening);
  return rectBetween(
    facePoint(volume.rect, opening.face, along[0], -apron.depth),
    facePoint(volume.rect, opening.face, along[1], opening.depth - DOOR_THICKNESS),
  );
}

/** The Site Works as plan pieces. Assumes a House that `validateHouse` accepted. */
export function sitePlan(house: House): SitePlan | undefined {
  const site = house.siteWorks;
  if (!site) return undefined;
  const terrace = site.terrace && {
    rect: site.terrace.rect,
    level: level(house, site.terrace.level).elevation,
    snow: site.terrace.snow,
  };
  return {
    terrace,
    walls: site.walls.map((w) => ({
      name: w.name,
      rect: w.rect,
      top: w.top,
      axis: wallAxis(w.rect),
      segments: wallSegments(w),
      lower: w.lower,
    })),
    steps: site.steps.map((s) => flight(s, site.walls)),
    paths: site.paths.map((p) => ({
      name: p.name,
      runs: pathRuns(p).map((rect) => ({ rect, tops: corners(rect).map((c) => pathLevel(p, c)) as Corners })),
    })),
    aprons: site.aprons.map((a) => {
      const opening = house.openings.find((o) => o.name === a.opening)!;
      return { opening: a.opening, rect: apronRect(house, a)!, level: level(house, opening.level).elevation };
    }),
  };
}

/** The distance from a plan point to a rectangle, 0 inside it. */
const rectDistance = (r: Rect, [x, y]: readonly [number, number]) =>
  Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1));

/** The long faces of a wall. */
const longFaces = (w: SiteWall): Face[] => (wallAxis(w.rect) === "x" ? ["front", "back"] : ["left", "right"]);

/**
 * Checks a House's Site Works against the House: every reference exists,
 * nothing stands inside a volume, steps and paths pass walls only through
 * their gaps, every path reaches a door, set-in lights sit in a wall's face,
 * and no Snow Shrub stands on a piece, in front of glazing or across a
 * wall's base line. Reports through `issue`.
 */
export function checkSiteWorks(house: House, issue: (part: string, message: string) => void) {
  const site = house.siteWorks;
  if (!site) return;
  const m = (n: number) => `${+n.toFixed(2)} m`;
  const levels = new Set(house.levels.map((l) => l.name));
  const walls = new Map(site.walls.map((w) => [w.name, w]));

  const seen = new Set<string>();
  for (const n of [...site.walls, ...site.steps, ...site.paths].map((p) => p.name)) {
    if (seen.has(n)) issue(`site works ${n}`, `the name ${n} is used by more than one wall, flight or path`);
    seen.add(n);
  }

  // Terrace
  const { terrace } = site;
  if (terrace && !levels.has(terrace.level)) issue("terrace", `names Level ${terrace.level}, which the House does not declare`);
  const within = (inner: Rect, outer: Rect) =>
    inner.x0 >= outer.x0 - EPS && inner.x1 <= outer.x1 + EPS && inner.y0 >= outer.y0 - EPS && inner.y1 <= outer.y1 + EPS;
  if (terrace?.snow && !within(terrace.snow, terrace.rect)) issue("terrace", "its snow runs past the terrace");

  // Walls
  for (const w of site.walls) {
    const part = `wall ${w.name}`;
    const axis = wallAxis(w.rect);
    const [lo, hi] = axis === "x" ? [w.rect.x0, w.rect.x1] : [w.rect.y0, w.rect.y1];
    const gaps = [...(w.gaps ?? [])].sort((a, b) => a.from - b.from);
    for (const [i, g] of gaps.entries()) {
      if (g.to <= g.from + EPS) issue(part, `a gap ends (${m(g.to)}) before it starts (${m(g.from)})`);
      if (g.from < lo - EPS || g.to > hi + EPS) issue(part, `a gap (${m(g.from)} to ${m(g.to)}) runs past its ends`);
      if (i > 0 && g.from < gaps[i - 1].to - EPS) issue(part, "two of its gaps overlap");
    }
    if (w.lower !== undefined) {
      if (axis !== "x") issue(part, "holds the snow behind it (lower), so it must run along x");
      if (w.lower >= w.top) issue(part, `the snow in front of it (${m(w.lower)}) is not below its top (${m(w.top)})`);
    }
  }

  // Steps
  for (const s of site.steps) {
    if (s.foot >= s.top - EPS) issue(`steps ${s.name}`, `their foot (${m(s.foot)}) is not below their top (${m(s.top)})`);
  }

  // Paths: axis-aligned runs, turning square, reaching a door
  const aprons = site.aprons.map((a) => ({ a, rect: apronRect(house, a) }));
  // where a path may end: on an apron, at a door, or on a terrace a door opens onto at its level
  const doors = house.openings.flatMap((o) => {
    const v = house.volumes.find((v) => v.name === o.volume);
    if (o.fill !== "door" || !v || !levels.has(o.level)) return [];
    const { along } = openingExtent(house, o);
    return [{ level: o.level, rect: rectBetween(facePoint(v.rect, o.face, along[0], 0), facePoint(v.rect, o.face, along[1], 0)) }];
  });
  const onTerrace = (d: (typeof doors)[number]) =>
    terrace !== undefined &&
    levels.has(terrace.level) &&
    level(house, d.level).elevation === level(house, terrace.level).elevation &&
    within(d.rect, terrace.rect);
  const doorways = [
    ...aprons.flatMap(({ rect }) => (rect ? [rect] : [])),
    ...doors.map((d) => d.rect),
    ...(doors.some(onTerrace) ? [terrace!.rect] : []),
  ];
  for (const p of site.paths) {
    const part = `path ${p.name}`;
    const segs = p.line.slice(1).map((b, i) => [b[0] - p.line[i][0], b[1] - p.line[i][1]] as const);
    let ok = true;
    for (const [i, [dx, dy]] of segs.entries()) {
      if ((Math.abs(dx) > EPS) === (Math.abs(dy) > EPS)) {
        issue(part, `run ${i + 1} of its line is ${Math.abs(dx) > EPS ? "not along x or y" : "of no length"}`);
        ok = false;
      } else if (i > 0 && Math.abs(dx * segs[i - 1][0] + dy * segs[i - 1][1]) > EPS) {
        issue(part, `run ${i + 1} of its line doesn't turn square from the one before`);
        ok = false;
      }
    }
    if (ok && pathRuns(p).length !== 2 * segs.length - 1) issue(part, "a run of its line is too short for its width");
    const ends = [p.line[0], p.line[p.line.length - 1]];
    const door = (pt: readonly [number, number]) => doorways.some((r) => rectDistance(r, pt) < EPS);
    if (!ends.some(door)) {
      issue(part, "reaches no door: neither end of its line is on an apron, at a door, or on a terrace a door opens onto");
    }
  }

  // Aprons
  for (const { a, rect } of aprons) {
    const opening = house.openings.find((o) => o.name === a.opening);
    if (!opening || !rect) issue(`apron at ${a.opening}`, `names opening ${a.opening}, which the House does not declare`);
    else if (opening.fill !== "door") issue(`apron at ${a.opening}`, `stands at ${a.opening}, a ${opening.fill}, not a door`);
  }

  // Set-in lights
  for (const l of site.lights) {
    const part = `light in ${l.wall}`;
    const w = walls.get(l.wall);
    if (!w) {
      issue(part, `names wall ${l.wall}, which the site works do not declare`);
      continue;
    }
    if (!longFaces(w).includes(l.face)) issue(part, `sits in the ${l.face} face, which is an end of the wall, not a long face`);
    const [lo, hi] = wallAxis(w.rect) === "x" ? [w.rect.x0, w.rect.x1] : [w.rect.y0, w.rect.y1];
    if (l.at < lo + 0.1 || l.at > hi - 0.1 || (w.gaps ?? []).some((g) => l.at > g.from - 0.1 && l.at < g.to + 0.1)) {
      issue(part, `at ${m(l.at)} is not in the wall's face`);
    }
  }

  // Pieces, as plan rectangles with their tops
  const plan = sitePlan({ ...house, siteWorks: { ...site, aprons: aprons.filter((x) => x.rect).map((x) => x.a) } })!;
  const pieces: { part: string; rect: Rect; top: number }[] = [
    ...(plan.terrace && levels.has(site.terrace!.level) ? [{ part: "terrace", rect: plan.terrace.rect, top: plan.terrace.level }] : []),
    ...plan.walls.flatMap((w) => w.segments.map((rect) => ({ part: `wall ${w.name}`, rect, top: w.top }))),
    ...plan.steps.flatMap((s) => [
      ...s.treads.map((t) => ({ part: `steps ${s.name}`, rect: t.rect, top: t.top })),
      ...s.cheeks.map((c) => ({ part: `steps ${s.name}`, rect: c.rect, top: Math.max(...c.tops) })),
    ]),
    ...plan.paths.flatMap((p) => p.runs.map((r) => ({ part: `path ${p.name}`, rect: r.rect, top: Math.max(...r.tops) }))),
    ...plan.aprons.map((a) => ({ part: `apron at ${a.opening}`, rect: a.rect, top: a.level })),
  ];
  const solids = [...house.volumes, house.stone].filter((v) => levels.has(v.from) && levels.has(v.to));
  const reported = new Set<string>();
  for (const p of pieces) {
    for (const v of solids) {
      const key = `${p.part}/${v.name}`;
      if (reported.has(key)) continue;
      if (planOverlap(p.rect, v.rect) > EPS && verticalExtent(house, v).bottom < p.top - EPS) {
        issue(p.part, `stands inside ${v.name}`);
        reported.add(key);
      }
    }
  }
  // Steps, paths and aprons cross a wall only through a gap
  const segments = plan.walls.flatMap((w) => w.segments.map((rect) => ({ name: w.name, rect })));
  for (const p of pieces.filter((p) => !p.part.startsWith("wall") && !p.part.startsWith("terrace"))) {
    for (const s of segments) {
      const key = `${p.part}/wall ${s.name}`;
      if (!reported.has(key) && planOverlap(p.rect, s.rect) > EPS) {
        issue(p.part, `crosses wall ${s.name} where it has no gap`);
        reported.add(key);
      }
    }
  }

  // Snow Shrubs
  const glazing = house.openings.flatMap((o) => {
    const v = house.volumes.find((v) => v.name === o.volume);
    if (o.fill !== "glazing" || !v) return [];
    const { along } = openingExtent(house, o);
    return [{ name: o.name, rect: rectBetween(facePoint(v.rect, o.face, along[0], 0), facePoint(v.rect, o.face, along[1], -GLAZING_CLEARANCE)) }];
  });
  for (const [i, s] of site.shrubs.entries()) {
    const part = `shrub ${i + 1}`;
    const r = s.size / 2;
    const touches = (rect: Rect) => rectDistance(rect, s.at) < r - EPS;
    for (const v of [...house.volumes, house.stone]) if (touches(v.rect)) issue(part, `stands inside ${v.name}`);
    for (const p of new Set(pieces.filter((p) => touches(p.rect)).map((p) => p.part))) issue(part, `stands on ${p}`);
    for (const g of glazing) if (touches(g.rect)) issue(part, `stands in front of Glazing Face ${g.name}`);
    for (const w of site.walls) {
      const axis = wallAxis(w.rect);
      const [c, lo, hi] = axis === "x" ? [s.at[0], w.rect.x0, w.rect.x1] : [s.at[1], w.rect.y0, w.rect.y1];
      const ends = [lo, hi, ...(w.gaps ?? []).flatMap((g) => [g.from, g.to])];
      const band = (face: Face) => {
        const [nx, ny] = faceNormal[face];
        const out = { x0: w.rect.x0, y0: w.rect.y0, x1: w.rect.x1, y1: w.rect.y1 };
        if (nx < 0) [out.x0, out.x1] = [w.rect.x0 - WALL_BASE, w.rect.x0];
        if (nx > 0) [out.x0, out.x1] = [w.rect.x1, w.rect.x1 + WALL_BASE];
        if (ny < 0) [out.y0, out.y1] = [w.rect.y0 - WALL_BASE, w.rect.y0];
        if (ny > 0) [out.y0, out.y1] = [w.rect.y1, w.rect.y1 + WALL_BASE];
        return out;
      };
      const across = longFaces(w).some((f) => touches(band(f))) && c > lo && c < hi;
      if (across && !ends.some((e) => Math.abs(c - e) <= WALL_END_REACH)) {
        issue(part, `breaks the base line of wall ${w.name}: in front of it, only by an end or a gap`);
      }
    }
  }
}
