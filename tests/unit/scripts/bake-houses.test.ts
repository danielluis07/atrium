import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { lyngen } from "@/content/projects/lyngen";
import { sceneLayout } from "@/content/scene";
import type { Project, SceneLayout } from "@/content/schema";
import { bakeHash, exportHouse } from "@/lib/house/export";
import { bakeIsCurrent, builderVersion, PUBLIC_DIR, readExtras } from "@/scripts/bake-houses";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const HASH = "a".repeat(64);
const LIGHTMAPS = { shell: { base: "lm-shell-base.ktx2", spill: "lm-shell-spill.ktx2" } };

/** A bake directory holding one House's GLB (just its root node) and, unless left out, its lightmaps. */
function bakeDir(extras: Record<string, unknown>, { lightmaps = true } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "atrium-bake-"));
  dirs.push(dir);
  mkdirSync(join(dir, "x"));
  const json = new TextEncoder().encode(JSON.stringify({ nodes: [{ name: "house:x", extras }] }));
  const chunk = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20);
  chunk.set(json);
  const glb = new Uint8Array(20 + chunk.length);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, glb.length, true);
  view.setUint32(12, chunk.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(chunk, 20);
  writeFileSync(join(dir, "x", "x.glb"), glb);
  if (lightmaps) for (const file of Object.values(LIGHTMAPS.shell)) writeFileSync(join(dir, "x", file), "");
  return dir;
}

describe("bakeIsCurrent", () => {
  test("a bake from the same hash, in the same mode, with its lightmaps, stands", () => {
    const dir = bakeDir({ bakeHash: HASH, mode: "draft", lightmaps: LIGHTMAPS });
    expect(bakeIsCurrent(dir, "x", HASH, "draft")).toBe(true);
  });

  test("a bake from another hash doesn't", () => {
    const dir = bakeDir({ bakeHash: HASH, mode: "draft", lightmaps: LIGHTMAPS });
    expect(bakeIsCurrent(dir, "x", "b".repeat(64), "draft")).toBe(false);
  });

  test("a final bake satisfies draft, a draft bake doesn't satisfy final", () => {
    const final = bakeDir({ bakeHash: HASH, mode: "final", lightmaps: LIGHTMAPS });
    expect(bakeIsCurrent(final, "x", HASH, "draft")).toBe(true);
    const draft = bakeDir({ bakeHash: HASH, mode: "draft", lightmaps: LIGHTMAPS });
    expect(bakeIsCurrent(draft, "x", HASH, "final")).toBe(false);
  });

  test("a missing lightmap or GLB means a new bake", () => {
    const dir = bakeDir({ bakeHash: HASH, mode: "draft", lightmaps: LIGHTMAPS }, { lightmaps: false });
    expect(bakeIsCurrent(dir, "x", HASH, "draft")).toBe(false);
    expect(bakeIsCurrent(dir, "y", HASH, "draft")).toBe(false);
  });
});

describe("the bake cache key", () => {
  const hashOf = (project: Project, layout: SceneLayout = sceneLayout) =>
    bakeHash(exportHouse(project, layout), builderVersion());
  const changed = (edit: (p: Project) => void) => {
    const project = structuredClone(lyngen) as Project;
    edit(project);
    return project;
  };

  test("the committed Lyngen bake is current, so re-running skips it", () => {
    expect(bakeIsCurrent(PUBLIC_DIR, "lyngen", hashOf(lyngen), "draft")).toBe(true);
  });

  test("changing the record, placement, camera block or overview camera re-bakes it", () => {
    const committed = readExtras(PUBLIC_DIR, "lyngen")!.bakeHash;
    const layout = structuredClone(sceneLayout);
    layout.houses.lyngen.rotation += 5;
    const overview = structuredClone(sceneLayout);
    overview.overview.position[0] += 10;
    for (const hash of [
      hashOf(changed((p) => (p.house.openings[0].width -= 0.2))),
      hashOf(changed((p) => (p.camera.azimuth += 10))),
      hashOf(lyngen, layout),
      hashOf(lyngen, overview),
    ]) {
      expect(hash).not.toBe(committed);
      expect(bakeIsCurrent(PUBLIC_DIR, "lyngen", hash, "draft")).toBe(false);
    }
  });
});

describe("the bake command", () => {
  test("skips a House whose committed bake is current, without needing Blender", () => {
    const run = Bun.spawnSync([process.execPath, "scripts/bake-houses.ts", "lyngen"], { env: { ...process.env, PATH: "" } });
    expect(run.stdout.toString()).toMatch(/lyngen: up to date \((draft|final), [0-9a-f]{12}\), skipped/);
    expect(run.exitCode).toBe(0);
  });

  test("refuses an unknown mode", () => {
    const run = Bun.spawnSync(["bun", "scripts/bake-houses.ts", "--mode", "preview", "lyngen"]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr.toString()).toContain("Unknown mode preview: use draft or final");
  });
});
