import { describe, expect, test } from "bun:test";

import { median, percentile, scenePart, signFlip, stats } from "@/scripts/perf/stats";

describe("percentile", () => {
  test("is nearest-rank, as the rung monitor's p90", () => {
    const ten = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5];
    expect(percentile(ten, 0.9)).toBe(9);
    expect(percentile(ten, 0.5)).toBe(5);
    expect(percentile([4], 0.9)).toBe(4);
  });
});

describe("median", () => {
  test("averages the middle two of an even count", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("stats", () => {
  test("is null for an empty window", () => {
    expect(stats([])).toBeNull();
    expect(stats([1, 2, 3])).toEqual({ n: 3, p50: 2, p90: 3, p99: 3 });
  });
});

describe("scenePart", () => {
  test("names the probed draws of the Scene", () => {
    expect(scenePart("fb4 | blit mask=4100")).toBe("MSAA resolve");
    expect(scenePart("fb3 | ? [envMapRotation,shadowRect,openSnow,openSnowIntensity,reliefKey,envMap,dfgLUT,shadowMask] | big")).toBe("terrain snow");
    expect(scenePart("fb3 | plinth [envMapRotation,shadowRect,spillK,lightDim,openSnow,reliefKey,envMap,dfgLUT,shadowMask,spillMap] | mid")).toBe("plinths");
    expect(scenePart("fb3 | ? [envMapRotation,openSnow,openSnowIntensity,envMap,dfgLUT] | inst mid")).toBe("pines");
    expect(scenePart("fb3 | ? [envMapRotation,openSnow,openSnowIntensity,envMap,dfgLUT] | mid")).toBe("mountains");
    expect(scenePart("fb3 | snow [envMapRotation,spillK,lightDim,reliefKey,envMap,dfgLUT,spillMap] | small")).toBe("House shells");
    expect(scenePart("fb3 | ? [] | small")).toBe("Interiors");
    expect(scenePart("fb6 | DownsamplingMaterial [texelSize,inputBuffer] | small")).toBe("bloom");
    expect(scenePart("fb3 | ? [uHouse,uWarm,uGlow,uRoom,uGlass,uZenith,uHorizon,uSnow] | small")).toBe("glazing");
    expect(scenePart("fb3 | Something [x] | small")).toBe("other");
  });
});

describe("signFlip", () => {
  test("finds a consistent gap and not a mixed one", () => {
    // a fixed coin keeps the test deterministic
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const consistent = signFlip([-2.2, -2.1, -2.3, -2.0, -2.2, -2.1, -2.2].map((d) => -d), 20_000, random);
    expect(consistent.higher).toBe(7);
    expect(consistent.p).toBeLessThan(0.02);
    const mixed = signFlip([1, -1, 0.5, -0.5, 0.2, -0.3], 20_000, random);
    expect(mixed.p).toBeGreaterThan(0.3);
  });
});
