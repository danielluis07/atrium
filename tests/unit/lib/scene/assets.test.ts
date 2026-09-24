import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { projectOrder } from "@/content/projects";
import { readGlb, type HouseExtras } from "@/lib/house/glb-contract";
import { BASIS_FILES, BASIS_PATH, DRACO_FILES, DRACO_PATH, houseAssets, sceneDownloads } from "@/lib/scene/assets";

const publicFile = (url: string) => join("public", url);

describe("the Scene's assets", () => {
  for (const { slug } of projectOrder) {
    test(`${slug}: the GLB's lightmaps are the files the Scene loads`, () => {
      const assets = houseAssets(slug);
      const gltf = readGlb(new Uint8Array(readFileSync(publicFile(assets.glb))));
      const extras = gltf.nodes.find((n) => n.name === `house:${slug}`)?.extras as HouseExtras;
      for (const [node, layers] of Object.entries(assets.lightmaps)) {
        for (const [layer, url] of Object.entries(layers)) {
          expect(url).toBe(`/houses/${slug}/${extras.lightmaps[node][layer as "base" | "spill"]}`);
        }
      }
    });
  }

  test("everything the Scene downloads is served from public/", () => {
    const downloads = sceneDownloads(projectOrder.map((p) => p.slug));
    expect(downloads.length).toBeGreaterThan(0);
    for (const url of downloads) {
      expect(url.startsWith("/")).toBe(true);
      expect({ url, exists: existsSync(publicFile(url)) }).toEqual({ url, exists: true });
    }
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
});
