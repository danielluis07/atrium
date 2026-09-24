const MINUS = "−";

/**
 * Formats a Depth mark the way a level mark reads on a section drawing:
 * `±0.00` at grade, `▽ −1.00` below it, `▽ −∞` for nowhere.
 */
export function formatDepth(depth: number): string {
  if (depth === 0) return "±0.00";
  if (depth > 0) throw new RangeError(`A Depth is at or below grade, got ${depth}`);
  if (depth === -Infinity) return `▽ ${MINUS}∞`;
  return `▽ ${MINUS}${Math.abs(depth).toFixed(2)}`;
}

/** The home page anchor for a Depth, usable from any page. */
export function depthHref(id: string): string {
  return `/#${id}`;
}
