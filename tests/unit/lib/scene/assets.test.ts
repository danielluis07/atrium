import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { projectOrder } from "@/content/projects";
import { sceneProject } from "@/content/schema";
import { readGlb, type HouseExtras } from "@/lib/house/glb-contract";
import {
  BASIS_FILES,
  BASIS_PATH,
  DRACO_FILES,
  DRACO_PATH,
  GPU_BENCHMARKS_PATH,
  houseAssets,
  LIVE_PATHS,
  sceneDownloads,
  type LivePath,
} from "@/lib/scene/assets";
import { DETAIL_PATH, detailMaps } from "@/lib/scene/detail";

const publicFile = (url: string) => join("public", url);
const houses = projectOrder.map(sceneProject);

describe("the Scene's assets", () => {
  for (const house of houses) {
    const { slug } = house;
    test(`${slug}: the GLB's lightmaps and Interior texture are the files the Scene loads`, () => {
      const assets = houseAssets(house);
      const gltf = readGlb(new Uint8Array(readFileSync(publicFile(assets.glb))));
      const extras = gltf.nodes.find((n) => n.name === `house:${slug}`)?.extras as HouseExtras;
      for (const [node, layers] of Object.entries(assets.lightmaps)) {
        for (const [layer, url] of Object.entries(layers)) {
          expect(url).toBe(`/houses/${slug}/${extras.lightmaps[node][layer as "base" | "spill"]}`);
        }
      }
      expect(assets.interior).toBe(extras.interior && `/houses/${slug}/${extras.interior.texture}`);
    });
  }

  test("only a House with an Interior downloads its texture", () => {
    expect(houseAssets({ slug: "lyngen", interior: true }).interior).toBe("/houses/lyngen/interior.ktx2");
    expect(houseAssets({ slug: "lyngen", interior: false }).interior).toBeUndefined();
    const textures = sceneDownloads(houses, "lean").filter((u) => u.endsWith("/interior.ktx2"));
    expect(textures).toEqual(houses.filter((h) => h.interior).map((h) => `/houses/${h.slug}/interior.ktx2`));
  });

  for (const path of LIVE_PATHS) {
    test(`everything the ${path} Scene downloads is served from public/`, () => {
      const downloads = sceneDownloads(houses, path);
      expect(downloads.length).toBeGreaterThan(0);
      for (const url of downloads) {
        expect(url.startsWith("/")).toBe(true);
        expect({ url, exists: existsSync(publicFile(url)) }).toEqual({ url, exists: true });
      }
    });
  }

  test("each path downloads its own detail set, and only that", () => {
    const detail = (path: LivePath) => sceneDownloads(houses, path).filter((u) => u.startsWith(`${DETAIL_PATH}/`));
    expect(detail("target")).toEqual(detailMaps("full").map((m) => m.url));
    expect(detail("lean")).toEqual(detail("target"));
    expect(detail("mobile")).toEqual(detailMaps("half").map((m) => m.url));
  });

  test("the self-hosted decoders are the ones three ships", () => {
    const pairs = [
      ...BASIS_FILES.map((f) => [BASIS_PATH + f, `node_modules/three/examples/jsm/libs/basis/${f}`]),
      ...DRACO_FILES.map((f) => [DRACO_PATH + f, `node_modules/three/examples/jsm/libs/draco/gltf/${f}`]),
    ];
    for (const [served, shipped] of pairs) {
      const same = readFileSync(publicFile(served)).equals(readFileSync(shipped));
      expect({ served, same }).toEqual({ served, same: true });
    }
  });

  test("the self-hosted GPU benchmarks are the ones detect-gpu ships", () => {
    const shipped = "node_modules/detect-gpu/dist/benchmarks";
    const files = readdirSync(shipped).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    expect(readdirSync(publicFile(GPU_BENCHMARKS_PATH)).sort()).toEqual(files.sort());
    for (const f of files) {
      const same = readFileSync(publicFile(`${GPU_BENCHMARKS_PATH}/${f}`)).equals(readFileSync(join(shipped, f)));
      expect({ f, same }).toEqual({ f, same: true });
    }
  });
});
