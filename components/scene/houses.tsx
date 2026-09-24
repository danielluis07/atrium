"use client";

import { useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  Box3,
  Float32BufferAttribute,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import {
  glazingMaterial,
  LIGHTMAP_INTENSITY,
  patchLightmap,
  type SpillUniforms,
} from "@/components/scene/materials";
import { WINDOW } from "@/components/scene/palette";
import { Terrain } from "@/components/scene/terrain";
import type { SceneLayout } from "@/content/schema";
import type { HouseExtras } from "@/lib/house/glb-contract";
import { BASIS_PATH, DRACO_PATH, houseAssets, type HouseAssets } from "@/lib/scene/assets";
import { houseTransform } from "@/lib/scene/frame";
import { plinthHeight, type PlinthRect } from "@/lib/scene/platform";

/** Environment reflection on the baked dielectrics: just enough for the bevels to catch the sky. */
const DIELECTRIC_ENVIRONMENT = 0.35;
/** Soffit downlights: small and far over the bloom threshold, so they read as points of light. */
const DOWNLIGHT = WINDOW.clone().multiplyScalar(14);

let draco: DRACOLoader | undefined;
const dracoLoader = () => (draco ??= new DRACOLoader().setDecoderPath(DRACO_PATH));

type Lightmaps = Record<keyof HouseAssets["lightmaps"], { base: Texture; spill: Texture }>;

type PreparedHouse = {
  slug: string;
  root: Object3D;
  plinth: Mesh;
  rect: PlinthRect;
  materials: Material[];
};

/**
 * The four baked Houses, placed from the Scene layout, standing on the live
 * terrain. Everything loads inside the Canvas's `<Suspense>`.
 */
export function Houses({ layout }: { layout: SceneLayout }) {
  const gl = useThree((s) => s.gl);
  const slugs = Object.keys(layout.houses);
  const assets = slugs.map(houseAssets);

  const gltfs = useLoader(
    GLTFLoader,
    assets.map((a) => a.glb),
    (loader) => {
      loader.setMeshoptDecoder(MeshoptDecoder);
      loader.setDRACOLoader(dracoLoader());
    },
  );
  const textures = useLoader(
    KTX2Loader,
    assets.flatMap(lightmapUrls),
    (loader) => {
      loader.setTranscoderPath(BASIS_PATH).detectSupport(gl);
    },
  );

  const houses = useMemo(() => {
    const prepared = slugs.map((slug, i) => {
      const [shellBase, shellSpill, plinthBase, plinthSpill] = textures.slice(i * 4, i * 4 + 4).map(asLightmap);
      return prepareHouse(slug, gltfs[i].scene, layout, {
        shell: { base: shellBase, spill: shellSpill },
        plinth: { base: plinthBase, spill: plinthSpill },
      });
    });
    const rects = prepared.map((h) => h.rect);
    prepared.forEach((h, i) => fitPlinth(h.plinth, rects, i));
    return prepared;
    // slugs follow the layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltfs, textures, layout]);

  useEffect(
    () => () => {
      for (const h of houses) {
        h.plinth.geometry.dispose();
        for (const m of h.materials) m.dispose();
      }
    },
    [houses],
  );

  const rects = useMemo(() => houses.map((h) => h.rect), [houses]);

  return (
    <>
      {houses.map((h) => (
        <primitive key={h.slug} object={h.root} dispose={null} />
      ))}
      <Terrain plinths={rects} />
    </>
  );
}

/** A House's lightmap files in load order: shell base, shell spill, plinth base, plinth spill. */
const lightmapUrls = (a: HouseAssets) => [
  a.lightmaps.shell.base,
  a.lightmaps.shell.spill,
  a.lightmaps.plinth.base,
  a.lightmaps.plinth.spill,
];

function asLightmap(texture: Texture): Texture {
  texture.channel = 1; // the GLB's second UV set
  texture.colorSpace = LinearSRGBColorSpace;
  return texture;
}

/**
 * A fresh copy of a loaded House (the loader's cache outlives the Canvas),
 * placed, with its materials swapped by name for baked-light ones.
 */
function prepareHouse(slug: string, scene: Object3D, layout: SceneLayout, lightmaps: Lightmaps): PreparedHouse {
  const root = scene.clone(true);
  const { position, rotationY } = houseTransform(layout.houses[slug]);
  root.position.set(...position);
  root.rotation.set(0, rotationY, 0);
  root.updateMatrixWorld(true);
  const toHouse = root.matrixWorld.clone().invert();

  // GLTFLoader strips `:` from object names (three reserves it for property paths) and keeps the original
  let node: Object3D | undefined;
  root.traverse((o) => {
    if (o.userData.name === `house:${slug}`) node = o;
  });
  const extras = node?.userData as HouseExtras | undefined;
  if (!extras?.datum) throw new Error(`${slug}.glb has no house:${slug} root with extras`);

  const shellSpill: SpillUniforms = { spillK: { value: 1 } };
  const plinthSpill: SpillUniforms = { spillK: shellSpill.spillK };
  const byName = new Map<string, Material>();
  const material = (name: string, source: Material): Material => {
    let m = byName.get(name);
    if (!m) {
      m = makeMaterial(name, source as MeshStandardMaterial, lightmaps, shellSpill, plinthSpill, toHouse);
      byName.set(name, m);
    }
    return m;
  };

  let plinth: Mesh | undefined;
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const source = o.material as Material;
    o.material = material(source.name, source);
    if (source.name === "plinth") plinth = o;
  });
  if (!plinth) throw new Error(`${slug}.glb has no plinth`);

  // the plinth is reshaped to meet the terrain, so it gets its own geometry
  plinth.geometry = plinth.geometry.clone();
  const box = new Box3().setFromBufferAttribute(plinth.geometry.getAttribute("position") as Float32BufferAttribute);
  box.applyMatrix4(toHouse.clone().multiply(plinth.matrixWorld));

  return {
    slug,
    root,
    plinth,
    rect: {
      origin: [position[0], position[2]],
      rotationY,
      min: [box.min.x, box.min.z],
      max: [box.max.x, box.max.z],
      low: position[1] + extras.datum.plinth,
    },
    materials: [...byName.values()],
  };
}

function makeMaterial(
  name: string,
  source: MeshStandardMaterial,
  lightmaps: Lightmaps,
  shellSpill: SpillUniforms,
  plinthSpill: SpillUniforms,
  toHouse: Matrix4,
): Material {
  switch (name) {
    case "glazing":
      return glazingMaterial(toHouse);
    case "balustrade":
      return new MeshStandardMaterial({
        color: "#d6e0ea",
        transparent: true,
        opacity: 0.16,
        roughness: 0.04,
        depthWrite: false,
      });
    case "downlight":
      return new MeshBasicMaterial({ color: DOWNLIGHT });
    case "plinth": {
      const m = baked(source, lightmaps.plinth.base, 0);
      // wins the depth test over the terrain sunk just under it
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -4;
      patchLightmap(m, lightmaps.plinth.spill, plinthSpill, { edgeFade: true });
      return m;
    }
    default: {
      // concrete, stone, timber, metal, snow: the builder's own colours, lit by the bake
      const m = baked(source, lightmaps.shell.base, name === "metal" ? 1 : DIELECTRIC_ENVIRONMENT);
      patchLightmap(m, lightmaps.shell.spill, shellSpill);
      return m;
    }
  }
}

function baked(source: MeshStandardMaterial, lightMap: Texture, envMapIntensity: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name: source.name,
    color: source.color,
    roughness: source.roughness,
    metalness: source.metalness,
    lightMap,
    lightMapIntensity: LIGHTMAP_INTENSITY,
    envMapIntensity,
  });
}

/** Bends the plinth's outer band onto the slope (`lib/scene/platform.ts`). */
function fitPlinth(plinth: Mesh, rects: PlinthRect[], index: number) {
  const source = plinth.geometry.getAttribute("position");
  const positions = new Float32Array(source.count * 3);
  const toLocal = plinth.matrixWorld.clone().invert();
  const p = new Vector3();
  for (let i = 0; i < source.count; i++) {
    p.fromBufferAttribute(source, i).applyMatrix4(plinth.matrixWorld);
    p.y = plinthHeight(rects, index, p.x, p.z, p.y);
    p.applyMatrix4(toLocal).toArray(positions, i * 3);
  }
  plinth.geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  plinth.geometry.deleteAttribute("normal");
  plinth.geometry.computeVertexNormals();
  plinth.geometry.computeBoundingBox();
  plinth.geometry.computeBoundingSphere();
}
