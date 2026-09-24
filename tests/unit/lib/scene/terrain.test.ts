import { describe, expect, test } from "bun:test";

import { sceneLayout } from "@/content/scene";
import { overviewFov, OVERVIEW_FOV } from "@/lib/scene/camera";
import { houseTransform, toThree } from "@/lib/scene/frame";
import { edgeDistance, plinthHeight, slopeHeight, terrainHeight, TERRAIN_SINK, type PlinthRect } from "@/lib/scene/platform";
import { groundHeight, WATER_LEVEL } from "@/lib/scene/terrain";

describe("the slope", () => {
  test("passes near every House's ground height", () => {
    for (const [slug, { position, ground }] of Object.entries(sceneLayout.houses)) {
      expect({ slug, off: Math.abs(groundHeight(...position) - ground) < 0.75 }).toEqual({ slug, off: true });
    }
  });

  test("falls into the fjord below the Houses and stays above it at the ridge", () => {
    expect(groundHeight(0, -60)).toBeLessThan(WATER_LEVEL);
    for (const x of [-200, -50, 0, 50, 200]) {
      expect(groundHeight(x, -60)).toBeLessThan(WATER_LEVEL);
      expect(groundHeight(x, 150)).toBeGreaterThan(10);
    }
  });

  test("hides nothing from the overview camera: every House's datum is above the ground in front of it", () => {
    const [cx, cy, cz] = sceneLayout.overview.position;
    for (const { position, ground } of Object.values(sceneLayout.houses)) {
      // sample the sight line from the camera to 1 m above the datum
      for (let t = 0.05; t < 0.9; t += 0.05) {
        const x = cx + (position[0] - cx) * t;
        const y = cy + (position[1] - cy) * t;
        const z = cz + (ground + 1 - cz) * t;
        expect(z).toBeGreaterThan(groundHeight(x, y));
      }
    }
  });
});

describe("the Scene frame", () => {
  test("turns the layout's z-up axes into three's y-up ones, as the builder turns a House for glTF", () => {
    expect(toThree([1, 2, 3])).toEqual([1, 3, -2]);
  });

  test("places a House's datum on its ground", () => {
    const { position, rotationY } = houseTransform({ position: [22, 26], rotation: 90, ground: 7.5 });
    expect(position).toEqual([22, 7.5, -26]);
    expect(rotationY).toBeCloseTo(Math.PI / 2);
  });
});

describe("the overview lens", () => {
  test("keeps its field of view on a wide screen and widens on a narrow one", () => {
    expect(overviewFov(16 / 9)).toBe(OVERVIEW_FOV);
    expect(overviewFov(4 / 3)).toBeGreaterThan(OVERVIEW_FOV);
    expect(overviewFov(1)).toBeGreaterThan(overviewFov(4 / 3));
  });
});

describe("plinths on the slope", () => {
  // two Houses whose plinths overlap, one set lower and turned
  const rects: PlinthRect[] = [
    { origin: [0, 0], rotationY: 0.17, min: [-24, -17], max: [24, 19], low: 0 },
    { origin: [42, 10], rotationY: -0.21, min: [-21, -20], max: [21, 21], low: -3 },
  ];
  const grid = function* () {
    for (let x = -80; x <= 110; x += 1.7) for (let z = -60; z <= 60; z += 1.3) yield [x, z] as const;
  };

  test("measures distance to a plinth's edge, positive inside", () => {
    const flat: PlinthRect = { origin: [10, 5], rotationY: 0, min: [-4, -2], max: [4, 2], low: 0 };
    expect(edgeDistance(flat, 10, 5)).toBeCloseTo(2);
    expect(edgeDistance(flat, 17, 5)).toBeCloseTo(-3);
    const turned = { ...flat, rotationY: Math.PI / 2 };
    // a quarter turn swaps the plinth's plan extents
    expect(edgeDistance(turned, 10, 5 + 3.9)).toBeCloseTo(0.1);
    expect(edgeDistance(turned, 10 + 1.9, 5)).toBeCloseTo(0.1);
  });

  test("keep their baked height in the middle and meet the slope at the edge", () => {
    expect(plinthHeight(rects, 0, 0, 0, 0)).toBeCloseTo(0);
    // the middle of the first plinth's left edge (local x −24, z 0), turned into the world
    const [ex, ez] = [-24 * Math.cos(0.17), 24 * Math.sin(0.17)];
    expect(edgeDistance(rects[0], ex, ez)).toBeCloseTo(0);
    expect(plinthHeight(rects, 0, ex, ez, 0)).toBeCloseTo(slopeHeight(ex, ez));
  });

  /** The plinth that shows at a point: the one it lies deepest inside, if any. */
  const showing = (x: number, z: number) => {
    const depths = rects.map((r) => edgeDistance(r, x, z));
    const deepest = Math.max(...depths);
    return deepest > 0 ? depths.indexOf(deepest) : -1;
  };

  test("the terrain stays under the plinth that shows", () => {
    for (const [x, z] of grid()) {
      const i = showing(x, z);
      if (i < 0) continue;
      const terrain = terrainHeight(rects, x, z);
      // any baked height at or above the plinth's lowest floor
      for (const baked of [rects[i].low, rects[i].low + 3.2]) {
        expect(plinthHeight(rects, i, x, z, baked)).toBeGreaterThanOrEqual(terrain + TERRAIN_SINK - 1e-9);
      }
    }
  });

  test("where two plinths overlap, the other one drops under the one that shows", () => {
    let overlaps = 0;
    for (const [x, z] of grid()) {
      const covering = rects.flatMap((r, i) => (edgeDistance(r, x, z) > 0 ? [i] : []));
      if (covering.length < 2) continue;
      overlaps++;
      const shown = plinthHeight(rects, showing(x, z), x, z, rects[showing(x, z)].low);
      for (const i of covering.filter((i) => i !== showing(x, z))) {
        expect(plinthHeight(rects, i, x, z, rects[i].low + 3.2)).toBeLessThan(shown);
      }
    }
    expect(overlaps).toBeGreaterThan(0);
  });

  test("the terrain is the plain slope away from the plinths", () => {
    for (const [x, z] of grid()) {
      if (rects.every((r) => edgeDistance(r, x, z) <= 0)) expect(terrainHeight(rects, x, z)).toBe(slopeHeight(x, z));
    }
  });
});
