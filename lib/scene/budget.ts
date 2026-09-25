import { gzipSync } from "node:zlib";

import { readKtx2Header } from "@/lib/house/glb-contract";
import { houseDownloads, sceneDownloads } from "@/lib/scene/assets";

/**
 * The Scene's download budget: what its committed files cost over the wire,
 * gated, and what their textures cost in GPU memory, reported only. The
 * limits are provisional, set before the first final bakes were measured.
 */

export const MB = 1_000_000;

export const BUDGETS = {
  /** Every House's GLB and KTX2 lightmaps. */
  houses: 16 * MB,
  /** Everything the Scene downloads: the Houses and the rest (`sceneDownloads`). */
  scene: 24 * MB,
} as const;

export type AssetSet = keyof typeof BUDGETS;

/** A texture's GPU memory on each path KTX2Loader may take. */
export type GpuBytes = {
  /** Transcoded to BC6H or ASTC HDR 4x4: 16 bytes per 4x4 block. */
  compressed: number;
  /** Decoded to RGBA16F where neither is supported: 8 bytes per pixel. */
  fallback: number;
};

export type AssetSize = { url: string; raw: number; wire: number; gpu?: GpuBytes };

export type BudgetReport = {
  sets: Record<AssetSet, { files: AssetSize[]; wire: number; raw: number; limit: number }>;
  /** Summed over every KTX2 in the Scene. */
  gpu: GpuBytes;
};

/**
 * What a file costs over the wire, taken as its gzip size where that is
 * smaller: meshopt GLBs are laid out for a general-purpose compressor on top,
 * and Zstandard KTX2 barely shrinks further.
 */
export function wireSize(bytes: Uint8Array): number {
  return Math.min(bytes.byteLength, gzipSync(bytes, { level: 9 }).byteLength);
}

/** GPU memory of a KTX2 texture from its dimensions and mip levels, or undefined when the bytes aren't KTX2. */
export function ktx2GpuBytes(bytes: Uint8Array): GpuBytes | undefined {
  const header = readKtx2Header(bytes);
  if (!header) return undefined;
  const gpu: GpuBytes = { compressed: 0, fallback: 0 };
  for (let level = 0; level < Math.max(1, header.levels); level++) {
    const w = Math.max(1, header.width >> level);
    const h = Math.max(1, header.height >> level);
    gpu.compressed += Math.ceil(w / 4) * Math.ceil(h / 4) * 16;
    gpu.fallback += w * h * 8;
  }
  return gpu;
}

/** Measures the committed files, read through `read` by their served URL. */
export function measureBudget(slugs: string[], read: (url: string) => Uint8Array): BudgetReport {
  const sizes = new Map<string, AssetSize>();
  const size = (url: string) => {
    let s = sizes.get(url);
    if (!s) {
      const bytes = read(url);
      s = { url, raw: bytes.byteLength, wire: wireSize(bytes), gpu: url.endsWith(".ktx2") ? ktx2GpuBytes(bytes) : undefined };
      sizes.set(url, s);
    }
    return s;
  };
  const set = (urls: string[], limit: number) => {
    const files = urls.map(size);
    const sum = (key: "raw" | "wire") => files.reduce((n, f) => n + f[key], 0);
    return { files, raw: sum("raw"), wire: sum("wire"), limit };
  };
  const sets = {
    houses: set(houseDownloads(slugs), BUDGETS.houses),
    scene: set(sceneDownloads(slugs), BUDGETS.scene),
  };
  const gpu: GpuBytes = { compressed: 0, fallback: 0 };
  for (const { gpu: g } of sets.scene.files) {
    gpu.compressed += g?.compressed ?? 0;
    gpu.fallback += g?.fallback ?? 0;
  }
  return { sets, gpu };
}

const mb = (bytes: number) => `${(bytes / MB).toFixed(2)} MB`;

/** Every asset set over its budget, named with its measured size. No issues when all fit. */
export function budgetIssues(report: BudgetReport): string[] {
  return Object.entries(report.sets)
    .filter(([, s]) => s.wire > s.limit)
    .map(([name, s]) => `${name} is ${mb(s.wire)} over the wire, over its ${mb(s.limit)} budget`);
}

/** The report as a table: each set's files, its totals against its budget, then the estimated GPU memory. */
export function formatBudget(report: BudgetReport): string {
  const lines: string[] = [];
  const row = (label: string, raw: string, wire: string, gpu = "") =>
    lines.push(`${label.padEnd(44)}${raw.padStart(11)}${wire.padStart(11)}${gpu.padStart(13)}`);
  row("file", "raw", "wire", "GPU (BC6H)");
  const { houses, scene } = report.sets;
  const houseUrls = new Set(houses.files.map((f) => f.url));
  for (const f of scene.files) {
    row(f.url, mb(f.raw), mb(f.wire), f.gpu ? mb(f.gpu.compressed) : "");
  }
  lines.push("");
  row(`houses (budget ${mb(houses.limit)})`, mb(houses.raw), mb(houses.wire));
  row(`scene (budget ${mb(scene.limit)})`, mb(scene.raw), mb(scene.wire));
  const others = scene.files.filter((f) => !houseUrls.has(f.url)).length;
  lines.push(
    "",
    `estimated GPU memory, lightmaps: ${mb(report.gpu.compressed)} as BC6H or ASTC HDR, ${mb(report.gpu.fallback)} as RGBA16F (not gated)`,
    `(scene = houses + ${others} other file${others === 1 ? "" : "s"}; the Scene's own JavaScript isn't counted)`,
  );
  return lines.join("\n");
}
