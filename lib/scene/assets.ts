/**
 * Where the Scene's files are served from, all under `public/`: nothing is
 * fetched from a third party at runtime.
 */

import { detailMaps, detailSet } from "@/lib/scene/detail";
import type { ScenePath } from "@/lib/scene/policy";

/** A path that draws the live Scene. */
export type LivePath = Exclude<ScenePath, "still">;
export const LIVE_PATHS: readonly LivePath[] = ["target", "lean", "mobile"];

const LIGHTMAP_NODES = ["shell", "plinth"] as const;
const LIGHTMAP_LAYERS = ["base", "spill"] as const;

export type LightmapNode = (typeof LIGHTMAP_NODES)[number];
export type LightmapLayer = (typeof LIGHTMAP_LAYERS)[number];

/** Which House, and whether it has an Interior (a `SceneProject` is one). */
export type SceneHouse = { slug: string; interior: boolean };

export type HouseAssets = {
  glb: string;
  lightmaps: Record<LightmapNode, Record<LightmapLayer, string>>;
  /** The Interior's baked KTX2 texture, for a House with an Interior. */
  interior?: string;
};

/** A baked House: its GLB and the KTX2 lightmaps, and Interior texture, the builder writes beside it. */
export function houseAssets({ slug, interior }: SceneHouse): HouseAssets {
  const dir = `/houses/${slug}`;
  const layers = (node: LightmapNode) =>
    Object.fromEntries(LIGHTMAP_LAYERS.map((layer) => [layer, `${dir}/lm-${node}-${layer}.ktx2`])) as Record<
      LightmapLayer,
      string
    >;
  return {
    glb: `${dir}/${slug}.glb`,
    lightmaps: Object.fromEntries(LIGHTMAP_NODES.map((node) => [node, layers(node)])) as HouseAssets["lightmaps"],
    ...(interior ? { interior: `${dir}/interior.ktx2` } : {}),
  };
}

/** The Basis Universal transcoder for KTX2, copied from `three/examples/jsm/libs/basis`. */
export const BASIS_PATH = "/decoders/basis/";
export const BASIS_FILES = ["basis_transcoder.js", "basis_transcoder.wasm"] as const;
/** The Draco decoder for GLTFLoader, copied from `three/examples/jsm/libs/draco/gltf`. */
export const DRACO_PATH = "/decoders/draco/";
export const DRACO_FILES = ["draco_decoder.wasm", "draco_wasm_wrapper.js"] as const;

/** detect-gpu's benchmark data, copied from `detect-gpu/dist/benchmarks`. */
export const GPU_BENCHMARKS_PATH = "/detect-gpu";

/**
 * Everything a live Scene path downloads before its first frame, so the
 * downloads can start the moment the path is chosen, alongside the Scene's
 * own code: the Houses, the path's detail maps and the KTX2 transcoder.
 */
export function sceneDownloads(houses: SceneHouse[], path: LivePath): string[] {
  return [
    ...houseDownloads(houses),
    ...detailMaps(detailSet(path)).map((m) => m.url),
    ...BASIS_FILES.map((f) => BASIS_PATH + f),
  ];
}

/** The Houses' files alone: each GLB, its lightmaps and its Interior's texture. */
export function houseDownloads(houses: SceneHouse[]): string[] {
  return houses.flatMap((house) => {
    const { glb, lightmaps, interior } = houseAssets(house);
    return [glb, ...Object.values(lightmaps).flatMap((l) => Object.values(l)), ...(interior ? [interior] : [])];
  });
}
