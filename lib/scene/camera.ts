import type { CameraBlock, Placement, SceneLayout } from "@/content/schema";
import { dropPose, type Cut } from "@/lib/scene/cut";
import { ASIDE, clampAngle, heroAngle, orbitPose, type Aim, type OrbitAngle } from "@/lib/scene/orbit";

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

/**
 * How high the House's look-at point sits over the bottom sheet, as a
 * fraction of the viewport's upper half: the band between the header and
 * the sheet's top edge.
 */
const ABOVE_SHEET = 0.6;

/**
 * Where the view at a House turns so the Project Panel leaves it clear: left
 * of a Panel on the right, or, for the mobile Scene's bottom sheet, centred
 * across and raised into the viewport's upper part, whatever its aspect.
 */
export function panelAim(panel: "right" | "bottom", aspect: number): Aim {
  if (panel === "right") return ASIDE;
  return { aside: 0, below: deg(Math.atan(ABOVE_SHEET * Math.tan(rad(overviewFov(aspect)) / 2))) };
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
  /** The mobile Scene's calmer camera: the drift and the sway at a House shrink to `CALM`. */
  calm?: boolean;
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
/** How much of the drift and sway a calm camera keeps. */
export const CALM = 0.4;

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
export const startOverview = ({ calm = false } = {}): OverviewRig =>
  calm ? { time: 0, lean: [0, 0], calm } : { time: 0, lean: [0, 0] };

/** The overview camera's state one frame on. */
export function stepOverview(rig: OverviewRig, input: OverviewInput): OverviewRig {
  const { pointer } = input;
  const dt = Math.min(input.dt, MAX_STEP);
  const [x, y] = pointer ? pointer.map((v) => Math.min(1, Math.max(-1, v))) : [0, 0];
  const k = 1 - Math.exp(-dt / LEAN_LAG);
  return {
    ...rig,
    time: rig.time + dt,
    lean: [rig.lean[0] + (x - rig.lean[0]) * k, rig.lean[1] + (y - rig.lean[1]) * k],
  };
}

/** The overview camera's pose for its state. */
export function overviewPose(overview: Overview, rig: OverviewRig): CameraPose {
  const { right, up } = basis(overview);
  const k = rig.calm ? CALM : 1;
  const across = k * DRIFT.across * Math.sin((2 * Math.PI * rig.time) / DRIFT.acrossPeriod);
  const rise = k * DRIFT.up * Math.sin((2 * Math.PI * rig.time) / DRIFT.upPeriod);
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
  /** Where the view turns, clear of the Project Panel (`panelAim`). */
  aim: Aim;
};

/** Where the camera is headed, or at rest: the drifting overview, or a House on its orbit. */
export type Shot = "overview" | HouseShot;

/** A flight under way, from the pose the camera left toward its shot. Seconds. */
export type Flight = { from: CameraPose; elapsed: number; duration: number };

/**
 * The whole camera: the overview's drift and lean, the shot, and the flight
 * to it if there is one. `held` is where a fly-back was when the Section
 * Cut absorbed it: the drop sets off from there instead (`cutRig`).
 */
export type Rig = { overview: OverviewRig; shot: Shot; flight?: Flight; held?: CameraPose };

/**
 * A flight's length (`DESIGN.md` § Motion): the shortest hop takes the
 * least time, and anything as far as `reach` metres or more the most.
 */
const FLY = { min: 1.2, max: 2, reach: 150 };

/** The camera at rest at overview; a calm one (the mobile Scene's) drifts and sways less. */
export const startRig = ({ calm = false } = {}): Rig => ({ overview: startOverview({ calm }), shot: "overview" });

/**
 * The idle drift at a House: the camera sways along its orbit around where
 * it was left, on the overview drift's periods. Degrees.
 */
const SWAY = { azimuth: 1.5, pitch: 0.5 };
/** How slowly the orbit follows a drag or a key: the time constant of its easing, seconds. */
const ORBIT_LAG = 0.15;

/** A House's hero angle, from its camera block, in the layout frame. */
export const heroPose = (camera: CameraBlock, placement: Placement, aim: Aim = ASIDE): CameraPose =>
  orbitPose(camera, placement, heroAngle(camera), aim);

/** A House's shot at its hero angle: where selecting it, or selecting it again, takes the camera. */
export function houseShot(camera: CameraBlock, placement: Placement, aim: Aim = ASIDE): HouseShot {
  const hero = heroAngle(camera);
  return { camera, placement, target: hero, angle: hero, time: 0, aim };
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
  return { overview, shot, flight: flight && flight.elapsed < flight.duration ? flight : undefined, held: rig.held };
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

/** A House shot's pose: its angle, swayed (less by a calm camera) and held to the orbit's limits. */
function housePose({ camera, placement, angle, time, aim }: HouseShot, calm = false): CameraPose {
  const k = calm ? CALM : 1;
  const swayed = {
    azimuth: angle.azimuth + k * SWAY.azimuth * Math.sin((2 * Math.PI * time) / DRIFT.acrossPeriod),
    pitch: angle.pitch + k * SWAY.pitch * Math.sin((2 * Math.PI * time) / DRIFT.upPeriod),
  };
  return orbitPose(camera, placement, clampAngle(camera, swayed), aim);
}

/** Where the camera is: on its shot, eased along the way there, or held where the drop absorbed a fly-back. */
export function rigPose(overview: Overview, rig: Rig): CameraPose {
  if (rig.held) return rig.held;
  const to = shotPose(overview, rig.overview, rig.shot);
  if (!rig.flight) return to;
  const { from, elapsed, duration } = rig.flight;
  const s = easeInOut(elapsed / duration);
  return { position: mix(from.position, to.position, s), lookAt: mix(from.lookAt, to.lookAt, s) };
}

// ---------------------------------------------------------------- the Section Cut

/**
 * The rig as the Section Cut finds it at `progress` (`lib/scene/cut.ts`).
 * Scrolling with a House selected closes it, and the drop absorbs the
 * fly-back: rather than fly out to overview and then drop, the camera holds
 * where the flight had it and drops from there, one move. Back at rest, it
 * flies on to overview.
 */
export function cutRig(overview: Overview, rig: Rig, progress: number, { reducedMotion = false } = {}): Rig {
  if (progress > 0 && rig.flight && rig.shot === "overview") {
    return { overview: rig.overview, shot: "overview", held: rigPose(overview, rig) };
  }
  if (progress <= 0 && rig.held) return flyTo(overview, rig, "overview", { reducedMotion });
  return rig;
}

/** Where the camera is with the Section Cut at `cut`, for a viewport of `aspect`: the rig's pose, dropped. */
export const cutPose = (overview: Overview, rig: Rig, cut: Cut, aspect: number): CameraPose =>
  dropPose(overview, rigPose(overview, rig), cut, { fov: overviewFov(aspect), aspect });

const shotPose = (overview: Overview, rig: OverviewRig, shot: Shot): CameraPose =>
  shot === "overview" ? overviewPose(overview, rig) : housePose(shot, rig.calm);

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
