import { describe, expect, test } from "bun:test";

import { lyngen } from "@/content/projects/lyngen";
import {
  bearing,
  compassPoint,
  glazingFaces,
  grossFloorArea,
  levelElevations,
  unionArea,
} from "@/lib/house/derive";

describe("Glazing Face bearings", () => {
  test("with north along +y and no rotation, faces point the obvious way", () => {
    const o = { rotation: 0, north: 0 };
    expect(bearing([0, 1], o)).toBe(0);
    expect(bearing([1, 0], o)).toBe(90);
    expect(bearing([0, -1], o)).toBe(180);
    expect(bearing([-1, 0], o)).toBe(270);
  });

  test("with north down the slope (−y), a front face looks north", () => {
    expect(bearing([0, -1], { rotation: 0, north: 180 })).toBe(0);
    expect(bearing([1, 0], { rotation: 0, north: 180 })).toBe(270);
  });

  test("rotating a House counter-clockwise swings its front toward the west", () => {
    expect(bearing([0, -1], { rotation: 10, north: 180 })).toBe(350);
    expect(bearing([0, -1], { rotation: 90, north: 180 })).toBe(270);
    expect(bearing([0, -1], { rotation: -45, north: 180 })).toBe(45);
  });

  test("bearings snap to one of 8 compass points", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(350)).toBe("N");
    expect(compassPoint(44)).toBe("NE");
    expect(compassPoint(200)).toBe("S");
    expect(compassPoint(337.6)).toBe("N");
  });

  test("Lyngen's Glazing Faces, rotated 10° with north down the slope", () => {
    const faces = glazingFaces(lyngen.house, { rotation: 10, north: 180 });
    expect(faces.map((f) => [f.name, f.bearing, f.point])).toEqual([
      ["hall-front", 350, "N"],
      ["living-front", 350, "N"],
      ["living-side", 80, "E"],
      ["dining-front", 350, "N"],
      ["study-side", 260, "W"],
    ]);
  });
});

describe("Level elevations", () => {
  test("floor and top of each Level, lowest first", () => {
    expect(levelElevations(lyngen.house)).toEqual([
      { name: "L0", floor: 0, top: 3.5 },
      { name: "L1", floor: 3.5, top: 6.8 },
    ]);
  });
});

describe("gross floor area", () => {
  test("counts overlapping footprints once", () => {
    const area = unionArea([
      { x0: 0, y0: 0, x1: 4, y1: 4 },
      { x0: 2, y0: 2, x1: 6, y1: 6 },
    ]);
    expect(area).toBe(28);
  });

  test("Lyngen: three volumes on L0, the frame on L1, the double-height room once", () => {
    expect(grossFloorArea(lyngen.house)).toBeCloseTo(68.4 + 75.2 + 57.12 + 79.04, 6);
  });
});
