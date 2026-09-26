import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { projectOrder } from "@/content/projects";
import { lyngen } from "@/content/projects/lyngen";
import { senja } from "@/content/projects/senja";
import { sceneLayout } from "@/content/scene";
import type { Project } from "@/content/schema";
import { exportHouse, HouseExportError } from "@/lib/house/export";
import { SCHEMA_VERSION } from "@/lib/house/schema";
import { runExport } from "@/scripts/export-houses";

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "atrium-export-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** The same object with its keys in reverse order at every depth. */
function reversed<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reversed) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reversed(v)])) as T;
  }
  return value;
}

/** The Scene layout with only Lyngen placed, for exporting Lyngen on its own. */
const lyngenOnly = { ...sceneLayout, houses: { lyngen: sceneLayout.houses.lyngen } };

const withBadOpening = (): Project => {
  const project = structuredClone(lyngen) as Project;
  project.house.openings[0].width = 20;
  return project;
};

describe("exportHouse", () => {
  test("carries the schema version, placement, camera block and derived facts", () => {
    const json = JSON.parse(exportHouse(lyngen, sceneLayout));
    expect(json.schemaVersion).toBe(SCHEMA_VERSION);
    expect(json.slug).toBe("lyngen");
    expect(json.placement).toEqual({ position: [0, 0], rotation: 10, ground: 0, north: 180 });
    expect(json.camera).toEqual(lyngen.camera);
    expect(json.house.openings).toHaveLength(lyngen.house.openings.length);
    expect(json.derived.glazingFaces.map((f: { name: string }) => f.name)).toContain("living-front");
  });

  test("gives each Glazing Face its room, and the Interior its shell and the face it turns to", () => {
    const { derived } = JSON.parse(exportHouse(lyngen, sceneLayout));
    const front = derived.glazingFaces.find((f: { name: string }) => f.name === "living-front");
    expect(front.room).toEqual({ depth: 9.1, height: 6.8, sill: 0, width: 6.6 });
    // the interior image looks out through living-front, on main's front
    expect(derived.interior).toMatchObject({ volume: "main", face: "front", floor: 0, ceiling: 6.8 });
    const bare = structuredClone(senja) as Project;
    delete bare.house.volumes.find((v) => v.name === "bar")!.interior;
    expect(JSON.parse(exportHouse(bare, sceneLayout)).derived.interior).toBeUndefined();
  });

  test("the same input gives byte-identical output, whatever the key order", () => {
    const first = exportHouse(lyngen, sceneLayout);
    expect(exportHouse(structuredClone(lyngen), structuredClone(sceneLayout))).toBe(first);
    expect(exportHouse(reversed(lyngen), reversed(sceneLayout))).toBe(first);
  });

  test("refuses an invalid House and names the part", () => {
    expect(() => exportHouse(withBadOpening(), sceneLayout)).toThrow(HouseExportError);
    expect(() => exportHouse(withBadOpening(), sceneLayout)).toThrow(/opening garage: runs .* past the right edge/);
  });

  test("refuses a House the Scene layout doesn't place", () => {
    expect(() => exportHouse(lyngen, { ...sceneLayout, houses: {} })).toThrow(/placement/);
  });
});

describe("the export command", () => {
  test("writes one JSON file per House and exits 0", () => {
    const outDir = tempDir();
    const code = runExport({ records: projectOrder, layout: sceneLayout, outDir }, () => {});
    expect(code).toBe(0);
    expect(readdirSync(outDir).sort()).toEqual(["kvaloya.json", "lyngen.json", "reine.json", "senja.json"]);
    for (const project of projectOrder) {
      expect(readFileSync(join(outDir, `${project.slug}.json`), "utf8")).toBe(exportHouse(project, sceneLayout));
    }
  });

  test("exits non-zero, writes nothing and names the part when a House is invalid", () => {
    const outDir = join(tempDir(), "out");
    const lines: string[] = [];
    const code = runExport({ records: [withBadOpening()], layout: lyngenOnly, outDir }, (l) => lines.push(l));
    expect(code).toBe(1);
    expect(existsSync(outDir)).toBe(false);
    expect(lines.join("\n")).toMatch(/Lyngen House:\n {2}opening garage: runs/);
  });

  test("exits non-zero for an unknown slug", () => {
    const code = runExport(
      { records: [lyngen], layout: lyngenOnly, outDir: tempDir(), slugs: ["tromso"] },
      () => {},
    );
    expect(code).toBe(1);
  });

  test("runs from the command line", () => {
    const outDir = tempDir();
    const run = Bun.spawnSync(["bun", "scripts/export-houses.ts", "--out", outDir, "lyngen"]);
    expect(run.exitCode).toBe(0);
    expect(existsSync(join(outDir, "lyngen.json"))).toBe(true);
  });
});
