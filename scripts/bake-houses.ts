/**
 * Bakes Houses from their records: checks the tools, validates and exports
 * each House's builder JSON, compiles and bakes it in headless Blender, then
 * compresses the outputs into public/houses/<slug>/: a meshopt GLB and one
 * KTX2 (UASTC HDR) per lightmap. One House at a time: a bake takes the
 * whole CPU and most of the RAM.
 *
 *   bun run houses:bake [--mode draft] [slug…]
 *
 * Needs uv, KTX-Software 5+ and `uv sync --project scripts/houses/builder`;
 * see scripts/houses/README.md.
 */
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { projectOrder } from "@/content/projects";
import { sceneLayout } from "@/content/scene";
import { bakeHash } from "@/lib/house/export";
import { readGlb, type HouseExtras } from "@/lib/house/glb-contract";
import { DEFAULT_OUT_DIR, runExport } from "@/scripts/export-houses";
import { BUILDER_DIR, preflight } from "@/scripts/houses/preflight";

export const PUBLIC_DIR = "public/houses";
export const MODES = ["draft"] as const;
type Mode = (typeof MODES)[number];

/** The builder's version, from its pyproject.toml: part of every bake hash. */
export function builderVersion(): string {
  const pyproject = Bun.TOML.parse(readFileSync(join(BUILDER_DIR, "pyproject.toml"), "utf8")) as {
    project: { version: string };
  };
  return pyproject.project.version;
}

/** Runs a step with its output streamed; throws naming the step when it fails. */
function step(label: string, cmd: string[], { quiet = false } = {}) {
  const result = Bun.spawnSync(cmd, {
    stdout: quiet ? "pipe" : "inherit",
    stderr: quiet ? "pipe" : "inherit",
  });
  if (result.exitCode !== 0) {
    if (quiet) process.stderr.write(`${result.stdout}${result.stderr}`);
    throw new Error(`${label} failed (exit ${result.exitCode})`);
  }
}

const kb = (path: string) => `${Math.round(statSync(path).size / 1024)} KB`;

export function bakeHouse(slug: string, mode: Mode): void {
  const exportJson = readFileSync(join(DEFAULT_OUT_DIR, `${slug}.json`), "utf8");
  const hash = bakeHash(exportJson, builderVersion());
  const work = join(DEFAULT_OUT_DIR, slug);
  const out = join(PUBLIC_DIR, slug);
  rmSync(work, { recursive: true, force: true });
  console.log(`\n${slug}: baking (${mode}, ${hash.slice(0, 12)})`);

  step(`${slug}: builder`, [
    "uv", "run", "--no-sync", "--project", BUILDER_DIR,
    "python", join(BUILDER_DIR, "build.py"),
    "--json", join(DEFAULT_OUT_DIR, `${slug}.json`),
    "--out", work,
    "--bake-hash", hash,
    "--mode", mode,
  ]);

  const raw = join(work, `${slug}-raw.glb`);
  const extras = readGlb(new Uint8Array(readFileSync(raw))).nodes.find((n) => n.name === `house:${slug}`)
    ?.extras as HouseExtras;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // texcoords at 16 bits: the lightmap UV is 0..1, and 12 bits visibly shifts it
  const glb = join(out, `${slug}.glb`);
  step(`${slug}: gltf-transform`, [
    "bun", "x", "--no-install", "gltf-transform", "meshopt", raw, glb,
    "--quantize-texcoord", "16", "--quantize-position", "16",
  ], { quiet: true });
  console.log(`  ${glb} ${kb(glb)}`);

  for (const layers of Object.values(extras.lightmaps)) {
    for (const file of Object.values(layers)) {
      const ktx2 = join(out, file);
      step(`${slug}: ktx create ${file}`, [
        "ktx", "create", "--format", "R16G16B16_SFLOAT", "--encode", "uastc-hdr-4x4",
        "--generate-mipmap", "--zstd", "18",
        join(work, file.replace(/\.ktx2$/, ".exr")), ktx2,
      ], { quiet: true });
      console.log(`  ${ktx2} ${kb(ktx2)}`);
    }
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--mode");
  const mode = (at >= 0 ? args[at + 1] : "draft") as Mode;
  const slugs = at >= 0 ? args.filter((_, i) => i !== at && i !== at + 1) : args;
  if (!MODES.includes(mode)) {
    console.error(`Unknown mode ${mode}: use ${MODES.join(" or ")}`);
    process.exit(1);
  }

  const problems = preflight();
  if (problems.length) {
    console.error(`Can't bake, missing tools:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  if (runExport({ records: projectOrder, layout: sceneLayout, outDir: DEFAULT_OUT_DIR, slugs }) !== 0) {
    process.exit(1);
  }
  const chosen = slugs.length ? slugs : projectOrder.map((p) => p.slug);
  try {
    for (const slug of chosen) bakeHouse(slug, mode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
