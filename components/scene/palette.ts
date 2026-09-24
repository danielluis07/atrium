import { Color, Vector3 } from "three";

import { oklchToLinear } from "@/lib/color";
import { toThree } from "@/lib/scene/frame";

/** The Scene palette from `DESIGN.md`, in linear sRGB. */
const oklch = (L: number, C: number, h: number) => new Color(...oklchToLinear(L, C, h));

export const SKY_ZENITH = oklch(0.26, 0.06, 262);
export const SKY_HORIZON = oklch(0.55, 0.06, 250);
export const SNOW_SHADOW = oklch(0.62, 0.04, 250);
export const WINDOW = oklch(0.82, 0.12, 70);

/**
 * What a baked lightmap reads on open snow, away from any House: the
 * builder's sky (zenith→horizon by height, `scripts/houses/builder`)
 * integrated over the upper hemisphere, cosine-weighted, in the lightmap's
 * units (irradiance / π). The plinth's edge fades to it and the live terrain
 * is lit by it, so they meet without a seam.
 */
export const OPEN_SNOW = SKY_HORIZON.clone().multiplyScalar(1 / 3).add(SKY_ZENITH.clone().multiplyScalar(2 / 3));

/** The afterglow's compass bearing, where the builder's sky puts it (`AFTERGLOW_BEARING` in its config). */
const AFTERGLOW_BEARING = 245;

/**
 * The afterglow low in the west-southwest, where the builder's sky puts it
 * (`AFTERGLOW_BEARING` and `AFTERGLOW_ELEVATION` in its config).
 */
export const afterglowDirection = (north: number) => skyDirection(north, AFTERGLOW_BEARING, 3);

/**
 * Where the baked shadow on the snow falls from (`components/scene/shadow.ts`):
 * the bright sky above the afterglow, high enough that the pines' and Houses'
 * shadows lie across the slope rather than down its whole length.
 */
export const keyDirection = (north: number) => skyDirection(north, AFTERGLOW_BEARING, 28);

/** A unit vector toward a point of the sky at a compass bearing and an elevation in degrees, in three.js axes. */
function skyDirection(north: number, bearing: number, elevationDeg: number): Vector3 {
  const elevation = (elevationDeg * Math.PI) / 180;
  // a compass bearing is clockwise from north; the layout's north is counter-clockwise from +y
  const theta = ((north - bearing) * Math.PI) / 180;
  const flat = Math.cos(elevation);
  return new Vector3(...toThree([-Math.sin(theta) * flat, Math.cos(theta) * flat, Math.sin(elevation)])).normalize();
}
