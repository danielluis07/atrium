/**
 * Screenshots of one House across its arc (`scripts/perf/README.md`): the overview, the House selected
 * (hero), then a drag to the arc's east end (arc0) and six steps back across it (arc1–arc6). Run it against
 * one build on :3100, then the other, and put the two side by side with `sheet.ts`.
 *
 *   bun scripts/perf/arc.ts <House> <label> [--base http://localhost:3100] [--out scripts/perf/out/arc]
 *     [--step 60] [--query ?scene=target]
 *
 * Writes <out>/<house>/<label>-<shot>.png, the House's name lowercased.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { launch, openScene, selectHouse } from "@/scripts/perf/scene-page";

/** The shots, in order: what `sheet.ts` lays out. */
export const SHOTS = ["overview", "hero", ...Array.from({ length: 7 }, (_, i) => `arc${i}`)] as const;

/** A drag this far overshoots the whole arc, so arc0 is always its east end. */
const TO_END = -1400;

if (import.meta.main) {
  const { values: a, positionals } = parseArgs({
    options: {
      base: { type: "string", default: "http://localhost:3100" },
      out: { type: "string", default: "scripts/perf/out/arc" },
      step: { type: "string", default: "60" },
      query: { type: "string", default: "?scene=target" },
    },
    allowPositionals: true,
  });
  const [house, label] = positionals;
  if (!house || !label) {
    console.error("Usage: bun scripts/perf/arc.ts <House> <label> [--base url] [--out dir] [--step px] [--query ?scene=…]");
    process.exit(1);
  }
  const dir = join(a.out, house.toLowerCase());
  mkdirSync(dir, { recursive: true });
  const browser = await launch();
  const page = await openScene(browser, a.base, { query: a.query });
  const shot = (name: (typeof SHOTS)[number]) => page.screenshot({ path: join(dir, `${label}-${name}.png`) });
  try {
    // keep the pointer off the Houses, so none is hovered
    await page.mouse.move(100, 800);
    await page.waitForTimeout(1_000);
    await shot("overview");
    await selectHouse(page, house);
    await shot("hero");
    const drag = async (dx: number) => {
      await page.mouse.move(560, 450);
      await page.mouse.down();
      await page.mouse.move(560 + dx / 2, 450, { steps: 20 });
      await page.mouse.move(560 + dx, 450, { steps: 20 });
      await page.mouse.up();
      await page.waitForTimeout(3_000);
    };
    await drag(TO_END);
    await shot("arc0");
    for (let i = 1; i <= 6; i++) {
      await drag(Number(a.step));
      await shot(`arc${i}` as (typeof SHOTS)[number]);
    }
    console.log(`wrote ${SHOTS.length} shots to ${dir}/${label}-*.png`);
  } finally {
    await browser.close();
  }
}
