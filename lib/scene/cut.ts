import type { SceneLayout } from "@/content/schema";
import { groundHeight, WATER_LEVEL } from "@/lib/scene/terrain";

/**
 * The Section Cut (ADR 0003): the paper page scrolls up over the pinned
 * Scene, and its top edge is the section line. The camera drops toward the
 * snow as the line rises, keyed so the rendered snow skyline sits just above
 * the line; by the time the paper covers the stage the camera is at grade.
 * Everything here is in the layout frame (x, y, z up; metres) and pure.
 */

type Vec3 = [number, number, number];
type Point = readonly [number, number, number];

/** Where the camera stands and what it looks at. */
export type Pose = { position: Vec3; lookAt: Vec3 };

/** Where the section line is on the Scene's stage. */
export type Cut = {
  /**
   * How far the line has risen: 0 at the stage's foot, 1 once it reaches
   * the header's baseline and the paper covers the stage.
   */
  progress: number;
  /** The line's height on the stage in NDC: −1 at the foot, 1 at the top. */
  line: number;
  /** How much snow stays in view above the line, NDC. */
  gap: number;
};

/** The cut at rest: the line at the stage's foot. */
export const REST: Cut = { progress: 0, line: -1, gap: 0 };

/** The sliver of snow kept above the section line, CSS pixels, for the live Scene and the still alike. */
export const SNOW_GAP = 6;
/**
 * The committed still (`public/scene/still.avif`): its aspect, and where its
 * snow line sits as a fraction of its height from the top. The stage holds
 * the still until the rising line meets its snow line
 * (`components/home/section-cut.tsx`), so a recaptured still updates these.
 */
export const STILL = { aspect: 16 / 9, snowLine: 0.62 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The cut from where things are on screen, in viewport pixels: the stage,
 * the section line (the paper's top edge) and the header's baseline. The
 * line is measured on the stage, so once the stage scrolls away under the
 * paper the cut stays where it ended.
 */
export function measureCut({
  stage,
  line,
  baseline,
}: {
  stage: { top: number; height: number };
  line: number;
  baseline: number;
}): Cut {
  const onStage = line - stage.top;
  return {
    progress: clamp01((stage.height - onStage) / (stage.height - baseline)),
    line: 1 - (2 * onStage) / stage.height,
    gap: (2 * SNOW_GAP) / stage.height,
  };
}

/** Whether the paper covers the stage, so the Scene can stop rendering. */
export const isCovered = (cut: Cut) => cut.progress >= 1;

// ---------------------------------------------------------------- the drop

/** The camera's lens: its vertical field of view in degrees, and the viewport's aspect (width / height). */
export type Lens = { fov: number; aspect: number };

/**
 * Where the drop ends: this far from the overview camera toward its look-at
 * point in plan, at eye height over the snow or the fjord, whichever is
 * higher. From down there the Houses stand up against the sky.
 */
const GRADE = { toward: 0.45, eye: 1.7 };

/** The drop's end point for the layout's overview. */
export function gradePoint({ position, lookAt }: SceneLayout["overview"]): Vec3 {
  const x = position[0] + (lookAt[0] - position[0]) * GRADE.toward;
  const y = position[1] + (lookAt[1] - position[1]) * GRADE.toward;
  return [x, y, Math.max(groundHeight(x, y), WATER_LEVEL) + GRADE.eye];
}

/**
 * The camera's pose in the drop: it descends from `origin` (where the rig
 * is, `lib/scene/camera.ts`) toward grade and turns to the overview's
 * heading, and its pitch holds the snow skyline where `origin` saw it until
 * the rising line reaches it, then keeps the skyline's lowest point `gap`
 * above the line. At rest it is `origin` exactly, so scrolling back up
 * undoes the cut; once the paper covers the stage it is the same pose
 * whatever `origin` was.
 */
export function dropPose(overview: SceneLayout["overview"], origin: Pose, cut: Cut, lens: Lens): Pose {
  if (cut.progress <= 0) return origin;
  const s = smooth(cut.progress);
  const from = aim(origin);
  const rest = aim(overview);
  const held = skylineOnScreen(origin.position, from, lens) * (1 - s) + restSkyline(overview, lens) * s;

  const position = mix(origin.position, gradePoint(overview), s);
  const heading = from.heading + turn(from.heading, rest.heading) * s;
  const pitch = pitchFor(position, heading, Math.max(held, cut.line + cut.gap), lens);
  const reach = from.reach;
  return {
    position,
    lookAt: [
      position[0] + reach * Math.sin(heading) * Math.cos(pitch),
      position[1] + reach * Math.cos(heading) * Math.cos(pitch),
      position[2] + reach * Math.sin(pitch),
    ],
  };
}

/**
 * The lowest point of the snow skyline across the viewport, in NDC, for a
 * camera at `pose`: the height the section line must stay under.
 */
export function skylineHeight(pose: Pose, lens: Lens): number {
  return skylineOnScreen(pose.position, aim(pose), lens);
}

/** A view direction: plan heading (radians clockwise from +y), pitch (radians above level) and the look-at distance. */
type Aim = { heading: number; pitch: number; reach: number };

function aim({ position, lookAt }: { position: Point; lookAt: Point }): Aim {
  const [x, y, z] = [lookAt[0] - position[0], lookAt[1] - position[1], lookAt[2] - position[2]];
  const flat = Math.hypot(x, y);
  return { heading: Math.atan2(x, y), pitch: Math.atan2(z, flat), reach: Math.hypot(flat, z) };
}

/** The skyline's height on screen for the layout's overview, which every drop ends keyed to; kept for the last lens. */
let rest: { overview: SceneLayout["overview"]; lens: Lens; height: number } | undefined;

function restSkyline(overview: SceneLayout["overview"], lens: Lens): number {
  if (rest?.overview !== overview || rest.lens.fov !== lens.fov || rest.lens.aspect !== lens.aspect) {
    rest = { overview, lens, height: skylineOnScreen(overview.position, aim(overview), lens) };
  }
  return rest.height;
}

/** Columns across the viewport the skyline is sampled at, NDC x. */
const COLUMNS = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1];

/** Where the terrain mesh reaches (`components/scene/terrain.tsx`): beyond it there is no snow to see. */
const EXTENT = { x: 600, y: [-90, 700] } as const;
/** The skyline is sampled out along the ground from 2 m to 1.5 km, each step this much farther than the last. */
const SAMPLE = { from: 2, step: 1.06, reach: 1500 };

/**
 * The snow skyline seen from `position`: for each column across the
 * viewport, its plan bearing off the heading and the steepest elevation
 * angle up to the terrain along it.
 */
function skyline(position: Point, heading: number, lens: Lens): { bearing: number; elevation: number }[] {
  const halfWidth = Math.tan(rad(lens.fov) / 2) * lens.aspect;
  return COLUMNS.map((u) => {
    const bearing = Math.atan(u * halfWidth);
    const [dx, dy] = [Math.sin(heading + bearing), Math.cos(heading + bearing)];
    let elevation = -Math.PI / 2;
    for (let d = SAMPLE.from; d < SAMPLE.reach; d *= SAMPLE.step) {
      const [x, y] = [position[0] + dx * d, position[1] + dy * d];
      if (Math.abs(x) > EXTENT.x || y < EXTENT.y[0] || y > EXTENT.y[1]) continue;
      // under the fjord there is no snow
      const ground = groundHeight(x, y);
      if (ground > WATER_LEVEL) elevation = Math.max(elevation, Math.atan2(ground - position[2], d));
    }
    return { bearing, elevation };
  });
}

/** NDC height of a direction `bearing` off the heading at `elevation`, seen at `pitch`. */
function screenHeight(bearing: number, elevation: number, pitch: number, lens: Lens): number {
  const across = Math.cos(elevation) * Math.cos(bearing);
  const forward = across * Math.cos(pitch) + Math.sin(elevation) * Math.sin(pitch);
  const up = Math.sin(elevation) * Math.cos(pitch) - across * Math.sin(pitch);
  return up / forward / Math.tan(rad(lens.fov) / 2);
}

const lowest = (sky: ReturnType<typeof skyline>, pitch: number, lens: Lens) =>
  Math.min(...sky.map(({ bearing, elevation }) => screenHeight(bearing, elevation, pitch, lens)));

function skylineOnScreen(position: Point, { heading, pitch }: Aim, lens: Lens): number {
  return lowest(skyline(position, heading, lens), pitch, lens);
}

/** The pitch that puts the skyline's lowest point at `target` (NDC): pitching up lowers it, so bisect. */
function pitchFor(position: Point, heading: number, target: number, lens: Lens): number {
  const sky = skyline(position, heading, lens);
  let [lo, hi] = [-PITCH_BOUND, PITCH_BOUND];
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (lowest(sky, mid, lens) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const PITCH_BOUND = rad(60);

function rad(d: number) {
  return (d * Math.PI) / 180;
}

/** The shortest signed turn from heading `a` to `b`, radians. */
const turn = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Slow into the drop and slow onto grade. */
const smooth = (t: number) => t * t * (3 - 2 * t);

const mix = (a: Point, b: Point, s: number): Vec3 => [
  a[0] + (b[0] - a[0]) * s,
  a[1] + (b[1] - a[1]) * s,
  a[2] + (b[2] - a[2]) * s,
];
