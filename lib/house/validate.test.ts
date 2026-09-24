import { describe, expect, test } from "bun:test";

import { lyngen } from "@/content/projects/lyngen";
import type { House } from "@/lib/house/schema";
import { parseHouse, validateHouse, type HouseIssue } from "@/lib/house/validate";

const floorArea = lyngen.floorArea;

/** A copy of the Lyngen House with one thing broken. */
function broken(edit: (house: House) => void): House {
  const house = structuredClone(lyngen.house) as House;
  edit(house);
  return house;
}

const opening = (house: House, name: string) => house.openings.find((o) => o.name === name)!;
const parts = (issues: HouseIssue[]) => issues.map((i) => i.part);

describe("parseHouse", () => {
  test("accepts the Lyngen House", () => {
    expect(parseHouse(lyngen.house).ok).toBe(true);
  });

  test("names the part a shape error is in", () => {
    const house = structuredClone(lyngen.house) as Record<string, unknown>;
    (house.openings as { name: string; fill: string }[])[2].fill = "curtain";
    const result = parseHouse(house);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].part).toBe("openings.living-front.fill");
  });
});

describe("validateHouse", () => {
  test("accepts the Lyngen House", () => {
    expect(validateHouse(lyngen.house, { floorArea })).toEqual([]);
  });

  test("rejects overlapping openings on one face", () => {
    const issues = validateHouse(
      broken((h) => (opening(h, "hall-front").at = 5.0)),
      { floorArea },
    );
    expect(issues).toEqual([{ part: "opening hall-front", message: "overlaps opening garage" }]);
  });

  test("openings stacked on one face don't overlap", () => {
    const issues = validateHouse(
      broken((h) =>
        h.openings.push({ ...opening(h, "study-side"), name: "study-low", level: "L1", sill: 0, head: 0.5 }),
      ),
      { floorArea },
    );
    expect(issues).toEqual([]);
  });

  test("rejects an opening that runs past its face", () => {
    const issues = validateHouse(
      broken((h) => (opening(h, "dining-front").width = 6.5)),
      { floorArea },
    );
    expect(issues).toEqual([
      {
        part: "opening dining-front",
        message: "runs 0.5 m past the right edge of the front face of lower (6.8 m wide)",
      },
    ]);
  });

  test("rejects an opening whose head is above its volume", () => {
    const issues = validateHouse(
      broken((h) => (opening(h, "study-side").head = 4.5)),
      { floorArea },
    );
    expect(issues).toEqual([
      { part: "opening study-side", message: "its head is 0.8 m above the top of frame" },
    ]);
  });

  test("rejects a slab that touches nothing", () => {
    const issues = validateHouse(
      broken((h) =>
        h.slabs.push({ ...h.slabs[1], name: "floating", rect: { x0: 20, y0: 20, x1: 24, y1: 22 } }),
      ),
      { floorArea },
    );
    expect(issues).toEqual([
      { part: "slab floating", message: "touches no volume or stone mass, so nothing holds it up" },
    ]);
  });

  test("a slab meeting a volume only along an edge is unsupported", () => {
    const issues = validateHouse(
      broken((h) =>
        h.slabs.push({ ...h.slabs[1], name: "edge", rect: { x0: -14, y0: -7, x1: -12.6, y1: -5 } }),
      ),
      { floorArea },
    );
    expect(parts(issues)).toEqual(["slab edge"]);
  });

  test("rejects duplicate opening names", () => {
    const issues = validateHouse(
      broken((h) => (opening(h, "study-side").name = "living-side")),
      { floorArea },
    );
    expect(issues).toEqual([
      { part: "opening living-side", message: "the name living-side is used by more than one opening" },
    ]);
  });

  test("rejects a gross floor area more than 15% off the authored m²", () => {
    expect(validateHouse(lyngen.house, { floorArea: 240 })).toEqual([
      { part: "volumes", message: "gross floor area is 280 m², more than ±15% from the authored 240 m²" },
    ]);
    expect(validateHouse(lyngen.house, { floorArea: 320 })).toEqual([]);
  });

  test("rejects an unknown Level wherever it is named", () => {
    const issues = validateHouse(
      broken((h) => {
        opening(h, "terrace").level = "L2";
        h.slabs[0].level = "L3";
        h.volumes[3].to = "L4";
      }),
      { floorArea },
    );
    expect(issues).toEqual([
      { part: "volume frame", message: "to names Level L4, which the House does not declare" },
      { part: "opening terrace", message: "level names Level L2, which the House does not declare" },
      { part: "slab roof-main", message: "level names Level L3, which the House does not declare" },
    ]);
  });

  test("rejects an opening on an unknown volume", () => {
    const issues = validateHouse(
      broken((h) => (opening(h, "garage").volume = "garage-block")),
      { floorArea },
    );
    expect(issues).toEqual([
      { part: "opening garage", message: "sits on volume garage-block, which the House does not declare" },
    ]);
  });

  test("needs exactly one Level at the datum", () => {
    const issues = validateHouse(
      broken((h) => h.levels.forEach((l) => (l.elevation += 0.5))),
      { floorArea },
    );
    expect(parts(issues)).toContain("levels");
  });

  test("rejects a section cut that misses the House", () => {
    const issues = validateHouse(
      broken((h) => (h.section = { axis: "y", at: 30 })),
      { floorArea },
    );
    expect(parts(issues)).toEqual(["section"]);
  });
});
