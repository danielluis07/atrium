/**
 * Scene policy: which path the home page hero takes, and on which rung it
 * starts. Pure, so the rules are testable without a browser
 * (`DESIGN.md` § Scene, Degradation and Render tiers).
 */

import { DESKTOP_LEAN, ladderOf, type Ladder } from "@/lib/scene/rungs";

export type ScenePath = "target" | "lean" | "mobile" | "still";

const PATHS: readonly ScenePath[] = ["target", "lean", "mobile", "still"];

/** The `?scene=` override from a URL query string, if it names a known path. */
export function sceneOverride(search: string): ScenePath | undefined {
  const value = new URLSearchParams(search).get("scene");
  return PATHS.find((p) => p === value);
}

/** Whether a WebGL renderer string names a software rasterizer. */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render driver/i.test(renderer);
}

/** Whether a GPU name is a discrete part: NVIDIA, AMD "RX" or Radeon Pro. */
export function isDiscreteGpu(gpu: string): boolean {
  // Ryzen's integrated "Radeon RX Vega 11" carries the RX badge too; the discrete Vegas are 56 and 64
  if (/vega \d{1,2}\b/i.test(gpu) && !/vega (56|64)\b/i.test(gpu)) return false;
  return /nvidia|geforce|quadro|radeon.*\brx\b|radeon pro/i.test(gpu);
}

/** What detect-gpu made of the GPU, or why it gave no answer in time. */
export type GpuClass = { tier: number; gpu?: string } | "timeout" | "error";

export type SceneCapabilities = {
  /** The `?scene=` override, which beats every other rule. */
  override?: ScenePath;
  reducedMotion: boolean;
  /** `(pointer: coarse)` without `(hover: hover)`. */
  touchPrimary: boolean;
  /** Whether a WebGL2 context could be created without a major performance caveat. */
  webgl2: boolean;
  /** The unmasked renderer string, when the browser exposes it. */
  renderer?: string;
  /** The detect-gpu result; only needed when nothing else decides the path. */
  gpu?: GpuClass;
  /** The lowest rung reached earlier this session, per ladder. */
  lowest?: Partial<Record<Ladder, number>>;
};

export type SceneChoice = { path: "still" } | { path: "target" | "lean" | "mobile"; rung: number };

const STILL: SceneChoice = { path: "still" };

/** The path a rung belongs to: the desktop ladder turns from Target to Lean at rung 4. */
function onRung(ladder: Ladder, rung: number): SceneChoice {
  if (ladder === "mobile") return { path: "mobile", rung };
  return { path: rung < DESKTOP_LEAN ? "target" : "lean", rung };
}

/**
 * The choice, when it can be made without the GPU's tier: an override, or
 * anything that rules the live Scene out. Undefined means the tier decides,
 * so it is worth waiting for.
 */
export function chooseWithoutGpu(c: Omit<SceneCapabilities, "gpu">): SceneChoice | undefined {
  // an override forces its look: it ignores session memory, so screenshots are repeatable
  if (c.override === "still") return STILL;
  if (c.override === "target") return onRung("desktop", 1);
  if (c.override === "lean") return onRung("desktop", DESKTOP_LEAN);
  if (c.override === "mobile") return onRung("mobile", 1);
  if (c.reducedMotion || !c.webgl2) return STILL;
  if (c.renderer && isSoftwareRenderer(c.renderer)) return STILL;
  return undefined;
}

export function chooseScenePath(c: SceneCapabilities): SceneChoice {
  const settled = chooseWithoutGpu(c);
  if (settled) return settled;
  const gpu = c.gpu ?? "error";
  if (typeof gpu === "object" && gpu.tier <= 0) return STILL;
  const ladder: Ladder = c.touchPrimary ? "mobile" : "desktop";
  const start = ladder === "mobile" ? 1 : startRung(gpu);
  // resume where this session already settled, never above the start
  const lowest = c.lowest?.[ladder];
  const floor = ladderOf(ladder).length;
  const rung = lowest === undefined ? start : Math.min(floor, Math.max(start, lowest));
  return onRung(ladder, rung);
}

/**
 * Only a discrete GPU at tier 2 or above starts on Target. An integrated one
 * (a laptop iGPU, Apple silicon) starts on Lean even at tier 3, as does a
 * timeout, an error or anything unknown.
 */
function startRung(gpu: GpuClass): number {
  if (typeof gpu !== "object" || !gpu.gpu) return DESKTOP_LEAN;
  return gpu.tier >= 2 && isDiscreteGpu(gpu.gpu) ? 1 : DESKTOP_LEAN;
}
