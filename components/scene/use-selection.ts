"use client";

import { useSyncExternalStore } from "react";

import type { Selection, SelectionStore } from "@/lib/scene/selection";

/** A slice of the selection store that re-renders the component when it changes. */
export function useSelection<T>(store: SelectionStore, select: (s: Selection) => T): T {
  const read = () => select(store.get());
  return useSyncExternalStore(store.subscribe, read, read);
}
