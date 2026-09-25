import { gzipSync } from "node:zlib";

import { KHR_DF_MODEL_UASTC_HDR_4X4, readKtx2Header } from "@/lib/house/glb-contract";
import { houseDownloads, sceneDownloads, type LivePath, type SceneHouse } from "@/lib/scene/assets";
import { DETAIL_PATH } from "@/lib/scene/detail";

/**
 * The Scene's download budget: what its committed files cost over the wire,
 * gated, and what their textures cost in GPU memory, reported only. The
 * limits are provisional, set before the first final bakes were measured.
 */

export const MB = 1_000_000;

export const BUDGETS = {
  /** Every House's GLB, KTX2 lightmaps and Interior texture. */
  houses: 16 * MB,
  /** Everything one Scene path downloads: the Houses, its detail maps and the rest (`sceneDownloads`). */
  scene: 24 * MB,
} as const;

export type AssetSet = keyof typeof BUDGETS;

/** A texture's GPU memory on each path KTX2Loader may take. */
export type GpuBytes = {
  /**
   * Transcoded to a 4x4 block format of 16 bytes a block: BC6H or ASTC HDR
   * for a lightmap, BC7 or ASTC for a detail map (ETC1 on a phone halves it).
   */
  compressed: number;
  /** Decoded where no block format is supported: RGBA16F (8 bytes a pixel) for HDR, RGBA8 (4) for the rest. */
  fallback: number;
};

export type AssetSize = { url: string; raw: number; wire: number; gpu?: GpuBytes };

export type BudgetReport = {
  path: LivePath;
  sets: Record<AssetSet, { files: AssetSize[]; wire: number; raw: number; limit: number }>;
  /** Summed over the Scene's KTX2 files: the Houses' lightmaps and Interior textures (HDR too), and the path's detail maps. */
  gpu: { lightmaps: GpuBytes; detail: GpuBytes };
};

/**
 * What a file costs over the wire, taken as its gzip size where that is
 * smaller: meshopt GLBs are laid out for a general-purpose compressor on top,
 * and Zstandard KTX2 barely shrinks further.
 */
export function wireSize(bytes: Uint8Array): number {
  return Math.min(bytes.byteLength, gzipSync(bytes, { level: 9 }).byteLength);
}

/** GPU memory of a KTX2 texture from its dimensions, mip levels and format, or undefined when the bytes aren't KTX2. */
export function ktx2GpuBytes(bytes: Uint8Array): GpuBytes | undefined {
  const header = readKtx2Header(bytes);
  if (!header) return undefined;
  const pixelBytes = header.colorModel === KHR_DF_MODEL_UASTC_HDR_4X4 ? 8 : 4;
  const gpu: GpuBytes = { compressed: 0, fallback: 0 };
  for (let level = 0; level < Math.max(1, header.levels); level++) {
    const w = Math.max(1, header.width >> level);
    const h = Math.max(1, header.height >> level);
    gpu.compressed += Math.ceil(w / 4) * Math.ceil(h / 4) * 16;
    gpu.fallback += w * h * pixelBytes;
  }
  return gpu;
}

/** Whether a served URL is one of the shared detail maps. */
export const isDetailMap = (url: string) => url.startsWith(`${DETAIL_PATH}/`);

/** Measures the committed files one Scene path downloads, read through `read` by their served URL. */
export function measureBudget(houses: SceneHouse[], path: LivePath, read: (url: string) => Uint8Array): BudgetReport {
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
    houses: set(houseDownloads(houses), BUDGETS.houses),
    scene: set(sceneDownloads(houses, path), BUDGETS.scene),
  };
  const gpu = { lightmaps: { compressed: 0, fallback: 0 }, detail: { compressed: 0, fallback: 0 } };
  for (const { url, gpu: g } of sets.scene.files) {
    if (!g) continue;
    const sum = isDetailMap(url) ? gpu.detail : gpu.lightmaps;
    sum.compressed += g.compressed;
    sum.fallback += g.fallback;
  }
  return { path, sets, gpu };
}

const mb = (bytes: number) => `${(bytes / MB).toFixed(2)} MB`;

/** Every asset set over its budget, named with its path and measured size. No issues when all fit. */
export function budgetIssues(report: BudgetReport): string[] {
  return Object.entries(report.sets)
    .filter(([, s]) => s.wire > s.limit)
    .map(([name, s]) => `${name} (${report.path}) is ${mb(s.wire)} over the wire, over its ${mb(s.limit)} budget`);
}

/** The report as a table: each set's files, its totals against its budget, then the estimated GPU memory. */
export function formatBudget(report: BudgetReport): string {
  const lines: string[] = [`?scene=${report.path}`];
  const row = (label: string, raw: string, wire: string, gpu = "") =>
    lines.push(`${label.padEnd(44)}${raw.padStart(11)}${wire.padStart(11)}${gpu.padStart(13)}`);
  row("file", "raw", "wire", "GPU");
  const { houses, scene } = report.sets;
  const houseUrls = new Set(houses.files.map((f) => f.url));
  for (const f of scene.files) {
    row(f.url, mb(f.raw), mb(f.wire), f.gpu ? mb(f.gpu.compressed) : "");
  }
  lines.push("");
  row(`houses (budget ${mb(houses.limit)})`, mb(houses.raw), mb(houses.wire));
  row(`scene (budget ${mb(scene.limit)})`, mb(scene.raw), mb(scene.wire));
  const others = scene.files.filter((f) => !houseUrls.has(f.url)).length;
  const { lightmaps, detail } = report.gpu;
  lines.push(
    "",
    "estimated GPU memory (not gated):",
    `  lightmaps:   ${mb(lightmaps.compressed)} as BC6H or ASTC HDR, ${mb(lightmaps.fallback)} as RGBA16F`,
    `  detail maps: ${mb(detail.compressed)} as BC7 or ASTC, ${mb(detail.fallback)} as RGBA8`,
    `(scene = houses + ${others} other file${others === 1 ? "" : "s"}; the Scene's own JavaScript isn't counted)`,
  );
  return lines.join("\n");
}
