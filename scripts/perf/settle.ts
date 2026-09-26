/**
 * Where the Scene settles with the rung left free (`scripts/perf/README.md`): a fresh load, then the rung
 * and the rAF interval p50/p90 every second at the overview for --duration ms. Run it after 5 idle
 * minutes for a cold GPU, or straight after other runs for a warm one.
 *
 *   bun scripts/perf/settle.ts --base http://localhost:3100 --label cold1 [--duration 45000]
 *     [--out scripts/perf/out/settle.jsonl]
 */
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { launch } from "@/scripts/perf/scene-page";
import { percentile } from "@/scripts/perf/stats";

const { values: a } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3100" },
    label: { type: "string", default: "run" },
    duration: { type: "string", default: "45000" },
    out: { type: "string", default: "scripts/perf/out/settle.jsonl" },
  },
});

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  // no ?scene= override and a fresh session: the Scene picks its start rung and steps as it would for a visitor
  await page.goto(`${a.base}/`);
  await page.locator('[data-slot="live-scene"][data-scene-ready="true"]').waitFor({ timeout: 180_000 });
  const seconds = await page.evaluate(
    (duration) =>
      new Promise<{ rung: string | null; intervals: number[] }[]>((resolve) => {
        const el = document.querySelector('[data-slot="live-scene"]')!;
        const out: { rung: string | null; intervals: number[] }[] = [];
        let bucket: number[] = [];
        let last: number | undefined;
        let start: number | undefined;
        const frame = (now: number) => {
          start ??= now;
          if (last !== undefined) bucket.push(now - last);
          last = now;
          if (now - start >= (out.length + 1) * 1000) {
            out.push({ rung: el.getAttribute("data-scene-rung"), intervals: bucket });
            bucket = [];
          }
          if (now - start < duration) requestAnimationFrame(frame);
          else resolve(out);
        };
        requestAnimationFrame(frame);
      }),
    Number(a.duration),
  );
  const log = seconds.map((s, i) => ({
    s: i,
    rung: s.rung,
    p50: +percentile(s.intervals, 0.5).toFixed(1),
    p90: +percentile(s.intervals, 0.9).toFixed(1),
  }));
  const rungs = log.map((x) => x.rung);
  /** The second each rung was first reached, null if never. */
  const reached = Object.fromEntries([...new Set(rungs)].map((r) => [r, rungs.indexOf(r)]));
  const row = { label: a.label, start: rungs[0], end: rungs.at(-1), reached, log };
  await mkdir(dirname(a.out!), { recursive: true });
  await appendFile(a.out!, JSON.stringify(row) + "\n");
  console.log(`${a.label}: rung ${row.start} -> ${row.end}, first reached at ${JSON.stringify(reached)} s`);
} finally {
  await browser.close();
}
