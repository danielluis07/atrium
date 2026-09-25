import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import {
  fullMipChain,
  KHR_DF_MODEL_ETC1S,
  KHR_DF_MODEL_UASTC,
  KHR_DF_TRANSFER_LINEAR,
  KHR_DF_TRANSFER_SRGB,
  readKtx2Header,
} from "@/lib/house/glb-contract";
import { DETAIL_MATERIALS, DETAIL_PATH, DETAIL_TILES, detailMaps, detailSet, type DetailSet } from "@/lib/scene/detail";
import type { ScenePath } from "@/lib/scene/policy";
import { DETAIL_DIR, ktxArgs } from "@/scripts/detail-maps";

const SETS: DetailSet[] = ["full", "half"];
const publicFile = (url: string) => join("public", url);

describe("the detail set of each Scene path", () => {
  test("is fixed per path: full on Target and Lean, half-size on mobile, none on the still", () => {
    const paths: ScenePath[] = ["target", "lean", "mobile", "still"];
    expect(Object.fromEntries(paths.map((p) => [p, detailSet(p)]))).toEqual({
      target: "full",
      lean: "full",
      mobile: "half",
      still: "none",
    });
  });

  test("the still downloads no detail map", () => {
    expect(detailMaps("none")).toEqual([]);
  });

  test("the full set has every map the materials name, and the half set the same maps at half size", () => {
    const full = detailMaps("full");
    const half = detailMaps("half");
    expect(full.map((m) => `${m.material}-${m.kind}`)).toEqual([
      "concrete-albedo",
      "concrete-normal",
      "concrete-roughness",
      "stone-albedo",
      "stone-normal",
      "timber-albedo",
      "timber-normal",
      "snow-normal",
    ]);
    expect(half.map((m) => `${m.material}-${m.kind}`)).toEqual(full.map((m) => `${m.material}-${m.kind}`));
    full.forEach((m, i) => {
      expect(m.px).toBe(DETAIL_TILES[m.material].px);
      expect(half[i].px).toBe(m.px / 2);
      expect(half[i].url).not.toBe(m.url);
    });
  });

  test("only albedo is sRGB", () => {
    for (const m of detailMaps("full")) expect({ m: m.url, srgb: m.srgb }).toEqual({ m: m.url, srgb: m.kind === "albedo" });
  });
});

describe("the committed detail maps", () => {
  for (const set of SETS) {
    for (const map of detailMaps(set)) {
      test(`${set}: ${basename(map.url)} is a mipmapped KTX2 in its colour space`, () => {
        expect(map.url.startsWith(`${DETAIL_PATH}/`)).toBe(true);
        expect(existsSync(publicFile(map.url))).toBe(true);
        const header = readKtx2Header(new Uint8Array(readFileSync(publicFile(map.url))));
        expect(header).toBeDefined();
        expect(header!.width).toBe(map.px);
        expect(header!.height).toBe(map.px);
        expect(header!.levels).toBe(fullMipChain(header!));
        expect(header!.transfer).toBe(map.srgb ? KHR_DF_TRANSFER_SRGB : KHR_DF_TRANSFER_LINEAR);
        expect(header!.colorModel).toBe(map.kind === "normal" ? KHR_DF_MODEL_UASTC : KHR_DF_MODEL_ETC1S);
      });
    }
  }

  test("public/scene/detail holds only the listed maps", () => {
    const listed = SETS.flatMap((s) => detailMaps(s).map((m) => basename(m.url))).sort();
    expect(readdirSync(DETAIL_DIR).sort()).toEqual(listed);
  });

  test("every material has a tile that is a power of two", () => {
    for (const material of DETAIL_MATERIALS) {
      const { px, metres } = DETAIL_TILES[material];
      expect(Math.log2(px) % 1).toBe(0);
      expect(metres).toBeGreaterThan(0);
    }
  });
});

describe("the encoder arguments", () => {
  const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];

  test("albedo is tagged sRGB, normal and roughness linear, never converted", () => {
    expect(flag(ktxArgs({ kind: "albedo", srgb: true }, "a.png", "a.ktx2"), "--assign-tf")).toBe("srgb");
    expect(flag(ktxArgs({ kind: "normal", srgb: false }, "n.png", "n.ktx2"), "--assign-tf")).toBe("linear");
    expect(flag(ktxArgs({ kind: "roughness", srgb: false }, "r.png", "r.ktx2"), "--format")).toBe("R8G8B8_UNORM");
  });

  test("normals are UASTC, the rest ETC1S, all with mipmaps", () => {
    const normal = ktxArgs({ kind: "normal", srgb: false }, "n.png", "n.ktx2");
    const albedo = ktxArgs({ kind: "albedo", srgb: true }, "a.png", "a.ktx2");
    expect(flag(normal, "--encode")).toBe("uastc");
    expect(flag(albedo, "--encode")).toBe("basis-lz");
    expect(normal).toContain("--generate-mipmap");
    expect(albedo).toContain("--generate-mipmap");
    expect(normal.slice(-2)).toEqual(["n.png", "n.ktx2"]);
  });
});
