/** The overview's vertical field of view on a wide screen, degrees. */
export const OVERVIEW_FOV = 35;
/** The narrowest horizontal field of view the overview allows, so all four Houses stay in frame. */
const MIN_HORIZONTAL_FOV = 56;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** The overview camera's vertical field of view for a viewport's aspect (width / height). */
export function overviewFov(aspect: number): number {
  const fromWidth = deg(2 * Math.atan(Math.tan(rad(MIN_HORIZONTAL_FOV) / 2) / aspect));
  return Math.max(OVERVIEW_FOV, fromWidth);
}
