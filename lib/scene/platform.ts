import { groundHeight } from "@/lib/scene/terrain";

/**
 * Each House's snow plinth is baked flat (`docs/design/house-schema.md`),
 * but the slope isn't. Around each House the Scene meets the two: the
 * plinth's outer band bends down or up onto the slope, and the terrain under
 * the plinth sinks just below it, so the baked snow always shows and its
 * edge lands on the live terrain. Everything here is in three.js axes
 * (x, z plan, y up; metres).
 */

export type PlinthRect = {
  /** The House root: its datum in plan and its turn about the vertical, radians. */
  origin: [number, number];
  rotationY: number;
  /** The plinth's plan extent in the House root frame (glTF x and z). */
  min: [number, number];
  max: [number, number];
  /** World height of the plinth's lowest floor. */
  low: number;
};

/** How far in from its edge the plinth bends onto the slope. */
export const PLINTH_BLEND = 9;
/** Where two plinths overlap, both give way to the slope over this distance. */
const OVERLAP_BLEND = 3;
/** How far under the plinth the terrain sits, so the plinth always wins the depth test. */
export const TERRAIN_SINK = 0.15;
/** How far a plinth that yields to an overlapping one drops: just under the terrain. */
const PLINTH_YIELD = 0.2;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** The slope's height at a point, in three.js axes (layout +y is three −z). */
export const slopeHeight = (x: number, z: number) => groundHeight(x, -z);

/** Distance from a plan point to the plinth's edge: positive inside, negative outside. */
export function edgeDistance(rect: PlinthRect, x: number, z: number): number {
  const dx = x - rect.origin[0];
  const dz = z - rect.origin[1];
  const c = Math.cos(rect.rotationY);
  const s = Math.sin(rect.rotationY);
  // undo the root's turn: world = Ry(θ) · local
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const inX = Math.min(lx - rect.min[0], rect.max[0] - lx);
  const inZ = Math.min(lz - rect.min[1], rect.max[1] - lz);
  if (inX >= 0 && inZ >= 0) return Math.min(inX, inZ);
  return -Math.hypot(Math.min(0, inX), Math.min(0, inZ));
}

/** How much a point inside a plinth gives way to the slope: 0 in the flat middle, 1 at the edge. */
const ownBlend = (d: number) => 1 - smoothstep(0, PLINTH_BLEND, d);

/**
 * Where a vertex of plinth `index` goes, given its baked height `y`: kept in
 * the middle, bent onto the slope toward the edge, and onto the slope
 * wherever it runs into another plinth.
 */
export function plinthHeight(rects: PlinthRect[], index: number, x: number, z: number, y: number): number {
  const own = edgeDistance(rects[index], x, z);
  let w = ownBlend(own);
  for (const [i, other] of rects.entries()) {
    if (i === index) continue;
    const d = edgeDistance(other, x, z);
    // where both cover the point, the plinth nearer its own edge yields, or the two fight for the pixel
    if (d > 0 && d > own) return slopeHeight(x, z) - PLINTH_YIELD;
    w = Math.max(w, 1 - smoothstep(0, OVERLAP_BLEND, -d));
  }
  return mix(y, slopeHeight(x, z), w);
}

/** The live terrain: the slope, sunk under every plinth that covers the point. */
export function terrainHeight(rects: PlinthRect[], x: number, z: number): number {
  const slope = slopeHeight(x, z);
  let under = Infinity;
  for (const rect of rects) {
    const d = edgeDistance(rect, x, z);
    if (d > 0) under = Math.min(under, slope, mix(rect.low, slope, ownBlend(d)));
  }
  return under === Infinity ? slope : under - TERRAIN_SINK;
}
