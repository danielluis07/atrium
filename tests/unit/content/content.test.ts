import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

import {
  createContent,
  getNextProject,
  getPlacement,
  getProject,
  getProjects,
  getSceneLayout,
  getSiteCopy,
} from "@/content";
import { lyngen } from "@/content/projects/lyngen";
import { senja } from "@/content/projects/senja";
import { sceneLayout } from "@/content/scene";
import { sceneProject, type Project } from "@/content/schema";
import { validateHouse } from "@/lib/house/validate";

describe("the site's Content", () => {
  test("lists the Projects in order", () => {
    expect(getProjects().map((p) => p.slug)).toEqual(["lyngen", "senja", "kvaloya", "reine"]);
  });

  test("every record parses", () => {
    expect(getProjects().map((p) => [p.name, p.location])).toEqual([
      ["Lyngen House", "Lyngen, Troms"],
      ["Senja House", "Senja, Troms"],
      ["Kvaløya House", "Kvaløya, Troms"],
      ["Reine House", "Reine, Nordland"],
    ]);
  });

  test("every House passes validateHouse", () => {
    for (const p of getProjects()) {
      expect([p.name, validateHouse(p.house, { floorArea: p.floorArea })]).toEqual([p.name, []]);
    }
  });

  test("every interior image looks out through a Glazing Face of its House", () => {
    for (const p of getProjects()) {
      const face = p.house.openings.find((o) => o.name === p.images.interior.glazingFace);
      expect([p.name, face?.fill]).toEqual([p.name, "glazing"]);
    }
  });

  test("an unknown slug has no Project", () => {
    expect(getProject("tromso")).toBeUndefined();
  });

  test("the next Project follows the order and wraps from the last to the first", () => {
    const next = getProjects().map((p) => getNextProject(p.slug).slug);
    expect(next).toEqual(["senja", "kvaloya", "reine", "lyngen"]);
  });

  test("places every House in the Scene, and nothing else, with north down the slope", () => {
    const layout = getSceneLayout();
    expect(layout.north).toBe(180);
    expect(Object.keys(layout.houses)).toEqual(getProjects().map((p) => p.slug));
    expect(getPlacement("lyngen")).toEqual({ position: [0, 0], rotation: 10, ground: 0 });
  });

  test("serves the site copy", () => {
    expect(getSiteCopy().studio.email).toBe("studio@atrium.example");
  });

  test("every Approach crop is cut from an image of a real Project", () => {
    for (const { label, crop } of getSiteCopy().approach) {
      const image = getProject(crop.project)?.images[crop.image];
      expect([label, image?.src.startsWith(`/projects/${crop.project}/`)]).toEqual([label, true]);
    }
  });

  test("the images the home page shows are on disk", () => {
    const srcs = [
      ...getProjects().map((p) => p.images.hero.src),
      ...getSiteCopy().approach.map(({ crop }) => getProject(crop.project)!.images[crop.image].src),
    ];
    for (const src of srcs) {
      expect([src, existsSync(`public${src}`)]).toEqual([src, true]);
    }
  });
});

/** Lyngen under another name, so the order and the wrap have something to show. */
const copy = (slug: string, name: string) => ({ ...structuredClone(lyngen), slug, name });

describe("createContent", () => {
  const records = [copy("senja", "Senja House"), lyngen, copy("reine", "Reine House")];
  const layout = {
    ...sceneLayout,
    houses: {
      lyngen: sceneLayout.houses.lyngen,
      senja: { position: [40, 10], rotation: -5, ground: -3 },
      reine: { position: [-40, 20], rotation: 20, ground: 2 },
    },
  };

  test("keeps the order it is given", () => {
    const content = createContent(records, layout);
    expect(content.projects().map((p) => p.slug)).toEqual(["senja", "lyngen", "reine"]);
  });

  test("the next Project follows the order and wraps from the last to the first", () => {
    const content = createContent(records, layout);
    expect(content.nextProject("senja").slug).toBe("lyngen");
    expect(content.nextProject("lyngen").slug).toBe("reine");
    expect(content.nextProject("reine").slug).toBe("senja");
    expect(() => content.nextProject("tromso")).toThrow(/tromso/);
  });

  test("refuses a record whose House is invalid, naming the Project and the part", () => {
    const bad = copy("senja", "Senja House");
    bad.house.openings[0].width = 20;
    expect(() => createContent([bad, lyngen], layout)).toThrow(/Senja House:\n {2}opening garage: runs/);
  });

  test("refuses a record with a bad shape, naming the field", () => {
    const bad = { ...copy("senja", "Senja House"), year: 2031 };
    expect(() => createContent([bad], layout)).toThrow(/Senja House:\n {2}year:/);
  });

  test("refuses an interior image that doesn't look out through a Glazing Face", () => {
    const bad = copy("senja", "Senja House");
    bad.images.interior.glazingFace = "garage";
    expect(() => createContent([bad], layout)).toThrow(/images.interior: looks out through garage/);
  });

  test("when a House has an Interior, its interior image looks out of it", () => {
    const bad = structuredClone(lyngen) as Project;
    bad.images.interior.glazingFace = "dining-front";
    expect(() => createContent([bad], sceneLayout)).toThrow(
      /images.interior: looks out through dining-front, which is in lower, not main, which has the Interior/,
    );
  });

  test("the Scene learns only whether a House has an Interior", () => {
    expect(sceneProject(lyngen).interior).toBe(true);
    expect(sceneProject(senja).interior).toBe(false);
    expect(sceneProject(lyngen)).not.toHaveProperty("house");
  });

  test("refuses a Project the Scene layout doesn't place, and a placement with no Project", () => {
    expect(() => createContent([lyngen], { ...sceneLayout, houses: {} })).toThrow(/no placement for lyngen/);
    expect(() => createContent([lyngen], layout)).toThrow(/places senja, which is not a Project/);
  });
});
