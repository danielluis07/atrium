/**
 * The Houses' shared tiled detail maps: which exist, how far each repeat
 * reaches, and which set each Scene path loads. `bun run houses:detail`
 * generates them from this list; the Scene tiles them in metres on the
 * GLB's first UV set.
 */

import type { ScenePath } from "@/lib/scene/policy";

export const DETAIL_PATH = "/scene/detail";

export const DETAIL_MATERIALS = ["concrete", "stone", "timber", "snow"] as const;
export type DetailMaterial = (typeof DETAIL_MATERIALS)[number];
export type DetailKind = "albedo" | "normal" | "roughness";

/** Each material's tile: the metres one repeat covers, its full size in pixels, and its maps. */
export const DETAIL_TILES: Record<DetailMaterial, { metres: number; px: number; maps: readonly DetailKind[] }> = {
  concrete: { metres: 2, px: 1024, maps: ["albedo", "normal", "roughness"] },
  stone: { metres: 2, px: 1024, maps: ["albedo", "normal"] },
  timber: { metres: 1, px: 1024, maps: ["albedo", "normal"] },
  snow: { metres: 2, px: 1024, maps: ["normal"] },
};

/**
 * What a path loads: every map at full size, every map at half size (the
 * same tiles at half the texel density), or none.
 */
export type DetailSet = "full" | "half" | "none";

/**
 * The detail set of a Scene path. It is fixed for the path, never chosen per
 * rung: swapping textures as the Scene steps down would recompile its
 * shaders mid-flight. Target and Lean share the desktop ladder, so they share
 * the full set; the mobile Scene gets half-size tiles; the still downloads
 * none.
 */
export function detailSet(path: ScenePath): DetailSet {
  switch (path) {
    case "target":
    case "lean":
      return "full";
    case "mobile":
      return "half";
    case "still":
      return "none";
  }
}

export type DetailMap = {
  material: DetailMaterial;
  kind: DetailKind;
  /** Width and height in pixels. */
  px: number;
  url: string;
  /** Albedo is sRGB; normal and roughness are linear data. */
  srgb: boolean;
};

/** Every map in a set, in load order. */
export function detailMaps(set: DetailSet): DetailMap[] {
  if (set === "none") return [];
  return DETAIL_MATERIALS.flatMap((material) => {
    const tile = DETAIL_TILES[material];
    const px = set === "full" ? tile.px : tile.px / 2;
    return tile.maps.map((kind) => ({
      material,
      kind,
      px,
      url: `${DETAIL_PATH}/${material}-${kind}-${px}.ktx2`,
      srgb: kind === "albedo",
    }));
  });
}
