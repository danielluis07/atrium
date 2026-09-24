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
