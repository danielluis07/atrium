import { describe, expect, test } from "bun:test";

import { getPlacement, getProject, getProjects } from "@/content";
import { sceneLayout } from "@/content/scene";
import { heroCamera, toHouseFrame } from "@/lib/house/cameras";
import {
  CALM,
  flyTo,
  heroPose,
  houseShot,
  overviewPose,
  rigPose,
  startOverview,
  startRig,
  stepOverview,
  stepRig,
  type CameraPose,
  type OverviewInput,
  type OverviewRig,
  type Rig,
} from "@/lib/scene/camera";
import { groundHeight } from "@/lib/scene/terrain";

const overview = sceneLayout.overview;
const FRAME = 1 / 60;

const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v, i) => v - b[i]));

/** The pose after each frame of `inputs`, from `rig`. */
function poses(inputs: OverviewInput[], rig: OverviewRig = startOverview()): CameraPose[] {
  return inputs.map((input) => {
    rig = stepOverview(rig, input);
    return overviewPose(overview, rig);
  });
}

const idle = (seconds: number): OverviewInput[] => Array.from({ length: seconds * 60 }, () => ({ dt: FRAME }));

describe("the overview camera", () => {
  test("starts exactly on the layout's overview, so the live Scene takes over from the still without a jump", () => {
    const pose = overviewPose(overview, startOverview());
    expect(pose.position).toEqual([...overview.position]);
    expect(pose.lookAt).toEqual([...overview.lookAt]);
  });

  test("drifts slowly with no cursor, still looking at the Houses", () => {
    const drift = poses(idle(20));
    const moved = Math.max(...drift.map((p) => distance(p.position, overview.position)));
    expect(moved).toBeGreaterThan(0.5);
    for (const [i, p] of drift.entries()) {
      expect(p.lookAt).toEqual([...overview.lookAt]);
      // slow and heavy: no more than a few centimetres a frame
      const before = i === 0 ? overview.position : drift[i - 1].position;
      expect(distance(p.position, before)).toBeLessThan(0.03);
    }
  });

  // the overview looks up the slope along +y, so its right is +x and its up is roughly +z
  test("leans toward the cursor", () => {
    const hold = (pointer: [number, number]) => poses(idle(5).map((f) => ({ ...f, pointer }))).at(-1)!;
    const right = hold([1, 0]);
    const left = hold([-1, 0]);
    const high = hold([0, 1]);
    const low = hold([0, -1]);
    expect(right.lookAt[0]).toBeGreaterThan(overview.lookAt[0] + 1);
    expect(left.lookAt[0]).toBeLessThan(overview.lookAt[0] - 1);
    expect(high.lookAt[2]).toBeGreaterThan(overview.lookAt[2] + 0.5);
    expect(low.lookAt[2]).toBeLessThan(overview.lookAt[2] - 0.5);
  });

  test("eases toward the cursor, and back to rest when the cursor leaves", () => {
    const toRight = poses(idle(3).map((f) => ({ ...f, pointer: [1, 0] as const })));
    const first = toRight[0].lookAt[0] - overview.lookAt[0];
    const settled = toRight.at(-1)!.lookAt[0] - overview.lookAt[0];
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(settled / 20);

    const rig = idle(3).reduce<OverviewRig>((r, f) => stepOverview(r, { ...f, pointer: [1, 0] }), startOverview());
    const away = poses(idle(5), rig).at(-1)!;
    expect(Math.abs(away.lookAt[0] - overview.lookAt[0])).toBeLessThan(0.05);
  });

  test("stays within a few metres of the overview, whatever the cursor does", () => {
    // a seeded walk: the cursor jumps, wanders past the viewport's edges and leaves; frames stutter
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const inputs: OverviewInput[] = Array.from({ length: 60 * 600 }, (_, i) => ({
      dt: random() < 0.01 ? 0.25 : FRAME,
      pointer: i % 900 < 600 ? [random() * 3 - 1.5, random() * 3 - 1.5] : undefined,
    }));
    const forward = (p: CameraPose) => {
      const d = p.lookAt.map((v, i) => v - p.position[i]);
      const n = Math.hypot(...d);
      return d.map((v) => v / n);
    };
    const rest = forward(overviewPose(overview, startOverview()));
    for (const pose of poses(inputs)) {
      // slight: under 4% of the camera's 130 m to the Houses, and the view turned under 3°
      expect(distance(pose.position, overview.position)).toBeLessThan(5);
      expect(distance(pose.lookAt, overview.lookAt)).toBeLessThan(4);
      const cos = forward(pose).reduce((s, v, i) => s + v * rest[i], 0);
      expect((Math.acos(Math.min(1, cos)) * 180) / Math.PI).toBeLessThan(3);
    }
  });

  test("picks up where it was after the Scene pauses, rather than jumping", () => {
    const before = poses(idle(10));
    const rig = before.reduce<OverviewRig>((r) => stepOverview(r, { dt: FRAME }), startOverview());
    // the tab was hidden for half a minute
    const [resumed] = poses([{ dt: 30 }], rig);
    expect(distance(resumed.position, before.at(-1)!.position)).toBeLessThan(0.03);
  });

  test("a calm camera (the mobile Scene's) drifts less, on the same periods", () => {
    const reach = (rig: OverviewRig) =>
      Math.max(...poses(idle(60), rig).map((p) => distance(p.position, overview.position)));
    const full = reach(startOverview());
    const calm = reach(startOverview({ calm: true }));
    expect(calm).toBeGreaterThan(0.1);
    expect(calm).toBeCloseTo(full * CALM, 6);
  });
});

describe("the fly-to", () => {
  const projects = getProjects();
  const hero = (slug: string) => {
    const p = getProject(slug)!;
    return heroPose(p.camera, getPlacement(slug));
  };
  const shot = (slug: string) => houseShot(getProject(slug)!.camera, getPlacement(slug));

  /** Steps `rig` a frame at a time until its flight lands, returning each frame's pose and the seconds it took. */
  function land(rig: Rig, pointer?: [number, number]): { rig: Rig; poses: CameraPose[]; seconds: number } {
    const out: CameraPose[] = [];
    let seconds = 0;
    while (rig.flight) {
      rig = stepRig(rig, { dt: FRAME, pointer });
      seconds += FRAME;
      out.push(rigPose(overview, rig));
      if (seconds > 10) throw new Error("the flight never landed");
    }
    return { rig, poses: out, seconds };
  }

  const at = (slug: string) => land(flyTo(overview, startRig(), shot(slug))).rig;

  const expectPose = (actual: CameraPose, expected: CameraPose) => {
    for (const k of ["position", "lookAt"] as const) {
      actual[k].forEach((v, i) => expect(v).toBeCloseTo(expected[k][i], 6));
    }
  };

  test("the hero angle is the camera block's, around the House where the layout places it", () => {
    for (const p of projects) {
      const pose = hero(p.slug);
      const placement = getPlacement(p.slug);
      toHouseFrame(pose.position, placement).forEach((v, i) => expect(v).toBeCloseTo(heroCamera(p.camera)[i], 3));
      // looking past the camera block's look-at point, at its height
      const lookAt = toHouseFrame(pose.lookAt, placement);
      expect(lookAt[2]).toBeCloseTo(p.camera.lookAt[2], 3);
    }
  });

  test("flies from overview to each House's hero angle in 1.2–2 s and lands exactly on it", () => {
    for (const p of projects) {
      const { rig, poses, seconds } = land(flyTo(overview, startRig(), shot(p.slug)));
      expect(seconds).toBeGreaterThanOrEqual(1.2);
      expect(seconds).toBeLessThanOrEqual(2 + FRAME);
      expectPose(poses.at(-1)!, hero(p.slug));
      expectPose(rigPose(overview, rig), hero(p.slug));
    }
  });

  test("flies straight from any House to any other in 1.2–2 s", () => {
    for (const a of projects) {
      for (const b of projects) {
        if (a === b) continue;
        const { poses, seconds } = land(flyTo(overview, at(a.slug), shot(b.slug)));
        expect(seconds).toBeGreaterThanOrEqual(1.2);
        expect(seconds).toBeLessThanOrEqual(2 + FRAME);
        expectPose(poses.at(-1)!, hero(b.slug));
      }
    }
  });

  test("starts where the camera is and eases in and out: slow at both ends, fastest in the middle", () => {
    const rig = stepRig(startRig(), { dt: 7 });
    const before = rigPose(overview, rig);
    const flying = flyTo(overview, rig, shot("reine"));
    expectPose(rigPose(overview, flying), before);

    const { poses } = land(flying);
    const steps = poses.map((p, i) => distance(p.position, i === 0 ? before.position : poses[i - 1].position));
    const fastest = Math.max(...steps);
    expect(steps.indexOf(fastest)).toBeGreaterThan(steps.length * 0.3);
    expect(steps.indexOf(fastest)).toBeLessThan(steps.length * 0.7);
    expect(steps[0]).toBeLessThan(fastest / 20);
    expect(steps.at(-1)!).toBeLessThan(fastest / 20);
  });

  test("a new flight mid-flight turns from where the camera is, without a jump", () => {
    let rig = flyTo(overview, startRig(), shot("lyngen"));
    for (let i = 0; i < 40; i++) rig = stepRig(rig, { dt: FRAME });
    const before = rigPose(overview, rig);
    const turned = flyTo(overview, rig, shot("kvaloya"));
    expectPose(rigPose(overview, turned), before);
    expectPose(land(turned).poses.at(-1)!, hero("kvaloya"));
  });

  test("flies back to the drifting overview and lands on it", () => {
    const { rig, seconds } = land(flyTo(overview, at("senja"), "overview"));
    expect(seconds).toBeGreaterThanOrEqual(1.2);
    expect(seconds).toBeLessThanOrEqual(2 + FRAME);
    expectPose(rigPose(overview, rig), overviewPose(overview, rig.overview));
    // and drifts on from there
    const next = stepRig(rig, { dt: FRAME });
    expect(distance(rigPose(overview, next).position, rigPose(overview, rig).position)).toBeLessThan(0.03);
  });

  test("sways gently around the hero angle at a House, and the cursor doesn't lean it", () => {
    let rig = at("lyngen");
    const rest = hero("lyngen");
    let moved = 0;
    for (let i = 0; i < 60 * 30; i++) {
      const before = rigPose(overview, rig);
      rig = stepRig(rig, { dt: FRAME, pointer: [1, 1] });
      const pose = rigPose(overview, rig);
      moved = Math.max(moved, distance(pose.position, rest.position));
      // slow and heavy: no more than a few centimetres a frame, and never far from the hero angle
      expect(distance(pose.position, before.position)).toBeLessThan(0.03);
      expect(distance(pose.position, rest.position)).toBeLessThan(1.5);
    }
    expect(moved).toBeGreaterThan(0.3);
  });

  test("a calm camera sways less at a House, and still holds its hero angle", () => {
    const sway = (calm: boolean) => {
      let { rig } = land(flyTo(overview, startRig({ calm }), shot("lyngen")));
      let moved = 0;
      for (let i = 0; i < 60 * 60; i++) {
        rig = stepRig(rig, { dt: FRAME });
        moved = Math.max(moved, distance(rigPose(overview, rig).position, hero("lyngen").position));
      }
      return moved;
    };
    expect(sway(true)).toBeGreaterThan(0);
    expect(sway(true)).toBeLessThan(sway(false) * 0.6);
  });

  test("cuts instead of flying under reduced motion", () => {
    const rig = flyTo(overview, startRig(), shot("reine"), { reducedMotion: true });
    expect(rig.flight).toBeUndefined();
    expectPose(rigPose(overview, rig), hero("reine"));
    const back = flyTo(overview, rig, "overview", { reducedMotion: true });
    expect(back.flight).toBeUndefined();
    expectPose(rigPose(overview, back), overviewPose(overview, back.overview));
  });

  test("stays well above the snow on every flight", () => {
    const flights = [
      ...projects.map((p) => land(flyTo(overview, startRig(), shot(p.slug)))),
      ...projects.map((p) => land(flyTo(overview, at(p.slug), "overview"))),
      ...projects.flatMap((a) => projects.filter((b) => b !== a).map((b) => land(flyTo(overview, at(a.slug), shot(b.slug))))),
    ];
    for (const { poses } of flights) {
      for (const { position: [x, y, z] } of poses) expect(z).toBeGreaterThan(groundHeight(x, y) + 3);
    }
  });
});
