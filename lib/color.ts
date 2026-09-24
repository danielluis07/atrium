export type Rgb = [number, number, number];

/**
 * An OKLCH colour (`DESIGN.md` writes every colour this way) as linear sRGB,
 * the working space three.js shades in. three's `Color` can't parse
 * `oklch()`, so the Scene converts here. Out-of-gamut channels clip at 0.
 */
export function oklchToLinear(L: number, C: number, h: number): Rgb {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
