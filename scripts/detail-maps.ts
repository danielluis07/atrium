/**
 * Generates the Houses' shared tiled detail maps (`lib/scene/detail.ts`):
 * the builder's procedural generator writes each map as PNG at full and half
 * size, then KTX-Software encodes every one to a mipmapped KTX2 in
 * public/scene/detail/, removing any map no longer listed. The maps are
 * placeholders until final ones are made by hand.
 *
 *   bun run houses:detail
 *
 * Needs the same tools as a bake; see scripts/houses/README.md.
 */
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import { DETAIL_TILES, detailMaps, type DetailMap } from "@/lib/scene/detail";
import { DEFAULT_OUT_DIR } from "@/scripts/export-houses";
import { BUILDER_DIR, preflight } from "@/scripts/houses/preflight";

export const DETAIL_DIR = "public/scene/detail";
const WORK_DIR = join(DEFAULT_OUT_DIR, "detail");

/**
 * KTX-Software's arguments for one map. Albedo and roughness are ETC1S
 * (Basis-LZ), indistinguishable from the source at a third of UASTC's size.
 * Normals are UASTC with RDO and Zstandard: ETC1S's block artefacts wreck
 * them. Albedo is tagged sRGB; the rest is linear data, never converted.
 */
export function ktxArgs(map: Pick<DetailMap, "kind" | "srgb">, input: string, output: string): string[] {
  const encode =
    map.kind === "normal"
      ? ["--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--uastc-rdo-l", "1", "--zstd", "18"]
      : ["--encode", "basis-lz", "--qlevel", "192"];
  return [
    "ktx", "create",
    "--format", map.srgb ? "R8G8B8_SRGB" : "R8G8B8_UNORM",
    "--assign-tf", map.srgb ? "srgb" : "linear",
    "--generate-mipmap",
    ...encode,
    input, output,
  ];
}

function step(label: string, cmd: string[], { quiet = false } = {}) {
  const result = Bun.spawnSync(cmd, { stdout: quiet ? "pipe" : "inherit", stderr: quiet ? "pipe" : "inherit" });
  if (result.exitCode !== 0) {
    if (quiet) process.stderr.write(`${result.stdout}${result.stderr}`);
    throw new Error(`${label} failed (exit ${result.exitCode})`);
  }
}

const kb = (path: string) => `${Math.round(statSync(path).size / 1024)} KB`;

export function generateDetailMaps(): void {
  rmSync(WORK_DIR, { recursive: true, force: true });
  const spec = Object.fromEntries(Object.entries(DETAIL_TILES).map(([m, t]) => [m, { metres: t.metres, px: t.px }]));
  step("textures.py", [
    "uv", "run", "--no-sync", "--project", BUILDER_DIR,
    "python", join(BUILDER_DIR, "textures.py"),
    "--out", WORK_DIR,
    "--spec", JSON.stringify(spec),
  ]);

  mkdirSync(DETAIL_DIR, { recursive: true });
  const maps = [...detailMaps("full"), ...detailMaps("half")];
  for (const map of maps) {
    const file = basename(map.url);
    const out = join(DETAIL_DIR, file);
    step(`ktx create ${file}`, ktxArgs(map, join(WORK_DIR, file.replace(/\.ktx2$/, ".png")), out), { quiet: true });
    console.log(`  ${out} ${kb(out)}`);
  }
  const listed = new Set(maps.map((m) => basename(m.url)));
  for (const file of readdirSync(DETAIL_DIR)) {
    if (!listed.has(file)) {
      rmSync(join(DETAIL_DIR, file));
      console.log(`  removed ${join(DETAIL_DIR, file)}`);
    }
  }
}

if (import.meta.main) {
  const problems = preflight();
  if (problems.length) {
    console.error(`Can't generate the detail maps, missing tools:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  try {
    generateDetailMaps();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
