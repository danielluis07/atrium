/**
 * The rung monitor (`DESIGN.md` § Render tiers, Stepping down): a reducer over
 * frame-time samples and events. It steps down one rung when the p90 frame
 * time over a rolling window runs over the threshold, then waits a cool-down
 * before judging again. The step onto the floor needs the p90 over the threshold
 * for longer, so a short slow spell doesn't cost the floor's lost effects for the
 * rest of the visit. It never steps up, and at the floor it stops.
 * Times are in milliseconds on one clock (`performance.now()`).
 */

/** Frame time is judged against a fixed 60 Hz budget, whatever the display's refresh rate. */
export const FRAME_BUDGET = 16.7;
/** A window whose p90 runs over this steps down. */
export const P90_LIMIT = 18;
/** The rolling window the p90 is taken over. */
export const WINDOW = 3000;
/** How long after a step, or after the monitor (re)starts, before it judges. */
export const COOL_DOWN = 3000;
/** How long the p90 must stay over the threshold, window after window, before the step onto the floor. */
export const FLOOR_SUSTAIN = 10_000;
/** How much of a fly-to is ignored. */
export const FLY_TO_EXCLUDED = 500;

export type MonitorState = {
  rung: number;
  /** The last rung on the ladder. */
  floor: number;
  /** Frame times inside the window, oldest first. */
  samples: readonly { t: number; ms: number }[];
  /** When counting (re)started; undefined until the first counted frame. */
  since?: number;
  /** Since when the window's p90 has been over the threshold without a break; undefined while it fits. */
  overSince?: number;
  /** Frames before this are ignored (a fly-to). */
  excludedUntil: number;
  /** A shader compile is under way. */
  compiling: boolean;
  /** The Scene is off screen or the tab hidden. */
  paused: boolean;
  /** The next frame straddles a pause, so it is ignored. */
  skipNext: boolean;
};

export type MonitorEvent =
  /** A frame rendered at `t`, taking `ms` since the one before. */
  | { type: "frame"; t: number; ms: number }
  /** The Scene went off screen or the tab hidden (false), or came back (true). */
  | { type: "visible"; visible: boolean }
  /** The camera started a fly-to. */
  | { type: "fly-to"; t: number }
  /** A shader compile started, or finished. */
  | { type: "compile"; compiling: boolean };

export function startMonitor(rung: number, floor: number): MonitorState {
  return { rung, floor, samples: [], excludedUntil: -Infinity, compiling: false, paused: false, skipNext: false };
}

/** Starts the window over: after a step, a pause or an excluded stretch. */
const restart = (s: MonitorState): MonitorState => ({ ...s, samples: [], since: undefined, overSince: undefined });

export function monitor(s: MonitorState, e: MonitorEvent): MonitorState {
  if (s.rung >= s.floor) return s;
  switch (e.type) {
    case "visible":
      if (e.visible === !s.paused) return s;
      return e.visible ? { ...restart(s), paused: false, skipNext: true } : { ...s, paused: true };
    case "fly-to":
      return { ...s, excludedUntil: Math.max(s.excludedUntil, e.t + FLY_TO_EXCLUDED) };
    case "compile":
      return e.compiling ? { ...s, compiling: true } : { ...restart(s), compiling: false };
    case "frame":
      return frame(s, e.t, e.ms);
  }
}

function frame(s: MonitorState, t: number, ms: number): MonitorState {
  if (s.paused || s.compiling) return s;
  if (s.skipNext) return { ...s, skipNext: false };
  if (t < s.excludedUntil) return s;
  const since = s.since ?? t;
  const samples = [...s.samples.filter((x) => x.t > t - WINDOW), { t, ms }];
  const over = p90(samples.map((x) => x.ms)) > P90_LIMIT;
  const overSince = over ? (s.overSince ?? t) : undefined;
  const next = { ...s, since, samples, overSince };
  if (overSince === undefined || t - since < COOL_DOWN) return next;
  if (s.rung + 1 === s.floor && t - overSince < FLOOR_SUSTAIN) return next;
  return restart({ ...next, rung: s.rung + 1 });
}

/** The nearest-rank 90th percentile. */
export function p90(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)];
}
