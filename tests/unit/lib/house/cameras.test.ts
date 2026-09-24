import { describe, expect, test } from "bun:test";

import { lyngen } from "@/content/projects/lyngen";
import { sceneLayout } from "@/content/scene";
import type { CameraBlock } from "@/content/schema";
import { arcCameras, heroCamera, orbitCamera, toHouseFrame, viewpoints } from "@/lib/house/cameras";

const straightOn: CameraBlock = { azimuth: 0, pitch: 30, distance: 20, lookAt: [0, 0, 2], arc: 50 };
const closeTo = (actual: number[], expected: number[]) =>
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 3));

describe("orbit cameras", () => {
  test("azimuth 0 stands straight in front of the House (−y), pitched up", () => {
    closeTo(heroCamera(straightOn), [0, -20 * Math.cos(Math.PI / 6), 2 + 10]);
  });

  test("azimuth swings clockwise seen from above: +90° is the House's left side", () => {
    closeTo(orbitCamera(straightOn, 90, 0), [-20, 0, 2]);
    closeTo(orbitCamera(straightOn, -90, 0), [20, 0, 2]);
  });

  test("the arc spans the hero angle ± arc at the pitch limits and the authored pitch", () => {
    const cameras = arcCameras({ ...straightOn, pitch: 14 });
    expect(cameras).toHaveLength(11 * 3);
    expect(cameras).toContainEqual(orbitCamera(straightOn, -50, 8));
    expect(cameras).toContainEqual(orbitCamera(straightOn, 50, 30));
    expect(cameras).toContainEqual(heroCamera({ ...straightOn, pitch: 14 }));
  });

  test("a narrow arc still ends on its limits, and a pitch at a limit isn't sampled twice", () => {
    const cameras = arcCameras({ ...straightOn, arc: 15 });
    expect(cameras).toHaveLength(5 * 2);
    expect(cameras).toContainEqual(orbitCamera(straightOn, 15, 8));
    expect(cameras).toContainEqual(orbitCamera(straightOn, -7.5, 30));
  });
});

describe("toHouseFrame", () => {
  test("undoes the placement's position, ground and counter-clockwise rotation", () => {
    const placement = { position: [10, 5] as [number, number], rotation: 90, ground: 3 };
    // turned 90° counter-clockwise, the House's front (−y) faces +x in the layout
    closeTo(toHouseFrame([20, 5, 3], placement), [0, -10, 0]);
    closeTo(toHouseFrame([10, 15, 7], placement), [10, 0, 4]);
  });
});

describe("viewpoints", () => {
  test("Lyngen is seen from the overview, out in front and above, then its arc", () => {
    const points = viewpoints(lyngen.camera, sceneLayout.houses.lyngen, sceneLayout);
    expect(points).toHaveLength(1 + 33);
    const [overview] = points;
    expect(overview[1]).toBeLessThan(-100);
    expect(overview[2]).toBeGreaterThan(20);
    expect(points.slice(1)).toEqual(arcCameras(lyngen.camera));
  });
});
