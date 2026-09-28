import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { projectOrder } from "@/content/projects";
import { kvaloya } from "@/content/projects/kvaloya";
import { lyngen } from "@/content/projects/lyngen";
import { reine } from "@/content/projects/reine";
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
    expect(front.room).toEqual({ depth: 9.1, height: 3.5, sill: 0, width: 6.6 });
    // the interior image looks out through living-front, on main's front
    expect(derived.interior).toMatchObject({ volume: "main", face: "front", floor: 0, ceiling: 3.5 });
    const bare = structuredClone(senja) as Project;
    for (const v of bare.house.volumes) delete v.interior;
    expect(JSON.parse(exportHouse(bare, sceneLayout)).derived.interior).toBeUndefined();
  });

  test("gives the other Interiors theirs too, and leaves them out of a House with one", () => {
    const { derived } = JSON.parse(exportHouse(senja, sceneLayout));
    expect(derived.interior).toMatchObject({ volume: "bar", face: "front", floor: 0, ceiling: 3.3 });
    expect(derived.otherInteriors).toEqual([
      { volume: "lower", face: "front", rect: { x0: -9.7, y0: -5.7, x1: 3.7, y1: 0.7 }, floor: -3.2, ceiling: 0 },
    ]);
    // so a House with one Interior keeps the bake hash it had before there could be several
    expect(exportHouse(kvaloya, sceneLayout)).not.toContain("otherInteriors");
  });

  test("gives a room behind a terrace the terrace's face, from the recess's glazed back wall", () => {
    const { derived } = JSON.parse(exportHouse(lyngen, sceneLayout));
    expect(derived.otherInteriors).toHaveLength(1);
    const [{ rect, ...frame }] = derived.otherInteriors;
    expect(frame).toEqual({ volume: "frame", face: "front", floor: 3.5, ceiling: 7.2 });
    for (const [k, v] of Object.entries({ x0: 5.3, y0: -3.4, x1: 12.3, y1: 5.1 })) expect(rect[k]).toBeCloseTo(v);
  });

  test("carries the Site Works as plan pieces, and a House without them keeps its JSON", () => {
    const { derived } = JSON.parse(exportHouse(lyngen, sceneLayout));
    expect(derived.site.walls.map((w: { name: string }) => w.name)).toEqual(["front", "west", "divider", "east"]);
    expect(derived.site.paths[0].runs).toHaveLength(5);
    expect(exportHouse({ ...reine, house: { ...reine.house, siteWorks: undefined } }, sceneLayout)).not.toContain('"site"');
  });

  test("leaves out the framing pines, which the Scene draws live", () => {
    const json = exportHouse(lyngen, sceneLayout);
    expect(sceneLayout.houses.lyngen.framing?.length).toBeGreaterThan(0);
    expect(json).not.toContain("framing");
    const bare = { ...sceneLayout, houses: { ...sceneLayout.houses, lyngen: { ...sceneLayout.houses.lyngen, framing: undefined } } };
    expect(exportHouse(lyngen, bare)).toBe(json);
  });

  test("leaves out the Curtains, which the builder never draws", () => {
    const json = exportHouse(lyngen, sceneLayout);
    expect(json).not.toContain("curtain");
    const bare = structuredClone(lyngen) as Project;
    for (const o of bare.house.openings) delete o.curtain;
    expect(exportHouse(bare, sceneLayout)).toBe(json);
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
