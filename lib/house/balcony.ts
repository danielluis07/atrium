import { facePoint, level, openingExtent, rectBetween, verticalExtent } from "@/lib/house/derive";
import type { BalconyPiece, Face, House, Opening, Rect, Slab } from "@/lib/house/schema";
import { planOverlap } from "@/lib/house/site";

/**
 * A House's balconies: the Balcony Furniture set out on its slabs, the
 * pergolas over them and the doors onto them, resolved to plan pieces, as
 * the builder JSON carries them (`derived.balcony`, `derived.pergolas`) and
 * `validateHouse` checks them. Unlike Site Works, all of it stands on a
 * slab, not on the plinth. The builder gives the pieces their shape from
 * its kit (`builder/balcony.py`).
 */

/** Each kind's footprint: across its front, and from its front to its back. Mirrors the kit in the builder. */
export const PIECE_SIZE: Record<BalconyPiece["kind"], readonly [number, number]> = {
  chair: [0.75, 0.95],
  table: [0.9, 0.55],
  pine: [0.6, 0.6],
  tub: [1.8, 1.8],
  "fire-bowl": [0.9, 0.9],
  bench: [1.5, 0.42],
  telescope: [0.8, 0.8],
};
/** How far in from its slab's edge every piece stands, clear of the fascia and the balustrade. */
export const BALCONY_EDGE = 0.15;
/** The way kept clear in front of a door onto a balcony, and how far out the slab reaches in front of it. */
export const DOOR_WAY = 0.9;
/** A pergola: from its beams' underside to its slats' top. */
export const PERGOLA_DEPTH = 0.3;
/** A pergola's posts, square in plan. */
export const PERGOLA_POST = 0.08;
/** How far in from its slab's edge a pergola's posts and beams stand, where no solid stands along that edge. */
export const PERGOLA_INSET = 0.12;
/** The longest span between a pergola's posts. */
export const PERGOLA_SPAN = 5;
/** The clear height under a pergola's beams. */
export const PERGOLA_HEADROOM = 2.1;

export type BalconyPlan = {
  slab: string;
  /** The slab's top, which the pieces stand on. */
  deck: number;
  pieces: (BalconyPiece & { facing: Face; rect: Rect })[];
}[];

export type PergolaPlan = {
  slab: string;
  /** Its outline: the slab's, drawn in on every edge no solid stands along. */
  rect: Rect;
  deck: number;
  bottom: number;
  top: number;
  /** Its posts in plan, on its outline, none against a solid. */
  posts: Rect[];
}[];

const EPS = 1e-6;
const m = (n: number) => `${+n.toFixed(2)} m`;
/** Rounded to 0.1 mm, so the builder JSON carries no float noise. */
const mm = (n: number) => Math.round(n * 1e4) / 1e4 + 0;
const roundRect = (r: Rect): Rect => ({ x0: mm(r.x0), y0: mm(r.y0), x1: mm(r.x1), y1: mm(r.y1) });

/** A slab's top: the top of its Level, plus its thickness. */
export const slabTop = (house: House, s: Slab) => {
  const l = level(house, s.level);
  return mm(l.elevation + l.height + s.thickness);
};

/** A piece's footprint, centred on its point and turned to its facing. */
export function pieceRect(piece: BalconyPiece): Rect {
  const [across, along] = PIECE_SIZE[piece.kind];
  const facing = piece.facing ?? "front";
  const [w, d] = facing === "front" || facing === "back" ? [across, along] : [along, across];
  const [x, y] = piece.at;
  return roundRect({ x0: x - w / 2, y0: y - d / 2, x1: x + w / 2, y1: y + d / 2 });
}

/** The Balcony Furniture as plan pieces. Assumes a House that `validateHouse` accepted. */
export function balconyPlan(house: House): BalconyPlan | undefined {
  if (!house.balconyFurniture?.length) return undefined;
  return house.balconyFurniture.map((b) => ({
    slab: b.slab,
    deck: slabTop(house, house.slabs.find((s) => s.name === b.slab)!),
    pieces: b.pieces.map((p) => ({ ...p, facing: p.facing ?? "front", rect: pieceRect(p) })),
  }));
}

/** The solids that stand beside a slab over its deck, up to `top`: a pergola's edge along one bears on it. */
function standing(house: House, deck: number, top: number): Rect[] {
  return [...house.volumes, house.stone].flatMap((v) => {
    const e = verticalExtent(house, v);
    return e.bottom <= deck + EPS && e.top >= top - EPS ? [v.rect] : [];
  });
}

/** Whether a solid stands along one edge of a rectangle, touching it for some length. */
function along(r: Rect, edge: Face, solids: Rect[]): boolean {
  return solids.some((s) => {
    const overlapX = Math.min(r.x1, s.x1) - Math.max(r.x0, s.x0);
    const overlapY = Math.min(r.y1, s.y1) - Math.max(r.y0, s.y0);
    switch (edge) {
      case "front":
        return Math.abs(s.y1 - r.y0) < EPS && overlapX > EPS;
      case "back":
        return Math.abs(s.y0 - r.y1) < EPS && overlapX > EPS;
      case "left":
        return Math.abs(s.x1 - r.x0) < EPS && overlapY > EPS;
      case "right":
        return Math.abs(s.x0 - r.x1) < EPS && overlapY > EPS;
    }
  });
}

/** The distance from a plan point to a rectangle, 0 inside it. */
const rectDistance = (r: Rect, [x, y]: readonly [number, number]) =>
  Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1));

/**
 * The pergolas as plan pieces: each one's outline, the slab's drawn in by
 * `PERGOLA_INSET` on every edge no solid stands along, and its posts, at
 * its corners and evenly between them no more than `PERGOLA_SPAN` apart,
 * except where a solid stands, which its beams bear on. Assumes a House
 * that `validateHouse` accepted.
 */
export function pergolaPlan(house: House): PergolaPlan | undefined {
  if (!house.pergolas?.length) return undefined;
  return house.pergolas.map((p) => {
    const slab = house.slabs.find((s) => s.name === p.slab)!;
    const deck = slabTop(house, slab);
    const solids = standing(house, deck, p.top);
    const s = slab.rect;
    const inset = (edge: Face) => (along(s, edge, solids) ? 0 : PERGOLA_INSET);
    const rect = { x0: s.x0 + inset("left"), y0: s.y0 + inset("front"), x1: s.x1 - inset("right"), y1: s.y1 - inset("back") };
    const corners: [number, number][] = [
      [rect.x0, rect.y0],
      [rect.x1, rect.y0],
      [rect.x1, rect.y1],
      [rect.x0, rect.y1],
    ];
    const points: [number, number][] = [];
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % 4];
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / PERGOLA_SPAN - EPS);
      for (let k = 0; k < n; k++) points.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    });
    const half = PERGOLA_POST / 2;
    const posts = points
      .filter((pt) => !solids.some((r) => rectDistance(r, pt) < PERGOLA_POST))
      .map(([x, y]) => {
        const px = Math.min(Math.max(x - half, rect.x0), rect.x1 - PERGOLA_POST);
        const py = Math.min(Math.max(y - half, rect.y0), rect.y1 - PERGOLA_POST);
        return roundRect({ x0: px, y0: py, x1: px + PERGOLA_POST, y1: py + PERGOLA_POST });
      });
    return { slab: p.slab, rect: roundRect(rect), deck, bottom: mm(p.top - PERGOLA_DEPTH), top: p.top, posts };
  });
}

/** Where a door opens in plan: its span on its face, reaching `DOOR_WAY` out in front of it. */
function doorWay(house: House, o: Opening): Rect {
  const v = house.volumes.find((v) => v.name === o.volume)!;
  const { along } = openingExtent(house, o);
  return rectBetween(facePoint(v.rect, o.face, along[0], 0), facePoint(v.rect, o.face, along[1], -DOOR_WAY));
}

const within = (inner: Rect, outer: Rect) =>
  inner.x0 >= outer.x0 - EPS && inner.x1 <= outer.x1 + EPS && inner.y0 >= outer.y0 - EPS && inner.y1 <= outer.y1 + EPS;

/**
 * Checks a House's balconies against the House: every door above the
 * entrance Level opens onto a slab level with its sill; every pergola and
 * group of Balcony Furniture names a slab, one each; a pergola leaves
 * `PERGOLA_HEADROOM` under its beams and stays under whatever is over it;
 * and every piece stands on its slab clear of its edges, of the House's
 * solids, of the other pieces, of the pergola's posts and of the way in
 * front of a door. Reports through `issue`.
 */
export function checkBalconies(house: House, issue: (part: string, message: string) => void) {
  const slabs = new Map(house.slabs.map((s) => [s.name, s]));
  const solids = [...house.volumes, house.stone].map((v) => ({ name: v.name, rect: v.rect, ...verticalExtent(house, v) }));

  // Doors above the entrance Level open onto a balcony
  const doors = house.openings.filter((o) => o.fill === "door" && level(house, o.level).elevation > EPS);
  const ways = doors.map((o) => {
    const way = doorWay(house, o);
    const sill = openingExtent(house, o).z[0];
    const onto = house.slabs.find((s) => Math.abs(slabTop(house, s) - sill) < EPS && within(way, s.rect));
    if (!onto) {
      issue(`opening ${o.name}`, `is a door above the entrance Level, so it must open onto a slab level with its sill (${m(sill)}) reaching ${m(DOOR_WAY)} out in front of it`);
    }
    return { name: o.name, way, slab: onto?.name };
  });

  // Pergolas
  const pergolas = new Map<string, PergolaPlan[number]>();
  for (const p of house.pergolas ?? []) {
    const part = `pergola on ${p.slab}`;
    const slab = slabs.get(p.slab);
    if (!slab) {
      issue(part, `names slab ${p.slab}, which the House does not declare`);
      continue;
    }
    if (pergolas.has(p.slab)) issue(part, `slab ${p.slab} has more than one pergola`);
    const [plan] = pergolaPlan({ ...house, pergolas: [p] })!;
    pergolas.set(p.slab, plan);
    if (plan.bottom < plan.deck + PERGOLA_HEADROOM - EPS) {
      issue(part, `leaves ${m(plan.bottom - plan.deck)} under its beams, less than ${m(PERGOLA_HEADROOM)}`);
    }
    const over = [
      ...house.slabs.filter((s) => s !== slab).map((s) => ({ name: `slab ${s.name}`, rect: s.rect, bottom: slabTop(house, s) - s.thickness })),
      ...solids.map((s) => ({ name: s.name, rect: s.rect, bottom: s.bottom })),
    ];
    for (const o of over) {
      if (planOverlap(o.rect, plan.rect) > EPS && o.bottom > plan.deck + EPS && o.bottom < plan.top - EPS) {
        issue(part, `rises to ${m(plan.top)}, above the underside of ${o.name} (${m(o.bottom)}) over it`);
      }
    }
  }

  // Balcony Furniture
  const furnished = new Set<string>();
  for (const b of house.balconyFurniture ?? []) {
    const part = `balcony furniture on ${b.slab}`;
    const slab = slabs.get(b.slab);
    if (!slab) {
      issue(part, `names slab ${b.slab}, which the House does not declare`);
      continue;
    }
    if (furnished.has(b.slab)) issue(part, `slab ${b.slab} is furnished more than once`);
    furnished.add(b.slab);
    const deck = slabTop(house, slab);
    const r = slab.rect;
    const inside = { x0: r.x0 + BALCONY_EDGE, y0: r.y0 + BALCONY_EDGE, x1: r.x1 - BALCONY_EDGE, y1: r.y1 - BALCONY_EDGE };
    const posts = pergolas.get(b.slab)?.posts ?? [];
    const placed: { name: string; rect: Rect }[] = [];
    for (const [i, p] of b.pieces.entries()) {
      const name = `${p.kind} ${i + 1}`;
      const at = `${part}: ${name}`;
      const rect = pieceRect(p);
      if (!within(rect, inside)) issue(at, `runs past its slab, or nearer than ${m(BALCONY_EDGE)} to its edge`);
      for (const s of solids) {
        if (planOverlap(rect, s.rect) > EPS && s.bottom < deck + 1 && s.top > deck + EPS) issue(at, `stands inside ${s.name}`);
      }
      for (const q of placed) if (planOverlap(rect, q.rect) > EPS) issue(at, `overlaps ${q.name}`);
      if (posts.some((post) => planOverlap(rect, post) > -EPS)) issue(at, "stands against a post of the pergola");
      for (const w of ways) if (w.slab === b.slab && planOverlap(rect, w.way) > EPS) issue(at, `stands in the way of door ${w.name}`);
      placed.push({ name, rect });
    }
  }
}
