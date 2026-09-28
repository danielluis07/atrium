import { describe, expect, test } from "bun:test";

import { lyngen } from "@/content/projects/lyngen";
import { senja } from "@/content/projects/senja";
import {
  bearing,
  compassPoint,
  glazingFaces,
  grossFloorArea,
  INTERIOR_WALL,
  interiorRoom,
  interiors,
  interiorShell,
  interiorTexture,
  interiorVolumes,
  levelElevations,
  openingRecess,
  unionArea,
} from "@/lib/house/derive";
import type { House } from "@/lib/house/schema";

/** Lyngen as it was before its loft: the main volume double height, its front glass spanning both Levels. */
function doubleHeight(): House {
  const house = structuredClone(lyngen.house) as House;
  house.volumes = house.volumes.filter((v) => v.name !== "loft");
  house.volumes.find((v) => v.name === "main")!.top = 6.8;
  house.openings = house.openings.filter((o) => o.name !== "loft-front");
  house.openings.find((o) => o.name === "living-front")!.to = "L1";
  Object.assign(house.openings.find((o) => o.name === "loft-side")!, { name: "living-side", volume: "main" });
  return house;
}

describe("the room behind a Glazing Face", () => {
  const room = (house: House, name: string) => {
    const r = interiorRoom(house, house.openings.find((o) => o.name === name)!);
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
  };

  test("a double-height volume is one room, floor to top, whichever Level its glass is on", () => {
    // the main volume: 8.0 × 9.4 m on L0, raised to 6.8 m; the front glass is recessed 0.3 m
    expect(room(doubleHeight(), "living-front")).toEqual({ width: 6.6, height: 6.8, depth: 9.1, sill: 0 });
    // its side glass starts on L1, 3.9 m up the same room
    expect(room(doubleHeight(), "living-side")).toEqual({ width: 2.4, height: 6.8, depth: 7.75, sill: 3.9 });
  });

  test("a volume of one Level that rises past it is one room to its top", () => {
    // the upper frame, on L1 (3.5 m) and raised to 7.2 m
    expect(room(lyngen.house, "study-side")).toEqual({ width: 6, height: 3.7, depth: 7.35, sill: 0.7 });
  });

  test("a volume over several Levels holds a room per Level", () => {
    const house = doubleHeight();
    const main = house.volumes.find((v) => v.name === "main")!;
    main.to = "L1";
    delete main.top;
    expect(room(house, "living-side")).toEqual({ width: 2.4, height: 3.3, depth: 7.75, sill: 0.4 });
    // glass that spans both Levels looks into both
    expect(room(house, "living-front")).toEqual({ width: 6.6, height: 6.8, depth: 9.1, sill: 0 });
  });
});

describe("the Interiors", () => {
  test("are in the volumes that have one, if any", () => {
    expect(interiorVolumes(lyngen.house).map((v) => v.name)).toEqual(["main", "frame"]);
    expect(interiorVolumes(senja.house).map((v) => v.name)).toEqual(["lower", "bar"]);
    const bare = structuredClone(lyngen.house);
    for (const v of bare.volumes) delete v.interior;
    expect(interiorVolumes(bare)).toEqual([]);
    expect(interiors(bare, "living-front")).toEqual([]);
  });

  test("the hero Interior comes first, as it was named before there were several", () => {
    const [hero, ...others] = interiors(senja.house, "bar-end");
    expect(hero).toMatchObject({ hero: true, node: "interior", texture: "interior.ktx2" });
    expect(hero.volume.name).toBe("bar");
    expect(hero.window.name).toBe("bar-end");
    expect(others).toHaveLength(1);
    expect(others[0]).toMatchObject({ hero: false, node: "interior:lower", texture: "interior-lower.ktx2" });
    expect(others[0].window.name).toBe("lower-front");
    expect(interiors(lyngen.house, "living-front").map((i) => i.node)).toEqual(["interior", "interior:frame"]);
  });

  test("another Interior may turn to a terrace's glazed back wall, when it is its largest glass", () => {
    // the terrace's glass, 6.9 × 3.3 m, is larger than study-side's 6 × 2.4 m
    expect(interiors(lyngen.house, "living-front").map((i) => i.window.name)).toEqual(["living-front", "terrace"]);
    const house = structuredClone(lyngen.house) as House;
    house.openings.find((o) => o.name === "study-side")!.sill = 0;
    house.openings.find((o) => o.name === "study-side")!.head = 3.3;
    house.openings.find((o) => o.name === "study-side")!.width = 7;
    expect(interiors(house, "living-front").map((i) => i.window.name)).toEqual(["living-front", "study-side"]);
  });

  test("the hero Interior never turns to a terrace, which is no Glazing Face", () => {
    expect(interiors(lyngen.house, "terrace").map((i) => i.node)).toEqual(["interior:main", "interior:frame"]);
  });

  test("the hero Interior turns to the interior image's face, another to its largest glass", () => {
    const house = structuredClone(senja.house) as House;
    house.openings.push({ name: "lower-side", volume: "lower", face: "left", at: 1, width: 4.4, level: "L-1", depth: 0.25, fill: "glazing" });
    expect(interiors(house, "bar-end").map((i) => i.window.name)).toEqual(["bar-end", "lower-front"]);
    // bar-end is larger than bar-side, but the hero turns to the image's face
    expect(interiors(house, "bar-side").map((i) => i.window.name)).toEqual(["bar-side", "lower-front"]);
    // with the image in lower, lower is the hero, and bar turns to its larger window
    expect(interiors(house, "lower-side").map((i) => [i.node, i.window.name])).toEqual([
      ["interior", "lower-side"],
      ["interior:bar", "bar-end"],
    ]);
  });

  test("an Interior's texture is named after its node", () => {
    expect(interiorTexture("interior")).toBe("interior.ktx2");
    expect(interiorTexture("interior:lower")).toBe("interior-lower.ktx2");
  });

  test("its room shell is its volume inside the walls, floor to top", () => {
    const main = interiorVolumes(lyngen.house)[0];
    const { rect, floor, ceiling } = interiorShell(lyngen.house, main);
    expect(INTERIOR_WALL).toBe(0.3);
    expect(rect.x0).toBeCloseTo(-3.1);
    expect(rect.y0).toBeCloseTo(-4.1);
    expect(rect.x1).toBeCloseTo(4.3);
    expect(rect.y1).toBeCloseTo(4.7);
    // the lounge is on L0, under the loft
    expect({ floor, ceiling }).toEqual({ floor: 0, ceiling: 3.5 });
  });

  test("behind a terrace, its room shell starts at the recess's glazed back wall", () => {
    const frame = lyngen.house.volumes.find((v) => v.name === "frame")!;
    const { rect, floor, ceiling } = interiorShell(lyngen.house, frame);
    // the terrace is 1.6 m deep in the front face, at y = -5
    expect(rect.y0).toBeCloseTo(-3.4);
    expect([rect.x0, rect.x1, rect.y1].map((n) => +n.toFixed(6))).toEqual([5.3, 12.3, 5.1]);
    // the frame rises past L1 to 7.2 m
    expect({ floor, ceiling }).toEqual({ floor: 3.5, ceiling: 7.2 });
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
      ["loft-front", 350, "N"],
      ["loft-side", 80, "E"],
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

  test("Lyngen: three volumes on L0, the loft and the frame on L1", () => {
    expect(grossFloorArea(lyngen.house)).toBeCloseTo(68.4 + 75.2 + 57.12 + 75.2 + 79.04, 6);
  });

  test("a double-height room counts once", () => {
    expect(grossFloorArea(doubleHeight())).toBeCloseTo(68.4 + 75.2 + 57.12 + 79.04, 6);
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
    const { rect, back } = recess("loft-side");
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
