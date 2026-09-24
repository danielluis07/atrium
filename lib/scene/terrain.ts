/**
 * The live snow terrain: the slope the Houses stand on, the shore and the
 * fjord below it, and the ridge above. Heights in the layout frame (x, y
 * metres, z up; `content/scene.ts`), where the ground rises toward +y and
 * the fjord lies toward −y. The Scene carves a flat platform around each
 * House's snow plinth into this surface.
 */

/** The fjord's surface. */
export const WATER_LEVEL = -12;

/** The slope's grade through the Houses: about 16°, matching the layout's ground heights. */
const SLOPE = 0.29;
/** Where the slope starts to level off toward the ridge, and how quickly. */
const RIDGE_FROM = 50;
const RIDGE_EASE = 35;
/** Where the slope steepens toward the shore. */
const SHORE_FROM = -25;
const SHORE_CURVE = 0.012;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The slope's profile up from the fjord: steeper at the shore, level at the ridge. */
function profile(y: number): number {
  if (y > RIDGE_FROM) return SLOPE * RIDGE_FROM + SLOPE * RIDGE_EASE * (1 - Math.exp(-(y - RIDGE_FROM) / RIDGE_EASE));
  if (y < SHORE_FROM) return SLOPE * y - SHORE_CURVE * (y - SHORE_FROM) ** 2;
  return SLOPE * y;
}

/** Ground height at a layout-frame point, before any House's platform is carved in. */
export function groundHeight(x: number, y: number): number {
  // drifts across the slope, a shoreline that bends in and out, and a skyline that rises and falls
  const drift = 0.4 * Math.sin(x / 29) * Math.cos(y / 23);
  const shore = (2.5 * Math.sin(x / 41 + 0.7) + 1.2 * Math.sin(x / 17 + 2.1)) * smoothstep(-20, -45, y);
  const ridge = (6 * Math.sin(x / 90 + 1) + 2.5 * Math.sin(x / 37)) * smoothstep(RIDGE_FROM, 130, y);
  return profile(y) + drift + shore + ridge;
}
