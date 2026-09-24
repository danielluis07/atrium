import { describe, expect, test } from "bun:test";

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
import { sceneLayout } from "@/content/scene";

describe("the site's Content", () => {
  test("lists the Projects in order", () => {
    expect(getProjects().map((p) => p.slug)).toEqual(["lyngen"]);
  });

  test("the Lyngen record parses", () => {
    const project = getProject("lyngen");
    expect(project?.name).toBe("Lyngen House");
    expect(project?.location).toBe("Lyngen, Troms");
    expect(project?.images.interior.glazingFace).toBe("living-front");
  });

  test("an unknown slug has no Project", () => {
    expect(getProject("tromso")).toBeUndefined();
  });

  test("with one Project, the next Project wraps to itself", () => {
    expect(getNextProject("lyngen").slug).toBe("lyngen");
  });

  test("places every Project in the Scene", () => {
    expect(getSceneLayout().north).toBe(180);
    expect(getPlacement("lyngen")).toEqual({ position: [0, 0], rotation: 10, ground: 0 });
  });

  test("serves the site copy", () => {
    expect(getSiteCopy().studio.email).toBe("studio@atrium.example");
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

  test("refuses a Project the Scene layout doesn't place, and a placement with no Project", () => {
    expect(() => createContent([lyngen], { ...sceneLayout, houses: {} })).toThrow(/no placement for lyngen/);
    expect(() => createContent([lyngen], layout)).toThrow(/places senja, which is not a Project/);
  });
});
