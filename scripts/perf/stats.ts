/**
 * The arithmetic behind the Vega measurements (`scripts/perf/README.md`): percentiles, the Scene part a
 * probed draw belongs to, and the paired sign-flip test used before calling a gap between builds real.
 */

/** The nearest-rank percentile, `p` from 0 to 1. The same rule as the rung monitor's p90. */
export function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}

export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export type Stats = { n: number; p50: number; p90: number; p99: number };

export function stats(values: readonly number[]): Stats | null {
  if (!values.length) return null;
  const r = (p: number) => +percentile(values, p).toFixed(2);
  return { n: values.length, p50: r(0.5), p90: r(0.9), p99: r(0.99) };
}

/**
 * The Scene part a probed draw belongs to, from its key: the framebuffer, the shader's `SHADER_NAME` or
 * material name, its distinctive uniforms and a size class (see `probe.ts`). When the Scene gains a
 * material, give it a line here, or it is counted as "other".
 */
export function scenePart(key: string): string {
  if (key.includes("blit")) return "MSAA resolve";
  if (key.includes("| clear")) return "clears";
  if (key.includes("| plinth ")) return "plinths";
  if (key.includes("shadowMask")) return "terrain snow";
  if (key.includes("openSnow") && key.includes("inst ")) return "pines";
  if (key.includes("openSnow")) return "mountains";
  if (key.includes("uAfterglow")) return "sky";
  if (key.includes("uPixelsPerMetre")) return "snowfall";
  if (/Luminance|Downsampling|Upsampling/.test(key)) return "bloom";
  if (key.includes("EffectMaterial")) return "tone map + composite";
  if (/N8AO|AOMaterial|PoissonBlur|EffectCompositer/i.test(key)) return "N8AO";
  if (/SMAA/i.test(key)) return "SMAA";
  if (key.includes("uGlow")) return "glazing";
  if (key.includes("uHouse")) return "House lights";
  if (/\| (snow|concrete|metal|timber) /.test(key)) return "House shells";
  if (key.includes("| ? [] |")) return "Interiors";
  if (key.includes("[envMapRotation,envMap,dfgLUT]")) return "water + small standard";
  return "other";
}

/**
 * The paired sign-flip test: runs alternate, so each pair shares a GPU state, and under "no difference"
 * each pair's sign is a coin flip. Returns how many pairs are higher on the B side and the one-sided p of
 * a mean paired difference at least this large.
 */
export function signFlip(diffs: readonly number[], trials = 100_000, random = Math.random) {
  const observed = mean(diffs);
  let hits = 0;
  for (let k = 0; k < trials; k++) {
    if (mean(diffs.map((d) => (random() < 0.5 ? d : -d))) >= observed) hits++;
  }
  return { higher: diffs.filter((d) => d > 0).length, pairs: diffs.length, meanDiff: observed, p: hits / trials };
}
