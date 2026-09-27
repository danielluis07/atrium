/**
 * A contact sheet of two builds' arc shots side by side (`arc.ts`): one row per shot, the first label on
 * the left. Each tile is the Scene's left 1140 px (clear of the Project Panel), at half size.
 *
 *   bun scripts/perf/sheet.ts <House> <label a> <label b> [--dir scripts/perf/out/arc] [--out <file>]
 *
 * Writes <dir>/<house>/<a>-vs-<b>.jpg unless --out names a file.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";

import sharp from "sharp";

import { SHOTS } from "@/scripts/perf/arc";

const TILE = { width: 570, height: 450 };
const CROP = { left: 0, top: 0, width: 1140, height: 900 };

const { values: a, positionals } = parseArgs({
  options: { dir: { type: "string", default: "scripts/perf/out/arc" }, out: { type: "string" } },
  allowPositionals: true,
});
const [house, left, right] = positionals;
if (!house || !left || !right) {
  console.error("Usage: bun scripts/perf/sheet.ts <House> <label a> <label b> [--dir dir] [--out file]");
  process.exit(1);
}
const dir = join(a.dir, house.toLowerCase());
const files = SHOTS.flatMap((shot) => [left, right].map((label) => join(dir, `${label}-${shot}.png`)));
const tiles = await Promise.all(files.map((f) => sharp(f).extract(CROP).resize(TILE.width, TILE.height).toBuffer()));
const out = a.out ?? join(dir, `${left}-vs-${right}.jpg`);
await sharp({ create: { width: TILE.width * 2, height: TILE.height * SHOTS.length, channels: 3, background: "#000" } })
  .composite(tiles.map((input, i) => ({ input, left: (i % 2) * TILE.width, top: Math.floor(i / 2) * TILE.height })))
  .jpeg({ quality: 82 })
  .toFile(out);
console.log(`wrote ${out}`);
