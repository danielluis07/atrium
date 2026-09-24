import { describe, expect, test } from "bun:test";

import { formatArea, formatElevation, formatIndex, formatLevel } from "@/lib/format";

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

describe("formatIndex", () => {
  test("numbers a drawing sheet's items in two digits", () => {
    expect(formatIndex(1)).toBe("01");
    expect(formatIndex(4)).toBe("04");
    expect(formatIndex(12)).toBe("12");
  });
});

describe("formatArea", () => {
  test("reads in square metres", () => {
    expect(formatArea(290)).toBe("290 m²");
  });
});

describe("formatLevel", () => {
  test("the datum reads ±0.00", () => {
    expect(formatLevel(0)).toBe("±0.00");
    expect(formatLevel(-0.001)).toBe("±0.00");
  });

  test("Levels above and below carry a sign and two decimals", () => {
    expect(formatLevel(3.5)).toBe("+3.50");
    expect(formatLevel(-3.2)).toBe("−3.20");
  });
});
