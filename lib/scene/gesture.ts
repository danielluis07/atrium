/**
 * A press on the Scene, from pointer down to release: under `CLICK_SLOP`
 * it is a click, and past it an orbit (`DESIGN.md` § Scene). A click on a
 * House selects it and a click on empty snow closes the Project Panel; a
 * drag does neither, whatever it ends over.
 */

/** How far the pointer may move between press and release and still click, CSS pixels; more is a drag. */
export const CLICK_SLOP = 5;

export type Gesture = {
  /** Where the press started, CSS pixels. */
  start: readonly [number, number];
  /** Where the pointer last was. */
  at: readonly [number, number];
  /** The House pressed, if any. */
  slug?: string;
  /** Whether it has moved past the slop: once a drag, always a drag. */
  dragging: boolean;
};

/** What a release does. */
export type Release = { type: "select"; slug: string } | { type: "close" } | { type: "none" };

export const pressGesture = (x: number, y: number): Gesture => ({ start: [x, y], at: [x, y], dragging: false });

/** The gesture after the pointer moves to `x`, `y`, and how far it moved since the last move while dragging. */
export function moveGesture(g: Gesture, x: number, y: number): { gesture: Gesture; drag?: [number, number] } {
  const dragging = g.dragging || Math.hypot(x - g.start[0], y - g.start[1]) > CLICK_SLOP;
  const gesture = { ...g, at: [x, y] as const, dragging };
  if (!dragging) return { gesture };
  // the first drag step counts from the press, so the slop isn't lost
  const from = g.dragging ? g.at : g.start;
  return { gesture, drag: [x - from[0], y - from[1]] };
}

/** What releasing the pointer does: a click selects the House pressed or closes; a drag does nothing. */
export function releaseGesture(g: Gesture): Release {
  if (g.dragging) return { type: "none" };
  return g.slug ? { type: "select", slug: g.slug } : { type: "close" };
}
