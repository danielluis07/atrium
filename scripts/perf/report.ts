/**
 * Summaries of the jsonl the perf scripts write (`scripts/perf/README.md`).
 *
 *   bun scripts/perf/report.ts probe  [file]   per-pass medians per label and camera, and the A/B toggle deltas
 *   bun scripts/perf/report.ts frames [file] [--a main --b branch]   paired build-vs-build GPU p50/p90 deltas
 *   bun scripts/perf/report.ts settle [file]   where each free-rung run settled
 */
import { parseArgs } from "node:util";

import { median, signFlip } from "@/scripts/perf/stats";

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: { a: { type: "string", default: "main" }, b: { type: "string", default: "branch" } },
});
const [kind, file] = positionals;
const read = async (path: string, keepErrors = false) =>
  (await Bun.file(path).text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => keepErrors || !r.error);
const f2 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(2);

type ProbeRow = {
  label: string;
  rungChanged?: true;
  camera: string;
  toggle: string | null;
  rung: string;
  frame: { a: { p50: number; p90: number } | null; b: { p50: number; p90: number } | null };
  draws: Record<string, { sum: number; parts: Record<string, number> }>;
};

async function probe(path: string) {
  const groups = new Map<string, ProbeRow[]>();
  for (const r of (await read(path)) as ProbeRow[]) {
    if (r.rungChanged) {
      console.warn(`${r.label} ${r.camera}: the rung stepped during the windows, left out`);
      continue;
    }
    const k = `${r.label} · ${r.camera} · rung ${r.rung}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const [k, rows] of groups) {
    console.log(`\n## ${k} (${rows.length} loads)`);
    console.log(`whole-frame GPU p50 ${median(rows.map((r) => r.frame.a!.p50)).toFixed(2)} ms, p90 ${median(rows.map((r) => r.frame.a!.p90)).toFixed(2)} ms`);
    const paired = rows.filter((r) => r.frame.b);
    if (paired.length) {
      const d50 = paired.map((r) => r.frame.b!.p50 - r.frame.a!.p50);
      const d90 = paired.map((r) => r.frame.b!.p90 - r.frame.a!.p90);
      console.log(`with ${paired[0].toggle}: Δp50 median ${f2(median(d50))} (${f2(Math.min(...d50))} to ${f2(Math.max(...d50))}), lower in ${d50.filter((d) => d < 0).length}/${d50.length}; Δp90 median ${f2(median(d90))}`);
    }
    const names = [...new Set(rows.flatMap((r) => Object.keys(r.draws.a.parts)))];
    const med = (side: string, p: string) => median(rows.filter((r) => r.draws[side]).map((r) => r.draws[side].parts[p] ?? 0));
    const table = names.map((p) => [p, med("a", p), paired.length ? med("b", p) : NaN] as const).sort((x, y) => y[1] - x[1]);
    for (const [p, ms, b] of table) console.log(`  ${ms.toFixed(2).padStart(6)} ms  ${p}${Number.isNaN(b) ? "" : `  (${b.toFixed(2)} with toggle)`}`);
    console.log(`  per-draw sum ${median(rows.map((r) => r.draws.a.sum)).toFixed(2)} ms (the per-draw queries add about 1 ms)`);
  }
}

type FrameRow = { label: string; select: string; error?: true; rungChanged?: true } & Record<"overview" | "selected", { rung: string; gpu: { p50: number; p90: number } }>;

async function frames(path: string) {
  const rows = (await read(path, true)) as FrameRow[];
  // pairs are consecutive rows, one of each build, in whichever order the driver ran them; a failed run
  // leaves an error line, and its pair is skipped
  const pairs: [FrameRow, FrameRow][] = [];
  for (let i = 0; i + 1 < rows.length; i += 2) {
    const [x, y] = [rows[i], rows[i + 1]];
    const A = [x, y].find((r) => r.label === a.a);
    const B = [x, y].find((r) => r.label === a.b);
    if (x.error || y.error) console.warn(`pair at rows ${i}–${i + 1} has a failed run: skipped`);
    else if (x.rungChanged || y.rungChanged) console.warn(`pair at rows ${i}–${i + 1} has a run whose rung stepped: skipped`);
    else if (A && B) pairs.push([A, B]);
    else console.warn(`rows ${i}–${i + 1} are not one ${a.a} and one ${a.b}: skipped`);
  }
  console.log(`${pairs.length} pairs, ${a.b} − ${a.a}`);
  for (const cam of ["overview", "selected"] as const) {
    for (const q of ["p50", "p90"] as const) {
      const diffs = pairs.map(([A, B]) => B[cam].gpu[q] - A[cam].gpu[q]);
      const t = signFlip(diffs);
      const of = (i: 0 | 1) => median(pairs.map((p) => p[i][cam].gpu[q]));
      console.log(`${cam.padEnd(8)} GPU ${q}: ${a.a} ${of(0).toFixed(2)}, ${a.b} ${of(1).toFixed(2)} (medians); paired Δ median ${f2(median(diffs))}, mean ${f2(t.meanDiff)}, ${a.b} higher in ${t.higher}/${t.pairs}, sign-flip p ${t.p.toFixed(3)}`);
    }
  }
  const settled = (label: string) => rows.filter((r) => r.label === label && !r.error).map((r) => `${r.overview.rung},${r.selected.rung}`);
  console.log(`rungs held (overview,selected): ${a.a} ${settled(a.a!).join(" ")} | ${a.b} ${settled(a.b!).join(" ")}`);
}

async function settle(path: string) {
  for (const r of await read(path)) console.log(`${String(r.label).padEnd(10)} rung ${r.start} -> ${r.end}, first reached (s): ${JSON.stringify(r.reached)}`);
}

const reports: Record<string, [(p: string) => Promise<void>, string]> = {
  probe: [probe, "scripts/perf/out/probe.jsonl"],
  frames: [frames, "scripts/perf/out/frames.jsonl"],
  settle: [settle, "scripts/perf/out/settle.jsonl"],
};
if (!kind || !(kind in reports)) throw new Error("usage: report.ts probe|frames|settle [file]");
const [run, fallback] = reports[kind];
await run(file ?? fallback);
