/**
 * The live Scene in a headed Chromium on this machine's GPU, instrumented for GPU timing
 * (`scripts/perf/README.md`). Every script here opens it the same way: ANGLE D3D11, 1600×900, vsync on.
 *
 * The page gets `window.__perf`, driven from Node:
 * - `mode: "frame"` wraps each rAF callback in one TIME_ELAPSED query: a frame's GPU time.
 * - `mode: "draw"` wraps each draw, clear and blit in its own query, keyed by framebuffer and shader
 *   program: the per-pass breakdown. The per-draw queries add about 1 ms to the sum.
 * - `toggle` names a built-in A/B switch (`TOGGLES`), read on every call, so it can flip inside one load.
 */
import { chromium, type Browser, type Page } from "@playwright/test";

/** A/B switches the probe can apply inside the page, for changes that can be tried without a build. */
export const TOGGLES = {
  /** Resolve only colour from the MSAA buffer: strip DEPTH_BUFFER_BIT from every blit (#65). */
  "depth-resolve": "strip DEPTH_BUFFER_BIT from blitFramebuffer",
} as const;
export type Toggle = keyof typeof TOGGLES;

export type Mode = "off" | "draw" | "frame";

export type PerfWindow = {
  /** Per-draw sums, in draw mode: key → total ms and call count over the window. */
  sums: Record<string, { ms: number; n: number }>;
  /** Whole-frame GPU times, in frame mode. */
  frames: number[];
  /** rAF intervals over the window: what the rung monitor judges. */
  intervals: number[];
  /** rAF callbacks in the window. */
  count: number;
};

/** Runs in the page before any of its scripts. Self-contained: Playwright serialises it. */
function instrument() {
  type Entry = { q: WebGLQuery; key: string };
  type Ext = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
  const w = window as unknown as Record<string, unknown>;
  const perf = {
    mode: "off" as "off" | "draw" | "frame",
    toggle: null as string | null,
    pending: [] as Entry[],
    sums: {} as Record<string, { ms: number; n: number }>,
    frames: [] as number[],
    intervals: [] as number[],
    count: 0,
    last: undefined as number | undefined,
  };
  w.__perf = perf;
  const contexts: WebGL2RenderingContext[] = [];
  const exts = new Map<WebGL2RenderingContext, Ext>();
  const sources = new Map<WebGLShader, string>();
  const attached = new Map<WebGLProgram, WebGLShader[]>();
  const labels = new Map<WebGLProgram, string>();
  const fbIds = new Map<WebGLFramebuffer | null, number>([[null, 0]]);
  // three.js's standard uniforms, left out of a program's label so the distinctive ones show
  const common = new Set(
    ("isOrthographic,modelMatrix,modelViewMatrix,projectionMatrix,viewMatrix,normalMatrix,cameraPosition,diffuse," +
      "emissive,roughness,metalness,opacity,envMapIntensity,toneMappingExposure,fogColor,fogDensity,logDepthBufFC," +
      "mapTransform,lightMapTransform,normalMapTransform,roughnessMapTransform,map,lightMap,lightMapIntensity," +
      "normalMap,normalScale,roughnessMap,ambientLightColor,directionalLights,hemisphereLights").split(","),
  );
  let scene: WebGL2RenderingContext | undefined;
  let program: WebGLProgram | null = null;
  let fb = 0;
  let inQuery = false;

  const label = (gl: WebGL2RenderingContext, p: WebGLProgram) => {
    const src = (attached.get(p) ?? []).map((s) => sources.get(s) ?? "").join("\n");
    const names: string[] = [];
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) names.push(gl.getActiveUniform(p, i)!.name);
    const distinct = names.filter((x) => !common.has(x.replace(/\[.*$/, "").split(".")[0]));
    return `${/#define SHADER_NAME (\S+)/.exec(src)?.[1] ?? "?"} [${distinct.join(",").slice(0, 160)}]`;
  };

  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: unknown) {
    const ctx = (getContext as (t: string, a?: unknown) => RenderingContext | null).call(this, type, attrs);
    if (type !== "webgl2" || !ctx || contexts.includes(ctx as WebGL2RenderingContext)) return ctx;
    const gl = ctx as WebGL2RenderingContext;
    contexts.push(gl);
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as Ext | null;
    if (!ext) return ctx;
    exts.set(gl, ext);
    const P = gl as unknown as Record<string, (...a: unknown[]) => unknown>;
    const wrap = (name: string, before: (...a: unknown[]) => void) => {
      const f = P[name].bind(gl);
      P[name] = (...a: unknown[]) => (before(...a), f(...a));
    };
    wrap("shaderSource", (s, src) => sources.set(s as WebGLShader, src as string));
    wrap("attachShader", (p, s) => attached.set(p as WebGLProgram, [...(attached.get(p as WebGLProgram) ?? []), s as WebGLShader]));
    wrap("useProgram", (p) => (program = p as WebGLProgram | null));
    wrap("bindFramebuffer", (target, f) => {
      if (target === gl.READ_FRAMEBUFFER) return;
      if (!fbIds.has(f as WebGLFramebuffer | null)) fbIds.set(f as WebGLFramebuffer | null, fbIds.size);
      fb = fbIds.get(f as WebGLFramebuffer | null)!;
    });
    const timed = (name: string, key: (...a: unknown[]) => string, edit?: (a: unknown[]) => void) => {
      const f = P[name].bind(gl);
      P[name] = (...a: unknown[]) => {
        edit?.(a);
        if (gl !== scene || perf.mode !== "draw" || inQuery) return f(...a);
        const k = key(...a);
        const q = gl.createQuery()!;
        inQuery = true;
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        try {
          return f(...a);
        } finally {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          inQuery = false;
          perf.pending.push({ q, key: k });
        }
      };
    };
    const prog = () => {
      if (!program) return "none";
      if (!labels.has(program)) labels.set(program, label(gl, program));
      return labels.get(program)!;
    };
    const size = (n: number) => (n > 1e5 ? "big" : n > 1e4 ? "mid" : "small");
    timed("drawElements", (_m, n) => `fb${fb} | ${prog()} | ${size(n as number)}`);
    timed("drawRangeElements", (_m, _s, _e, n) => `fb${fb} | ${prog()} | ${size(n as number)}`);
    timed("drawArrays", (_m, _f, n) => `fb${fb} | ${prog()} | ${size(n as number)}`);
    timed("drawElementsInstanced", (_m, n, _t, _o, i) => `fb${fb} | ${prog()} | inst ${size((n as number) * (i as number))}`);
    timed("drawArraysInstanced", (_m, _f, n, i) => `fb${fb} | ${prog()} | inst ${size((n as number) * (i as number))}`);
    timed("clear", () => `fb${fb} | clear`);
    timed(
      "blitFramebuffer",
      (...a) => `fb${fb} | blit mask=${(a[8] as number).toString(16)}`,
      (a) => {
        if (perf.toggle === "depth-resolve") a[8] = (a[8] as number) & ~gl.DEPTH_BUFFER_BIT;
      },
    );
    return ctx;
  } as typeof getContext;

  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      // the Scene's context is the largest connected canvas, chosen every frame: the GPU classifier's
      // canvas is created first and would otherwise be timed instead
      scene = contexts
        .filter((c) => c.canvas instanceof HTMLCanvasElement && c.canvas.isConnected && !c.isContextLost())
        .sort((a, b) => b.canvas.width * b.canvas.height - a.canvas.width * a.canvas.height)[0];
      const gl = scene;
      const ext = gl && exts.get(gl);
      if (!gl || !ext) return cb(t);
      // results arrive a frame or more late, so they are drained on every frame, the mode on or off
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      perf.pending = perf.pending.filter((e) => {
        if (!gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) return true;
        const ms = gl.getQueryParameter(e.q, gl.QUERY_RESULT) / 1e6;
        if (!disjoint) {
          if (e.key === "__frame") perf.frames.push(ms);
          else {
            const s = (perf.sums[e.key] ??= { ms: 0, n: 0 });
            s.ms += ms;
            s.n++;
          }
        }
        gl.deleteQuery(e.q);
        return false;
      });
      if (perf.mode === "off") return cb(t);
      perf.count++;
      if (perf.last !== undefined) perf.intervals.push(t - perf.last);
      perf.last = t;
      if (perf.mode === "draw") return cb(t);
      const q = gl.createQuery()!;
      inQuery = true;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      try {
        cb(t);
      } finally {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        inQuery = false;
        perf.pending.push({ q, key: "__frame" });
      }
    });
}

/**
 * Holds the start rung: the rung monitor times frames with performance.now(), so slowing that clock makes
 * every frame look short to it. rAF timestamps and GPU queries are untouched; the Scene's own clock (drift,
 * fly-to) runs slower, the same for every build measured.
 */
function pinRung() {
  const now = performance.now.bind(performance);
  performance.now = () => now() * 0.3;
}

export type SceneOptions = {
  /** Hold the rung the Scene starts at. */
  pin?: boolean;
  /** Start at this desktop rung (via the session's remembered rung) instead of the `?scene=` override. */
  rung?: number;
  /** The query string, `?scene=lean` by default; ignored with `rung`. */
  query?: string;
};

export async function launch(): Promise<Browser> {
  return chromium.launch({ headless: false, args: ["--use-angle=d3d11", "--window-position=0,0"] });
}

/** Opens the Scene and waits until it is ready and the shader compile has settled. */
export async function openScene(browser: Browser, base: string, o: SceneOptions = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript(instrument);
  if (o.pin) await page.addInitScript(pinRung);
  if (o.rung) await page.addInitScript((r) => sessionStorage.setItem("atrium:scene-rung:desktop", r), String(o.rung));
  await page.goto(`${base}/${o.rung ? "" : (o.query ?? "?scene=lean")}`);
  await page.locator('[data-slot="live-scene"][data-scene-ready="true"]').waitFor({ timeout: 180_000 });
  await page.waitForTimeout(4_000);
  return page;
}

export const rungOf = (page: Page) => page.locator('[data-slot="live-scene"]').getAttribute("data-scene-rung");

/**
 * Selects a House by (part of) its Project name, as the Scene's listbox option, and waits out the fly-to:
 * 1.5 s of Scene time, which takes 5 s of wall time with the pinned (×0.3) clock.
 */
export async function selectHouse(page: Page, name: string) {
  await page.evaluate(
    (n) => ([...document.querySelectorAll('[role="option"]')] as HTMLElement[]).find((o) => o.textContent?.includes(n))!.click(),
    name,
  );
  await page.waitForTimeout(6_000);
}

export const setToggle = (page: Page, toggle: Toggle | null) =>
  page.evaluate((t) => ((window as unknown as { __perf: { toggle: string | null } }).__perf.toggle = t), toggle);

/** Records one window of `ms` in the given mode. */
export async function sample(page: Page, mode: Exclude<Mode, "off">, ms: number): Promise<PerfWindow> {
  await page.evaluate((m) => {
    const p = (window as unknown as { __perf: Record<string, unknown> }).__perf;
    Object.assign(p, { sums: {}, frames: [], intervals: [], count: 0, last: undefined, mode: m });
  }, mode);
  await page.waitForTimeout(ms);
  await page.evaluate(() => ((window as unknown as { __perf: { mode: string } }).__perf.mode = "off"));
  // the window's last queries resolve over the next few frames
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const p = (window as unknown as { __perf: PerfWindow }).__perf;
    return { sums: p.sums, frames: p.frames, intervals: p.intervals, count: p.count };
  });
}
