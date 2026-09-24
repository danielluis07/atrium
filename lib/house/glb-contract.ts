import type { Project, SceneLayout } from "@/content/schema";
import { faceNormal, glazingFaces, levelElevations, openingExtent, verticalExtent } from "@/lib/house/derive";
import { SCHEMA_VERSION } from "@/lib/house/schema";

/**
 * The GLB contract from `docs/design/house-schema.md`: what the builder hands
 * back to the Scene for one House. `checkGlbContract` compares a baked GLB
 * with the House record it was baked from. It is the one guard over the
 * Python builder, which is verified through its outputs.
 */

export const MATERIALS = [
  "concrete",
  "stone",
  "timber",
  "metal",
  "snow",
  "glazing",
  "balustrade",
  "downlight",
  "plinth",
] as const;

/** Which materials each node may carry. */
const NODE_MATERIALS: Record<string, readonly string[]> = {
  shell: ["concrete", "stone", "timber", "metal", "snow"],
  glazing: ["glazing"],
  // a terrace's glazed back wall isn't a Glazing Face, so it rides with the balustrade glass
  balustrade: ["balustrade", "glazing"],
  downlights: ["downlight"],
  plinth: ["plinth"],
};

type Vec3 = [number, number, number];

/** What the builder writes to the root node's extras. */
export type HouseExtras = {
  schemaVersion: number;
  slug: string;
  mode: "draft" | "final";
  bakeHash: string;
  /** The GLB origin is the datum: the finished floor of `level`. The snow plinth sits at `plinth`. */
  datum: { level: string; plinth: number };
  /** Everything but the plinth, in glTF axes (y up, front +z). */
  bbox: { min: Vec3; max: Vec3 };
  /** `seen`: whether the overview or arc cameras see any of the Glazing Face. */
  glazingFaces: Record<string, { size: [number, number]; normal: Vec3; bearing: number; seen: boolean }>;
  /** Lightmap files beside the GLB, per node and layer. */
  lightmaps: Record<string, { base: string; spill: string }>;
};

/** The parts of a glTF JSON document the contract reads. */
export type Gltf = {
  scene?: number;
  scenes: { nodes: number[] }[];
  nodes: { name?: string; mesh?: number; children?: number[]; extras?: unknown }[];
  meshes: { primitives: { material?: number }[] }[];
  materials: { name?: string }[];
};

/** The JSON chunk of a binary glTF. */
export function readGlb(bytes: Uint8Array): Gltf {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB");
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new Error("GLB has no JSON chunk first");
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
}

const KTX2_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
/** Khronos Data Format colour model for UASTC HDR 4x4. */
export const KHR_DF_MODEL_UASTC_HDR_4X4 = 167;

export type Ktx2Header = { width: number; height: number; levels: number; colorModel: number };

/** The few KTX2 header fields the contract checks, or undefined when the bytes aren't KTX2. */
export function readKtx2Header(bytes: Uint8Array): Ktx2Header | undefined {
  if (bytes.byteLength < 80 || KTX2_IDENTIFIER.some((b, i) => bytes[i] !== b)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dfd = view.getUint32(48, true);
  return {
    width: view.getUint32(20, true),
    height: view.getUint32(24, true),
    levels: view.getUint32(40, true),
    // DFD: total size, then the basic block's vendor/type and version/size words, then the model byte
    colorModel: view.getUint8(dfd + 12),
  };
}

const TOLERANCE = 1e-3;
const near = (a: unknown, b: number) => typeof a === "number" && Math.abs(a - b) <= TOLERANCE;
const nearAll = (a: unknown, b: number[]) =>
  Array.isArray(a) && a.length === b.length && b.every((v, i) => near(a[i], v));
const show = (v: unknown) => JSON.stringify(v);

/** House frame (x right, y back, z up) to glTF (y up, front +z). */
export const toGltf = ([x, y, z]: readonly [number, number, number]): Vec3 => [x, z, y === 0 ? 0 : -y];

/** Node names the record implies: required, and allowed but not required. */
export function expectedNodes(project: Project): { required: string[]; optional: string[] } {
  const { house } = project;
  const glazing = house.openings.filter((o) => o.fill === "glazing").map((o) => `glazing:${o.name}`);
  const hasBalustrade = house.balustrades.length > 0 || house.openings.some((o) => o.fill === "terrace");
  return {
    required: ["shell", "plinth", ...glazing, ...(hasBalustrade ? ["balustrade"] : [])],
    // a soffit that the volumes below cover entirely gets no downlights
    optional: ["downlights"],
  };
}

/**
 * Every way a GLB fails to match its House record: nodes, materials and the
 * root extras. Given the current bake hash (`bakeHash` of the House's
 * export), a GLB baked from anything else is stale. Returns no issues when
 * it matches.
 */
export function checkGlbContract(
  gltf: Gltf,
  project: Project,
  layout: SceneLayout,
  { bakeHash }: { bakeHash?: string } = {},
): string[] {
  const issues: string[] = [];
  const { house, slug } = project;
  const rootName = `house:${slug}`;

  const sceneNodes = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? [];
  const roots = sceneNodes.map((i) => gltf.nodes[i]);
  const root = roots.find((n) => n?.name === rootName);
  if (!root || roots.length !== 1) {
    issues.push(`the scene should have one root node ${rootName}, found ${show(roots.map((n) => n?.name))}`);
    if (!root) return issues;
  }

  // Nodes
  const children = (root.children ?? []).map((i) => gltf.nodes[i]);
  const names = children.map((n) => n.name ?? "(unnamed)");
  const { required, optional } = expectedNodes(project);
  for (const name of required) if (!names.includes(name)) issues.push(`node ${name} is missing`);
  for (const name of names) {
    if (!required.includes(name) && !optional.includes(name)) issues.push(`node ${name} is not in the House record`);
  }
  if (new Set(names).size !== names.length) issues.push(`node names repeat: ${show(names)}`);

  // Materials
  for (const m of gltf.materials ?? []) {
    if (!(MATERIALS as readonly string[]).includes(m.name ?? "")) {
      issues.push(`material ${m.name ?? "(unnamed)"} is not in the material enum`);
    }
  }
  for (const node of children) {
    const kind = node.name?.startsWith("glazing:") ? "glazing" : (node.name ?? "");
    const allowed = NODE_MATERIALS[kind];
    if (node.mesh === undefined) {
      issues.push(`node ${node.name} has no mesh`);
      continue;
    }
    if (!allowed) continue;
    for (const p of gltf.meshes[node.mesh]?.primitives ?? []) {
      const material = p.material === undefined ? undefined : gltf.materials[p.material]?.name;
      if (!material || !allowed.includes(material)) {
        issues.push(`node ${node.name} uses material ${material ?? "(none)"}, expected one of ${allowed.join(", ")}`);
      }
    }
  }

  // Extras
  const extras = (root.extras ?? {}) as Partial<HouseExtras>;
  if (extras.schemaVersion !== SCHEMA_VERSION) {
    issues.push(`extras.schemaVersion is ${show(extras.schemaVersion)}, expected ${SCHEMA_VERSION}`);
  }
  if (extras.slug !== slug) issues.push(`extras.slug is ${show(extras.slug)}, expected ${slug}`);
  if (typeof extras.bakeHash !== "string" || !/^[0-9a-f]{64}$/.test(extras.bakeHash)) {
    issues.push(`extras.bakeHash ${show(extras.bakeHash)} is not a sha256 hex digest`);
  } else if (bakeHash && extras.bakeHash !== bakeHash) {
    issues.push(
      `extras.bakeHash is ${extras.bakeHash.slice(0, 12)}…, expected ${bakeHash.slice(0, 12)}…: the bake is stale, run \`bun run houses:bake ${slug}\``,
    );
  }
  if (extras.mode !== "draft" && extras.mode !== "final") {
    issues.push(`extras.mode is ${show(extras.mode)}, expected draft or final`);
  }

  const levels = levelElevations(house);
  const entrance = levels.find((l) => l.floor === 0)?.name;
  const solids = [...house.volumes, house.stone];
  const lowest = Math.min(...solids.map((s) => verticalExtent(house, s).bottom));
  if (extras.datum?.level !== entrance) issues.push(`extras.datum.level is ${show(extras.datum?.level)}, expected ${entrance}`);
  if (!near(extras.datum?.plinth, lowest)) issues.push(`extras.datum.plinth is ${show(extras.datum?.plinth)}, expected ${lowest}`);

  const { min, max } = extras.bbox ?? {};
  if (!Array.isArray(min) || !Array.isArray(max) || min.length !== 3 || max.length !== 3) {
    issues.push(`extras.bbox ${show(extras.bbox)} is not a min/max pair`);
  } else {
    for (const s of solids) {
      const { bottom, top } = verticalExtent(house, s);
      const a = toGltf([s.rect.x0, s.rect.y1, bottom]);
      const b = toGltf([s.rect.x1, s.rect.y0, top]);
      if (a.some((v, i) => v < min[i] - TOLERANCE) || b.some((v, i) => v > max[i] + TOLERANCE)) {
        issues.push(`extras.bbox doesn't contain ${s.name}`);
      }
    }
  }

  const faces = extras.glazingFaces ?? {};
  const expected = glazingFaces(house, { rotation: layout.houses[slug]?.rotation ?? 0, north: layout.north });
  for (const name of Object.keys(faces)) {
    if (!expected.some((g) => g.name === name)) issues.push(`extras.glazingFaces.${name} is not a Glazing Face in the record`);
  }
  for (const g of expected) {
    const face = faces[g.name];
    if (!face) {
      issues.push(`extras.glazingFaces.${g.name} is missing`);
      continue;
    }
    const opening = house.openings.find((o) => o.name === g.name)!;
    const { along, z } = openingExtent(house, opening);
    const size = [along[1] - along[0], z[1] - z[0]];
    const [nx, ny] = faceNormal[opening.face];
    const normal = toGltf([nx, ny, 0]);
    if (!nearAll(face.size, size)) issues.push(`extras.glazingFaces.${g.name}.size is ${show(face.size)}, expected ${show(size)}`);
    if (!nearAll(face.normal, normal)) issues.push(`extras.glazingFaces.${g.name}.normal is ${show(face.normal)}, expected ${show(normal)}`);
    if (!near(face.bearing, g.bearing)) issues.push(`extras.glazingFaces.${g.name}.bearing is ${show(face.bearing)}, expected ${g.bearing}`);
    if (typeof face.seen !== "boolean") issues.push(`extras.glazingFaces.${g.name}.seen is ${show(face.seen)}, expected true or false`);
  }

  for (const node of ["shell", "plinth"]) {
    for (const layer of ["base", "spill"] as const) {
      const file = extras.lightmaps?.[node]?.[layer];
      if (typeof file !== "string" || !file.endsWith(".ktx2")) {
        issues.push(`extras.lightmaps.${node}.${layer} ${show(file)} is not a .ktx2 file name`);
      }
    }
  }
  return issues;
}
