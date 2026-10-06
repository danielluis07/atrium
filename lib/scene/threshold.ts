/**
 * The Threshold (`CONTEXT.md`): the screen over the stage while the live
 * Scene gets ready. It is raised before first paint by an inline script
 * (`thresholdScript`), so neither the still nor the header flashes under it,
 * and cleared by the live Scene: on its first rendered frame, after a floor,
 * or at once if the visitor scrolls first. It shows once per visit.
 */

/** The attribute on `<html>` that holds the Threshold up (`"up"`) or fades it (`"clearing"`). */
export const THRESHOLD_ATTRIBUTE = "data-threshold";
export const THRESHOLD_SEEN_KEY = "atrium:threshold-seen";

/** The least time it stays on screen, so a warm cache doesn't flicker it. */
export const THRESHOLD_FLOOR_MS = 800;
/** Its fade once cleared. */
export const THRESHOLD_FADE_MS = 300;

export type ThresholdArrival = {
  pathname: string;
  search: string;
  hash: string;
  /** Whether this visit has already seen it; undefined when storage can't be read. */
  seen: boolean | undefined;
  reducedMotion: boolean;
  /** Whether a WebGL2 context comes up without a major performance caveat; asked only when it matters. */
  webgl2: () => boolean;
};

/**
 * Whether to raise the Threshold on arrival: on the home page, at its top,
 * once per visit, and only where the Scene can go live: as in the Scene's
 * policy, `?scene=` decides first, then reduced motion and WebGL2 rule out
 * the still path. A weak GPU is only known later, and the live Scene clears
 * it then.
 *
 * Inlined into the page as source (`thresholdScript`), so it must stand
 * alone: no imports and nothing from outside its own body.
 */
export function raiseThreshold({ pathname, search, hash, seen, reducedMotion, webgl2 }: ThresholdArrival): boolean {
  if (pathname !== "/" || hash) return false;
  if (seen) return false;
  const forced = new URLSearchParams(search).get("scene");
  if (forced === "still") return false;
  if (forced === "target" || forced === "lean" || forced === "mobile") return true;
  return !reducedMotion && webgl2();
}

/**
 * The script, run in `<head>` before first paint, that raises the Threshold
 * and marks the visit as having seen it. Storage that throws counts as not
 * seen, so without it the Threshold shows on every arrival.
 */
export function thresholdScript(): string {
  return `(function(){try{var raise=${raiseThreshold.toString()};var seen;try{seen=window.sessionStorage.getItem(${JSON.stringify(THRESHOLD_SEEN_KEY)})==="1"}catch(e){}if(!raise({pathname:location.pathname,search:location.search,hash:location.hash,seen:seen,reducedMotion:matchMedia("(prefers-reduced-motion: reduce)").matches,webgl2:function(){try{var gl=document.createElement("canvas").getContext("webgl2",{failIfMajorPerformanceCaveat:true});if(!gl)return false;var lose=gl.getExtension("WEBGL_lose_context");if(lose)lose.loseContext();return true}catch(e){return false}}}))return;document.documentElement.setAttribute(${JSON.stringify(THRESHOLD_ATTRIBUTE)},"up");try{window.sessionStorage.setItem(${JSON.stringify(THRESHOLD_SEEN_KEY)},"1")}catch(e){}}catch(e){}})()`;
}

export type ThresholdState = {
  /** The Scene path: undefined while the GPU is still being classified. */
  path: "live" | "still" | undefined;
  /** Whether the Scene has drawn its first frame. */
  ready: boolean;
  /** Whether the visitor has scrolled the page. */
  scrolled: boolean;
  /** How long it has been on screen, in milliseconds. */
  shownFor: number;
};

/** How a raised Threshold clears: `"cut"` at once, `"fade"` after `after` ms, or not yet (undefined). */
export type ThresholdClear = { how: "cut" } | { how: "fade"; after: number } | undefined;

/**
 * When a raised Threshold clears. Scrolling clears it at once, and the still
 * is the loading state from there. A still path has nothing to wait for. The
 * Scene's first frame clears it, but not before the floor.
 */
export function clearThreshold({ path, ready, scrolled, shownFor }: ThresholdState): ThresholdClear {
  if (scrolled) return { how: "cut" };
  if (path === "still") return { how: "fade", after: 0 };
  if (ready) return { how: "fade", after: Math.max(0, THRESHOLD_FLOOR_MS - shownFor) };
}

/**
 * The share of `downloads` finished, from the URLs (absolute or not) of
 * the resources the page has finished loading.
 */
export function downloadProgress(downloads: readonly string[], finished: Iterable<string>): number {
  if (downloads.length === 0) return 0;
  const wanted = new Set(downloads.map(pathOf));
  let done = 0;
  for (const url of new Set(Array.from(finished, pathOf))) if (wanted.has(url)) done += 1;
  return done / wanted.size;
}

function pathOf(url: string): string {
  return new URL(url, "http://localhost").pathname;
}
