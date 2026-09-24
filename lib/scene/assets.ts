/**
 * Where the Scene's files are served from, all under `public/`: nothing is
 * fetched from a third party at runtime.
 */

const LIGHTMAP_NODES = ["shell", "plinth"] as const;
const LIGHTMAP_LAYERS = ["base", "spill"] as const;

export type LightmapNode = (typeof LIGHTMAP_NODES)[number];
export type LightmapLayer = (typeof LIGHTMAP_LAYERS)[number];

export type HouseAssets = {
  glb: string;
  lightmaps: Record<LightmapNode, Record<LightmapLayer, string>>;
};

/** A baked House: its GLB and the KTX2 lightmaps the builder writes beside it. */
export function houseAssets(slug: string): HouseAssets {
  const dir = `/houses/${slug}`;
  const layers = (node: LightmapNode) =>
    Object.fromEntries(LIGHTMAP_LAYERS.map((layer) => [layer, `${dir}/lm-${node}-${layer}.ktx2`])) as Record<
      LightmapLayer,
      string
    >;
  return {
    glb: `${dir}/${slug}.glb`,
    lightmaps: Object.fromEntries(LIGHTMAP_NODES.map((node) => [node, layers(node)])) as HouseAssets["lightmaps"],
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
 * Everything the Lean Scene downloads before its first frame, so the
 * downloads can start the moment the path is chosen, alongside the Scene's
 * own code.
 */
export function sceneDownloads(slugs: string[]): string[] {
  return [
    ...slugs.flatMap((slug) => {
      const { glb, lightmaps } = houseAssets(slug);
      return [glb, ...Object.values(lightmaps).flatMap((l) => Object.values(l))];
    }),
    ...BASIS_FILES.map((f) => BASIS_PATH + f),
  ];
}
