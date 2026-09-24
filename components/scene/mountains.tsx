"use client";

import { useEffect, useMemo } from "react";
import { BufferGeometry, Color, Float32BufferAttribute } from "three";

import { skyLitMaterial } from "@/components/scene/materials";
import { toThree } from "@/lib/scene/frame";
import { WATER_LEVEL } from "@/lib/scene/terrain";

/**
 * The distant mountains: two ranges of snowy peaks beyond the ridge and
 * round the sides of the fjord, far enough out that the fog takes most of
 * them and they read as pale shapes in the dusk. Built in the layout frame
 * (x, y, z up) around the Houses, as a band of rings in plan.
 */

/** Snow on the far slopes, a touch darker than the slope's, since it turns from the sky. */
const SNOW = new Color(0.62, 0.66, 0.72);
/** Plan bearings the ranges span, radians from +y (up the slope) toward +x. */
const SPAN = [-1.75, 1.75] as const;
const SEGMENTS = 240;
/** Rows across each range, from its foot in front, over its crest, to its foot behind. */
const ROWS = 12;

type Range = {
  /** Distance of the crest from the Houses, metres. */
  distance: number;
  /** Breadth of the range from foot to foot. */
  breadth: number;
  /** Crest height at its highest and lowest. */
  high: number;
  low: number;
  /** Phase of the crest's rise and fall, so the two ranges differ. */
  phase: number;
};

const RANGES: Range[] = [
  { distance: 340, breadth: 220, high: 150, low: 55, phase: 0 },
  { distance: 700, breadth: 380, high: 320, low: 140, phase: 2.3 },
];

/** Where the ranges' feet sit: under the terrain and the fjord, so no edge shows where they rise. */
const FOOT = WATER_LEVEL - 2;

/** The crest's height along a range: a few peaks, saddles between, jagged on top. */
function crest(range: Range, a: number): number {
  const t = a * 3 + range.phase;
  const swell = 0.5 + 0.3 * Math.sin(t) + 0.2 * Math.sin(2.7 * t + 1.3);
  const jag = 0.08 * Math.sin(11 * t + 0.4) + 0.05 * Math.sin(23 * t + 2.2);
  return range.low + (range.high - range.low) * Math.min(1, Math.max(0, swell + jag));
}

function rangeGeometry(range: Range, positions: number[], index: number[]) {
  const first = positions.length / 3;
  for (let s = 0; s <= SEGMENTS; s++) {
    const a = SPAN[0] + ((SPAN[1] - SPAN[0]) * s) / SEGMENTS;
    const peak = crest(range, a);
    for (let r = 0; r <= ROWS; r++) {
      const u = r / ROWS; // 0 at the near foot, 1 at the far foot
      const across = (u - 0.5) * range.breadth;
      const distance = range.distance + across;
      // a ridge profile, steeper on the near face, with gullies down it
      const shape = Math.pow(Math.sin(Math.PI * u), 1.6);
      const gully = 1 - 0.12 * Math.abs(Math.sin(a * 60 + u * 4 + range.phase)) * (1 - shape);
      const z = FOOT + (peak - FOOT) * shape * gully;
      positions.push(...toThree([distance * Math.sin(a), distance * Math.cos(a), z]));
    }
  }
  for (let s = 0; s < SEGMENTS; s++) {
    for (let r = 0; r < ROWS; r++) {
      const a = first + s * (ROWS + 1) + r;
      const b = a + ROWS + 1;
      // s runs toward +x and r away from the Houses: wound to face the sky
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
}

function mountainGeometry(): BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  for (const range of RANGES) rangeGeometry(range, positions, index);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** The distant ranges, one draw call. */
export function Mountains() {
  const geometry = useMemo(() => mountainGeometry(), []);
  const material = useMemo(() => skyLitMaterial(SNOW), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <mesh geometry={geometry} material={material} raycast={() => null} />;
}
