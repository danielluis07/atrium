/**
 * Whole-frame GPU time of one build at a held rung (`scripts/perf/README.md`), the method of #57 / #59:
 * a window at the overview, then one at a selected House. Run it from `pairs.sh`, which alternates two
 * builds, and compare them with `report.ts frames`.
 *
 *   bun scripts/perf/frames.ts --base http://localhost:3100 --label main --select Lyngen [--rung 6]
 *     [--out scripts/perf/out/frames.jsonl]
 */
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { launch, openScene, rungOf, sample, selectHouse } from "@/scripts/perf/scene-page";
import { stats } from "@/scripts/perf/stats";

const { values: a } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3100" },
    label: { type: "string", default: "build" },
    select: { type: "string", default: "Lyngen" },
    rung: { type: "string" },
    out: { type: "string", default: "scripts/perf/out/frames.jsonl" },
    window: { type: "string", default: "15000" },
  },
});

const browser = await launch();
try {
  const page = await openScene(browser, a.base!, { pin: true, rung: a.rung ? Number(a.rung) : undefined });
  const window_ = async () => {
    const w = await sample(page, "frame", Number(a.window));
    return { rung: await rungOf(page), gpu: stats(w.frames), interval: stats(w.intervals) };
  };
  const start = await rungOf(page);
  const overview = await window_();
  await selectHouse(page, a.select!);
  const selected = await window_();
  // a step mid-run (a slow spell can beat the pinned clock) mixes two configs: flagged, and left out by report.ts
  const rungChanged = selected.rung !== start || undefined;
  if (rungChanged) console.warn(`warning: the rung stepped from ${start} to ${selected.rung}; this run is flagged`);
  const row = { label: a.label, select: a.select, rungChanged, overview, selected };
  await mkdir(dirname(a.out!), { recursive: true });
  await appendFile(a.out!, JSON.stringify(row) + "\n");
  console.log(`${a.label}: overview GPU p50/p90 ${overview.gpu?.p50}/${overview.gpu?.p90}, ${a.select} ${selected.gpu?.p50}/${selected.gpu?.p90}, rungs ${overview.rung},${selected.rung}`);
} finally {
  await browser.close();
}
