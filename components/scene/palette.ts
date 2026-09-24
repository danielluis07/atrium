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

/**
 * The afterglow low in the west-southwest, where the builder's sky puts it
 * (`AFTERGLOW_BEARING` and `AFTERGLOW_ELEVATION` in its config).
 */
export function afterglowDirection(north: number): Vector3 {
  const bearing = 245;
  const elevation = (3 * Math.PI) / 180;
  // a compass bearing is clockwise from north; the layout's north is counter-clockwise from +y
  const theta = ((north - bearing) * Math.PI) / 180;
  const flat = Math.cos(elevation);
  return new Vector3(...toThree([-Math.sin(theta) * flat, Math.cos(theta) * flat, Math.sin(elevation)])).normalize();
}
