import type { CameraBlock, Placement, SceneLayout } from "@/content/schema";

/**
 * Where the Scene's cameras stand relative to one House, in its House frame
 * (x right, y back, z up; metres). The builder marks the faces these points
 * can see as seen and bakes the rest at a lower texel density, and the
 * Scene's camera rig places its hero camera the same way.
 */

export type Point = [number, number, number];

/** The orbit's pitch limits at a selected House, in degrees (`DESIGN.md` § Scene). */
export const PITCH_LIMITS = [8, 30] as const;
/** Degrees between the arc cameras the builder samples. */
export const ARC_STEP = 10;

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const round = (v: number) => Math.round(v * 1e4) / 1e4 + 0;

/**
 * A camera on the camera block's sphere: `azimuth` degrees clockwise (seen
 * from above) from straight in front of the House, `pitch` above the horizon.
 */
export function orbitCamera(camera: CameraBlock, azimuth: number, pitch: number): Point {
  const [x, y, z] = camera.lookAt;
  const flat = camera.distance * Math.cos(rad(pitch));
  return [
    round(x - flat * Math.sin(rad(azimuth))),
    round(y - flat * Math.cos(rad(azimuth))),
    round(z + camera.distance * Math.sin(rad(pitch))),
  ];
}

/** The hero camera: where selecting the House flies to. */
export const heroCamera = (camera: CameraBlock): Point => orbitCamera(camera, camera.azimuth, camera.pitch);

/**
 * The arc cameras: every `ARC_STEP` degrees across the arc either side of
 * the hero angle, at the pitch limits and the authored pitch.
 */
export function arcCameras(camera: CameraBlock): Point[] {
  const steps = Math.ceil(camera.arc / ARC_STEP);
  const azimuths = Array.from({ length: 2 * steps + 1 }, (_, i) => camera.azimuth + (camera.arc * (i - steps)) / steps);
  const pitches = [...new Set([PITCH_LIMITS[0], camera.pitch, PITCH_LIMITS[1]])];
  return azimuths.flatMap((a) => pitches.map((p) => orbitCamera(camera, a, p)));
}

/** A layout-frame point in a House's frame: undo its position, ground and rotation. */
export function toHouseFrame([x, y, z]: readonly number[], placement: Placement): Point {
  const [px, py] = placement.position;
  const r = rad(placement.rotation);
  const dx = x - px;
  const dy = y - py;
  // the rotation is counter-clockwise seen from above, so turn back clockwise
  return [round(dx * Math.cos(r) + dy * Math.sin(r)), round(-dx * Math.sin(r) + dy * Math.cos(r)), round(z - placement.ground)];
}

/** A point in a House's frame in the layout frame: `toHouseFrame` undone. */
export function fromHouseFrame([x, y, z]: readonly number[], placement: Placement): Point {
  const [px, py] = placement.position;
  const r = rad(placement.rotation);
  return [px + x * Math.cos(r) - y * Math.sin(r), py + x * Math.sin(r) + y * Math.cos(r), z + placement.ground];
}

/** Every point a House can be seen from: the overview camera, then its arc cameras. */
export function viewpoints(camera: CameraBlock, placement: Placement, layout: Pick<SceneLayout, "overview">): Point[] {
  return [toHouseFrame(layout.overview.position, placement), ...arcCameras(camera)];
}
