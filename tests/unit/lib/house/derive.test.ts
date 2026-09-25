import { describe, expect, test } from "bun:test";

import { lyngen } from "@/content/projects/lyngen";
import { reine } from "@/content/projects/reine";
import {
  bearing,
  compassPoint,
  glazingFaces,
  grossFloorArea,
  INTERIOR_WALL,
  interiorRoom,
  interiorShell,
  interiorVolume,
  levelElevations,
  openingRecess,
  unionArea,
} from "@/lib/house/derive";
import type { House } from "@/lib/house/schema";

describe("the room behind a Glazing Face", () => {
  const room = (house: House, name: string) => {
    const r = interiorRoom(house, house.openings.find((o) => o.name === name)!);
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
  };

  test("a double-height volume is one room, floor to top, whichever Level its glass is on", () => {
    // the main volume: 8.0 × 9.4 m on L0, raised to 6.8 m; the front glass is recessed 0.3 m
    expect(room(lyngen.house, "living-front")).toEqual({ width: 6.6, height: 6.8, depth: 9.1, sill: 0 });
    // its side glass starts on L1, 3.9 m up the same room
    expect(room(lyngen.house, "living-side")).toEqual({ width: 2.4, height: 6.8, depth: 7.75, sill: 3.9 });
  });

  test("a volume of one Level that rises past it is one room to its top", () => {
    // the upper frame, on L1 (3.5 m) and raised to 7.2 m
    expect(room(lyngen.house, "study-side")).toEqual({ width: 6, height: 3.7, depth: 7.35, sill: 0.7 });
  });

  test("a volume over several Levels holds a room per Level", () => {
    const house = structuredClone(lyngen.house) as House;
    const main = house.volumes.find((v) => v.name === "main")!;
    main.to = "L1";
    delete main.top;
    expect(room(house, "living-side")).toEqual({ width: 2.4, height: 3.3, depth: 7.75, sill: 0.4 });
    // glass that spans both Levels looks into both
    expect(room(house, "living-front")).toEqual({ width: 6.6, height: 6.8, depth: 9.1, sill: 0 });
  });
});

describe("the Interior", () => {
  test("is in the volume that has one, if any", () => {
    expect(interiorVolume(lyngen.house)?.name).toBe("main");
    expect(interiorVolume(reine.house)).toBeUndefined();
  });

  test("its room shell is its volume inside the walls, floor to top", () => {
    const main = interiorVolume(lyngen.house)!;
    const { rect, floor, ceiling } = interiorShell(lyngen.house, main);
    expect(INTERIOR_WALL).toBe(0.3);
    expect(rect.x0).toBeCloseTo(-3.1);
    expect(rect.y0).toBeCloseTo(-4.1);
    expect(rect.x1).toBeCloseTo(4.3);
    expect(rect.y1).toBeCloseTo(4.7);
    expect({ floor, ceiling }).toEqual({ floor: 0, ceiling: 6.8 });
  });
});

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

describe("opening recesses", () => {
  const recess = (name: string) => openingRecess(lyngen.house, lyngen.house.openings.find((o) => o.name === name)!);

  test("a front opening runs from the face's left edge (−x) and cuts in toward +y", () => {
    const { rect, back } = recess("living-front");
    expect(rect.x0).toBeCloseTo(-2.6);
    expect(rect.x1).toBeCloseTo(4.0);
    expect(rect.y0).toBeCloseTo(-4.4);
    expect(rect.y1).toBeCloseTo(-4.1);
    expect(back[0][1]).toBeCloseTo(-4.1);
    expect(back[1][1]).toBeCloseTo(-4.1);
  });

  test("a left opening runs from the face's left edge seen from outside (+y) and cuts in toward +x", () => {
    const { rect, back } = recess("living-side");
    expect(rect.x0).toBeCloseTo(-3.4);
    expect(rect.x1).toBeCloseTo(-3.15);
    expect(rect.y0).toBeCloseTo(2.2);
    expect(rect.y1).toBeCloseTo(4.6);
    expect(back[0]).toEqual([-3.15, 4.6]);
  });

  test("a right opening runs from −y and cuts in toward −x", () => {
    const { rect } = recess("study-side");
    expect(rect.x0).toBeCloseTo(12.35);
    expect(rect.x1).toBeCloseTo(12.6);
    expect(rect.y0).toBeCloseTo(-2.0);
    expect(rect.y1).toBeCloseTo(4.0);
  });
});
