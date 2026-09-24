/**
 * Validates every Project's House and writes the builder JSON, one file per
 * House. Writes nothing and exits non-zero if any House is invalid.
 *
 *   bun run houses:export [--out <dir>] [slug…]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createContent } from "@/content";
import { projectOrder } from "@/content/projects";
import { sceneLayout } from "@/content/scene";
import { exportHouse } from "@/lib/house/export";

export const DEFAULT_OUT_DIR = "scripts/houses/out";

type Options = { records: unknown[]; layout: unknown; outDir: string; slugs?: string[] };

/** Returns the exit code; logs what it wrote or why it refused. */
export function runExport(
  { records, layout, outDir, slugs = [] }: Options,
  log: (line: string) => void = console.log,
): number {
  let files: [string, string][];
  try {
    const content = createContent(records, layout);
    const unknown = slugs.filter((s) => !content.project(s));
    if (unknown.length) {
      log(`Unknown Project: ${unknown.join(", ")}`);
      return 1;
    }
    const chosen = content.projects().filter((p) => !slugs.length || slugs.includes(p.slug));
    files = chosen.map((p) => [`${p.slug}.json`, exportHouse(p, content.sceneLayout())]);
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
    return 1;
  }
  mkdirSync(outDir, { recursive: true });
  for (const [file, json] of files) {
    writeFileSync(join(outDir, file), json);
    log(`wrote ${join(outDir, file)}`);
  }
  return 0;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const out = args.indexOf("--out");
  const outDir = out >= 0 ? args[out + 1] : DEFAULT_OUT_DIR;
  const slugs = out >= 0 ? args.filter((_, i) => i !== out && i !== out + 1) : args;
  process.exit(runExport({ records: projectOrder, layout: sceneLayout, outDir, slugs }));
}
