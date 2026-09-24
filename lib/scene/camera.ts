import type { CameraBlock, Placement, SceneLayout } from "@/content/schema";
import { clampAngle, heroAngle, orbitPose, type OrbitAngle } from "@/lib/scene/orbit";

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

/**
 * A selected House's shot: the camera on its orbit (`lib/scene/orbit.ts`),
 * easing toward where a drag or ←/→ last put it, and swaying there.
 */
export type HouseShot = {
  camera: CameraBlock;
  placement: Placement;
  /** Where the drag or the keys put the camera. */
  target: OrbitAngle;
  /** Where the camera is, damped after the target. */
  angle: OrbitAngle;
  /** Seconds of sway so far; it starts once the camera arrives. */
  time: number;
};

/** Where the camera is headed, or at rest: the drifting overview, or a House on its orbit. */
export type Shot = "overview" | HouseShot;

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

/**
 * The idle drift at a House: the camera sways along its orbit around where
 * it was left, on the overview drift's periods. Degrees.
 */
const SWAY = { azimuth: 1.5, pitch: 0.5 };
/** How slowly the orbit follows a drag or a key: the time constant of its easing, seconds. */
const ORBIT_LAG = 0.15;

/** A House's hero angle, from its camera block, in the layout frame. */
export const heroPose = (camera: CameraBlock, placement: Placement): CameraPose =>
  orbitPose(camera, placement, heroAngle(camera));

/** A House's shot at its hero angle: where selecting it, or selecting it again, takes the camera. */
export function houseShot(camera: CameraBlock, placement: Placement): HouseShot {
  const hero = heroAngle(camera);
  return { camera, placement, target: hero, angle: hero, time: 0 };
}

/**
 * The camera with its orbit target turned by `turn` (a drag or a step, from
 * `lib/scene/orbit.ts`). Only at a House: at overview or in flight there is
 * no orbit.
 */
export function orbitRig(rig: Rig, turn: (camera: CameraBlock, target: OrbitAngle) => OrbitAngle): Rig {
  if (rig.shot === "overview" || rig.flight) return rig;
  return { ...rig, shot: { ...rig.shot, target: turn(rig.shot.camera, rig.shot.target) } };
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

/**
 * The camera one frame on. The cursor leans it only when it is at or headed
 * for overview; at a House, the orbit eases after its target and sways.
 */
export function stepRig(rig: Rig, input: OverviewInput): Rig {
  const dt = Math.min(input.dt, MAX_STEP);
  const overview = stepOverview(rig.overview, rig.shot === "overview" ? input : { dt: input.dt });
  const flight = rig.flight && { ...rig.flight, elapsed: rig.flight.elapsed + dt };
  const shot = rig.shot === "overview" || rig.flight ? rig.shot : stepOrbit(rig.shot, dt);
  return { overview, shot, flight: flight && flight.elapsed < flight.duration ? flight : undefined };
}

function stepOrbit(shot: HouseShot, dt: number): HouseShot {
  const k = 1 - Math.exp(-dt / ORBIT_LAG);
  const { angle, target } = shot;
  return {
    ...shot,
    angle: {
      azimuth: angle.azimuth + (target.azimuth - angle.azimuth) * k,
      pitch: angle.pitch + (target.pitch - angle.pitch) * k,
    },
    time: shot.time + dt,
  };
}

/** A House shot's pose: its angle, swayed and held to the orbit's limits. */
function housePose({ camera, placement, angle, time }: HouseShot): CameraPose {
  const swayed = {
    azimuth: angle.azimuth + SWAY.azimuth * Math.sin((2 * Math.PI * time) / DRIFT.acrossPeriod),
    pitch: angle.pitch + SWAY.pitch * Math.sin((2 * Math.PI * time) / DRIFT.upPeriod),
  };
  return orbitPose(camera, placement, clampAngle(camera, swayed));
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
  shot === "overview" ? overviewPose(overview, rig) : housePose(shot);

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
