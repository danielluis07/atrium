import type { CameraBlock, Placement, SceneLayout } from "@/content/schema";
import { fromHouseFrame, heroCamera } from "@/lib/house/cameras";

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

// ---------------------------------------------------------------- the overview rig

type Vec3 = [number, number, number];
type Point = readonly [number, number, number];

/** Where the camera stands and what it looks at, in the layout frame (x, y, z up; metres). */
export type CameraPose = { position: Vec3; lookAt: Vec3 };

/** The layout's overview camera, the rig's rest pose. */
export type Overview = SceneLayout["overview"];

/** The overview camera's state. */
export type OverviewRig = {
  /** Seconds of drift so far. */
  time: number;
  /** The cursor as the camera has caught up with it: −1…1 across and up the viewport. */
  lean: [number, number];
};

export type OverviewInput = {
  /** Seconds since the last frame. */
  dt: number;
  /** The cursor over the Scene, −1…1 across (right +) and up (top +); none when it is away. */
  pointer?: readonly [number, number];
};

/**
 * The idle drift: the camera sways across and up and down on two slow,
 * unrelated periods while it keeps looking at the same point. Metres and
 * seconds.
 */
const DRIFT = { across: 2.5, acrossPeriod: 47, up: 0.8, upPeriod: 31 };

/**
 * The lean toward the cursor at full reach, metres: the look-at turns toward
 * it and the camera steps a little after, so the view turns rather than
 * slides.
 */
const LEAN = { look: { across: 3.5, up: 1.5 }, stand: { across: 1.5, up: 0.6 } };
/** How slowly the lean follows the cursor: the time constant of its easing, seconds. */
const LEAN_LAG = 0.8;
/**
 * The longest step the rig takes in one frame, seconds: after a pause (the
 * stage off screen, the tab hidden) it picks up where it was.
 */
const MAX_STEP = 0.1;

/** The rig at rest: the pose the still was taken from. */
export const startOverview = (): OverviewRig => ({ time: 0, lean: [0, 0] });

/** The overview camera's state one frame on. */
export function stepOverview(rig: OverviewRig, input: OverviewInput): OverviewRig {
  const { pointer } = input;
  const dt = Math.min(input.dt, MAX_STEP);
  const [x, y] = pointer ? pointer.map((v) => Math.min(1, Math.max(-1, v))) : [0, 0];
  const k = 1 - Math.exp(-dt / LEAN_LAG);
  return {
    time: rig.time + dt,
    lean: [rig.lean[0] + (x - rig.lean[0]) * k, rig.lean[1] + (y - rig.lean[1]) * k],
  };
}

/** The overview camera's pose for its state. */
export function overviewPose(overview: Overview, rig: OverviewRig): CameraPose {
  const { right, up } = basis(overview);
  const across = DRIFT.across * Math.sin((2 * Math.PI * rig.time) / DRIFT.acrossPeriod);
  const rise = DRIFT.up * Math.sin((2 * Math.PI * rig.time) / DRIFT.upPeriod);
  const [leanX, leanY] = rig.lean;
  return {
    position: add(
      overview.position,
      scale(right, across + LEAN.stand.across * leanX),
      scale(up, rise + LEAN.stand.up * leanY),
    ),
    lookAt: add(overview.lookAt, scale(right, LEAN.look.across * leanX), scale(up, LEAN.look.up * leanY)),
  };
}

// ---------------------------------------------------------------- the fly-to

/** How far the pointer may move between press and release and still click, CSS pixels; more is a drag. */
export const CLICK_SLOP = 5;

/** Where the camera is headed, or at rest: the drifting overview, or a House's hero angle. */
export type Shot = "overview" | CameraPose;

/** A flight under way, from the pose the camera left toward its shot. Seconds. */
export type Flight = { from: CameraPose; elapsed: number; duration: number };

/** The whole camera: the overview's drift and lean, the shot, and the flight to it if there is one. */
export type Rig = { overview: OverviewRig; shot: Shot; flight?: Flight };

/**
 * A flight's length (`DESIGN.md` § Motion): the shortest hop takes the
 * least time, and anything as far as `reach` metres or more the most.
 */
const FLY = { min: 1.2, max: 2, reach: 150 };

/** The camera at rest at overview. */
export const startRig = (): Rig => ({ overview: startOverview(), shot: "overview" });

/** A House's hero angle, from its camera block, in the layout frame. */
export function heroPose(camera: CameraBlock, placement: Placement): CameraPose {
  return {
    position: fromHouseFrame(heroCamera(camera), placement),
    lookAt: fromHouseFrame(camera.lookAt, placement),
  };
}

/**
 * Sets the camera flying from wherever it is, mid-flight included, toward
 * `shot`. Under reduced motion it cuts there instead.
 */
export function flyTo(overview: Overview, rig: Rig, shot: Shot, { reducedMotion = false } = {}): Rig {
  if (reducedMotion) return { overview: rig.overview, shot };
  const from = rigPose(overview, rig);
  const duration = flyDuration(from, shotPose(overview, rig.overview, shot));
  return { overview: rig.overview, shot, flight: { from, elapsed: 0, duration } };
}

/** The camera one frame on. The cursor leans it only when it is at or headed for overview. */
export function stepRig(rig: Rig, input: OverviewInput): Rig {
  const overview = stepOverview(rig.overview, rig.shot === "overview" ? input : { dt: input.dt });
  const flight = rig.flight && { ...rig.flight, elapsed: rig.flight.elapsed + Math.min(input.dt, MAX_STEP) };
  return { overview, shot: rig.shot, flight: flight && flight.elapsed < flight.duration ? flight : undefined };
}

/** Where the camera is: on its shot, or eased along the way there. */
export function rigPose(overview: Overview, rig: Rig): CameraPose {
  const to = shotPose(overview, rig.overview, rig.shot);
  if (!rig.flight) return to;
  const { from, elapsed, duration } = rig.flight;
  const s = easeInOut(elapsed / duration);
  return { position: mix(from.position, to.position, s), lookAt: mix(from.lookAt, to.lookAt, s) };
}

const shotPose = (overview: Overview, rig: OverviewRig, shot: Shot): CameraPose =>
  shot === "overview" ? overviewPose(overview, rig) : shot;

function flyDuration(from: CameraPose, to: CameraPose): number {
  const travel = Math.hypot(...sub(to.position, from.position));
  return FLY.min + (FLY.max - FLY.min) * Math.min(1, travel / FLY.reach);
}

/** Cubic ease-in-out: slow and heavy at both ends. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2);

const mix = (a: Point, b: Point, s: number): Vec3 => [
  a[0] + (b[0] - a[0]) * s,
  a[1] + (b[1] - a[1]) * s,
  a[2] + (b[2] - a[2]) * s,
];

/** The overview camera's right and up, in the layout frame (z up). */
function basis({ position, lookAt }: Overview): { right: Vec3; up: Vec3 } {
  const forward = normalize(sub(lookAt, position));
  const right = normalize(cross(forward, [0, 0, 1]));
  return { right, up: cross(right, forward) };
}

const sub = (a: Point, b: Point): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Point, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Point, ...rest: Point[]): Vec3 =>
  rest.reduce<Vec3>((s, b) => [s[0] + b[0], s[1] + b[1], s[2] + b[2]], [a[0], a[1], a[2]]);
const cross = (a: Point, b: Point): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Point): Vec3 => scale(a, 1 / Math.hypot(...a));
