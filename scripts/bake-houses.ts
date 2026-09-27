/**
 * Bakes Houses from their records: validates and exports each House's
 * builder JSON, skips every House whose committed bake is current, checks
 * the tools, then compiles and bakes the rest in headless Blender and
 * compresses the outputs into public/houses/<slug>/: a meshopt GLB and one
 * KTX2 (UASTC HDR) per lightmap and per Interior, its baked texture. One House at a time: a bake takes the whole CPU and most
 * of the RAM. Last, it stamps every House's Curtains into its GLB, which
 * needs no bake.
 *
 *   bun run houses:bake [--mode draft|final] [--force] [slug…]
 *
 * Needs uv, KTX-Software 5+ and `uv sync --project scripts/houses/builder`;
 * see scripts/houses/README.md.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { projectOrder } from "@/content/projects";
import { sceneLayout } from "@/content/scene";
import type { Project } from "@/content/schema";
import { bakeHash } from "@/lib/house/export";
import { readGlb, stampCurtains, writeGlb, type HouseExtras } from "@/lib/house/glb-contract";
import { DEFAULT_OUT_DIR, runExport } from "@/scripts/export-houses";
import { BUILDER_DIR, preflight } from "@/scripts/houses/preflight";

export const PUBLIC_DIR = "public/houses";
/** Worst first: a bake in a later mode also satisfies an earlier one. */
export const MODES = ["draft", "final"] as const;
export type Mode = (typeof MODES)[number];

/** The builder's version, from its pyproject.toml: part of every bake hash. */
export function builderVersion(): string {
  const pyproject = Bun.TOML.parse(readFileSync(join(BUILDER_DIR, "pyproject.toml"), "utf8")) as {
    project: { version: string };
  };
  return pyproject.project.version;
}

/** The root extras of a House's GLB in `dir`, or undefined when there is none. */
export function readExtras(dir: string, slug: string): HouseExtras | undefined {
  const path = join(dir, slug, `${slug}.glb`);
  if (!existsSync(path)) return undefined;
  return readGlb(new Uint8Array(readFileSync(path))).nodes.find((n) => n.name === `house:${slug}`)
    ?.extras as HouseExtras | undefined;
}

/**
 * Whether a House's bake in `dir` can stand: baked from `hash`, in `mode` or
 * a better one, with every lightmap and texture it names beside it.
 */
export function bakeIsCurrent(dir: string, slug: string, hash: string, mode: Mode): boolean {
  const extras = readExtras(dir, slug);
  if (extras?.bakeHash !== hash || !(MODES.indexOf(extras.mode) >= MODES.indexOf(mode))) return false;
  return bakedFiles(extras).every((file) => existsSync(join(dir, slug, file)));
}

/**
 * Stamps a House's Curtains into its GLB in `dir` (`stampCurtains`), which
 * needs no bake. Returns whether the GLB changed.
 */
export function stampHouse(dir: string, project: Project): boolean {
  const path = join(dir, project.slug, `${project.slug}.glb`);
  const bytes = new Uint8Array(readFileSync(path));
  const gltf = readGlb(bytes);
  if (!stampCurtains(gltf, project)) return false;
  writeFileSync(path, writeGlb(bytes, gltf));
  return true;
}

/** The KTX2 files a House's extras name: its lightmaps, then its Interiors' textures, the hero Interior's first. */
const bakedFiles = (extras: HouseExtras) => [
  ...Object.values(extras.lightmaps ?? {}).flatMap((layers) => Object.values(layers)),
  ...[...(extras.interior ? [extras.interior] : []), ...(extras.otherInteriors ?? [])].map((i) => i.texture),
];

/** The bake hash of a House's exported JSON, as the builder will write it. */
export const exportedBakeHash = (slug: string) =>
  bakeHash(readFileSync(join(DEFAULT_OUT_DIR, `${slug}.json`), "utf8"), builderVersion());

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

export function bakeHouse(slug: string, mode: Mode, hash: string): void {
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

  // an Interior's texture is baked light too, colours and all
  for (const file of bakedFiles(extras)) {
    const ktx2 = join(out, file);
    step(`${slug}: ktx create ${file}`, [
      "ktx", "create", "--format", "R16G16B16_SFLOAT", "--encode", "uastc-hdr-4x4",
      "--generate-mipmap", "--zstd", "18",
      join(work, file.replace(/\.ktx2$/, ".exr")), ktx2,
    ], { quiet: true });
    console.log(`  ${ktx2} ${kb(ktx2)}`);
  }
}

if (import.meta.main) {
  let parsed;
  try {
    parsed = parseArgs({
      options: { mode: { type: "string", default: "draft" }, force: { type: "boolean", default: false } },
      allowPositionals: true,
    });
  } catch (error) {
    console.error(`${(error as Error).message}\nUsage: bun run houses:bake [--mode draft|final] [--force] [slug…]`);
    process.exit(1);
  }
  const { values, positionals: slugs } = parsed;
  const mode = values.mode as Mode;
  if (!MODES.includes(mode)) {
    console.error(`Unknown mode ${mode}: use ${MODES.join(" or ")}`);
    process.exit(1);
  }

  if (runExport({ records: projectOrder, layout: sceneLayout, outDir: DEFAULT_OUT_DIR, slugs }) !== 0) {
    process.exit(1);
  }
  const chosen = slugs.length ? slugs : projectOrder.map((p) => p.slug);
  const stale: [string, string][] = [];
  for (const slug of chosen) {
    const hash = exportedBakeHash(slug);
    if (!values.force && bakeIsCurrent(PUBLIC_DIR, slug, hash, mode)) {
      console.log(`${slug}: up to date (${readExtras(PUBLIC_DIR, slug)?.mode}, ${hash.slice(0, 12)}), skipped`);
    } else {
      stale.push([slug, hash]);
    }
  }
  if (stale.length) {
    const problems = preflight();
    if (problems.length) {
      console.error(`Can't bake, missing tools:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
      process.exit(1);
    }
    try {
      for (const [slug, hash] of stale) bakeHouse(slug, mode, hash);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  // Curtains aren't baked: every House gets its record's, fresh bake or not
  for (const slug of chosen) {
    if (stampHouse(PUBLIC_DIR, projectOrder.find((p) => p.slug === slug)!)) console.log(`${slug}: Curtains stamped`);
  }
}
