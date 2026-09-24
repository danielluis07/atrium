/**
 * The lowest rung reached this session, kept in `sessionStorage` so that
 * returning from a Project page doesn't stutter down the ladder again.
 * Storage can be missing or throw (private modes, blocked site data), so
 * every access is guarded and a failure just means no memory.
 */

import type { Ladder } from "@/lib/scene/rungs";

const key = (ladder: Ladder) => `atrium:scene-rung:${ladder}`;

type GetStorage = () => Pick<Storage, "getItem" | "setItem">;

const sessionStore: GetStorage = () => window.sessionStorage;

export function readLowestRung(ladder: Ladder, storage: GetStorage = sessionStore): number | undefined {
  try {
    const rung = Number(storage().getItem(key(ladder)));
    return Number.isInteger(rung) && rung >= 1 ? rung : undefined;
  } catch {
    return undefined;
  }
}

/** Keeps `rung` if it is below the one already kept. */
export function rememberRung(ladder: Ladder, rung: number, storage: GetStorage = sessionStore): void {
  try {
    const lowest = readLowestRung(ladder, storage);
    if (lowest === undefined || rung > lowest) storage().setItem(key(ladder), String(rung));
  } catch {
    // no memory this session
  }
}
