import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { projectOrder } from "@/content/projects";
import { lyngen } from "@/content/projects/lyngen";
import { sceneLayout } from "@/content/scene";
import type { Project } from "@/content/schema";
import { bakeHash, exportHouse } from "@/lib/house/export";
import {
  checkGlbContract,
  fullMipChain,
  KHR_DF_MODEL_UASTC_HDR_4X4,
  readGlb,
  readKtx2Header,
  type Gltf,
  type HouseExtras,
} from "@/lib/house/glb-contract";
import { builderVersion } from "@/scripts/bake-houses";

const HOUSES_DIR = "public/houses";
const glbPath = (slug: string) => join(HOUSES_DIR, slug, `${slug}.glb`);
const baked = projectOrder.filter((p) => existsSync(glbPath(p.slug)));
const load = (slug: string) => readGlb(new Uint8Array(readFileSync(glbPath(slug))));
const rootOf = (gltf: Gltf, slug: string) => gltf.nodes.find((n) => n.name === `house:${slug}`)!;
const extrasOf = (gltf: Gltf, slug: string) => rootOf(gltf, slug).extras as HouseExtras;
/** The hash a bake of this record would carry now. */
const currentHash = (project: Project) => bakeHash(exportHouse(project, sceneLayout), builderVersion());

describe("committed House GLBs", () => {
  test("every House is baked", () => {
    expect(baked.map((p) => p.slug)).toEqual(projectOrder.map((p) => p.slug));
  });

  for (const project of baked) {
    describe(project.name, () => {
      test("matches its House record", () => {
        expect(checkGlbContract(load(project.slug), project, sceneLayout, { bakeHash: currentHash(project) })).toEqual([]);
      });

      test("has its Interior's texture beside it as UASTC HDR KTX2, when it has an Interior", () => {
        const { interior } = extrasOf(load(project.slug), project.slug);
        expect(!!interior).toBe(project.house.volumes.some((v) => v.interior));
        if (!interior) return;
        const header = readKtx2Header(new Uint8Array(readFileSync(join(HOUSES_DIR, project.slug, interior.texture))));
        expect(header?.colorModel).toBe(KHR_DF_MODEL_UASTC_HDR_4X4);
        expect(header!.levels).toBe(fullMipChain(header!));
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

  test("fails when the bake is stale: the record changed since", () => {
    const project = structuredClone(lyngen) as Project;
    project.camera.azimuth += 10;
    const [issue] = checkGlbContract(fresh(), project, sceneLayout, { bakeHash: currentHash(project) });
    expect(issue).toMatch(/^extras\.bakeHash is [0-9a-f]{12}…, expected [0-9a-f]{12}…: the bake is stale, run `bun run houses:bake lyngen`$/);
  });

  test("fails when a Glazing Face has no seen flag, or the mode is unknown", () => {
    const gltf = fresh();
    const extras = extrasOf(gltf, "lyngen");
    delete (extras.glazingFaces["living-front"] as Partial<HouseExtras["glazingFaces"][string]>).seen;
    (extras as { mode: string }).mode = "preview";
    expect(check(gltf)).toEqual([
      "extras.mode is \"preview\", expected draft or final",
      "extras.glazingFaces.living-front.seen is undefined, expected true or false",
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

  test("fails when the shell has no first UV set for the detail maps", () => {
    const gltf = fresh();
    const shell = gltf.nodes.find((n) => n.name === "shell")!;
    const concrete = gltf.meshes[shell.mesh!].primitives.find((p) => gltf.materials[p.material!].name === "concrete")!;
    delete concrete.attributes!.TEXCOORD_0;
    // the glazing needs none
    const glass = gltf.nodes.find((n) => n.name === "glazing:hall-front")!;
    delete gltf.meshes[glass.mesh!].primitives[0].attributes!.TEXCOORD_0;
    expect(check(gltf)).toEqual(["node shell's concrete has no TEXCOORD_0 for the detail maps"]);
  });

  test("fails when a room doesn't match the record", () => {
    const gltf = fresh();
    extrasOf(gltf, "lyngen").glazingFaces["dining-front"].room = { size: [3.3, 3.3, 5], sill: 0 };
    expect(check(gltf)).toEqual([
      'extras.glazingFaces.dining-front.room is {"size":[3.3,3.3,5],"sill":0}, expected {"size":[5.4,3.5,8.1],"sill":0}',
    ]);
  });

  test("fails when a face into the Interior isn't marked, or one that isn't is", () => {
    const gltf = fresh();
    const faces = extrasOf(gltf, "lyngen").glazingFaces;
    faces["living-side"].interior = false;
    faces["dining-front"].interior = true;
    expect(check(gltf)).toEqual([
      "extras.glazingFaces.living-side.interior is false, expected true",
      "extras.glazingFaces.dining-front.interior is true, expected false",
    ]);
  });

  test("fails when the Interior is missing, elsewhere or of another kind, or has no texture", () => {
    const gltf = fresh();
    extrasOf(gltf, "lyngen").interior = { volume: "lower", kind: "bedroom", texture: "interior.exr" };
    expect(check(gltf)).toEqual([
      'extras.interior.volume is "lower", expected main',
      'extras.interior.kind is "bedroom", expected lounge',
      'extras.interior.texture "interior.exr" is not a .ktx2 file name',
    ]);
    gltf.nodes.find((n) => n.name === "interior")!.name = "room";
    expect(check(gltf)).toEqual(expect.arrayContaining(["node interior is missing", "node room is not in the House record"]));
  });

  test("fails when the room has no UV set for its texture", () => {
    const gltf = fresh();
    const room = gltf.nodes.find((n) => n.name === "interior")!;
    delete gltf.meshes[room.mesh!].primitives[0].attributes!.TEXCOORD_0;
    expect(check(gltf)).toEqual(["node interior has no TEXCOORD_0 for its baked texture"]);
  });

  test("fails on an Interior the record doesn't give", () => {
    const project = structuredClone(lyngen) as Project;
    delete project.house.volumes.find((v) => v.name === "main")!.interior;
    expect(check(fresh(), project)).toEqual([
      "node interior is not in the House record",
      "extras.glazingFaces.living-front.interior is true, expected false",
      "extras.glazingFaces.living-side.interior is true, expected false",
      'extras.interior is {"volume":"main","kind":"lounge","texture":"interior.ktx2"}, but the record has no Interior',
    ]);
  });

  test("fails on the wrong schema version, root or lightmaps", () => {
    const gltf = fresh();
    const extras = extrasOf(gltf, "lyngen");
    extras.schemaVersion = 0;
    extras.lightmaps.shell.spill = "lm-shell-spill.hdr";
    expect(check(gltf)).toEqual([
      "extras.schemaVersion is 0, expected 3",
      'extras.lightmaps.shell.spill "lm-shell-spill.hdr" is not a .ktx2 file name',
    ]);
    rootOf(gltf, "lyngen").name = "house:senja";
    expect(check(gltf)).toEqual(['the scene should have one root node house:lyngen, found ["house:senja"]']);
  });
});
