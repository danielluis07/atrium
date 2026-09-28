import { describe, expect, test } from "bun:test";

import { getProjects } from "@/content";
import { reine } from "@/content/projects/reine";
import { sceneLayout } from "@/content/scene";
import { balconyPlan, pergolaPlan, pieceRect } from "@/lib/house/balcony";
import { exportHouse } from "@/lib/house/export";
import type { BalconyPiece, House } from "@/lib/house/schema";
import { parseHouse, validateHouse, type HouseIssue } from "@/lib/house/validate";

const floorArea = reine.floorArea;
/** Reine without its balconies' pieces, pergola and door. */
const bare = {
  ...reine.house,
  balconyFurniture: undefined,
  pergolas: undefined,
  openings: reine.house.openings.filter((o) => o.name !== "balcony"),
} as House;

/** A copy of the Reine House with something on its balconies changed. */
function edited(edit: (house: Required<House>) => void): HouseIssue[] {
  const house = structuredClone(reine.house) as Required<House>;
  edit(house);
  return validateHouse(house, { floorArea });
}
const messages = (issues: HouseIssue[]) => issues.map((i) => `${i.part}: ${i.message}`);
const upper = (house: Required<House>) => house.balconyFurniture.find((b) => b.slab === "balcony-upper")!;
const lower = (house: Required<House>) => house.balconyFurniture.find((b) => b.slab === "balcony-lower")!;

describe("the balconies", () => {
  test("are optional, and every House's are valid", () => {
    expect(parseHouse(bare).ok).toBe(true);
    expect(validateHouse(bare, { floorArea })).toEqual([]);
    for (const p of getProjects()) expect(validateHouse(p.house, { floorArea: p.floorArea })).toEqual([]);
  });

  test("accept only the kit's kinds, each with its own options", () => {
    const house = structuredClone(reine.house) as Required<House>;
    (upper(house).pieces[0] as Record<string, unknown>).kind = "sofa";
    expect(parseHouse(house).ok).toBe(false);
    const other = structuredClone(reine.house) as Required<House>;
    (upper(other).pieces[0] as Record<string, unknown>).lantern = true;
    expect(parseHouse(other).ok).toBe(false);
  });
});

describe("balconyPlan", () => {
  test("is left out for a House without Balcony Furniture", () => {
    expect(balconyPlan(bare)).toBeUndefined();
  });

  test("stands each piece on its slab's top, centred on its point", () => {
    const plan = balconyPlan(reine.house)!;
    expect(plan.map((b) => [b.slab, b.deck])).toEqual([
      ["balcony-lower", 3.5],
      ["balcony-upper", 6.6],
    ]);
    const tub = plan[1].pieces.find((p) => p.kind === "tub")!;
    expect(tub.facing).toBe("front");
    expect(tub.rect).toEqual({ x0: 2, y0: -3.25, x1: 3.8, y1: -1.45 });
  });

  test("turns a piece's footprint to its facing", () => {
    const bench: BalconyPiece = { kind: "bench", at: [0, 0] };
    expect(pieceRect(bench)).toEqual({ x0: -0.75, y0: -0.21, x1: 0.75, y1: 0.21 });
    expect(pieceRect({ ...bench, facing: "left" })).toEqual({ x0: -0.21, y0: -0.75, x1: 0.21, y1: 0.75 });
  });
});

describe("pergolaPlan", () => {
  const [pergola] = pergolaPlan(reine.house)!;

  test("is left out for a House without a pergola", () => {
    expect(pergolaPlan(bare)).toBeUndefined();
  });

  test("covers the whole slab, flush against the wall it bears on and drawn in from its other edges", () => {
    expect(pergola.rect).toEqual({ x0: 1.8, y0: -5.48, x1: 8.48, y1: 2.88 });
    expect([pergola.deck, pergola.bottom, pergola.top]).toEqual([6.6, 8.7, 9]);
  });

  test("stands on posts at its corners and between them, but none against the wall", () => {
    const centres = pergola.posts.map((p) => [+((p.x0 + p.x1) / 2).toFixed(2), +((p.y0 + p.y1) / 2).toFixed(2)]);
    expect(centres).toEqual([
      [1.84, -5.44],
      [5.14, -5.44],
      [8.44, -5.44],
      [8.44, -1.3],
      [8.44, 2.84],
      [5.14, 2.84],
    ]);
  });
});

describe("validateHouse on the balconies", () => {
  test("wants a door above the entrance Level to open onto a slab level with its sill", () => {
    expect(
      messages(
        edited((h) => {
          h.openings.find((o) => o.name === "balcony")!.sill = 0;
        }),
      ),
    ).toContain(
      "opening balcony: is a door above the entrance Level, so it must open onto a slab level with its sill (3.2 m) reaching 0.9 m out in front of it",
    );
    // on the right face, it would open over nothing
    expect(
      edited((h) => {
        const door = h.openings.find((o) => o.name === "balcony")!;
        door.face = "back";
        door.at = 5;
      }).map((i) => i.part),
    ).toContain("opening balcony");
  });

  test("keeps every piece on its slab, clear of its edge", () => {
    expect(messages(edited((h) => void (upper(h).pieces[3].at = [8.3, -4.85])))).toContain(
      "balcony furniture on balcony-upper: telescope 4: runs past its slab, or nearer than 0.15 m to its edge",
    );
  });

  test("keeps the pieces apart, and out of the House's solids", () => {
    expect(messages(edited((h) => void (upper(h).pieces[2].at = [5.4, -3.0])))).toContain(
      "balcony furniture on balcony-upper: bench 3: overlaps fire-bowl 2",
    );
    expect(messages(edited((h) => void (upper(h).pieces[0].at = [1.9, -2.35])))).toContain(
      "balcony furniture on balcony-upper: tub 1: stands inside top",
    );
  });

  test("keeps the pieces off the pergola's posts and out of a door's way", () => {
    expect(messages(edited((h) => void (upper(h).pieces[3].at = [7.9, -4.8])))).toEqual([]);
    expect(messages(edited((h) => void (upper(h).pieces[1].at = [5.14, -5.0])))).toContain(
      "balcony furniture on balcony-upper: fire-bowl 2: stands against a post of the pergola",
    );
    expect(messages(edited((h) => void (lower(h).pieces[1].at = [-2.6, 1.1])))).toContain(
      "balcony furniture on balcony-lower: chair 2: stands in the way of door balcony",
    );
  });

  test("names a declared slab, and furnishes it once", () => {
    expect(messages(edited((h) => void (upper(h).slab = "balcony-top")))).toContain(
      "balcony furniture on balcony-top: names slab balcony-top, which the House does not declare",
    );
    expect(messages(edited((h) => void (lower(h).slab = "balcony-upper")))).toContain(
      "balcony furniture on balcony-upper: slab balcony-upper is furnished more than once",
    );
  });

  test("leaves headroom under a pergola, and keeps it under the roof", () => {
    expect(messages(edited((h) => void (h.pergolas[0].top = 8.8)))).toContain(
      "pergola on balcony-upper: leaves 1.9 m under its beams, less than 2.1 m",
    );
    expect(messages(edited((h) => void (h.pergolas[0].top = 9.6)))).toContain(
      "pergola on balcony-upper: rises to 9.6 m, above the underside of slab roof (9.4 m) over it",
    );
    expect(messages(edited((h) => void h.pergolas.push({ slab: "balcony-upper", top: 9 })))).toContain(
      "pergola on balcony-upper: slab balcony-upper has more than one pergola",
    );
  });
});

describe("the builder JSON", () => {
  test("carries the balconies as plan pieces, and a House without them keeps its JSON", () => {
    const { derived } = JSON.parse(exportHouse(reine, sceneLayout));
    expect(derived.balcony.map((b: { slab: string }) => b.slab)).toEqual(["balcony-lower", "balcony-upper"]);
    expect(derived.pergolas).toHaveLength(1);
    const json = exportHouse({ ...reine, house: bare }, sceneLayout);
    expect(json).not.toContain('"balcony"');
    expect(json).not.toContain('"pergolas"');
  });
});
