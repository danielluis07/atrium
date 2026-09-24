import { describe, expect, test } from "bun:test";

import { getPlacement, getProject } from "@/content";
import { sceneLayout } from "@/content/scene";
import {
  cutPose,
  cutRig,
  flyTo,
  houseShot,
  overviewFov,
  rigPose,
  startRig,
  stepRig,
  type CameraPose,
  type Rig,
} from "@/lib/scene/camera";
import { gradePoint, isCovered, measureCut, REST, skylineHeight, SNOW_GAP, type Cut } from "@/lib/scene/cut";
import { groundHeight, WATER_LEVEL } from "@/lib/scene/terrain";

const overview = sceneLayout.overview;
const FRAME = 1 / 60;
const HEADER = 56;
const ASPECTS = [16 / 9, 4 / 3, 21 / 9, 9 / 19.5];

const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
const lens = (aspect: number) => ({ fov: overviewFov(aspect), aspect });

/** The cut with the line risen `progress` of the way from the foot of a pinned stage to the header's baseline. */
function cutAt(progress: number, height = 900): Cut {
  return measureCut({ stage: { top: 0, height }, line: height - progress * (height - HEADER), baseline: HEADER });
}

const expectClose = (actual: readonly number[], expected: readonly number[], digits = 6) =>
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], digits));

/** Which way a pose looks, as a unit vector. */
function direction({ position, lookAt }: CameraPose): number[] {
  const v = lookAt.map((c, i) => c - position[i]);
  return v.map((c) => c / Math.hypot(...v));
}

const shot = (slug: string) => houseShot(getProject(slug)!.camera, getPlacement(slug));

/** A rig settled at `slug`'s hero angle. */
function atHouse(slug: string): Rig {
  let rig = flyTo(overview, startRig(), shot(slug));
  while (rig.flight) rig = stepRig(rig, { dt: FRAME });
  return rig;
}

/** One frame of the rig the way the Scene runs it: the cut first, then time. */
const frame = (rig: Rig, progress: number) => stepRig(cutRig(overview, rig, progress), { dt: FRAME });

describe("measuring the cut", () => {
  test("runs from the stage's foot to the header's baseline, and holds there", () => {
    expect(cutAt(0)).toMatchObject({ progress: 0, line: -1 });
    expect(cutAt(0.5).progress).toBeCloseTo(0.5, 9);
    expect(cutAt(1).progress).toBe(1);
    expect(cutAt(1).line).toBeCloseTo(1 - (2 * HEADER) / 900, 9);
    // the line below the stage (not yet in view), and past the header
    expect(measureCut({ stage: { top: 0, height: 900 }, line: 1200, baseline: HEADER }).progress).toBe(0);
    expect(measureCut({ stage: { top: 0, height: 900 }, line: 20, baseline: HEADER }).progress).toBe(1);
  });

  test("stays covered once the stage has scrolled away under the paper, however far down the page", () => {
    for (const top of [-100, -900, -5000]) {
      const cut = measureCut({ stage: { top, height: 900 }, line: top + HEADER, baseline: HEADER });
      expect(cut.progress).toBe(1);
      expect(isCovered(cut)).toBe(true);
    }
  });

  test("keeps a few pixels of snow above the line, whatever the stage's height", () => {
    for (const height of [480, 900, 1440]) expect((cutAt(0.5, height).gap * height) / 2).toBeCloseTo(SNOW_GAP, 9);
  });

  test("the paper covers the stage once the line reaches the header", () => {
    expect(isCovered(cutAt(0.99))).toBe(false);
    expect(isCovered(cutAt(1))).toBe(true);
    expect(isCovered(REST)).toBe(false);
  });
});

describe("the drop", () => {
  const progressions = Array.from({ length: 41 }, (_, i) => i / 40);

  test("at rest is the rig's pose exactly, so the live Scene is untouched until the line rises", () => {
    for (const rig of [startRig(), stepRig(startRig(), { dt: 7, pointer: [0.5, -0.3] }), atHouse("reine")]) {
      expect(cutPose(overview, rig, REST, 16 / 9)).toEqual(rigPose(overview, rig));
      expect(cutPose(overview, rig, cutAt(0), 16 / 9)).toEqual(rigPose(overview, rig));
    }
  });

  test("is a pure function of progress, so scrolling back up reverses it exactly", () => {
    const rig = stepRig(startRig(), { dt: 3 });
    const down = progressions.map((p) => cutPose(overview, rig, cutAt(p), 16 / 9));
    const up = [...progressions].reverse().map((p) => cutPose(overview, rig, cutAt(p), 16 / 9));
    expect(up.reverse()).toEqual(down);
  });

  test("keeps the snow's skyline where it was until the line reaches it, then just above the line", () => {
    for (const aspect of ASPECTS) {
      const rest = skylineHeight(overview as CameraPose, lens(aspect));
      let met = false;
      for (const p of progressions.slice(1)) {
        const cut = cutAt(p);
        const skyline = skylineHeight(cutPose(overview, startRig(), cut, aspect), lens(aspect));
        met ||= cut.line + cut.gap > rest;
        expect(skyline).toBeCloseTo(met ? cut.line + cut.gap : rest, 2);
        // never any sky between the snow and the line
        expect(skyline).toBeGreaterThan(cut.line);
      }
      expect(met).toBe(true);
    }
  });

  test("descends steadily from overview to grade, above the snow and the fjord all the way", () => {
    const grade = gradePoint(overview);
    const [gx, gy, gz] = grade;
    expect(gz).toBeCloseTo(Math.max(groundHeight(gx, gy), WATER_LEVEL) + 1.7, 6);

    const poses = progressions.map((p) => cutPose(overview, startRig(), cutAt(p), 16 / 9));
    for (const [i, { position }] of poses.entries()) {
      const [x, y, z] = position;
      expect(z).toBeGreaterThan(Math.max(groundHeight(x, y), WATER_LEVEL) + 1.5);
      if (i > 0) {
        expect(z).toBeLessThanOrEqual(poses[i - 1].position[2]);
        expect(distance(position, grade)).toBeLessThanOrEqual(distance(poses[i - 1].position, grade));
      }
    }
    expectClose(poses.at(-1)!.position, grade);
  });

  test("ends at the same pose wherever the camera was when the line started rising", () => {
    const covered = cutAt(1);
    const expected = cutPose(overview, startRig(), covered, 16 / 9);
    for (const rig of [stepRig(startRig(), { dt: 11, pointer: [1, 1] }), atHouse("senja"), atHouse("kvaloya")]) {
      const pose = cutPose(overview, rig, covered, 16 / 9);
      expectClose(pose.position, expected.position);
      // the cursor's lean is all that turns it, and only a little
      expectClose(direction(pose), direction(expected), 1);
    }
  });
});

describe("scrolling at a selected House", () => {
  /** A rig at `slug` whose Panel was just closed: the fly-back to overview is pending. */
  const closing = (slug: string) => flyTo(overview, atHouse(slug), "overview");

  test("absorbs the pending fly-back: the camera drops from where it was, with no jump", () => {
    for (const slug of ["lyngen", "senja", "kvaloya", "reine"]) {
      const before = rigPose(overview, closing(slug));
      const rig = frame(closing(slug), cutAt(0.01).progress);
      expect(rig.flight).toBeUndefined();
      expect(rig.held).toEqual(before);
      expect(distance(cutPose(overview, rig, cutAt(0.01), 16 / 9).position, before.position)).toBeLessThan(0.1);
    }
  });

  test("makes one camera move: straight down to grade as the line rises, never back out to overview first", () => {
    const grade = gradePoint(overview);
    for (const slug of ["lyngen", "senja", "kvaloya", "reine"]) {
      let rig = closing(slug);
      let last = Infinity;
      // the line rises over a second and a half, about as long as the fly-back would have taken
      for (let i = 1; i <= 90; i++) {
        const cut = cutAt(i / 90);
        rig = frame(rig, cut.progress);
        const gone = distance(cutPose(overview, rig, cut, 16 / 9).position, grade);
        expect(gone).toBeLessThanOrEqual(last + 1e-9);
        last = gone;
      }
      expect(last).toBeLessThan(1e-6);
    }
  });

  test("reverses the drop exactly on the way back up, then flies on to overview", () => {
    let rig = frame(closing("reine"), cutAt(0.02).progress);
    const held = rig.held!;
    const down = [0.2, 0.5, 0.8].map((p) => cutPose(overview, (rig = frame(rig, p)), cutAt(p), 16 / 9));
    const up = [0.8, 0.5, 0.2].map((p) => cutPose(overview, (rig = frame(rig, p)), cutAt(p), 16 / 9));
    expect(up).toEqual([...down].reverse());

    // back at rest: from where the drop set out, to overview
    const flying = cutRig(overview, rig, 0);
    expect(flying.held).toBeUndefined();
    expect(flying.flight?.from).toEqual(held);
    expect(flying.shot).toBe("overview");
  });

  test("leaves a flight to a House alone", () => {
    const rig = flyTo(overview, startRig(), shot("lyngen"));
    expect(cutRig(overview, rig, 0.3)).toBe(rig);
  });
});
