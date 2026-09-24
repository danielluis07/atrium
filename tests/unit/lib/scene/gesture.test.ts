import { describe, expect, test } from "bun:test";

import { CLICK_SLOP, moveGesture, pressGesture, releaseGesture, type Gesture } from "@/lib/scene/gesture";

/** A press at the origin, on `slug` if given, moved through `points`. */
function press(slug: string | undefined, ...points: [number, number][]): { gesture: Gesture; drags: [number, number][] } {
  let gesture: Gesture = { ...pressGesture(0, 0), slug };
  const drags: [number, number][] = [];
  for (const [x, y] of points) {
    const moved = moveGesture(gesture, x, y);
    gesture = moved.gesture;
    if (moved.drag) drags.push(moved.drag);
  }
  return { gesture, drags };
}

describe("a press on the Scene", () => {
  test("is a click up to 5 px of movement, and a drag past it", () => {
    expect(CLICK_SLOP).toBe(5);
    expect(press(undefined, [3, 4]).gesture.dragging).toBe(false); // exactly 5 px
    expect(press(undefined, [5, 0]).gesture.dragging).toBe(false);
    expect(press(undefined, [4, 4]).gesture.dragging).toBe(true); // 5.66 px
    expect(press(undefined, [0, -6]).gesture.dragging).toBe(true);
  });

  test("a click on a House selects it, and on empty snow closes", () => {
    expect(releaseGesture(press("lyngen", [2, 1]).gesture)).toEqual({ type: "select", slug: "lyngen" });
    expect(releaseGesture(press(undefined, [2, 1]).gesture)).toEqual({ type: "close" });
    expect(releaseGesture(press(undefined).gesture)).toEqual({ type: "close" });
  });

  test("a drag never closes or selects, wherever it ends", () => {
    for (const slug of [undefined, "senja"]) {
      // out and back to where it started: still a drag
      expect(releaseGesture(press(slug, [20, 0], [0, 0]).gesture)).toEqual({ type: "none" });
      expect(releaseGesture(press(slug, [6, 0]).gesture)).toEqual({ type: "none" });
      expect(releaseGesture(press(slug, [0, 300]).gesture)).toEqual({ type: "none" });
    }
  });

  test("orbits only once past the slop, and counts the drag from the press", () => {
    const { drags } = press(undefined, [2, 0], [4, 0], [8, 0], [10, 3]);
    expect(drags).toEqual([
      [8, 0],
      [2, 3],
    ]);
  });
});
