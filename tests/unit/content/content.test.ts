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
import { kvaloya } from "@/content/projects/kvaloya";
import { lyngen } from "@/content/projects/lyngen";
import { reine } from "@/content/projects/reine";
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
      ["Casa Lyngen", "Lyngen, Troms"],
      ["Casa Senja", "Senja, Troms"],
      ["Casa Kvaløya", "Kvaløya, Troms"],
      ["Casa Reine", "Reine, Nordland"],
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
    expect(getPlacement("lyngen")).toMatchObject({ position: [0, 0], rotation: 10, ground: 0 });
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
  const records = [copy("senja", "Casa Senja"), lyngen, copy("reine", "Casa Reine")];
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
    const bad = copy("senja", "Casa Senja");
    bad.house.openings[0].width = 20;
    expect(() => createContent([bad, lyngen], layout)).toThrow(/Casa Senja:\n {2}opening garage: runs/);
  });

  test("refuses a record with a bad shape, naming the field", () => {
    const bad = { ...copy("senja", "Casa Senja"), year: 2031 };
    expect(() => createContent([bad], layout)).toThrow(/Casa Senja:\n {2}year:/);
  });

  test("refuses an interior image that doesn't look out through a Glazing Face", () => {
    const bad = copy("senja", "Casa Senja");
    bad.images.interior.glazingFace = "garage";
    expect(() => createContent([bad], layout)).toThrow(/images.interior: looks out through garage/);
  });

  test("when a House has an Interior, its interior image looks out of it", () => {
    const bad = structuredClone(lyngen) as Project;
    bad.images.interior.glazingFace = "dining-front";
    expect(() => createContent([bad], sceneLayout)).toThrow(
      /images.interior: looks out through dining-front, which is in lower, not main or frame, which have the Interiors/,
    );
  });

  test("when a House has several Interiors, its interior image looks out of one of them", () => {
    const bad = structuredClone(lyngen) as Project;
    bad.house.volumes.find((v) => v.name === "lower")!.interior = { kind: "dining" };
    bad.images.interior.glazingFace = "loft-front";
    const only = { ...sceneLayout, houses: { lyngen: sceneLayout.houses.lyngen } };
    expect(() => createContent([bad], only)).toThrow(
      /images.interior: looks out through loft-front, which is in loft, not main or lower or frame, which have the Interiors/,
    );
    // either one can be the hero Interior
    bad.images.interior.glazingFace = "dining-front";
    bad.house.openings.find((o) => o.name === "dining-front")!.curtain = undefined;
    expect(() => createContent([bad], only)).not.toThrow();
  });

  test("an Interior that isn't the hero is measured in from its own window", () => {
    const at = (partition: number) => {
      const record = structuredClone(senja) as Project;
      record.house.volumes.find((v) => v.name === "lower")!.interior = { kind: "lounge", partition };
      return () => createContent([record], { ...sceneLayout, houses: { senja: sceneLayout.houses.senja } });
    };
    expect(at(5.4)).not.toThrow();
    expect(at(5.5)).toThrow(
      /volumes.lower.interior: its partition is 5.5 m in from lower-front, in a room 6.40 m deep: it must leave 3.5 m for the lounge and 1 m behind/,
    );
    const curtained = structuredClone(senja) as Project;
    curtained.house.openings.find((o) => o.name === "lower-front")!.curtain = true;
    expect(() => createContent([curtained], { ...sceneLayout, houses: { senja: sceneLayout.houses.senja } })).toThrow(
      /opening lower-front: hangs a Curtain, but looks into the Interior in lower$/m,
    );
  });

  test("a lounge turns to its fire or its TV, not both", () => {
    expect(senja.house.volumes.find((v) => v.name === "lower")!.interior).toMatchObject({ kind: "lounge", tv: "right" });
    const bad = structuredClone(senja) as Project;
    bad.house.volumes.find((v) => v.name === "lower")!.interior = { kind: "lounge", tv: "right", fireplace: true };
    expect(() => createContent([bad], { ...sceneLayout, houses: { senja: sceneLayout.houses.senja } })).toThrow(
      /volumes.lower.interior: has a fireplace and a TV, but a lounge turns to one or the other/,
    );
  });

  test("a dining room with seating is wide enough for it and the table", () => {
    const living = (p: Project) => p.house.volumes.find((v) => v.name === "living")!;
    expect(living(kvaloya).interior).toMatchObject({ kind: "dining", kitchen: true, seating: "left" });
    const narrow = structuredClone(kvaloya) as Project;
    living(narrow).rect.x1 = 5.0;
    narrow.house.openings.find((o) => o.name === "living-front")!.width = 4.0;
    expect(() => createContent([narrow], { ...sceneLayout, houses: { kvaloya: sceneLayout.houses.kvaloya } })).toThrow(
      /volumes.living.interior: is 5.60 m wide: a dining room with seating needs 7 m, a third for the seating and the rest for the table/,
    );
  });

  test("a library's desk and door stand on side walls clear of their glass", () => {
    const frame = (p: Project) => p.house.volumes.find((v) => v.name === "frame")!;
    expect(frame(lyngen).interior).toMatchObject({ kind: "library", desk: "left", door: "left" });
    const only = { ...sceneLayout, houses: { lyngen: sceneLayout.houses.lyngen } };
    const bad = structuredClone(lyngen) as Project;
    frame(bad).interior = { kind: "library", desk: "right", door: "right" };
    // the room turns to the terrace, and study-side is in its right wall, 1.4 to 7.4 m in
    expect(() => createContent([bad], only)).toThrow(
      /volumes.frame.interior: its desk is on the right wall, but study-side is there, 1.40 to 7.40 m in from terrace: the desk takes 2.95 to 5.55 m in from terrace/,
    );
    expect(() => createContent([bad], only)).toThrow(/its door is on the right wall, but study-side is there/);
  });

  test("glass into the room behind a terrace hangs no Curtain", () => {
    const bad = structuredClone(lyngen) as Project;
    bad.house.openings.find((o) => o.name === "study-side")!.curtain = true;
    expect(() => createContent([bad], { ...sceneLayout, houses: { lyngen: sceneLayout.houses.lyngen } })).toThrow(
      /opening study-side: hangs a Curtain, but looks into the Interior in frame/,
    );
  });

  test("a bedroom's partition leaves room for the bed in front of it and some behind", () => {
    const at = (partition: number) => {
      const record = structuredClone(senja) as Project;
      record.house.volumes.find((v) => v.name === "bar")!.interior = { kind: "bedroom", partition };
      return () => createContent([record], { ...sceneLayout, houses: { senja: sceneLayout.houses.senja } });
    };
    expect(at(5.2)).not.toThrow();
    expect(at(3)).toThrow(/volumes.bar.interior: its partition is 3 m in from bar-end, in a room 19.40 m deep/);
    expect(at(18.8)).toThrow(/its partition is 18.8 m in from bar-end/);
  });

  describe("a bedroom's bed against a side wall, and its TV", () => {
    const load = (edit: (p: Project) => void) => {
      const record = structuredClone(reine) as Project;
      edit(record);
      return () => createContent([record], { ...sceneLayout, houses: { reine: sceneLayout.houses.reine } });
    };
    const top = (p: Project) => p.house.volumes.find((v) => v.name === "top")!;
    const opening = (p: Project, name: string) => p.house.openings.find((o) => o.name === name)!;

    test("Reine's bed has its head to the right wall, and its TV faces it from the left", () => {
      expect(top(reine).interior).toMatchObject({ kind: "bedroom", bedside: "right", tv: true });
      expect(sceneProject(reine).interiors).toEqual(["interior", "interior:top"]);
      // bedroom-side runs from 0.7 m to 3.9 m in from bedroom-front, short of the 3.3 m the bed takes at the back
      expect(load(() => {})).not.toThrow();
      expect(load((p) => (top(p).interior = { kind: "bedroom", bedside: "left", tv: true }))).not.toThrow();
    });

    test("the TV faces the bed across the room, so it needs a bedside", () => {
      expect(load((p) => (top(p).interior = { kind: "bedroom", tv: true }))).toThrow(
        /volumes.top.interior: has a TV, but no bedside: the TV faces the bed from a side wall/,
      );
    });

    test("neither stands against glass", () => {
      // bedroom-side moved back: 2.7 m to 5.9 m in from bedroom-front
      const back = (p: Project) => (opening(p, "bedroom-side").at = 3.0);
      expect(load(back)).toThrow(
        /volumes.top.interior: its bed stands against the right wall, but bedroom-side is there, 2.70 to 5.90 m in from bedroom-front: the bed takes the 3.3 m in front of the back wall/,
      );
      expect(
        load((p) => {
          back(p);
          top(p).interior = { kind: "bedroom", bedside: "left", tv: true };
        }),
      ).toThrow(/its TV stands against the right wall, but bedroom-side is there, 2.70 to 5.90 m in/);
      // without the TV, the right wall is free
      expect(
        load((p) => {
          back(p);
          top(p).interior = { kind: "bedroom", bedside: "left" };
        }),
      ).not.toThrow();
    });

    test("with a partition, the bed stands in front of it", () => {
      const at = (bedside: "left" | "right", partition: number) =>
        load((p) => (top(p).interior = { kind: "bedroom", bedside, partition }));
      // the left wall has no glass; on the right, the bed comes forward onto bedroom-side's
      expect(at("left", 4)).not.toThrow();
      expect(at("right", 6.4)).toThrow(
        /its bed stands against the right wall, but bedroom-side is there, 0.70 to 3.90 m in from bedroom-front: the bed takes the 3.3 m in front of the partition/,
      );
    });

    test("the room must be deep and wide enough for it", () => {
      // top cut down to 3.4 m by 3.4 m, 2.8 m by 2.8 m inside
      const small = (p: Project) => {
        top(p).rect = { x0: -1.6, y0: -3.0, x1: 1.8, y1: 0.4 };
        opening(p, "bedroom-front").at = 0.4;
        opening(p, "bedroom-front").width = 2.6;
        opening(p, "bedroom-side").width = 2.2;
      };
      expect(load(small)).toThrow(/volumes.top.interior: is 2.80 m across: a bed against a side wall needs 3.5 m/);
      expect(load(small)).toThrow(/volumes.top.interior: is 2.80 m deep in front of the back wall: a bed against a side wall takes 3.3 m of it/);
    });
  });

  test("so does a lounge's, by the same margins", () => {
    const at = (partition: number) => {
      const record = structuredClone(lyngen) as Project;
      record.house.volumes.find((v) => v.name === "main")!.interior = { kind: "lounge", fireplace: true, partition };
      return () => createContent([record], { ...sceneLayout, houses: { lyngen: sceneLayout.houses.lyngen } });
    };
    expect(at(3.5)).not.toThrow();
    expect(at(7.8)).not.toThrow();
    expect(at(3.4)).toThrow(
      /volumes.main.interior: its partition is 3.4 m in from living-front, in a room 8.80 m deep: it must leave 3.5 m for the lounge and 1 m behind/,
    );
    expect(at(7.9)).toThrow(/its partition is 7.9 m in from living-front/);
  });

  test("a Curtain never hangs in front of the Interior", () => {
    const bad = structuredClone(lyngen) as Project;
    bad.house.volumes.find((v) => v.name === "main")!.interior = { kind: "lounge", fireplace: true };
    bad.house.openings.find((o) => o.name === "living-front")!.curtain = true;
    expect(() => createContent([bad], sceneLayout)).toThrow(
      /opening living-front: hangs a Curtain, but looks into the Interior in main$/m,
    );
  });

  test("a lounge's door needs another volume on its floor against one of its walls", () => {
    // the dining room in lower stands against the lounge's right wall
    expect(lyngen.house.volumes.find((v) => v.name === "main")!.interior).toMatchObject({ door: true });
    const bad = structuredClone(lyngen) as Project;
    bad.house.volumes.find((v) => v.name === "lower")!.rect.x0 = 5.0;
    bad.house.openings.find((o) => o.name === "dining-front")!.at = 0.4;
    expect(() => createContent([bad], sceneLayout)).toThrow(
      /volumes.main.interior: has a door, but no other volume on its floor stands against its walls in front of the partition for 2.1 m/,
    );
  });

  test("the door's room must be high enough, and meet the lounge in front of its partition", () => {
    const load = (edit: (p: Project) => void) => {
      const record = structuredClone(lyngen) as Project;
      edit(record);
      return () => createContent([record], { ...sceneLayout, houses: { lyngen: sceneLayout.houses.lyngen } });
    };
    const lower = (p: Project) => p.house.volumes.find((v) => v.name === "lower")!;
    // a room too low for a door beside it
    expect(load((p) => (lower(p).top = 2.2))).toThrow(/has a door, but no other volume/);
    // lower meets the lounge's right wall from 4.6 m in; the partition at 5.8 m leaves 1.2 m of it, too little
    expect(load((p) => (lower(p).rect.y0 = 0.5))).toThrow(/has a door, but no other volume/);
    expect(
      load((p) => {
        lower(p).rect.y0 = 0.5;
        p.house.volumes.find((v) => v.name === "main")!.interior = { kind: "lounge", fireplace: true, partition: 7.8, door: true };
      }),
    ).not.toThrow();
  });

  test("a lounge with a partition can't have its fireplace on the back wall, behind the partition", () => {
    const bad = structuredClone(lyngen) as Project;
    bad.house.stone.rect = { x0: -2.0, y0: 5.0, x1: 2.0, y1: 6.0 };
    expect(() => createContent([bad], { ...sceneLayout, houses: { lyngen: sceneLayout.houses.lyngen } })).toThrow(
      /volumes.main.interior: has a fireplace and a partition, but the stone stands behind the back wall, behind the partition/,
    );
  });

  test("but may hang in the empty room behind a bedroom's partition", () => {
    const at = (partition: number) => {
      const record = structuredClone(senja) as Project;
      record.house.volumes.find((v) => v.name === "bar")!.interior = { kind: "bedroom", partition };
      return () => createContent([record], { ...sceneLayout, houses: { senja: sceneLayout.houses.senja } });
    };
    // bar-side runs from 7.7 m to 16.7 m in from bar-end
    expect(senja.house.openings.find((o) => o.name === "bar-side")!.curtain).toBe(true);
    expect(at(5.2)).not.toThrow();
    expect(at(7.7)).not.toThrow();
    expect(at(8)).toThrow(/opening bar-side: hangs a Curtain, but looks into the Interior in bar in front of its partition/);
    const glass = structuredClone(senja) as Project;
    glass.house.openings.find((o) => o.name === "bar-end")!.curtain = true;
    expect(() => createContent([glass], { ...sceneLayout, houses: { senja: sceneLayout.houses.senja } })).toThrow(
      /opening bar-end: hangs a Curtain, but looks into the Interior in bar in front of its partition/,
    );
  });

  test("the Scene learns only its House's Interiors, by their GLB nodes, the hero Interior first", () => {
    const bare = structuredClone(lyngen) as Project;
    for (const v of bare.house.volumes) delete v.interior;
    expect(sceneProject(lyngen).interiors).toEqual(["interior", "interior:frame"]);
    expect(sceneProject(senja).interiors).toEqual(["interior", "interior:lower"]);
    expect(sceneProject(bare).interiors).toEqual([]);
    expect(sceneProject(lyngen)).not.toHaveProperty("house");
  });

  test("refuses a Project the Scene layout doesn't place, and a placement with no Project", () => {
    expect(() => createContent([lyngen], { ...sceneLayout, houses: {} })).toThrow(/no placement for lyngen/);
    expect(() => createContent([lyngen], layout)).toThrow(/places senja, which is not a Project/);
  });
});
