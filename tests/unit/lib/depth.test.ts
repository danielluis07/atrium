import { describe, expect, test } from "bun:test";

import { depthHref, formatDepth } from "@/lib/depth";

describe("formatDepth", () => {
  test("grade reads ±0.00", () => {
    expect(formatDepth(0)).toBe("±0.00");
    expect(formatDepth(-0)).toBe("±0.00");
  });

  test("below grade uses the level triangle and a true minus sign", () => {
    expect(formatDepth(-1)).toBe("▽ −1.00");
    expect(formatDepth(-4)).toBe("▽ −4.00");
    expect(formatDepth(-2.5)).toBe("▽ −2.50");
  });

  test("the 404 sits at minus infinity", () => {
    expect(formatDepth(-Infinity)).toBe("▽ −∞");
  });

  test("nothing sits above grade", () => {
    expect(() => formatDepth(1)).toThrow(RangeError);
  });
});

describe("depthHref", () => {
  test("points at the home page anchor so it works from any page", () => {
    expect(depthHref("projects")).toBe("/#projects");
  });
});
