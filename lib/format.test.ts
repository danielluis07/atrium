import { describe, expect, test } from "bun:test";

import { formatArea, formatElevation } from "@/lib/format";

describe("formatElevation", () => {
  test("above sea level carries a plus sign", () => {
    expect(formatElevation(40)).toBe("+40 m");
  });

  test("sea level is +0 m", () => {
    expect(formatElevation(0)).toBe("+0 m");
  });

  test("below sea level uses a true minus sign", () => {
    expect(formatElevation(-3)).toBe("−3 m");
  });
});

describe("formatArea", () => {
  test("reads in square metres", () => {
    expect(formatArea(290)).toBe("290 m²");
  });
});
