import { describe, expect, test } from "bun:test";

import { readLowestRung, rememberRung } from "@/lib/scene/memory";

function memoryStorage() {
  const items = new Map<string, string>();
  return () => ({
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  });
}

const throwing = () => {
  throw new DOMException("The operation is insecure.", "SecurityError");
};

const throwingOnUse = () => ({
  getItem: (): string | null => {
    throw new DOMException("Access denied", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("Quota exceeded", "QuotaExceededError");
  },
});

describe("session memory", () => {
  test("remembers nothing at first", () => {
    expect(readLowestRung("desktop", memoryStorage())).toBeUndefined();
  });

  test("keeps the lowest rung reached, per ladder", () => {
    const storage = memoryStorage();
    rememberRung("desktop", 2, storage);
    rememberRung("desktop", 5, storage);
    rememberRung("desktop", 3, storage);
    rememberRung("mobile", 2, storage);
    expect(readLowestRung("desktop", storage)).toBe(5);
    expect(readLowestRung("mobile", storage)).toBe(2);
  });

  test("ignores a value it didn't write", () => {
    const storage = memoryStorage();
    for (const junk of ["", "0", "-1", "2.5", "rung"]) {
      storage().setItem("atrium:scene-rung:desktop", junk);
      expect(readLowestRung("desktop", storage)).toBeUndefined();
    }
  });

  test("tolerates a sessionStorage that throws", () => {
    for (const storage of [throwing, throwingOnUse]) {
      expect(readLowestRung("desktop", storage)).toBeUndefined();
      expect(() => rememberRung("desktop", 4, storage)).not.toThrow();
    }
  });

  test("tolerates no window at all", () => {
    expect(readLowestRung("desktop")).toBeUndefined();
    expect(() => rememberRung("desktop", 4)).not.toThrow();
  });
});
