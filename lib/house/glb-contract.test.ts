import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { projectOrder } from "@/content/projects";
import { lyngen } from "@/content/projects/lyngen";
import { sceneLayout } from "@/content/scene";
import type { Project } from "@/content/schema";
import {
  checkGlbContract,
  KHR_DF_MODEL_UASTC_HDR_4X4,
  readGlb,
  readKtx2Header,
  type Gltf,
  type HouseExtras,
} from "@/lib/house/glb-contract";

const HOUSES_DIR = "public/houses";
const glbPath = (slug: string) => join(HOUSES_DIR, slug, `${slug}.glb`);
const baked = projectOrder.filter((p) => existsSync(glbPath(p.slug)));
const load = (slug: string) => readGlb(new Uint8Array(readFileSync(glbPath(slug))));
const rootOf = (gltf: Gltf, slug: string) => gltf.nodes.find((n) => n.name === `house:${slug}`)!;
const extrasOf = (gltf: Gltf, slug: string) => rootOf(gltf, slug).extras as HouseExtras;

describe("committed House GLBs", () => {
  test("Lyngen is baked", () => {
    expect(baked.map((p) => p.slug)).toContain("lyngen");
  });

  for (const project of baked) {
    describe(project.name, () => {
      test("matches its House record", () => {
        expect(checkGlbContract(load(project.slug), project, sceneLayout)).toEqual([]);
      });

      test("has its lightmaps beside it as UASTC HDR KTX2", () => {
        const { lightmaps } = extrasOf(load(project.slug), project.slug);
        for (const layers of Object.values(lightmaps)) {
          for (const file of Object.values(layers)) {
            const path = join(HOUSES_DIR, project.slug, file);
            expect(existsSync(path)).toBe(true);
            const header = readKtx2Header(new Uint8Array(readFileSync(path)));
            expect(header?.colorModel).toBe(KHR_DF_MODEL_UASTC_HDR_4X4);
            expect(header?.width).toBe(header?.height);
            expect(Math.log2(header!.width) % 1).toBe(0);
            expect(header!.levels).toBeGreaterThan(1);
          }
        }
      });
    });
  }
});

describe("checkGlbContract", () => {
  const fresh = () => structuredClone(load("lyngen"));
  const check = (gltf: Gltf, project: Project = lyngen) => checkGlbContract(gltf, project, sceneLayout);

  test("fails when a Glazing Face node is renamed", () => {
    const gltf = fresh();
    gltf.nodes.find((n) => n.name === "glazing:living-front")!.name = "glazing:living-room";
    expect(check(gltf)).toEqual(
      expect.arrayContaining([
        "node glazing:living-front is missing",
        "node glazing:living-room is not in the House record",
      ]),
    );
  });

  test("fails when a node is missing or unknown", () => {
    const gltf = fresh();
    gltf.nodes.find((n) => n.name === "plinth")!.name = "terrain";
    expect(check(gltf)).toEqual(
      expect.arrayContaining(["node plinth is missing", "node terrain is not in the House record"]),
    );
  });

  test("fails when the record gains a Glazing Face the GLB lacks", () => {
    const project = structuredClone(lyngen) as Project;
    project.house.openings.find((o) => o.name === "garage")!.fill = "glazing";
    expect(check(fresh(), project)).toEqual(
      expect.arrayContaining(["node glazing:garage is missing", "extras.glazingFaces.garage is missing"]),
    );
  });

  test("fails when a Glazing Face's extras don't match the record", () => {
    const gltf = fresh();
    const faces = extrasOf(gltf, "lyngen").glazingFaces;
    faces["living-front"].size = [6.6, 3.3];
    faces["study-side"].normal = [-1, 0, 0];
    faces["hall-front"].bearing = 10;
    expect(check(gltf)).toEqual([
      "extras.glazingFaces.hall-front.bearing is 10, expected 350",
      "extras.glazingFaces.living-front.size is [6.6,3.3], expected [6.6,6.8]",
      "extras.glazingFaces.study-side.normal is [-1,0,0], expected [1,0,0]",
    ]);
  });

  test("fails when a material is outside the enum or on the wrong node", () => {
    const gltf = fresh();
    gltf.materials.find((m) => m.name === "stone")!.name = "granite";
    const glass = gltf.nodes.find((n) => n.name === "glazing:hall-front")!;
    const concrete = gltf.materials.findIndex((m) => m.name === "concrete");
    gltf.meshes[glass.mesh!].primitives[0].material = concrete;
    expect(check(gltf)).toEqual(
      expect.arrayContaining([
        "material granite is not in the material enum",
        "node glazing:hall-front uses material concrete, expected one of glazing",
      ]),
    );
  });

  test("fails on the wrong schema version, root or lightmaps", () => {
    const gltf = fresh();
    const extras = extrasOf(gltf, "lyngen");
    extras.schemaVersion = 0;
    extras.lightmaps.shell.spill = "lm-shell-spill.hdr";
    expect(check(gltf)).toEqual([
      "extras.schemaVersion is 0, expected 1",
      'extras.lightmaps.shell.spill "lm-shell-spill.hdr" is not a .ktx2 file name',
    ]);
    rootOf(gltf, "lyngen").name = "house:senja";
    expect(check(gltf)).toEqual(['the scene should have one root node house:lyngen, found ["house:senja"]']);
  });
});
