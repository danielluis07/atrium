import { edgeDistance, slopeHeight, type PlinthRect } from "@/lib/scene/platform";
import { WATER_LEVEL } from "@/lib/scene/terrain";

/**
 * Where the sparse pines stand: in loose clumps across the slope and the
 * ridge, clear of every House's plinth, above the shore, and never between
 * the overview camera and a House. Deterministic, so the Scene is the same
 * on every visit. Everything is in three.js axes (x, z plan, y up; metres).
 */

export type Pine = {
  x: number;
  z: number;
  /** Ground height under the trunk. */
  y: number;
  height: number;
  /** Radius of the lowest tier. */
  radius: number;
  /** Turn about the vertical, radians. */
  turn: number;
};

/** The ground the pines may take: across the slope, from above the shore to over the ridge. */
const AREA = { x: [-230, 230], z: [-220, 30] } as const;
const CLUMPS = 60;
/** How far a pine keeps from a plinth's edge. */
const PLINTH_CLEARANCE = 7;
/** How far above the fjord the shore's first pine stands. */
const SHORE_CLEARANCE = 3;
/** The least distance between two trunks. */
const SPACING = 3.5;
/** Extra turn, radians, either side of a House that no pine may cover as seen from the overview. */
const SIGHT_MARGIN = 0.02;

const SEED = 11;

/** A small seeded generator (Park–Miller), so the forest is the same every time. */
function generator(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** The pines around the Houses' plinths, kept out of the overview `camera`'s view of them (plan x, z). */
export function placePines(plinths: PlinthRect[], camera: readonly [number, number]): Pine[] {
  const random = generator(SEED);
  const between = (a: number, b: number) => a + (b - a) * random();
  const sights = plinths.map((rect) => houseSight(rect, camera));
  const pines: Pine[] = [];

  for (let c = 0; c < CLUMPS; c++) {
    const cx = between(...AREA.x);
    const cz = between(...AREA.z);
    const spread = between(5, 16);
    const size = 2 + Math.floor(random() * 7);
    for (let i = 0; i < size; i++) {
      const a = random() * 2 * Math.PI;
      const r = spread * Math.sqrt(random());
      const x = cx + r * Math.cos(a);
      const z = cz + r * Math.sin(a);
      const y = slopeHeight(x, z);
      if (y < WATER_LEVEL + SHORE_CLEARANCE) continue;
      if (plinths.some((rect) => edgeDistance(rect, x, z) > -PLINTH_CLEARANCE)) continue;
      if (sights.some((sight) => hides(sight, camera, x, z))) continue;
      if (pines.some((p) => Math.hypot(p.x - x, p.z - z) < SPACING)) continue;
      const height = between(6, 13);
      pines.push({ x, z, y, height, radius: height * between(0.26, 0.34), turn: random() * 2 * Math.PI });
    }
  }
  return pines;
}

type Sight = { bearing: number; halfWidth: number; distance: number };

/** A House as the overview camera sees it in plan: its bearing, how wide it looks, how far it is. */
function houseSight(rect: PlinthRect, camera: readonly [number, number]): Sight {
  const dx = rect.origin[0] - camera[0];
  const dz = rect.origin[1] - camera[1];
  const distance = Math.hypot(dx, dz);
  const reach = Math.hypot(rect.max[0] - rect.min[0], rect.max[1] - rect.min[1]) / 2;
  return { bearing: Math.atan2(dx, dz), halfWidth: Math.atan(reach / distance) + SIGHT_MARGIN, distance };
}

/** Whether a pine at (x, z) stands in front of the House as seen from the camera. */
function hides(sight: Sight, camera: readonly [number, number], x: number, z: number): boolean {
  const dx = x - camera[0];
  const dz = z - camera[1];
  if (Math.hypot(dx, dz) > sight.distance) return false;
  const turn = Math.atan2(Math.sin(Math.atan2(dx, dz) - sight.bearing), Math.cos(Math.atan2(dx, dz) - sight.bearing));
  return Math.abs(turn) < sight.halfWidth;
}
