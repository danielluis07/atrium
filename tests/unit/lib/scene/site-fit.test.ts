import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Box3, Mesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

import { projectOrder } from "@/content/projects";
import { sceneLayout } from "@/content/scene";
import type { HouseExtras } from "@/lib/house/glb-contract";
import { houseTransform } from "@/lib/scene/frame";
import { plinthHeight, type PlinthRect } from "@/lib/scene/platform";

// Load the committed plinths as the Scene does, including meshopt's
// quantization transforms. The overlap depends on all four Houses.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const houses = await Promise.all(projectOrder.map(async ({ slug }) => {
  const bytes = readFileSync(`public/houses/${slug}/${slug}.glb`);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const root = gltf.scene.children[0];
  const extras = root.userData as HouseExtras;
  root.updateMatrixWorld(true);
  const plinth = root.getObjectByName("plinth")!;
  const bounds = new Box3().setFromObject(plinth);
  const { position, rotationY } = houseTransform(sceneLayout.houses[slug]);
  const rect: PlinthRect = {
    origin: [position[0], position[2]], rotationY,
    min: [bounds.min.x, bounds.min.z], max: [bounds.max.x, bounds.max.z],
    low: position[1] + extras.datum.plinth, bottom: position[1] + bounds.min.y,
  };
  return { root, rect };
}));
const rects = houses.map(h => h.rect);

describe("Reine's west wall in the live Scene", () => {
  const index = projectOrder.findIndex(p => p.slug === "reine");
  const { root, rect } = houses[index];
  const site = root.getObjectByName("site")!;

  test("both concrete pieces and their snow caps survive the bake", () => {
    const found = new Set<string>();
    site.traverse(o => {
      if (!(o instanceof Mesh)) return;
      const positions = o.geometry.getAttribute("position");
      const p = new Vector3();
      for (let i = 0; i < positions.count; i++) {
        p.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
        if (p.x < -8.04 || p.x > -7.66 || p.y < 0.2) continue;
        const piece = p.z >= 7 && p.z <= 9.04 ? "far" : p.z >= 4 && p.z <= 5.84 ? "near" : undefined;
        if (piece) {
          for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
            found.add(`${piece}:${material.name}`);
          }
        }
      }
    });
    expect([...found].sort()).toEqual(["far:concrete", "far:snow", "near:concrete", "near:snow"]);
  });

  test("the wall remains at its set-in lights' height where Lyngen's plinth overlaps", () => {
    // Use the cap and face vertices around the two lights at y=-8,
    // rather than just checking that the wall exists in the baked GLB.
    let vertices = 0;
    site.traverse(o => {
      if (!(o instanceof Mesh)) return;
      const positions = o.geometry.getAttribute("position");
      const p = new Vector3();
      const c = Math.cos(rect.rotationY), s = Math.sin(rect.rotationY);
      for (let i = 0; i < positions.count; i++) {
        p.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
        if (p.x < -8.04 || p.x > -7.66 || p.z < 7 || p.z > 8.9 || p.y < 0.2) continue;
        const x = rect.origin[0] + c * p.x + s * p.z;
        const z = rect.origin[1] - s * p.x + c * p.z;
        expect(plinthHeight(rects, index, x, z, rect.low) - rect.low).toBeCloseTo(0, 5);
        vertices++;
      }
    });
    expect(vertices).toBeGreaterThan(0);

    const faces = new Set<string>();
    root.getObjectByName("downlights")!.traverse(o => {
      if (!(o instanceof Mesh)) return;
      const positions = o.geometry.getAttribute("position");
      const p = new Vector3();
      for (let i = 0; i < positions.count; i++) {
        p.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
        if (Math.abs(p.z - 8) > 0.08 || p.y < 0.24 || p.y > 0.30) continue;
        // The slots at y=-8 sit on the two concrete faces, x=-8
        // and x=-7.7, just below the wall's 0.45 m top.
        if (Math.abs(p.x + 8) < 0.01) faces.add("left");
        if (Math.abs(p.x + 7.7) < 0.01) faces.add("right");
      }
    });
    expect([...faces].sort()).toEqual(["left", "right"]);
  });
});
