import { describe, expect, test } from "bun:test";

import { kvaloya } from "@/content/projects/kvaloya";
import { reine } from "@/content/projects/reine";
import { lyngen } from "@/content/projects/lyngen";
import { senja } from "@/content/projects/senja";
import type { House } from "@/lib/house/schema";
import { pathRuns, sitePlan, wallSegments } from "@/lib/house/site";
import { parseHouse, validateHouse, type HouseIssue } from "@/lib/house/validate";

const floorArea = lyngen.floorArea;
/** Reine without its Site Works: a House that has none. */
const bare = { ...reine.house, siteWorks: undefined } as House;

/** A copy of the Lyngen House with something in its Site Works changed. */
function edited(edit: (house: House & { siteWorks: NonNullable<House["siteWorks"]> }) => void): HouseIssue[] {
  const house = structuredClone(lyngen.house) as House & { siteWorks: NonNullable<House["siteWorks"]> };
  edit(house);
  return validateHouse(house, { floorArea });
}
const messages = (issues: HouseIssue[]) => issues.map((i) => `${i.part}: ${i.message}`);

describe("the Site Works field", () => {
  test("is optional, and every House's is valid", () => {
    expect(parseHouse(bare).ok).toBe(true);
    expect(validateHouse(reine.house, { floorArea: reine.floorArea })).toEqual([]);
    expect(validateHouse(lyngen.house, { floorArea })).toEqual([]);
    expect(validateHouse(senja.house, { floorArea: senja.floorArea })).toEqual([]);
    expect(validateHouse(kvaloya.house, { floorArea: kvaloya.floorArea })).toEqual([]);
  });

  test("keeps a Snow Shrub between 0.5 and 1.1 m across", () => {
    const house = structuredClone(lyngen.house) as House;
    house.siteWorks!.shrubs[0].size = 1.6;
    expect(parseHouse(house).ok).toBe(false);
  });
});

describe("sitePlan", () => {
  const plan = sitePlan(lyngen.house)!;

  test("is left out for a House without Site Works", () => {
    expect(sitePlan(bare)).toBeUndefined();
  });

  test("stands a wall as boxes between its gaps", () => {
    const front = lyngen.house.siteWorks!.walls.find((w) => w.name === "front")!;
    expect(wallSegments(front)).toEqual([
      { x0: -3.7, y0: -8.9, x1: 1.6, y1: -8.6 },
      { x0: 3.0, y0: -8.9, x1: 11.4, y1: -8.6 },
    ]);
    expect(plan.walls.find((w) => w.name === "west")!.axis).toBe("y");
  });

  test("divides a flight into equal treads down toward its face, between cheeks that fall from the wall", () => {
    const [steps] = plan.steps;
    expect(steps.wall).toBe("front");
    expect(steps.treads.map((t) => t.top)).toEqual([0, -0.15, -0.3]);
    // down toward the front: the first tread is the back one
    expect(steps.treads[0].rect.y1).toBeCloseTo(-8.6);
    expect(steps.treads[2].rect.y0).toBeCloseTo(-9.6);
    // each cheek runs from the wall's front face to the foot, falling from the wall's top
    const [left, right] = steps.cheeks;
    expect(left.rect).toEqual({ x0: 1.35, y0: -9.6, x1: 1.6, y1: -8.9 });
    expect(right.rect.x0).toBeCloseTo(3.0);
    // tops at x0y0, x1y0 (the foot), x1y1, x0y1 (at the wall)
    expect(left.tops[2]).toBeCloseTo(0.45);
    expect(left.tops[0]).toBeCloseTo(-0.05);
  });

  test("lays a path as a slab to each straight run and each corner, rising evenly along it", () => {
    const path = lyngen.house.siteWorks!.paths[0];
    const runs = pathRuns(path);
    // three runs and two corner squares, meeting edge to edge
    expect(runs).toHaveLength(5);
    const near = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v.toFixed(4)]));
    expect(near(runs[0])).toEqual({ x0: 1.7, y0: -10, x1: 2.9, y1: -9.6 });
    expect(near(runs[1])).toEqual({ x0: 1.7, y0: -11.2, x1: 2.9, y1: -10 });
    const [first] = plan.paths[0].runs;
    const last = plan.paths[0].runs.at(-1)!;
    expect(Math.max(...first.tops)).toBeLessThan(-0.4);
    expect(Math.max(...last.tops)).toBeCloseTo(0);
  });

  test("brings an apron up to its door in the recess, level with its floor", () => {
    const [apron] = plan.aprons;
    expect(apron).toMatchObject({ opening: "garage", level: 0 });
    for (const [k, v] of Object.entries({ x0: -11.8, y0: -6.3, x1: -7, y1: -4.76 })) {
      expect(apron.rect[k as keyof typeof apron.rect]).toBeCloseTo(v);
    }
  });
});

describe("checkSiteWorks", () => {
  test("refuses a piece inside a volume", () => {
    expect(messages(edited((h) => (h.siteWorks.walls[1].rect.y1 = -4.0)))).toContain("wall west: stands inside chimney");
  });

  test("refuses steps or a path across a wall where it has no gap", () => {
    expect(messages(edited((h) => delete h.siteWorks.walls[0].gaps))).toContain(
      "steps terrace-steps: crosses wall front where it has no gap",
    );
    expect(messages(edited((h) => (h.siteWorks.paths[0].line[0] = [-6, -9.6])))).toEqual(
      expect.arrayContaining(["path garage-path: run 2 of its line doesn't turn square from the one before"]),
    );
  });

  test("refuses a path that reaches no door, or runs off the square", () => {
    expect(
      messages(
        edited((h) => {
          h.siteWorks.aprons = [];
          h.siteWorks.paths[0].line[3] = [-9.4, -7.5];
        }),
      ),
    ).toContain("path garage-path: reaches no door: neither end of its line is on an apron, at a door, or on a terrace a door opens onto");
    expect(messages(edited((h) => (h.siteWorks.paths[0].line[1] = [2.0, -10.6])))).toContain(
      "path garage-path: run 1 of its line is not along x or y",
    );
  });

  test("takes a path that ends on a terrace only when a door opens onto it", () => {
    // Reine's path starts on the paving in front of its entry
    const house = structuredClone(reine.house) as House & { siteWorks: NonNullable<House["siteWorks"]> };
    expect(validateHouse(house, { floorArea: reine.floorArea })).toEqual([]);
    // paving that stops short of the entry leaves the path reaching no door
    house.siteWorks.terrace!.rect.x0 = -2.0;
    expect(messages(validateHouse(house, { floorArea: reine.floorArea }))).toContain(
      "path entry-path: reaches no door: neither end of its line is on an apron, at a door, or on a terrace a door opens onto",
    );
  });

  test("refuses an apron at anything but a door", () => {
    expect(messages(edited((h) => (h.siteWorks.aprons[0].opening = "hall-front")))).toContain(
      "apron at hall-front: stands at hall-front, a glazing, not a door",
    );
  });

  test("refuses a set-in light in a wall's end or in a gap", () => {
    expect(messages(edited((h) => (h.siteWorks.lights[0].face = "left")))).toContain(
      "light in front: sits in the left face, which is an end of the wall, not a long face",
    );
    expect(messages(edited((h) => (h.siteWorks.lights[0].at = 2.2)))).toContain("light in front: at 2.2 m is not in the wall's face");
  });

  test("refuses a wall that holds the snow but doesn't run along x", () => {
    expect(messages(edited((h) => (h.siteWorks.walls[1].lower = -0.3)))).toContain(
      "wall west: holds the snow behind it (lower), so it must run along x",
    );
  });

  test("keeps a Snow Shrub off the pieces, out from glazing and clear of a wall's base line", () => {
    const shrub = (at: [number, number]) => messages(edited((h) => (h.siteWorks.shrubs[0].at = at)));
    expect(shrub([-9.4, -8.0])).toContain("shrub 1: stands on path garage-path");
    expect(shrub([0, -5.0])).toContain("shrub 1: stands in front of Glazing Face living-front");
    expect(shrub([7.5, -9.5])).toContain("shrub 1: breaks the base line of wall front: in front of it, only by an end or a gap");
    expect(shrub([-8, -2])).toContain("shrub 1: stands inside wing");
  });
});
