import type { Face, House, Level, Opening, Rect, Volume } from "@/lib/house/schema";

/**
 * Facts derived from a House, shared by the export, the drawings and the
 * runtime so they never compute them differently. They assume a House that
 * `validateHouse` accepted: an unknown Level reference throws.
 */

export type LevelElevation = { name: string; floor: number; top: number };

/** Each Level's floor and top relative to the datum, lowest first. */
export function levelElevations(house: House): LevelElevation[] {
  return [...house.levels]
    .sort((a, b) => a.elevation - b.elevation)
    .map((l) => ({ name: l.name, floor: l.elevation, top: l.elevation + l.height }));
}

export function level(house: House, name: string): Level {
  const found = house.levels.find((l) => l.name === name);
  if (!found) throw new Error(`Unknown Level ${name}`);
  return found;
}

const levelTop = (l: Level) => l.elevation + l.height;

/** Bottom and top of a volume or the stone mass. */
export function verticalExtent(house: House, part: Volume): { bottom: number; top: number } {
  return {
    bottom: level(house, part.from).elevation,
    top: part.top ?? levelTop(level(house, part.to)),
  };
}

/** Width of a volume face, seen from outside. */
export function faceWidth(rect: Rect, face: Face): number {
  return face === "front" || face === "back" ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
}

/** Outward normal of a face in the House frame (x, y). */
export const faceNormal: Record<Face, readonly [number, number]> = {
  front: [0, -1],
  back: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** Where an opening sits: along its face from the left edge, and absolute z. */
export function openingExtent(
  house: House,
  opening: Opening,
): { along: [number, number]; z: [number, number] } {
  const volume = house.volumes.find((v) => v.name === opening.volume);
  if (!volume) throw new Error(`Unknown volume ${opening.volume}`);
  const floor = level(house, opening.level).elevation;
  const above = levelTop(level(house, opening.to ?? opening.level));
  const head = opening.head ?? Math.min(above, verticalExtent(house, volume).top) - floor;
  return {
    along: [opening.at, opening.at + opening.width],
    z: [floor + (opening.sill ?? 0), floor + head],
  };
}

/** How deep a volume is behind one of its faces. */
export function faceDepth(rect: Rect, face: Face): number {
  return face === "front" || face === "back" ? rect.y1 - rect.y0 : rect.x1 - rect.x0;
}

/**
 * The room a Glazing Face looks into, metres: as wide as the glass, as deep
 * as the volume behind the recess. It stands on the floor of the opening's
 * Level and rises to the top of that Level (or of `to`), except in a volume
 * of one Level, whose room rises to the volume's top: a double-height room
 * is one room. `sill` is how far the glass starts above the room's floor.
 * The builder mirrors it (`interior_room`), and the glazing shader draws the
 * procedural room from the numbers it writes to the GLB.
 */
export function interiorRoom(
  house: House,
  opening: Opening,
): { width: number; height: number; depth: number; sill: number } {
  const volume = house.volumes.find((v) => v.name === opening.volume);
  if (!volume) throw new Error(`Unknown volume ${opening.volume}`);
  const { top } = verticalExtent(house, volume);
  const single = volume.from === volume.to;
  const floor = level(house, single ? volume.from : opening.level).elevation;
  const ceiling = single ? top : Math.min(top, levelTop(level(house, opening.to ?? opening.level)));
  return {
    width: opening.width,
    height: ceiling - floor,
    depth: faceDepth(volume.rect, opening.face) - opening.depth,
    sill: openingExtent(house, opening).z[0] - floor,
  };
}

/** How thick the walls round an Interior are, metres. */
export const INTERIOR_WALL = 0.3;

/** The volume that holds the House's Interior, when it has one. */
export const interiorVolume = (house: House): Volume | undefined => house.volumes.find((v) => v.interior);

/**
 * The room shell of the Interior in `volume` (ADR 0005): the volume's plan
 * inside walls `INTERIOR_WALL` thick, from its floor to its top, since a
 * volume with an Interior spans one Level. The builder hollows the volume to
 * it, and every Glazing Face into the volume looks into it.
 */
export function interiorShell(house: House, volume: Volume): { rect: Rect; floor: number; ceiling: number } {
  const { bottom, top } = verticalExtent(house, volume);
  const { x0, y0, x1, y1 } = volume.rect;
  const w = INTERIOR_WALL;
  return { rect: { x0: x0 + w, y0: y0 + w, x1: x1 - w, y1: y1 - w }, floor: bottom, ceiling: top };
}

type Point = readonly [number, number];

/**
 * Where an opening cuts into its volume, in plan: the recess from the face
 * plane `depth` inward, and the segment at its back where the fill sits.
 * Mirrors `FaceFrame` in the builder.
 */
export function openingRecess(house: House, opening: Opening): { rect: Rect; back: [Point, Point] } {
  const volume = house.volumes.find((v) => v.name === opening.volume);
  if (!volume) throw new Error(`Unknown volume ${opening.volume}`);
  const { x0, y0, x1, y1 } = volume.rect;
  // `a` runs along the face from its left edge seen from outside, `d` inward
  const point = (a: number, d: number): Point => {
    switch (opening.face) {
      case "front":
        return [x0 + a, y0 + d];
      case "back":
        return [x1 - a, y1 - d];
      case "left":
        return [x0 + d, y1 - a];
      case "right":
        return [x1 - d, y0 + a];
    }
  };
  const [a0, a1] = [opening.at, opening.at + opening.width];
  const [p, q] = [point(a0, 0), point(a1, opening.depth)];
  return {
    rect: { x0: Math.min(p[0], q[0]), y0: Math.min(p[1], q[1]), x1: Math.max(p[0], q[0]), y1: Math.max(p[1], q[1]) },
    back: [point(a0, opening.depth), point(a1, opening.depth)],
  };
}

/** Plan area of the union of rectangles. */
export function unionArea(rects: Rect[]): number {
  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const [a, b] = [xs[i], xs[i + 1]];
    const spans = rects
      .filter((r) => r.x0 <= a && r.x1 >= b)
      .map((r) => [r.y0, r.y1] as const)
      .sort((p, q) => p[0] - q[0]);
    let covered = 0;
    let end = -Infinity;
    for (const [y0, y1] of spans) {
      if (y1 <= end) continue;
      covered += y1 - Math.max(y0, end);
      end = y1;
    }
    area += covered * (b - a);
  }
  return area;
}

/**
 * Gross floor area: on each Level, the union of the footprints of the
 * volumes that span it. A double-height room is one volume on one Level
 * with a raised top, so it counts once.
 */
export function grossFloorArea(house: House): number {
  const order = levelElevations(house).map((l) => l.name);
  return order.reduce((sum, name, i) => {
    const on = house.volumes.filter(
      (v) => order.indexOf(v.from) <= i && order.indexOf(v.to) >= i,
    );
    return sum + unionArea(on.map((v) => v.rect));
  }, 0);
}

export const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/**
 * How the Scene layout orients a House: its rotation (degrees,
 * counter-clockwise seen from above) and the layout's north (the direction
 * of north in the layout frame, degrees counter-clockwise from +y).
 */
export type Orientation = { rotation: number; north: number };

/** Compass bearing (degrees clockwise from north) of a House-frame direction. */
export function bearing([x, y]: readonly [number, number], { rotation, north }: Orientation): number {
  const angle = (Math.atan2(-x, y) * 180) / Math.PI + rotation;
  const b = (((north - angle) % 360) + 360) % 360;
  const rounded = Math.round(b * 1e6) / 1e6;
  return rounded === 360 ? 0 : rounded;
}

export function compassPoint(degrees: number): CompassPoint {
  return COMPASS_POINTS[Math.round(degrees / 45) % 8];
}

export type GlazingFace = {
  name: string;
  volume: string;
  face: Face;
  /** Degrees clockwise from north. */
  bearing: number;
  point: CompassPoint;
};

/** Every Glazing Face with the compass direction it looks out to. */
export function glazingFaces(house: House, orientation: Orientation): GlazingFace[] {
  return house.openings
    .filter((o) => o.fill === "glazing")
    .map((o) => {
      const b = bearing(faceNormal[o.face], orientation);
      return { name: o.name, volume: o.volume, face: o.face, bearing: b, point: compassPoint(b) };
    });
}
