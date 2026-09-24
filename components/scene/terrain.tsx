"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferGeometry, Color, Float32BufferAttribute, MeshStandardMaterial } from "three";

import { skyLitMaterial } from "@/components/scene/materials";
import { bakeShadow, type ShadowUniforms } from "@/components/scene/shadow";
import { terrainHeight, type PlinthRect } from "@/lib/scene/platform";
import { WATER_LEVEL } from "@/lib/scene/terrain";

/** Grid lines per side. The grid is densest around the Houses and opens out toward the fog. */
const GRID = 257;
/** Snow, the builder's colour for the plinth, so the two match at the plinth's edge. */
const SNOW = new Color(0.82, 0.84, 0.86);
const WATER = new Color(0.004, 0.006, 0.01);

/** Plan positions for grid parameter t in [−1, 1], three.js axes: about 0.5–0.7 m apart near the Houses. */
const gridX = (t: number) => 90 * t + 510 * t ** 3;
// three's z is the layout's −y: from behind the ridge (−z) down to below the shore, under the fjord
const gridZ = (t: number) => -(t < 0 ? 10 + 60 * t + 40 * t ** 3 : 10 + 90 * t + 600 * t ** 3);

function terrainGeometry(plinths: PlinthRect[]): BufferGeometry {
  const positions = new Float32Array(GRID * GRID * 3);
  for (let j = 0; j < GRID; j++) {
    const z = gridZ((2 * j) / (GRID - 1) - 1);
    for (let i = 0; i < GRID; i++) {
      const x = gridX((2 * i) / (GRID - 1) - 1);
      positions.set([x, terrainHeight(plinths, x, z), z], (j * GRID + i) * 3);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < GRID - 1; j++) {
    for (let i = 0; i < GRID - 1; i++) {
      const a = j * GRID + i;
      const b = a + 1;
      const c = a + GRID;
      const d = c + 1;
      // z runs toward −z as j grows, so wind each quad to face up
      index.push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The live snow slope, carved to each House's plinth, and the fjord below it.
 * With `shadow`, it bakes the shadow of the Houses and pines once they are in,
 * and takes it.
 */
export function Terrain({ plinths, north, shadow }: { plinths: PlinthRect[]; north: number; shadow?: ShadowUniforms }) {
  const get = useThree((s) => s.get);
  const geometry = useMemo(() => terrainGeometry(plinths), [plinths]);
  const snow = useMemo(() => skyLitMaterial(SNOW, shadow), [shadow]);
  const water = useMemo(() => new MeshStandardMaterial({ color: WATER, roughness: 0.08 }), []);

  useEffect(() => () => geometry.dispose(), [geometry]);
  // passive effects run after every layout effect, so the pines are placed by now
  useEffect(() => {
    if (!shadow) return;
    const { gl, scene } = get();
    return bakeShadow(gl, scene, geometry, north, shadow);
  }, [get, geometry, north, shadow]);
  useEffect(
    () => () => {
      snow.dispose();
      water.dispose();
    },
    [snow, water],
  );

  return (
    <>
      <mesh geometry={geometry} material={snow} raycast={() => null} />
      <mesh material={water} rotation-x={-Math.PI / 2} position-y={WATER_LEVEL} raycast={() => null}>
        <planeGeometry args={[4000, 4000]} />
      </mesh>
    </>
  );
}
