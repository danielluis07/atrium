/**
 * Per-pass GPU breakdown of one build, in one page load (`scripts/perf/README.md`): at the overview and,
 * with --select, at a selected House, a whole-frame window and a per-draw window. With --toggle, each camera
 * runs whole-frame windows in ABBA order (A without the toggle, B with it) and a per-draw window of each,
 * so both sides see the same thermal state.
 *
 *   bun scripts/perf/probe.ts --base http://localhost:3100 --label main [--select Lyngen] [--rung 6]
 *     [--toggle depth-resolve] [--out scripts/perf/out/probe.jsonl]
 *
 * Appends one JSON line per camera to --out and prints a summary.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { launch, openScene, rungOf, sample, selectHouse, setToggle, TOGGLES, type Toggle } from "@/scripts/perf/scene-page";
import { scenePart, stats } from "@/scripts/perf/stats";

const { values: a } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3100" },
    label: { type: "string", default: "build" },
    select: { type: "string" },
    rung: { type: "string" },
    toggle: { type: "string" },
    out: { type: "string", default: "scripts/perf/out/probe.jsonl" },
    frame: { type: "string", default: "7000" },
    draw: { type: "string", default: "6000" },
  },
});
if (a.toggle && !(a.toggle in TOGGLES)) throw new Error(`Unknown toggle ${a.toggle}: one of ${Object.keys(TOGGLES).join(", ")}`);
const toggle = a.toggle as Toggle | undefined;
const [FRAME_MS, DRAW_MS] = [Number(a.frame), Number(a.draw)];

/** Per-draw sums over a window, as ms per frame by Scene part, costliest first. */
function parts(w: { sums: Record<string, { ms: number; n: number }>; count: number }) {
  const byPart = new Map<string, number>();
  for (const [key, v] of Object.entries(w.sums)) byPart.set(scenePart(key), (byPart.get(scenePart(key)) ?? 0) + v.ms / w.count);
  return Object.fromEntries([...byPart].sort((x, y) => y[1] - x[1]).map(([k, ms]) => [k, +ms.toFixed(3)]));
}

const browser = await launch();
const page = await openScene(browser, a.base!, { pin: true, rung: a.rung ? Number(a.rung) : undefined });

async function measure(camera: string) {
  const rung = await rungOf(page);
  const sides = toggle ? [false, true] : [false];
  const frames: Record<string, number[]> = { a: [], b: [] };
  for (const on of toggle ? [false, true, true, false] : [false]) {
    await setToggle(page, on ? toggle! : null);
    frames[on ? "b" : "a"].push(...(await sample(page, "frame", FRAME_MS)).frames);
  }
  const draws: Record<string, { sum: number; parts: Record<string, number>; keys: Record<string, number> }> = {};
  for (const on of sides) {
    await setToggle(page, on ? toggle! : null);
    const w = await sample(page, "draw", DRAW_MS);
    const p = parts(w);
    const keys = Object.fromEntries(Object.entries(w.sums).map(([k, v]) => [k, +(v.ms / w.count).toFixed(3)]));
    draws[on ? "b" : "a"] = { sum: +Object.values(p).reduce((x, y) => x + y, 0).toFixed(2), parts: p, keys };
  }
  await setToggle(page, null);
  const rungAfter = await rungOf(page);
  // a step mid-measurement (a slow spell can beat the pinned clock) mixes two configs: flagged, and left out by report.ts
  const rungChanged = rungAfter !== rung || undefined;
  if (rungChanged) console.warn(`warning: the rung stepped from ${rung} to ${rungAfter} during the ${camera} windows; this row is flagged`);
  const row = { label: a.label, camera, toggle: toggle ?? null, rung, rungAfter, rungChanged, frame: { a: stats(frames.a), b: stats(frames.b) }, draws };
  await mkdir(dirname(a.out!), { recursive: true });
  await appendFile(a.out!, JSON.stringify(row) + "\n");
  const f = row.frame;
  console.log(`${a.label} ${camera} rung ${rung}->${rungAfter}: GPU p50 ${f.a?.p50}${f.b ? ` → ${f.b.p50} with ${toggle}` : ""}, per-draw sum ${draws.a.sum}`);
  for (const [part, ms] of Object.entries(draws.a.parts)) console.log(`  ${ms.toFixed(2).padStart(6)} ms  ${part}${draws.b ? `  (${(draws.b.parts[part] ?? 0).toFixed(2)})` : ""}`);
}

try {
  await measure("overview");
  if (a.select) {
    await selectHouse(page, a.select);
    await measure(a.select);
  }
} finally {
  await browser.close();
}
