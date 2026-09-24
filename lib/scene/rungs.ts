/**
 * The render-tier ladders (`DESIGN.md` § Render tiers): each rung is a render
 * config, cheapest visual loss first. Rungs are numbered from 1, the top;
 * the last rung is the floor.
 */

export type Ladder = "desktop" | "mobile";

export type RenderConfig = {
  /** Device pixel ratio the Canvas renders at. */
  dpr: number;
  /** MSAA samples in the composer's buffers. */
  msaa: 0 | 4;
  smaa: boolean;
  /** N8AO ambient occlusion, at full or half resolution, or none. */
  ao: "full" | "half" | false;
  bloom: boolean;
};

const TARGET: RenderConfig = { dpr: 2, msaa: 4, smaa: true, ao: "full", bloom: true };
const LEAN: RenderConfig = { dpr: 1, msaa: 4, smaa: false, ao: false, bloom: true };

const DESKTOP: readonly RenderConfig[] = [
  TARGET,
  { ...TARGET, dpr: 1.5 },
  { ...TARGET, dpr: 1.5, ao: "half" },
  LEAN,
  { ...LEAN, dpr: 0.75 },
  { ...LEAN, dpr: 0.75, bloom: false },
];

/** The first Lean rung on the desktop ladder. */
export const DESKTOP_LEAN = 4;

/** The mobile Scene's short ladder: only the DPR drops. */
const MOBILE: readonly RenderConfig[] = [1.5, 1, 0.75].map((dpr) => ({ ...LEAN, dpr }));

export function ladderOf(ladder: Ladder): readonly RenderConfig[] {
  return ladder === "mobile" ? MOBILE : DESKTOP;
}

/** The render config of a rung, clamped to the ladder. */
export function renderConfig(ladder: Ladder, rung: number): RenderConfig {
  const rungs = ladderOf(ladder);
  return rungs[Math.min(rungs.length, Math.max(1, rung)) - 1];
}
