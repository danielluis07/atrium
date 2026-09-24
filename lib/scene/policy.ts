/**
 * Scene policy: which path the home page hero takes. Pure, so the rules are
 * testable without a browser. For now it knows the Lean Scene and the still;
 * the render-tier ladder, the mobile Scene and detect-gpu come later
 * (`DESIGN.md` § Scene, Degradation and Render tiers).
 */

export type ScenePath = "lean" | "still";

const PATHS: readonly ScenePath[] = ["lean", "still"];

/** The `?scene=` override from a URL query string, if it names a known path. */
export function sceneOverride(search: string): ScenePath | undefined {
  const value = new URLSearchParams(search).get("scene");
  return PATHS.find((p) => p === value);
}

/** Whether a WebGL renderer string names a software rasterizer. */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render driver/i.test(renderer);
}

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
};

export function chooseScenePath(c: SceneCapabilities): ScenePath {
  if (c.override) return c.override;
  if (c.reducedMotion || !c.webgl2) return "still";
  if (c.renderer && isSoftwareRenderer(c.renderer)) return "still";
  // Touch gets the mobile Scene once it exists; until then the still.
  if (c.touchPrimary) return "still";
  return "lean";
}
