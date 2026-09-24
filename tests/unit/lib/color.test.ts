import { expect, test } from "bun:test";

import { oklchToLinear } from "@/lib/color";

test("converts OKLCH to linear sRGB", () => {
  // the snow paper, `--background` (docs/research/scene-rendering.md §2)
  const [r, g, b] = oklchToLinear(0.975, 0.004, 240);
  expect(r).toBeCloseTo(0.908, 3);
  expect(g).toBeCloseTo(0.931, 3);
  expect(b).toBeCloseTo(0.949, 3);
  expect(oklchToLinear(1, 0, 0).map((c) => +c.toFixed(4))).toEqual([1, 1, 1]);
  expect(oklchToLinear(0, 0, 0)).toEqual([0, 0, 0]);
});
