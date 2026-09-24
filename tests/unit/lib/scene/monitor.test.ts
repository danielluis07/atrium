import { describe, expect, test } from "bun:test";

import { monitor, p90, startMonitor, type MonitorEvent, type MonitorState } from "@/lib/scene/monitor";

const FLOOR = 6;

/** Frames at a steady `ms` apiece from `from` for `duration` ms. */
function frames(from: number, duration: number, ms: number): MonitorEvent[] {
  const events: MonitorEvent[] = [];
  for (let t = from + ms; t <= from + duration; t += ms) events.push({ type: "frame", t, ms });
  return events;
}

/** The rung after each event, collapsed to the rungs visited. */
function rungs(start: MonitorState, events: MonitorEvent[]): number[] {
  const visited = [start.rung];
  let s = start;
  for (const e of events) {
    s = monitor(s, e);
    if (s.rung !== visited.at(-1)) visited.push(s.rung);
  }
  return visited;
}

const run = (s: MonitorState, events: MonitorEvent[]) => events.reduce(monitor, s);

describe("p90", () => {
  test("is the nearest-rank 90th percentile", () => {
    expect(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
    expect(p90([5])).toBe(5);
  });
});

describe("the rung monitor", () => {
  test("holds its rung while frames fit the budget", () => {
    expect(rungs(startMonitor(1, FLOOR), frames(0, 20_000, 16.7))).toEqual([1]);
  });

  test("steps down one rung on a sustained p90 over 18 ms", () => {
    expect(rungs(startMonitor(1, FLOOR), frames(0, 3100, 20))).toEqual([1, 2]);
  });

  test("tolerates a few long frames when the p90 still fits", () => {
    // one frame in twenty runs long: the p90 stays at 16 ms
    const events = frames(0, 10_000, 16).map((e, i) =>
      e.type === "frame" && i % 20 === 0 ? { ...e, ms: 40 } : e,
    );
    expect(rungs(startMonitor(1, FLOOR), events)).toEqual([1]);
  });

  test("waits out the cool-down after a step before judging again", () => {
    const stepped = run(startMonitor(1, FLOOR), frames(0, 3020, 20));
    expect(stepped.rung).toBe(2);
    // still slow, but under 3 s since the step
    expect(run(stepped, frames(3020, 2900, 20)).rung).toBe(2);
    expect(run(stepped, frames(3020, 3100, 20)).rung).toBe(3);
  });

  test("judges no sooner than a full window after it starts", () => {
    expect(run(startMonitor(1, FLOOR), frames(0, 2900, 50)).rung).toBe(1);
  });

  test("never steps up, however fast the frames get", () => {
    const slow = run(startMonitor(1, FLOOR), frames(0, 3100, 25));
    expect(rungs(slow, frames(3100, 30_000, 4))).toEqual([2]);
  });

  test("stops at the floor", () => {
    expect(rungs(startMonitor(4, FLOOR), frames(0, 60_000, 40))).toEqual([4, 5, 6]);
    const floor = startMonitor(FLOOR, FLOOR);
    expect(run(floor, frames(0, 10_000, 100))).toBe(floor);
  });

  test("ignores frames during a shader compile", () => {
    const events: MonitorEvent[] = [
      { type: "compile", compiling: true },
      ...frames(0, 5000, 200),
      { type: "compile", compiling: false },
      ...frames(5000, 5000, 16),
    ];
    expect(rungs(startMonitor(1, FLOOR), events)).toEqual([1]);
  });

  test("ignores the first 500 ms of a fly-to", () => {
    const events: MonitorEvent[] = [
      ...frames(0, 2000, 16),
      { type: "fly-to", t: 2000 },
      // the camera's first moves run long while the view swings
      ...frames(2000, 500, 20),
      ...frames(2500, 4000, 16),
    ];
    expect(rungs(startMonitor(1, FLOOR), events)).toEqual([1]);
    // the same stretch outside a fly-to is counted
    expect(rungs(startMonitor(1, FLOOR), events.filter((e) => e.type !== "fly-to"))).toEqual([1, 2]);
  });

  test("pauses while hidden, and ignores the first frame back", () => {
    const events: MonitorEvent[] = [
      ...frames(0, 2000, 16),
      { type: "visible", visible: false },
      // nothing renders while hidden; any stray frame is ignored
      ...frames(2000, 10_000, 100),
      { type: "visible", visible: true },
      // the first frame back spans the whole time away
      { type: "frame", t: 60_000, ms: 48_000 },
      ...frames(60_000, 5000, 16),
    ];
    expect(rungs(startMonitor(1, FLOOR), events)).toEqual([1]);
  });

  test("starts its window over after a pause, so old frames don't count", () => {
    const events: MonitorEvent[] = [
      ...frames(0, 2500, 30),
      { type: "visible", visible: false },
      { type: "visible", visible: true },
      ...frames(10_000, 2900, 30),
    ];
    // 2.5 s + 2.9 s of slow frames, but never a full window of them in a row
    expect(rungs(startMonitor(1, FLOOR), events)).toEqual([1]);
  });
});
