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
  expectedNodes,
  fullMipChain,
  KHR_DF_MODEL_UASTC_HDR_4X4,
  readGlb,
  readKtx2Header,
  stampCurtains,
  writeGlb,
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

      test("has each Interior's texture beside it as UASTC HDR KTX2", () => {
        const { interior, otherInteriors = [] } = extrasOf(load(project.slug), project.slug);
        const rooms = [...(interior ? [interior] : []), ...otherInteriors];
        expect(rooms).toHaveLength(project.house.volumes.filter((v) => v.interior).length);
        for (const { texture } of rooms) {
          const header = readKtx2Header(new Uint8Array(readFileSync(join(HOUSES_DIR, project.slug, texture))));
          expect(header?.colorModel).toBe(KHR_DF_MODEL_UASTC_HDR_4X4);
          expect(header!.levels).toBe(fullMipChain(header!));
        }
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

  test("allows a site node only to a House whose record has Site Works", () => {
    expect(expectedNodes(lyngen).optional).toContain("site");
    const bare = structuredClone(lyngen) as Project;
    delete bare.house.siteWorks;
    expect(expectedNodes(bare).optional).not.toContain("site");
    expect(check(fresh(), bare)).toContain("node site is not in the House record");
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
    faces["living-front"].size = [6.6, 6.8];
    faces["study-side"].normal = [-1, 0, 0];
    faces["hall-front"].bearing = 10;
    expect(check(gltf)).toEqual([
      "extras.glazingFaces.hall-front.bearing is 10, expected 350",
      "extras.glazingFaces.living-front.size is [6.6,6.8], expected [6.6,3.5]",
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
    faces["living-front"].interior = false;
    faces["loft-front"].interior = true;
    expect(check(gltf)).toEqual([
      "extras.glazingFaces.living-front.interior is false, expected true",
      "extras.glazingFaces.loft-front.interior is true, expected false",
    ]);
  });

  test("fails when a Curtain isn't stamped, or doesn't match the record", () => {
    const gltf = fresh();
    const faces = extrasOf(gltf, "lyngen").glazingFaces;
    delete (faces["hall-front"] as Partial<HouseExtras["glazingFaces"][string]>).curtain;
    faces["dining-front"].curtain = false;
    faces["living-front"].curtain = true;
    expect(check(gltf)).toEqual([
      "extras.glazingFaces.hall-front.curtain is undefined, expected true: run `bun run houses:bake lyngen` to stamp it",
      "extras.glazingFaces.living-front.curtain is true, expected false: run `bun run houses:bake lyngen` to stamp it",
      "extras.glazingFaces.dining-front.curtain is false, expected true: run `bun run houses:bake lyngen` to stamp it",
    ]);
  });

  test("a stamp brings the Curtains in line with the record, and keeps the rest of the GLB", () => {
    const bytes = new Uint8Array(readFileSync(glbPath("lyngen")));
    const project = structuredClone(lyngen) as Project;
    project.house.openings.find((o) => o.name === "dining-front")!.curtain = false;
    const gltf = readGlb(bytes);
    expect(stampCurtains(gltf, project)).toBe(true);
    expect(stampCurtains(gltf, project)).toBe(false);
    const written = writeGlb(bytes, gltf);
    expect(written.byteLength % 4).toBe(0);
    expect(checkGlbContract(readGlb(written), project, sceneLayout, { bakeHash: currentHash(project) })).toEqual([]);
    // the binary chunk, after the JSON, is untouched
    const tail = (b: Uint8Array) => b.subarray(20 + new DataView(b.buffer, b.byteOffset).getUint32(12, true));
    expect(tail(written)).toEqual(tail(bytes));
  });

  test("fails when the Interior is missing, elsewhere or of another kind, or has no texture", () => {
    const gltf = fresh();
    extrasOf(gltf, "lyngen").interior = { volume: "lower", kind: "bedroom", texture: "interior.exr" };
    expect(check(gltf)).toEqual([
      'extras.interior.volume is "lower", expected main',
      'extras.interior.kind is "bedroom", expected lounge',
      'extras.interior.texture is "interior.exr", expected "interior.ktx2"',
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
      'extras.interior is {"volume":"main","kind":"lounge","texture":"interior.ktx2"}, but the record has no Interior',
    ]);
  });

  test("wants every other Interior in its own node, with its own texture", () => {
    const project = structuredClone(lyngen) as Project;
    project.house.volumes.find((v) => v.name === "lower")!.interior = { kind: "dining" };
    expect(check(fresh(), project)).toEqual([
      "node interior:lower is missing",
      "extras.glazingFaces.dining-front.interior is false, expected true",
      "extras.otherInteriors has 0 Interiors, expected 1 (lower)",
      "extras.otherInteriors[0].volume is undefined, expected lower",
      "extras.otherInteriors[0].kind is undefined, expected dining",
      'extras.otherInteriors[0].texture is undefined, expected "interior-lower.ktx2"',
    ]);
    // a copy of the hero's node and extras, renamed, stands in for the bake
    const gltf = fresh();
    const hero = gltf.nodes.find((n) => n.name === "interior")!;
    gltf.nodes.push({ ...hero, name: "interior:lower" });
    rootOf(gltf, "lyngen").children!.push(gltf.nodes.length - 1);
    const extras = extrasOf(gltf, "lyngen");
    extras.glazingFaces["dining-front"].interior = true;
    extras.otherInteriors = [{ volume: "lower", kind: "dining", texture: "interior-lower.ktx2" }];
    expect(check(gltf, project)).toEqual([]);
    delete gltf.meshes[hero.mesh!].primitives[0].attributes!.TEXCOORD_0;
    expect(check(gltf, project)).toEqual([
      "node interior has no TEXCOORD_0 for its baked texture",
      "node interior:lower has no TEXCOORD_0 for its baked texture",
    ]);
    expect(check(gltf)).toEqual(
      expect.arrayContaining([
        "node interior:lower is not in the House record",
        'extras.otherInteriors is [{"volume":"lower","kind":"dining","texture":"interior-lower.ktx2"}], but the record has one Interior at most',
      ]),
    );
  });

  test("fails on the wrong schema version, root or lightmaps", () => {
    const gltf = fresh();
    const extras = extrasOf(gltf, "lyngen");
    extras.schemaVersion = 0;
    extras.lightmaps.shell.spill = "lm-shell-spill.hdr";
    expect(check(gltf)).toEqual([
      "extras.schemaVersion is 0, expected 4",
      'extras.lightmaps.shell.spill "lm-shell-spill.hdr" is not a .ktx2 file name',
    ]);
    rootOf(gltf, "lyngen").name = "house:senja";
    expect(check(gltf)).toEqual(['the scene should have one root node house:lyngen, found ["house:senja"]']);
  });
});
