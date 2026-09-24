import type { CameraBlock, Placement } from "@/content/schema";
import { fromHouseFrame, orbitCamera, PITCH_LIMITS } from "@/lib/house/cameras";

/**
 * The limited orbit at a selected House (`DESIGN.md` § Scene): the camera
 * stays on its camera block's sphere, at the block's distance from its
 * look-at point, and swings along the arc either side of the hero angle
 * with its pitch between 8° and 30°. These are the same cameras the builder
 * bakes the House for (`arcCameras`).
 */

type Vec3 = [number, number, number];

/** Where the camera is on a House's sphere, in degrees: as the camera block measures them. */
export type OrbitAngle = { azimuth: number; pitch: number };

/** Degrees the orbit turns per CSS pixel of drag: across for azimuth, up and down for pitch. */
const DRAG = { across: 0.3, up: 0.15 };
/** Degrees a press of ← or → turns the orbit. */
export const ORBIT_STEP = 10;
/**
 * How far the view turns right of the look-at point, degrees. The Project
 * Panel covers the right of the viewport, so the look-at point sits left of
 * centre (a third of the way across a 16:9 viewport) and the House with it,
 * whichever side of it the camera is on.
 */
export const LOOK_ASIDE = 10;

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The hero angle: where selecting the House puts the camera. */
export const heroAngle = (camera: CameraBlock): OrbitAngle => ({ azimuth: camera.azimuth, pitch: camera.pitch });

/** `angle` held to the House's arc and the pitch limits. */
export function clampAngle(camera: CameraBlock, { azimuth, pitch }: OrbitAngle): OrbitAngle {
  return {
    azimuth: clamp(azimuth, camera.azimuth - camera.arc, camera.azimuth + camera.arc),
    pitch: clamp(pitch, PITCH_LIMITS[0], PITCH_LIMITS[1]),
  };
}

/**
 * The angle after a drag of `dx`, `dy` CSS pixels (right and down +). The
 * drag turns the House under the pointer, so dragging right carries the
 * camera left around it and dragging down lifts it.
 */
export function dragAngle(camera: CameraBlock, angle: OrbitAngle, dx: number, dy: number): OrbitAngle {
  return clampAngle(camera, { azimuth: angle.azimuth + dx * DRAG.across, pitch: angle.pitch + dy * DRAG.up });
}

/** The angle one press of ← (−1) or → (+1) on: the camera steps that way around the House. */
export function stepAngle(camera: CameraBlock, angle: OrbitAngle, direction: -1 | 1): OrbitAngle {
  // azimuth runs clockwise seen from above, so the camera's right is the lower azimuth
  return clampAngle(camera, { ...angle, azimuth: angle.azimuth - direction * ORBIT_STEP });
}

/**
 * The camera at `angle` around a House, in the layout frame: on the camera
 * block's sphere, looking past the look-at point by `LOOK_ASIDE`.
 */
export function orbitPose(
  camera: CameraBlock,
  placement: Placement,
  angle: OrbitAngle,
): { position: Vec3; lookAt: Vec3 } {
  const position = orbitCamera(camera, angle.azimuth, angle.pitch);
  const [x, y, z] = camera.lookAt.map((v, i) => v - position[i]);
  // turned clockwise seen from above: to the right
  const c = Math.cos(rad(LOOK_ASIDE));
  const s = Math.sin(rad(LOOK_ASIDE));
  const aim: Vec3 = [position[0] + x * c + y * s, position[1] - x * s + y * c, position[2] + z];
  return { position: fromHouseFrame(position, placement), lookAt: fromHouseFrame(aim, placement) };
}
