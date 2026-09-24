/**
 * The Scene's selection: which House is selected and which is hovered, and
 * where the camera is between overview and the selected House. It is the
 * one seam between the DOM UI (the Project Panel, later the Section Cut)
 * and the Scene. Selection is not in the URL.
 */

/**
 * Where the camera is: at overview, flying in to the selected House, at it,
 * or flying back out to overview.
 */
export type CameraPhase = "overview" | "flying-in" | "at-house" | "flying-out";

/** Whether the camera is between overview and a House. */
export const isFlying = (phase: CameraPhase) => phase === "flying-in" || phase === "flying-out";

export type Selection = {
  /** The selected House's Project slug; none at overview. */
  selected?: string;
  /** The House under the pointer. */
  hovered?: string;
  phase: CameraPhase;
  /** Which flight the camera is on: every new flight gets a new number, so a superseded one can't arrive. */
  flight: number;
  /** Whether a drag is orbiting the selected House; while it does, nothing hovers. */
  dragging?: boolean;
};

export type SelectionEvent =
  | { type: "hover"; slug?: string }
  | { type: "select"; slug: string }
  | { type: "close" }
  /** A drag starts or stops orbiting; one only starts at a House. */
  | { type: "drag"; dragging: boolean }
  /** The camera finished `flight`. */
  | { type: "arrive"; flight: number };

const START: Selection = { phase: "overview", flight: 0 };

/** The selection after `e`; the same object when nothing changed. */
export function reduceSelection(s: Selection, e: SelectionEvent): Selection {
  switch (e.type) {
    case "hover":
      return s.hovered === e.slug || s.dragging ? s : { ...s, hovered: e.slug };
    case "drag":
      if (!!s.dragging === e.dragging) return s;
      if (e.dragging && s.phase !== "at-house") return s;
      return { ...s, dragging: e.dragging, hovered: e.dragging ? undefined : s.hovered };
    case "select":
      // already on its way there; at the House, selecting it again returns to its hero angle
      if (s.selected === e.slug && s.phase === "flying-in") return s;
      return { ...s, selected: e.slug, phase: "flying-in", flight: s.flight + 1 };
    case "close":
      if (!s.selected) return s;
      return { ...s, selected: undefined, phase: "flying-out", flight: s.flight + 1, dragging: false };
    case "arrive":
      if (e.flight !== s.flight) return s;
      if (s.phase === "flying-in") return { ...s, phase: "at-house" };
      if (s.phase === "flying-out") return { ...s, phase: "overview" };
      return s;
  }
}

export type SelectionStore = {
  get(): Selection;
  dispatch(e: SelectionEvent): void;
  /** Called after every change with the new state and the one before it. */
  subscribe(listener: (next: Selection, prev: Selection) => void): () => void;
};

export function createSelectionStore(): SelectionStore {
  let state = START;
  const listeners = new Set<(next: Selection, prev: Selection) => void>();
  return {
    get: () => state,
    dispatch(e) {
      const prev = state;
      state = reduceSelection(state, e);
      if (state !== prev) for (const listener of listeners) listener(state, prev);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
