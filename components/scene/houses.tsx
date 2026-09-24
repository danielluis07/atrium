"use client";

import { useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Box3,
  Float32BufferAttribute,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  Vector3,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import type { LabelPoint } from "@/components/scene/hover-label";
import {
  glazingMaterial,
  LIGHTMAP_INTENSITY,
  patchLightmap,
  type LightUniforms,
} from "@/components/scene/materials";
import { WINDOW } from "@/components/scene/palette";
import { Pines } from "@/components/scene/pines";
import { CASTER_LAYER, shadowUniforms, type ShadowUniforms } from "@/components/scene/shadow";
import { Terrain } from "@/components/scene/terrain";
import type { SceneLayout } from "@/content/schema";
import type { HouseExtras } from "@/lib/house/glb-contract";
import { BASIS_PATH, DRACO_PATH, houseAssets, type HouseAssets } from "@/lib/scene/assets";
import { CLICK_SLOP } from "@/lib/scene/camera";
import { houseTransform } from "@/lib/scene/frame";
import { plinthHeight, type PlinthRect } from "@/lib/scene/platform";
import type { SelectionStore } from "@/lib/scene/selection";

/** Environment reflection on the baked dielectrics: just enough for the bevels to catch the sky. */
const DIELECTRIC_ENVIRONMENT = 0.35;
/** Soffit downlights: small and far over the bloom threshold, so they read as points of light. */
const DOWNLIGHT = WINDOW.clone().multiplyScalar(14);
/** Parts that cast no shadow on the snow: the see-through glass, the lights, and the plinth, which is the snow. */
const UNSHADOWED = new Set(["balustrade", "downlight", "plinth"]);
/** Hovering a House: its window spill and its glazing brighten by these factors. */
const HOVER = { spill: 1.8, glow: 1.5 };
/** What the Houses left unselected keep of their light. */
const DIMMED = 0.35;
/** How quickly hover and dim ease in and out: their time constants, seconds. The dim keeps pace with the camera's flight. */
const EASE = { hover: 0.08, dim: 0.25 };
/** How far above a House's roof its hover label points, metres. */
const LABEL_RISE = 1.5;

let draco: DRACOLoader | undefined;
const dracoLoader = () => (draco ??= new DRACOLoader().setDecoderPath(DRACO_PATH));

type Lightmaps = Record<keyof HouseAssets["lightmaps"], { base: Texture; spill: Texture }>;

type PreparedHouse = {
  slug: string;
  root: Object3D;
  plinth: Mesh;
  rect: PlinthRect;
  materials: Material[];
  /** The shell's baked light, which hover and dim adjust. */
  light: LightUniforms;
  glazing?: ShaderMaterial;
  downlight?: MeshBasicMaterial;
  /** Where the hover label points: just above the roof, in three.js axes. */
  anchor: Vector3;
};

/** What a frame adjusts on one House, and how far it is into its hover and its dim (0–1, eased). */
type Look = Pick<PreparedHouse, "slug" | "anchor" | "light" | "glazing" | "downlight"> & { hover: number; dim: number };

/**
 * The four baked Houses, placed from the Scene layout, standing on the live
 * terrain among the pines. With `shadows`, they and the pines cast the baked
 * shadow over the snow. Everything loads inside the Canvas's `<Suspense>`.
 *
 * Only a House's shell and glazing pick. Hovering a House brightens its
 * windows, and every frame `onLabel` gets the point on screen its label
 * points at (none when it is behind the camera). Clicking a House selects
 * it, and the Houses left unselected dim.
 */
export function Houses({
  layout,
  shadows,
  store,
  onLabel,
}: {
  layout: SceneLayout;
  shadows: boolean;
  store: SelectionStore;
  /** Where the hovered House's label goes. */
  onLabel: (at: LabelPoint | undefined) => void;
}) {
  const gl = useThree((s) => s.gl);
  const shadow = useMemo(() => shadowUniforms(), []);
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
      return prepareHouse(
        slug,
        gltfs[i].scene,
        layout,
        {
          shell: { base: shellBase, spill: shellSpill },
          plinth: { base: plinthBase, spill: plinthSpill },
        },
        shadows ? shadow : undefined,
      );
    });
    const rects = prepared.map((h) => h.rect);
    prepared.forEach((h, i) => fitPlinth(h.plinth, rects, i));
    return prepared;
    // slugs follow the layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltfs, textures, layout, shadow, shadows]);

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
  const looks = useRef<Look[]>([]);
  const onScreen = useRef(new Vector3());
  useEffect(() => {
    looks.current = houses.map(({ slug, anchor, light, glazing, downlight }) => ({
      slug,
      anchor,
      light,
      glazing,
      downlight,
      hover: 0,
      dim: 0,
    }));
  }, [houses]);

  useFrame(({ camera, size }, dt) => {
    const { hovered, selected } = store.get();
    for (const h of looks.current) lookTo(h, hovered === h.slug, !!selected && selected !== h.slug, dt);

    const house = looks.current.find((h) => h.slug === hovered);
    if (!house) return;
    const p = onScreen.current.copy(house.anchor).project(camera);
    onLabel(p.z < 1 ? { x: ((p.x + 1) / 2) * size.width, y: ((1 - p.y) / 2) * size.height } : undefined);
  });

  const pickHandlers = (slug: string) => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      // only the nearest House under the pointer
      e.stopPropagation();
      if (e.pointerType !== "touch") store.dispatch({ type: "hover", slug });
    },
    onPointerOut: () => {
      if (store.get().hovered === slug) store.dispatch({ type: "hover" });
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta <= CLICK_SLOP) store.dispatch({ type: "select", slug });
    },
  });

  return (
    <>
      {houses.map((h) => (
        <primitive key={h.slug} object={h.root} dispose={null} {...pickHandlers(h.slug)} />
      ))}
      <Terrain plinths={rects} north={layout.north} shadow={shadows ? shadow : undefined} />
      <Pines plinths={rects} overview={layout.overview} />
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
function prepareHouse(
  slug: string,
  scene: Object3D,
  layout: SceneLayout,
  lightmaps: Lightmaps,
  shadow: ShadowUniforms | undefined,
): PreparedHouse {
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

  // the spill on the plinth brightens with the windows, but the plinth never dims: its edge is the open snow
  const shellSpill: LightUniforms = { spillK: { value: 1 }, lightDim: { value: 1 } };
  const plinthSpill: LightUniforms = { spillK: shellSpill.spillK, lightDim: { value: 1 } };
  const byName = new Map<string, Material>();
  const material = (name: string, source: Material): Material => {
    let m = byName.get(name);
    if (!m) {
      m = makeMaterial(name, source as MeshStandardMaterial, lightmaps, shellSpill, plinthSpill, toHouse, shadow);
      byName.set(name, m);
    }
    return m;
  };

  let plinth: Mesh | undefined;
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const source = o.material as Material;
    o.material = material(source.name, source);
    if (!UNSHADOWED.has(source.name)) o.layers.enable(CASTER_LAYER);
    if (source.name === "plinth") plinth = o;
    if (!pickable(partOf(o))) o.raycast = () => {};
  });
  if (!plinth) throw new Error(`${slug}.glb has no plinth`);

  // the plinth is reshaped to meet the terrain, so it gets its own geometry
  plinth.geometry = plinth.geometry.clone();
  const box = new Box3().setFromBufferAttribute(plinth.geometry.getAttribute("position") as Float32BufferAttribute);
  box.applyMatrix4(toHouse.clone().multiply(plinth.matrixWorld));

  const bounds = new Box3().setFromObject(root);
  const anchor = bounds.getCenter(new Vector3()).setY(bounds.max.y + LABEL_RISE);

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
    light: shellSpill,
    glazing: byName.get("glazing") as ShaderMaterial | undefined,
    downlight: byName.get("downlight") as MeshBasicMaterial | undefined,
    anchor,
  };
}

/** The GLB part a mesh belongs to (`shell`, `glazing:<name>`, `plinth`…): its nearest named node. */
function partOf(o: Object3D): string | undefined {
  for (let n: Object3D | null = o; n; n = n.parent) {
    if (typeof n.userData.name === "string") return n.userData.name;
  }
}

/** Only a House's shell and glazing select it; the balustrade glass, the lights and the plinth let the pointer through. */
const pickable = (part: string | undefined) => part === "shell" || !!part?.startsWith("glazing:");

/** Eases a House a frame toward its hover and dim, and lights it accordingly. */
function lookTo(h: Look, hovered: boolean, dimmed: boolean, dt: number) {
  h.hover = ease(h.hover, hovered ? 1 : 0, dt, EASE.hover);
  h.dim = ease(h.dim, dimmed ? 1 : 0, dt, EASE.dim);
  const dim = 1 - (1 - DIMMED) * h.dim;
  h.light.spillK.value = 1 + (HOVER.spill - 1) * h.hover;
  h.light.lightDim.value = dim;
  if (h.glazing) h.glazing.uniforms.uGlow.value = (1 + (HOVER.glow - 1) * h.hover) * dim;
  h.downlight?.color.copy(DOWNLIGHT).multiplyScalar(dim);
}

/** `value` eased toward `target` over a frame, with time constant `tau`. */
const ease = (value: number, target: number, dt: number, tau: number) =>
  value + (target - value) * (1 - Math.exp(-dt / tau));

function makeMaterial(
  name: string,
  source: MeshStandardMaterial,
  lightmaps: Lightmaps,
  shellSpill: LightUniforms,
  plinthSpill: LightUniforms,
  toHouse: Matrix4,
  shadow: ShadowUniforms | undefined,
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
      patchLightmap(m, lightmaps.plinth.spill, plinthSpill, { edgeFade: true, shadow });
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
