import {
  faceWidth,
  grossFloorArea,
  levelElevations,
  openingExtent,
  verticalExtent,
} from "@/lib/house/derive";
import { House, type Rect, type Slab, type Volume } from "@/lib/house/schema";

/** One problem with a House, naming the part it is about (`opening living-front`). */
export type HouseIssue = { part: string; message: string };

/** How far the House's gross floor area may drift from the Project's authored m². */
export const FLOOR_AREA_TOLERANCE = 0.15;

const EPS = 1e-6;
const m = (n: number) => `${+n.toFixed(2)} m`;

/** Checks shape with zod. Issues name the part by its path and, where it has one, its name. */
export function parseHouse(
  input: unknown,
): { ok: true; house: House } | { ok: false; issues: HouseIssue[] } {
  const result = House.safeParse(input);
  if (result.success) return { ok: true, house: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      part: describePath(input, issue.path),
      message: issue.message,
    })),
  };
}

function describePath(input: unknown, path: PropertyKey[]): string {
  let node: unknown = input;
  const out: string[] = [];
  for (const key of path) {
    node = node && typeof node === "object" ? (node as Record<PropertyKey, unknown>)[key] : undefined;
    const named = node && typeof node === "object" && "name" in node ? String(node.name) : undefined;
    out.push(typeof key === "number" && named ? named : String(key));
  }
  return out.join(".") || "house";
}

/**
 * Checks what zod cannot: references exist, openings fit their faces and
 * don't overlap, the one Interior sits in a volume of one Level that glass
 * looks into and no void or terrace cuts through, every slab touches a
 * volume or the stone mass, names are unique, and the gross floor area is
 * within ±15% of the authored m².
 * Returns no issues when the House is valid.
 */
export function validateHouse(house: House, { floorArea }: { floorArea: number }): HouseIssue[] {
  const issues: HouseIssue[] = [];
  const issue = (part: string, message: string) => issues.push({ part, message });

  // Names
  const unique = (kind: string, names: string[]) => {
    const seen = new Set<string>();
    for (const n of names) {
      if (seen.has(n)) issue(`${kind} ${n}`, `the name ${n} is used by more than one ${kind}`);
      seen.add(n);
    }
  };
  unique("level", house.levels.map((l) => l.name));
  unique("volume", house.volumes.map((v) => v.name));
  unique("slab", house.slabs.map((s) => s.name));
  unique("opening", house.openings.map((o) => o.name));

  // Levels
  const levels = new Set(house.levels.map((l) => l.name));
  const stacked = levelElevations(house);
  if (stacked.filter((l) => Math.abs(l.floor) < EPS).length !== 1) {
    issue("levels", "exactly one Level, the entrance Level, must sit at the datum (elevation 0)");
  }
  for (let i = 1; i < stacked.length; i++) {
    if (stacked[i].floor < stacked[i - 1].top - EPS) {
      issue(`level ${stacked[i].name}`, `its floor is inside Level ${stacked[i - 1].name}`);
    }
  }

  // References
  const order = stacked.map((l) => l.name);
  const known = (part: string, ref: string | undefined, role: string) => {
    if (ref === undefined || levels.has(ref)) return true;
    issue(part, `${role} names Level ${ref}, which the House does not declare`);
    return false;
  };
  const massOk = (kind: string, v: Volume) => {
    const part = `${kind} ${v.name}`;
    const ok = [known(part, v.from, "from"), known(part, v.to, "to")].every(Boolean);
    if (!ok) return false;
    if (order.indexOf(v.to) < order.indexOf(v.from)) {
      issue(part, `runs from Level ${v.from} down to Level ${v.to}`);
      return false;
    }
    const { bottom, top } = verticalExtent(house, v);
    if (top <= bottom + EPS) {
      issue(part, `its top (${m(top)}) is not above its bottom (${m(bottom)})`);
      return false;
    }
    return true;
  };
  const volumesOk = house.volumes.map((v) => massOk("volume", v)).every(Boolean);
  const stoneOk = massOk("stone", house.stone);
  const volumes = new Map(house.volumes.map((v) => [v.name, v]));

  // Openings
  const placed: { name: string; key: string; along: [number, number]; z: [number, number] }[] = [];
  for (const o of house.openings) {
    const part = `opening ${o.name}`;
    const volume = volumes.get(o.volume);
    const refs = [known(part, o.level, "level"), known(part, o.to, "to")].every(Boolean);
    if (!volume) issue(part, `sits on volume ${o.volume}, which the House does not declare`);
    if (!volume || !refs || !volumesOk) continue;

    const width = faceWidth(volume.rect, o.face);
    const { bottom, top } = verticalExtent(house, volume);
    const { along, z } = openingExtent(house, o);
    const where = `the ${o.face} face of ${volume.name}`;
    if (along[1] > width + EPS) {
      issue(part, `runs ${m(along[1] - width)} past the right edge of ${where} (${m(width)} wide)`);
    }
    if (z[1] <= z[0] + EPS) issue(part, `its head (${m(z[1])}) is not above its sill (${m(z[0])})`);
    if (z[0] < bottom - EPS) issue(part, `its sill is ${m(bottom - z[0])} below the bottom of ${volume.name}`);
    if (z[1] > top + EPS) issue(part, `its head is ${m(z[1] - top)} above the top of ${volume.name}`);
    placed.push({ name: o.name, key: `${o.volume}/${o.face}`, along, z });
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [a, b] = [placed[i], placed[j]];
      if (a.key === b.key && overlap(a.along, b.along) > EPS && overlap(a.z, b.z) > EPS) {
        issue(`opening ${b.name}`, `overlaps opening ${a.name}`);
      }
    }
  }

  // Interiors: one room shell, in one Level, that some glass looks into and nothing cuts through
  const rooms = house.volumes.filter((v) => v.interior);
  for (const v of rooms.slice(1)) {
    issue(`volume ${v.name}`, `has an Interior, but ${rooms[0].name} already has the House's one Interior`);
  }
  for (const v of rooms) {
    const part = `volume ${v.name}`;
    const into = house.openings.filter((o) => o.volume === v.name);
    if (v.from !== v.to) issue(part, `has an Interior, so it must span one Level, not ${v.from} to ${v.to}`);
    if (!into.some((o) => o.fill === "glazing")) issue(part, "has an Interior, but no Glazing Face looks into it");
    for (const o of into.filter((o) => o.fill === "void" || o.fill === "terrace")) {
      issue(`opening ${o.name}`, `is a ${o.fill}, which would cut through the Interior in ${v.name}`);
    }
  }

  // Slabs
  const supports = [
    ...(volumesOk ? house.volumes : []),
    ...(stoneOk ? [house.stone] : []),
  ].map((v) => box(v.rect, verticalExtent(house, v)));
  for (const s of house.slabs) {
    const part = `slab ${s.name}`;
    if (!known(part, s.level, "level")) continue;
    const slab = slabBox(house, s);
    if (volumesOk && stoneOk && !supports.some((b) => touches(slab, b))) {
      issue(part, "touches no volume or stone mass, so nothing holds it up");
    }
  }

  // Balustrades
  const slabs = new Set(house.slabs.map((s) => s.name));
  for (const b of house.balustrades) {
    if (!slabs.has(b.slab)) issue(`balustrade on ${b.slab}`, `names slab ${b.slab}, which the House does not declare`);
  }

  // Section
  const plan = [...house.volumes, house.stone].map((v) => v.rect);
  const [lo, hi] =
    house.section.axis === "x"
      ? [Math.min(...plan.map((r) => r.x0)), Math.max(...plan.map((r) => r.x1))]
      : [Math.min(...plan.map((r) => r.y0)), Math.max(...plan.map((r) => r.y1))];
  if (house.section.at <= lo || house.section.at >= hi) {
    issue("section", `the cut at ${house.section.axis} = ${m(house.section.at)} misses the House`);
  }

  // Gross floor area
  if (volumesOk) {
    const gfa = grossFloorArea(house);
    if (Math.abs(gfa - floorArea) > floorArea * FLOOR_AREA_TOLERANCE) {
      issue(
        "volumes",
        `gross floor area is ${Math.round(gfa)} m², more than ±15% from the authored ${floorArea} m²`,
      );
    }
  }

  return issues;
}

/** Formats issues one per line, for errors and the export's output. */
export function formatIssues(issues: HouseIssue[]): string {
  return issues.map((i) => `  ${i.part}: ${i.message}`).join("\n");
}

type Box = { x: [number, number]; y: [number, number]; z: [number, number] };

const overlap = (a: [number, number], b: [number, number]) =>
  Math.min(a[1], b[1]) - Math.max(a[0], b[0]);

const box = (r: Rect, { bottom, top }: { bottom: number; top: number }): Box => ({
  x: [r.x0, r.x1],
  y: [r.y0, r.y1],
  z: [bottom, top],
});

function slabBox(house: House, s: Slab): Box {
  const l = house.levels.find((l) => l.name === s.level)!;
  const bottom = l.elevation + l.height;
  return box(s.rect, { bottom, top: bottom + s.thickness });
}

/** Two boxes touch when they meet on at least a patch of face, not just an edge. */
function touches(a: Box, b: Box): boolean {
  const o = [overlap(a.x, b.x), overlap(a.y, b.y), overlap(a.z, b.z)];
  return o.every((d) => d >= -EPS) && o.filter((d) => d > EPS).length >= 2;
}
