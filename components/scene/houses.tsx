"use client";

import { useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  Box3,
  Float32BufferAttribute,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
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
  interiorGlassMaterial,
  LIGHTMAP_INTENSITY,
  type GlazingRoom,
  patchLightmap,
  withDetail,
  type DetailTextures,
  type LightUniforms,
  type ReliefUniforms,
} from "@/components/scene/materials";
import { keyDirection, WINDOW } from "@/components/scene/palette";
import { Pines } from "@/components/scene/pines";
import { CASTER_LAYER, shadowUniforms, type ShadowUniforms } from "@/components/scene/shadow";
import { planUv, Terrain } from "@/components/scene/terrain";
import type { SceneLayout } from "@/content/schema";
import type { HouseExtras } from "@/lib/house/glb-contract";
import { BASIS_PATH, DRACO_PATH, houseAssets, type HouseAssets, type SceneHouse } from "@/lib/scene/assets";
import {
  DETAIL_MATERIALS,
  DETAIL_TILES,
  detailMaps,
  type DetailMaterial,
  type DetailSet,
} from "@/lib/scene/detail";
import { houseTransform } from "@/lib/scene/frame";
import type { Gesture } from "@/lib/scene/gesture";
import { plinthHeight, type PlinthRect } from "@/lib/scene/platform";
import type { SelectionStore } from "@/lib/scene/selection";

/** Environment reflection on the baked dielectrics: just enough for the bevels to catch the sky. */
const DIELECTRIC_ENVIRONMENT = 0.35;
/** Soffit downlights: small and far over the bloom threshold, so they read as points of light. */
const DOWNLIGHT = WINDOW.clone().multiplyScalar(14);
/** Parts that cast no shadow on the snow: the see-through glass, the lights, the plinth, which is the snow, and the room inside. */
const UNSHADOWED = new Set(["balustrade", "downlight", "plinth", "interior"]);
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
  /** Every window's glow, shared by the House's glazing, which hover and dim adjust. */
  glow: { value: number };
  /** The Interior, lit by its baked texture alone, which brightens and dims with the glow. */
  interior?: MeshBasicMaterial;
  downlight?: MeshBasicMaterial;
  /** Where the hover label points: just above the roof, in three.js axes. */
  anchor: Vector3;
};

/** What a frame adjusts on one House, and how far it is into its hover and its dim (0–1, eased). */
type Look = Pick<PreparedHouse, "slug" | "anchor" | "light" | "glow" | "interior" | "downlight"> & {
  hover: number;
  dim: number;
};

/**
 * The four baked Houses, placed from the Scene layout, standing on the live
 * terrain among the pines. With `shadows`, they and the pines cast the baked
 * shadow over the snow. Everything loads inside the Canvas's `<Suspense>`.
 *
 * Only a House's shell and glazing pick. Hovering a House, or the keyboard
 * focusing it, brightens its windows, and every frame `onLabel` gets the
 * point on screen its label points at (none when it is behind the camera). Pressing a House marks it
 * on the press under way, so a click selects it (the camera rig reads the
 * press), and the Houses left unselected dim.
 */
export function Houses({
  layout,
  houses: sceneHouses,
  shadows,
  detail,
  store,
  gesture,
  onLabel,
}: {
  layout: SceneLayout;
  /** The Houses to load, each with whether it has an Interior. */
  houses: SceneHouse[];
  shadows: boolean;
  /** The shared detail maps to tile over the shells, the plinths and the terrain. */
  detail: DetailSet;
  store: SelectionStore;
  /** The press under way, which the camera rig starts and resolves. */
  gesture: RefObject<Gesture | undefined>;
  /** Where the hovered or focused House's label goes. */
  onLabel: (at: LabelPoint | undefined) => void;
}) {
  const gl = useThree((s) => s.gl);
  const shadow = useMemo(() => shadowUniforms(), []);
  const slugs = sceneHouses.map((h) => h.slug);
  const assets = sceneHouses.map(houseAssets);

  const gltfs = useLoader(
    GLTFLoader,
    assets.map((a) => a.glb),
    (loader) => {
      loader.setMeshoptDecoder(MeshoptDecoder);
      loader.setDRACOLoader(dracoLoader());
    },
  );
  const maps = detailMaps(detail);
  const interiorUrls = assets.flatMap((a) => (a.interior ? [a.interior] : []));
  // one loader for all: the detail maps and the Interiors' textures share the lightmaps' transcoder
  const textures = useLoader(
    KTX2Loader,
    [...assets.flatMap(lightmapUrls), ...maps.map((m) => m.url), ...interiorUrls],
    (loader) => {
      loader.setTranscoderPath(BASIS_PATH).detectSupport(gl);
    },
  );
  const lightmapCount = assets.length * 4;

  const details = useMemo(() => {
    const byMaterial: Partial<Record<DetailMaterial, DetailTextures>> = {};
    const anisotropy = gl.capabilities.getMaxAnisotropy();
    maps.forEach((map, i) => {
      const texture = asDetail(textures[lightmapCount + i], DETAIL_TILES[map.material].metres, anisotropy);
      (byMaterial[map.material] ??= {})[map.kind] = texture;
    });
    return byMaterial;
    // maps follow the detail set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textures, detail, gl, lightmapCount]);
  const relief = useMemo<ReliefUniforms>(() => ({ reliefKey: { value: keyDirection(layout.north) } }), [layout.north]);
  const snow = useMemo(() => ({ maps: details.snow, relief }), [details, relief]);

  const houses = useMemo(() => {
    const prepared = slugs.map((slug, i) => {
      const [shellBase, shellSpill, plinthBase, plinthSpill] = textures.slice(i * 4, i * 4 + 4).map(asLightmap);
      const interior = assets[i].interior;
      return prepareHouse(
        slug,
        gltfs[i].scene,
        layout,
        {
          shell: { base: shellBase, spill: shellSpill },
          plinth: { base: plinthBase, spill: plinthSpill },
        },
        { details, relief },
        interior ? asInteriorTexture(textures[lightmapCount + maps.length + interiorUrls.indexOf(interior)]) : undefined,
        shadows ? shadow : undefined,
      );
    });
    const rects = prepared.map((h) => h.rect);
    prepared.forEach((h, i) => fitPlinth(h.plinth, rects, i));
    return prepared;
    // slugs and assets follow the houses
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltfs, textures, layout, shadow, shadows, details, relief]);

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
    looks.current = houses.map(({ slug, anchor, light, glow, interior, downlight }) => ({
      slug,
      anchor,
      light,
      glow,
      interior,
      downlight,
      hover: 0,
      dim: 0,
    }));
  }, [houses]);

  useFrame(({ camera, size }, dt) => {
    const { hovered, focused, selected } = store.get();
    for (const h of looks.current) {
      lookTo(h, hovered === h.slug || focused === h.slug, !!selected && selected !== h.slug, dt);
    }

    // the pointer's House wins the label over the keyboard's
    const named = hovered ?? focused;
    const house = looks.current.find((h) => h.slug === named);
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
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (gesture.current) gesture.current = { ...gesture.current, slug };
    },
  });

  return (
    <>
      {houses.map((h) => (
        <primitive key={h.slug} object={h.root} dispose={null} {...pickHandlers(h.slug)} />
      ))}
      <Terrain plinths={rects} north={layout.north} shadow={shadows ? shadow : undefined} snow={snow} />
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

/** The Interior's baked light, colours and all, on its only UV set. */
function asInteriorTexture(texture: Texture): Texture {
  texture.channel = 0;
  texture.colorSpace = LinearSRGBColorSpace;
  return texture;
}

/**
 * A detail map tiled every `metres` on the first UV set, which is in metres.
 * KTX2Loader has already set its colour space from the file. Anisotropic
 * filtering keeps boards on a wall seen at a glancing angle from blurring.
 */
function asDetail(texture: Texture, metres: number, anisotropy: number): Texture {
  texture.channel = 0;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.setScalar(1 / metres);
  texture.anisotropy = anisotropy;
  return texture;
}

type Detail = { details: Partial<Record<DetailMaterial, DetailTextures>>; relief: ReliefUniforms };

const isDetailMaterial = (name: string): name is DetailMaterial => (DETAIL_MATERIALS as readonly string[]).includes(name);

/**
 * A fresh copy of a loaded House (the loader's cache outlives the Canvas),
 * placed, with its materials swapped by name for baked-light ones.
 */
function prepareHouse(
  slug: string,
  scene: Object3D,
  layout: SceneLayout,
  lightmaps: Lightmaps,
  detail: Detail,
  interiorTexture: Texture | undefined,
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
  const glow = { value: 1 };
  const byName = new Map<string, Material>();
  const material = (name: string, source: Material): Material => {
    let m = byName.get(name);
    if (!m) {
      m = makeMaterial(name, source as MeshStandardMaterial, lightmaps, detail, shellSpill, plinthSpill, interiorTexture, shadow);
      byName.set(name, m);
    }
    return m;
  };
  // each window looks into its own procedural room, or through glass into the Interior
  const panes: Material[] = [];
  const pane = (mesh: Mesh, part: string | undefined): Material => {
    const face = part?.startsWith("glazing:") ? extras.glazingFaces[part.slice("glazing:".length)] : undefined;
    const m = face?.interior
      ? interiorGlassMaterial(toHouse)
      : glazingMaterial(toHouse, glow, face ? { ...face.room, glass: face.size[1] } : terraceRoom(mesh, toHouse));
    panes.push(m);
    return m;
  };

  let plinth: Mesh | undefined;
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const source = o.material as Material;
    const part = partOf(o);
    o.material = source.name === "glazing" ? pane(o, part) : material(source.name, source);
    if (!UNSHADOWED.has(source.name)) o.layers.enable(CASTER_LAYER);
    if (source.name === "plinth") plinth = o;
    // the room draws after the House's other opaque parts, so the depth test drops what its walls hide
    if (source.name === "interior") o.renderOrder = 1;
    if (!pickable(part)) o.raycast = () => {};
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
    materials: [...byName.values(), ...panes],
    light: shellSpill,
    glow,
    interior: byName.get("interior") as MeshBasicMaterial | undefined,
    downlight: byName.get("downlight") as MeshBasicMaterial | undefined,
    anchor,
  };
}

/** Nominal depth of the room behind a terrace's glass, which the record doesn't describe. */
const TERRACE_ROOM_DEPTH = 5;

/**
 * The procedural room behind a terrace's glazed back wall, which isn't a
 * Glazing Face and has no room in the extras: as wide and high as its glass.
 */
function terraceRoom(mesh: Mesh, toHouse: Matrix4): GlazingRoom {
  const box = new Box3()
    .setFromBufferAttribute(mesh.geometry.getAttribute("position") as Float32BufferAttribute)
    .applyMatrix4(toHouse.clone().multiply(mesh.matrixWorld));
  const height = box.max.y - box.min.y;
  const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  return { size: [width, height, TERRACE_ROOM_DEPTH], sill: 0, glass: height };
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
  h.glow.value = (1 + (HOVER.glow - 1) * h.hover) * dim;
  h.interior?.color.setScalar(h.glow.value);
  h.downlight?.color.copy(DOWNLIGHT).multiplyScalar(dim);
}

/** `value` eased toward `target` over a frame, with time constant `tau`. */
const ease = (value: number, target: number, dt: number, tau: number) =>
  value + (target - value) * (1 - Math.exp(-dt / tau));

function makeMaterial(
  name: string,
  source: MeshStandardMaterial,
  lightmaps: Lightmaps,
  { details, relief }: Detail,
  shellSpill: LightUniforms,
  plinthSpill: LightUniforms,
  interiorTexture: Texture | undefined,
  shadow: ShadowUniforms | undefined,
): Material {
  switch (name) {
    case "interior":
      // baked with its colours, and lit by nothing else
      return new MeshBasicMaterial({ map: interiorTexture });
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
      // the snow normal, tiled in world plan metres as on the terrain (`fitPlinth`)
      const m = withDetail(baked(source, lightmaps.plinth.base, 0), "snow", details.snow);
      // wins the depth test over the terrain sunk just under it
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -4;
      patchLightmap(m, lightmaps.plinth.spill, plinthSpill, { edgeFade: true, shadow, relief });
      return m;
    }
    default: {
      // concrete, stone, timber, metal, snow: the builder's own colours, lit by the bake, and
      // all but metal with the shared detail maps over them
      const m = baked(source, lightmaps.shell.base, name === "metal" ? 1 : DIELECTRIC_ENVIRONMENT);
      if (isDetailMaterial(name)) withDetail(m, name, details[name]);
      patchLightmap(m, lightmaps.shell.spill, shellSpill, { relief });
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

/**
 * Bends the plinth's outer band onto the slope (`lib/scene/platform.ts`), and
 * maps its first UV set to world plan metres, as the terrain's is, so the
 * snow's detail normal runs across its edge unbroken.
 */
function fitPlinth(plinth: Mesh, rects: PlinthRect[], index: number) {
  const source = plinth.geometry.getAttribute("position");
  const positions = new Float32Array(source.count * 3);
  const uvs = new Float32Array(source.count * 2);
  const toLocal = plinth.matrixWorld.clone().invert();
  const p = new Vector3();
  for (let i = 0; i < source.count; i++) {
    p.fromBufferAttribute(source, i).applyMatrix4(plinth.matrixWorld);
    p.y = plinthHeight(rects, index, p.x, p.z, p.y);
    uvs.set(planUv(p.x, p.z), i * 2);
    p.applyMatrix4(toLocal).toArray(positions, i * 3);
  }
  plinth.geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  plinth.geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  plinth.geometry.deleteAttribute("normal");
  plinth.geometry.computeVertexNormals();
  plinth.geometry.computeBoundingBox();
  plinth.geometry.computeBoundingSphere();
}
