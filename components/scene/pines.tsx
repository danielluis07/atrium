"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { skyLitMaterial } from "@/components/scene/materials";
import { CASTER_LAYER } from "@/components/scene/shadow";
import type { SceneLayout } from "@/content/schema";
import { oklchToLinear } from "@/lib/color";
import { toThree } from "@/lib/scene/frame";
import { placePines } from "@/lib/scene/pines";
import type { PlinthRect } from "@/lib/scene/platform";

/** Spruce in the dusk: a deep blue-green, nearly black against the snow. */
const NEEDLES = new Color(...oklchToLinear(0.3, 0.03, 190));
/** How far a trunk sinks into the snow, so it never floats on the slope. */
const SINK = 0.4;

/** One pine, 1 m tall with a 1 m lowest radius: tiers of cones on a short trunk. */
function pineGeometry(): BufferGeometry {
  const tiers: [base: number, top: number, radius: number][] = [
    [0.12, 0.52, 1],
    [0.32, 0.72, 0.74],
    [0.52, 0.9, 0.5],
    [0.7, 1, 0.3],
  ];
  const parts: BufferGeometry[] = [new CylinderGeometry(0.05, 0.07, 0.2, 5).translate(0, 0.1, 0)];
  for (const [base, top, radius] of tiers) {
    parts.push(new ConeGeometry(radius, top - base, 8).translate(0, (base + top) / 2, 0));
  }
  const merged = mergeGeometries(parts.map((p) => p.deleteAttribute("uv")));
  for (const p of parts) p.dispose();
  return merged;
}

/** The sparse pines on the slope and the ridge, one draw call. */
export function Pines({ plinths, overview }: { plinths: PlinthRect[]; overview: SceneLayout["overview"] }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => pineGeometry(), []);
  const material = useMemo(() => skyLitMaterial(NEEDLES), []);
  const pines = useMemo(() => {
    const [x, , z] = toThree(overview.position);
    return placePines(plinths, [x, z]);
  }, [plinths, overview]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const turn = new Quaternion();
    const up = new Vector3(0, 1, 0);
    for (const [i, p] of pines.entries()) {
      turn.setFromAxisAngle(up, p.turn);
      matrix.compose(new Vector3(p.x, p.y - SINK, p.z), turn, new Vector3(p.radius, p.height, p.radius));
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.layers.enable(CASTER_LAYER);
    mesh.computeBoundingSphere();
  }, [pines]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <instancedMesh
      ref={ref}
      // a new count needs a new mesh
      key={pines.length}
      args={[geometry, material, pines.length]}
      raycast={() => null}
    />
  );
}
