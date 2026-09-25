import { describe, expect, test } from "bun:test";

import { getPlacement, getProject, getProjects } from "@/content";
import { sceneLayout } from "@/content/scene";
import type { CameraBlock, Project } from "@/content/schema";
import { fromHouseFrame, PITCH_LIMITS, toHouseFrame, type Point } from "@/lib/house/cameras";
import { verticalExtent } from "@/lib/house/derive";
import {
  flyTo,
  heroPose,
  houseShot,
  orbitRig,
  overviewFov,
  panelAim,
  rigPose,
  startRig,
  stepRig,
  type CameraPose,
  type HouseShot,
  type Rig,
} from "@/lib/scene/camera";
import { clampAngle, dragAngle, heroAngle, ORBIT_STEP, orbitPose, stepAngle, type OrbitAngle } from "@/lib/scene/orbit";

const overview = sceneLayout.overview;
const FRAME = 1 / 60;
const projects = getProjects();

const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v, i) => v - b[i]));

/** Every angle the orbit reaches, on a 5° grid across the arc, at the pitch limits and the authored pitch. */
function reachable(camera: CameraBlock): OrbitAngle[] {
  const out: OrbitAngle[] = [];
  for (let a = camera.azimuth - camera.arc; a <= camera.azimuth + camera.arc + 1e-9; a += 5) {
    for (const pitch of [PITCH_LIMITS[0], camera.pitch, PITCH_LIMITS[1]]) out.push({ azimuth: a, pitch });
  }
  return out;
}

describe("the orbit at a selected House", () => {
  test("clamps to the House's arc and to a pitch of 8–30°, however far the drag", () => {
    for (const p of projects) {
      const hero = heroAngle(p.camera);
      const drags = [
        [5000, 0],
        [-5000, 0],
        [0, 5000],
        [0, -5000],
        [3000, -3000],
        [-3000, 3000],
      ];
      for (const [dx, dy] of drags) {
        const a = dragAngle(p.camera, hero, dx, dy);
        expect(a.azimuth).toBeGreaterThanOrEqual(p.camera.azimuth - p.camera.arc);
        expect(a.azimuth).toBeLessThanOrEqual(p.camera.azimuth + p.camera.arc);
        expect(a.pitch).toBeGreaterThanOrEqual(8);
        expect(a.pitch).toBeLessThanOrEqual(30);
      }
      expect(dragAngle(p.camera, hero, 5000, 0).azimuth).toBe(p.camera.azimuth + p.camera.arc);
      expect(dragAngle(p.camera, hero, -5000, 0).azimuth).toBe(p.camera.azimuth - p.camera.arc);
      expect(dragAngle(p.camera, hero, 0, 5000).pitch).toBe(30);
      expect(dragAngle(p.camera, hero, 0, -5000).pitch).toBe(8);
    }
  });

  test("the arc is at most ±50° of the hero angle", () => {
    for (const p of projects) {
      for (const turn of [-180, 180]) {
        const a = clampAngle(p.camera, { azimuth: p.camera.azimuth + turn, pitch: p.camera.pitch });
        expect(Math.abs(a.azimuth - p.camera.azimuth)).toBeLessThanOrEqual(50);
      }
    }
  });

  test("keeps a fixed distance from the House's look-at point at every angle", () => {
    for (const p of projects) {
      const placement = getPlacement(p.slug);
      for (const angle of reachable(p.camera)) {
        const { position } = orbitPose(p.camera, placement, angle);
        expect(distance(toHouseFrame(position, placement), p.camera.lookAt)).toBeCloseTo(p.camera.distance, 3);
      }
    }
  });

  test("a drag turns it: right carries the camera left around the House, down lifts it", () => {
    const { camera } = getProject("lyngen")!;
    const hero = heroAngle(camera);
    const right = dragAngle(camera, hero, 20, 0);
    expect(right.azimuth).toBeGreaterThan(hero.azimuth);
    expect(right.azimuth - hero.azimuth).toBeLessThan(10);
    expect(dragAngle(camera, hero, 0, 20).pitch).toBeGreaterThan(hero.pitch);
  });

  test("←/→ step it 10° and stop at the ends of the arc", () => {
    for (const p of projects) {
      for (const direction of [-1, 1] as const) {
        let angle = heroAngle(p.camera);
        const seen = [angle.azimuth];
        for (let i = 0; i < 12; i++) {
          angle = stepAngle(p.camera, angle, direction);
          seen.push(angle.azimuth);
        }
        const end = p.camera.azimuth - direction * p.camera.arc;
        expect(seen.at(-1)).toBe(end);
        expect(Math.abs(seen[1] - seen[0])).toBe(ORBIT_STEP);
        for (let i = 1; i < seen.length; i++) {
          const step = Math.abs(seen[i] - seen[i - 1]);
          // whole steps up to the end of the arc, then none
          if (seen[i - 1] === end) expect(step).toBe(0);
          else expect(step).toBeLessThanOrEqual(ORBIT_STEP);
        }
        expect(angle.pitch).toBe(p.camera.pitch);
      }
    }
  });

  test("→ carries the camera to its right around the House, ← to its left", () => {
    const p = getProject("reine")!;
    const placement = getPlacement(p.slug);
    const hero = heroPose(p.camera, placement);
    const moved = (direction: -1 | 1) =>
      orbitPose(p.camera, placement, stepAngle(p.camera, heroAngle(p.camera), direction)).position;
    const forward = hero.lookAt.map((v, i) => v - hero.position[i]);
    const across = (q: readonly number[]) =>
      (q[0] - hero.position[0]) * forward[1] - (q[1] - hero.position[1]) * forward[0];
    expect(across(moved(1))).toBeGreaterThan(0);
    expect(across(moved(-1))).toBeLessThan(0);
  });

  describe("keeps the House clear of the Project Panel on the right", () => {
    // desktop viewports, from 4:3 to ultrawide
    for (const [name, aspect] of [
      ["4:3", 4 / 3],
      ["16:10", 16 / 10],
      ["16:9", 16 / 9],
      ["21:9", 21 / 9],
    ] as const) {
      test(`its projected centre stays in the left 55% of a ${name} viewport at every angle`, () => {
        const tanX = Math.tan((overviewFov(aspect) * Math.PI) / 360) * aspect;
        for (const p of projects) {
          const placement = getPlacement(p.slug);
          const centre = fromHouseFrame(houseCentre(p), placement);
          for (const angle of reachable(p.camera)) {
            const x = screenX(orbitPose(p.camera, placement, angle), centre, tanX);
            expect(x).toBeGreaterThan(0.1);
            expect(x).toBeLessThan(0.55);
          }
        }
      });
    }
  });
});

describe("the mobile Scene's hero angle keeps the House above the bottom sheet", () => {
  // touch viewports: phones upright and on their side, and a tablet
  for (const [name, aspect] of [
    ["9:19.5", 9 / 19.5],
    ["9:16", 9 / 16],
    ["3:4", 3 / 4],
    ["19.5:9", 19.5 / 9],
  ] as const) {
    test(`its projected centre sits centred across, in the upper part of a ${name} viewport`, () => {
      const half = Math.tan((overviewFov(aspect) * Math.PI) / 360);
      const aim = panelAim("bottom", aspect);
      for (const p of projects) {
        const placement = getPlacement(p.slug);
        const centre = fromHouseFrame(houseCentre(p), placement);
        const pose = orbitPose(p.camera, placement, heroAngle(p.camera), aim);
        const x = screenX(pose, centre, half * aspect);
        expect(x).toBeGreaterThan(0.3);
        expect(x).toBeLessThan(0.7);
        // from the top: below the header, above the sheet's top edge at 40%
        const y = screenY(pose, centre, half);
        expect(y).toBeGreaterThan(0.12);
        expect(y).toBeLessThan(0.35);
      }
    });
  }

  test("a Panel on the right keeps the desktop aim", () => {
    const p = getProject("lyngen")!;
    const placement = getPlacement(p.slug);
    expect(orbitPose(p.camera, placement, heroAngle(p.camera), panelAim("right", 16 / 9))).toEqual(
      orbitPose(p.camera, placement, heroAngle(p.camera)),
    );
  });
});

describe("the orbit in the camera rig", () => {
  const shot = (slug: string) => houseShot(getProject(slug)!.camera, getPlacement(slug));
  const land = (rig: Rig) => {
    while (rig.flight) rig = stepRig(rig, { dt: FRAME });
    return rig;
  };
  const settle = (rig: Rig, seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) rig = stepRig(rig, { dt: FRAME });
    return rig;
  };
  const at = (slug: string) => land(flyTo(overview, startRig(), shot(slug)));
  const drag = (dx: number) => (rig: Rig) => orbitRig(rig, (camera, t) => dragAngle(camera, t, dx, 0));

  test("follows a drag, damped, and stays where it was released", () => {
    const p = getProject("senja")!;
    const placement = getPlacement(p.slug);
    const hero = heroPose(p.camera, placement);
    const target = dragAngle(p.camera, heroAngle(p.camera), 60, 0);
    const goal = orbitPose(p.camera, placement, target);
    let rig = drag(60)(at("senja"));

    // eased: some of the way there after a frame, not all of it
    const first = rigPose(overview, stepRig(rig, { dt: FRAME }));
    expect(distance(first.position, hero.position)).toBeGreaterThan(0);
    expect(distance(first.position, hero.position)).toBeLessThan(distance(goal.position, hero.position) / 2);

    // released: it settles there and stays, swaying a little
    rig = settle(rig, 2);
    expect((rig.shot as HouseShot).angle.azimuth).toBeCloseTo(target.azimuth, 1);
    for (let i = 0; i < 30 * 60; i++) {
      rig = stepRig(rig, { dt: FRAME, pointer: [-1, 1] });
      expect(distance(rigPose(overview, rig).position, goal.position)).toBeLessThan(1.5);
    }
  });

  test("selecting the same House again flies back to its hero angle", () => {
    const p = getProject("kvaloya")!;
    const hero = heroPose(p.camera, getPlacement(p.slug));
    const turned = settle(drag(-120)(at("kvaloya")), 2);
    expect(distance(rigPose(overview, turned).position, hero.position)).toBeGreaterThan(5);
    const pose: CameraPose = rigPose(overview, land(flyTo(overview, turned, shot("kvaloya"))));
    pose.position.forEach((v, i) => expect(v).toBeCloseTo(hero.position[i], 6));
    pose.lookAt.forEach((v, i) => expect(v).toBeCloseTo(hero.lookAt[i], 6));
  });

  test("doesn't orbit at overview or in flight", () => {
    const rest = startRig();
    expect(drag(100)(rest)).toBe(rest);
    const flying = flyTo(overview, startRig(), shot("reine"));
    expect(drag(100)(flying)).toBe(flying);
  });
});

/** A House's centre in its House frame: the centre of its plan (the datum) at mid-height of its volumes. */
function houseCentre(p: Project): Point {
  const extents = p.house.volumes.map((v) => verticalExtent(p.house, v));
  const bottom = Math.min(...extents.map((e) => e.bottom));
  const top = Math.max(...extents.map((e) => e.top));
  return [0, 0, (bottom + top) / 2];
}

/** Where `point` falls across the viewport seen from `pose` (z up): 0 at the left edge, 1 at the right. */
function screenX(pose: CameraPose, point: readonly number[], tanX: number): number {
  const f = normalize(pose.lookAt.map((v, i) => v - pose.position[i]));
  const right = normalize([f[1], -f[0], 0]);
  const d = point.map((v, i) => v - pose.position[i]);
  return (dot(d, right) / dot(d, f) / tanX + 1) / 2;
}

/** Where `point` falls down the viewport seen from `pose` (z up): 0 at the top edge, 1 at the bottom. */
function screenY(pose: CameraPose, point: readonly number[], tanY: number): number {
  const f = normalize(pose.lookAt.map((v, i) => v - pose.position[i]));
  const right = normalize([f[1], -f[0], 0]);
  const up = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
  const d = point.map((v, i) => v - pose.position[i]);
  return (1 - dot(d, up) / dot(d, f) / tanY) / 2;
}

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const normalize = (a: number[]) => a.map((v) => v / Math.hypot(...a));
