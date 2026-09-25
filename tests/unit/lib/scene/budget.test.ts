import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { projectOrder } from "@/content/projects";
import { houseAssets } from "@/lib/scene/assets";
import {
  budgetIssues,
  BUDGETS,
  formatBudget,
  ktx2GpuBytes,
  MB,
  measureBudget,
  wireSize,
  type BudgetReport,
} from "@/lib/scene/budget";

const readPublic = (url: string) => new Uint8Array(readFileSync(join("public", url)));
const slugs = projectOrder.map((p) => p.slug);
/** Bytes no compressor can shrink. */
function noise(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 65_536) crypto.getRandomValues(bytes.subarray(i, i + 65_536));
  return bytes;
}

describe("the committed Scene", () => {
  const report = measureBudget(slugs, readPublic);

  test("fits its download budgets", () => {
    console.log(`\n${formatBudget(report)}\n`);
    expect(budgetIssues(report)).toEqual([]);
  });

  test("counts every House file, and the Houses within the Scene", () => {
    expect(report.sets.houses.files).toHaveLength(slugs.length * 5);
    const scene = new Set(report.sets.scene.files.map((f) => f.url));
    expect(report.sets.houses.files.every((f) => scene.has(f.url))).toBe(true);
    expect(report.sets.scene.wire).toBeGreaterThan(report.sets.houses.wire);
  });

  test("estimates GPU memory from every lightmap", () => {
    const lightmaps = report.sets.houses.files.filter((f) => f.url.endsWith(".ktx2"));
    expect(lightmaps.every((f) => f.gpu && f.gpu.compressed > 0)).toBe(true);
    expect(report.gpu.compressed).toBe(lightmaps.reduce((n, f) => n + f.gpu!.compressed, 0));
  });
});

describe("the budget check", () => {
  const fake = (houses: number, scene: number): BudgetReport => ({
    sets: {
      houses: { files: [], raw: houses, wire: houses, limit: BUDGETS.houses },
      scene: { files: [], raw: scene, wire: scene, limit: BUDGETS.scene },
    },
    gpu: { compressed: 0, fallback: 0 },
  });

  test("passes at the budget", () => {
    expect(budgetIssues(fake(16 * MB, 24 * MB))).toEqual([]);
  });

  test("fails when the Houses go over, naming the set and its size", () => {
    expect(budgetIssues(fake(16.5 * MB, 20 * MB))).toEqual([
      "houses is 16.50 MB over the wire, over its 16.00 MB budget",
    ]);
  });

  test("fails when the whole Scene goes over", () => {
    expect(budgetIssues(fake(10 * MB, 24 * MB + 1))).toEqual([
      "scene is 24.00 MB over the wire, over its 24.00 MB budget",
    ]);
  });

  test("fails on a committed asset set that is too big", () => {
    // the real files, with Lyngen's shell lightmap swapped for 17 MB of noise
    const big = houseAssets("lyngen").lightmaps.shell.base;
    const report = measureBudget(slugs, (url) => (url === big ? noise(17 * MB) : readPublic(url)));
    expect(budgetIssues(report).map((i) => i.split(" ")[0])).toContain("houses");
  });
});

describe("sizes", () => {
  test("the wire size is the gzip size, or the raw size when gzip doesn't help", () => {
    expect(wireSize(new Uint8Array(100_000))).toBeLessThan(1_000);
    expect(wireSize(noise(1_000))).toBe(1_000);
  });

  test("GPU memory counts 4x4 blocks down the mip chain", () => {
    const bytes = readPublic(houseAssets("lyngen").lightmaps.shell.base);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(20, true);
    const levels = view.getUint32(40, true);
    expect(levels).toBe(Math.log2(width) + 1);
    let blocks = 0;
    let pixels = 0;
    for (let l = 0; l < levels; l++) {
      const w = Math.max(1, width >> l);
      blocks += Math.ceil(w / 4) ** 2;
      pixels += w * w;
    }
    expect(ktx2GpuBytes(bytes)).toEqual({ compressed: blocks * 16, fallback: pixels * 8 });
    expect(ktx2GpuBytes(new Uint8Array(100))).toBeUndefined();
  });
});
