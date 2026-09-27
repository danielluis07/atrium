import { describe, expect, test } from "bun:test";

import { projectOrder as projects } from "@/content/projects";
import { sceneLayout } from "@/content/scene";
import { arcCameras, fromHouseFrame, type Point } from "@/lib/house/cameras";
import { verticalExtent } from "@/lib/house/derive";
import type { House } from "@/lib/house/schema";
import { OVERVIEW_FOV } from "@/lib/scene/camera";
import { houseTransform, toThree } from "@/lib/scene/frame";
import { framingPines, placePines } from "@/lib/scene/pines";
import { edgeDistance, PLINTH_BLEND, type PlinthRect } from "@/lib/scene/platform";

/** The builder's plinth margin round a House's footprint (`PLINTH_MARGIN` in its config.py). */
const PLINTH_MARGIN = 12;
/** How far a pine sinks into the snow (`components/scene/pines.tsx`). */
const SINK = 0.4;

/** Each House's parts as boxes in its House frame: x0, y0, z0, x1, y1, z1. */
function boxes(house: House): number[][] {
  const solids = [...house.volumes, house.stone].map((v) => {
    const { bottom, top } = verticalExtent(house, v);
    return [v.rect.x0, v.rect.y0, bottom, v.rect.x1, v.rect.y1, top];
  });
  const slabs = house.slabs.map((s) => {
    const l = house.levels.find((l) => l.name === s.level)!;
    const z = l.elevation + l.height;
    return [s.rect.x0, s.rect.y0, z, s.rect.x1, s.rect.y1, z + Math.max(s.thickness, s.fascia)];
  });
  return [...solids, ...slabs];
}

/** A House's plinth as the Scene measures it: its footprint plus the builder's margin, flat at its lowest floor. */
function plinthRect(slug: string, house: House): PlinthRect {
  const b = boxes(house);
  const [x0, y0, x1, y1] = [0, 1, 3, 4].map((i) => (i < 3 ? Math.min : Math.max)(...b.map((r) => r[i])));
  const { position, rotationY } = houseTransform(sceneLayout.houses[slug]);
  const low = Math.min(...[...house.volumes, house.stone].map((v) => verticalExtent(house, v).bottom));
  return {
    origin: [position[0], position[2]],
    rotationY,
    min: [x0 - PLINTH_MARGIN, -(y1 + PLINTH_MARGIN)],
    max: [x1 + PLINTH_MARGIN, -(y0 - PLINTH_MARGIN)],
    low: position[1] + low,
  };
}

const rects = projects.map((p) => plinthRect(p.slug, p.house));
const framing = framingPines(sceneLayout);
const overview = toThree(sceneLayout.overview.position);
const pines = placePines(rects, [overview[0], overview[2]], framing).slice(0, framing.length);

describe("framing pines", () => {
  test("come from the Scene layout, in each House's frame", () => {
    const placed = Object.values(sceneLayout.houses).reduce((n, p) => n + (p.framing?.length ?? 0), 0);
    expect(framing).toHaveLength(placed);
    expect(placed).toBeGreaterThan(0);
  });

  test("each stands on a plinth where it bends onto the slope", () => {
    for (const pine of framing) {
      const d = Math.max(...rects.map((r) => edgeDistance(r, pine.x, pine.z)));
      expect({ pine, bends: d > 0 && d < PLINTH_BLEND }).toEqual({ pine, bends: true });
    }
  });

  test("none covers any House from its arc cameras or the overview", () => {
    // every camera: the overview, and each House's arc, each with the point it looks at, in three.js axes
    const three = (p: Point, slug: string) => toThree(fromHouseFrame(p, sceneLayout.houses[slug]) as Point);
    const cameras = [
      { at: toThree(sceneLayout.overview.position), look: toThree(sceneLayout.overview.lookAt) },
      ...projects.flatMap((p) =>
        arcCameras(p.camera).map((c) => ({ at: three(c, p.slug), look: three(p.camera.lookAt, p.slug) })),
      ),
    ];
    // points over every face of every part of every House
    const targets = projects.flatMap((p) =>
      boxes(p.house).flatMap(([x0, y0, z0, x1, y1, z1]) => {
        const out: Point[] = [];
        const steps = [0, 0.25, 0.5, 0.75, 1];
        for (const u of steps) {
          for (const v of steps) {
            const [x, y, z] = [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * v];
            out.push([x, y0, z], [x, y1, z], [x0, y, z], [x1, y, z], [x, y0 + (y1 - y0) * v, z1]);
          }
        }
        return out.map((q) => three(q, p.slug));
      }),
    );
    const covers = (pine: (typeof pines)[number], [cx, cy, cz]: number[], [tx, ty, tz]: number[]) => {
      // most sight lines pass nowhere near the pine in plan
      const [dx, dz] = [tx - cx, tz - cz];
      const k = Math.min(1, Math.max(0, ((pine.x - cx) * dx + (pine.z - cz) * dz) / (dx * dx + dz * dz)));
      if (Math.hypot(cx + dx * k - pine.x, cz + dz * k - pine.z) > pine.radius) return false;
      const base = pine.y - SINK;
      for (let i = 1; i < 200; i++) {
        const s = i / 200;
        const [x, y, z] = [cx + (tx - cx) * s, cy + (ty - cy) * s, cz + (tz - cz) * s];
        // the crown's outline: its full radius at the lowest tier, narrowing to the tip
        const t = (y - base) / pine.height;
        if (t < 0.12 || t > 1) continue;
        if (Math.hypot(x - pine.x, z - pine.z) < pine.radius * (1 - (t - 0.12) / 0.88)) return true;
      }
      return false;
    };
    // whether a point is in a camera's frame, at 16:9 with the overview's field of view
    const inFrame = ({ at, look }: (typeof cameras)[number], t: number[]) => {
      const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
      const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
      const norm = (a: number[]) => a.map((v) => v / Math.hypot(...a));
      const f = norm(sub(look, at));
      const r = norm([-f[2], 0, f[0]]);
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      const d = sub(t, at);
      const ahead = dot(d, f);
      const half = Math.tan((OVERVIEW_FOV * Math.PI) / 360);
      return ahead > 0 && Math.abs(dot(d, u) / ahead) < half && Math.abs(dot(d, r) / ahead) < half * (16 / 9);
    };
    const hits = pines.flatMap((pine) =>
      cameras.some((c) => targets.some((t) => inFrame(c, t) && covers(pine, c.at, t))) ? [{ x: pine.x, z: pine.z }] : [],
    );
    expect(hits).toEqual([]);
    // it tests some hundred thousand sight lines
  }, 60_000);
});
