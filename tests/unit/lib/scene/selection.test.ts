import { describe, expect, test } from "bun:test";

import { createSelectionStore, type Selection, type SelectionEvent } from "@/lib/scene/selection";

/** A store taken through `events`, from overview. */
function after(...events: SelectionEvent[]) {
  const store = createSelectionStore();
  for (const e of events) store.dispatch(e);
  return store;
}

/** Arrival of whatever flight is under way. */
const arrive = (s: Selection): SelectionEvent => ({ type: "arrive", flight: s.flight });

describe("the selection store", () => {
  test("starts at overview with nothing selected or hovered", () => {
    const s = createSelectionStore().get();
    expect(s.selected).toBeUndefined();
    expect(s.hovered).toBeUndefined();
    expect(s.phase).toBe("overview");
  });

  test("hovering names a House and leaving it names none, whatever is selected", () => {
    const store = after({ type: "hover", slug: "lyngen" });
    expect(store.get().hovered).toBe("lyngen");
    store.dispatch({ type: "select", slug: "senja" });
    store.dispatch({ type: "hover", slug: "reine" });
    expect(store.get().hovered).toBe("reine");
    store.dispatch({ type: "hover" });
    expect(store.get().hovered).toBeUndefined();
    expect(store.get().selected).toBe("senja");
  });

  test("selecting a House flies in to it, and it is at the House once that flight arrives", () => {
    const store = after({ type: "select", slug: "lyngen" });
    expect(store.get()).toMatchObject({ selected: "lyngen", phase: "flying-in" });
    store.dispatch(arrive(store.get()));
    expect(store.get()).toMatchObject({ selected: "lyngen", phase: "at-house" });
  });

  test("closing flies out to overview with nothing selected", () => {
    const store = after({ type: "select", slug: "lyngen" });
    store.dispatch(arrive(store.get()));
    store.dispatch({ type: "close" });
    expect(store.get().selected).toBeUndefined();
    expect(store.get().phase).toBe("flying-out");
    store.dispatch(arrive(store.get()));
    expect(store.get().phase).toBe("overview");
  });

  test("closing mid-flight turns the flight back", () => {
    const store = after({ type: "select", slug: "lyngen" });
    const inbound = store.get().flight;
    store.dispatch({ type: "close" });
    expect(store.get().phase).toBe("flying-out");
    expect(store.get().flight).not.toBe(inbound);
  });

  test("selecting another House flies straight to it, from wherever the camera is", () => {
    const store = after({ type: "select", slug: "lyngen" });
    store.dispatch(arrive(store.get()));
    const first = store.get().flight;
    store.dispatch({ type: "select", slug: "senja" });
    expect(store.get()).toMatchObject({ selected: "senja", phase: "flying-in" });
    expect(store.get().flight).not.toBe(first);

    // and mid-flight
    const second = store.get().flight;
    store.dispatch({ type: "select", slug: "reine" });
    expect(store.get()).toMatchObject({ selected: "reine", phase: "flying-in" });
    expect(store.get().flight).not.toBe(second);
  });

  test("selecting the House it is flying to doesn't restart the flight", () => {
    const store = after({ type: "select", slug: "lyngen" });
    const before = store.get();
    store.dispatch({ type: "select", slug: "lyngen" });
    expect(store.get()).toBe(before);
  });

  test("selecting the House it is at flies back to its hero angle", () => {
    const store = after({ type: "select", slug: "lyngen" });
    store.dispatch(arrive(store.get()));
    const at = store.get().flight;
    store.dispatch({ type: "select", slug: "lyngen" });
    expect(store.get()).toMatchObject({ selected: "lyngen", phase: "flying-in" });
    expect(store.get().flight).not.toBe(at);
  });

  test("an arrival from a flight that was superseded is ignored", () => {
    const store = after({ type: "select", slug: "lyngen" });
    const stale = arrive(store.get());
    store.dispatch({ type: "select", slug: "senja" });
    store.dispatch(stale);
    expect(store.get().phase).toBe("flying-in");
    store.dispatch(arrive(store.get()));
    expect(store.get()).toMatchObject({ selected: "senja", phase: "at-house" });
  });

  test("closing at overview changes nothing", () => {
    const store = createSelectionStore();
    const before = store.get();
    store.dispatch({ type: "close" });
    store.dispatch({ type: "hover" });
    expect(store.get()).toBe(before);
  });

  test("tells subscribers about each change, with the state before it, until they unsubscribe", () => {
    const store = createSelectionStore();
    const seen: [Selection, Selection][] = [];
    const unsubscribe = store.subscribe((next, prev) => seen.push([next, prev]));
    store.dispatch({ type: "hover", slug: "lyngen" });
    store.dispatch({ type: "hover", slug: "lyngen" });
    store.dispatch({ type: "select", slug: "lyngen" });
    expect(seen.map(([next]) => next.phase)).toEqual(["overview", "flying-in"]);
    expect(seen[1][1].phase).toBe("overview");
    unsubscribe();
    store.dispatch({ type: "close" });
    expect(seen).toHaveLength(2);
  });
});
