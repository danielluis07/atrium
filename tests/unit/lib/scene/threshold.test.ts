import { describe, expect, test } from "bun:test";

import {
  clearThreshold,
  downloadProgress,
  raiseThreshold,
  THRESHOLD_ATTRIBUTE,
  THRESHOLD_FLOOR_MS,
  THRESHOLD_SEEN_KEY,
  thresholdScript,
  type ThresholdArrival,
} from "@/lib/scene/threshold";

const arrival: ThresholdArrival = {
  pathname: "/",
  search: "",
  hash: "",
  seen: false,
  reducedMotion: false,
  webgl2: () => true,
};

describe("raising the Threshold", () => {
  test("raises on a first arrival at the home page", () => {
    expect(raiseThreshold(arrival)).toBe(true);
  });

  test("raises when storage can't say whether it was seen", () => {
    expect(raiseThreshold({ ...arrival, seen: undefined })).toBe(true);
  });

  test("shows once per visit", () => {
    expect(raiseThreshold({ ...arrival, seen: true })).toBe(false);
  });

  test("never raises on the still path", () => {
    expect(raiseThreshold({ ...arrival, reducedMotion: true })).toBe(false);
    expect(raiseThreshold({ ...arrival, webgl2: () => false })).toBe(false);
    expect(raiseThreshold({ ...arrival, search: "?scene=still" })).toBe(false);
  });

  test("a forced live path raises it without probing WebGL", () => {
    const probe = () => {
      throw new Error("probed");
    };
    expect(raiseThreshold({ ...arrival, search: "?scene=mobile", reducedMotion: true, webgl2: probe })).toBe(true);
  });

  test("probes WebGL only when nothing else has decided", () => {
    let probes = 0;
    const webgl2 = () => (probes += 1) > 0;
    raiseThreshold({ ...arrival, seen: true, webgl2 });
    raiseThreshold({ ...arrival, reducedMotion: true, webgl2 });
    expect(probes).toBe(0);
    expect(raiseThreshold({ ...arrival, webgl2 })).toBe(true);
    expect(probes).toBe(1);
  });

  test("only on the home page, at its top", () => {
    expect(raiseThreshold({ ...arrival, pathname: "/projects/senja" })).toBe(false);
    expect(raiseThreshold({ ...arrival, hash: "#studio" })).toBe(false);
  });
});

describe("the inline script", () => {
  function run({
    storage,
    search = "",
    webgl2 = true,
  }: {
    storage?: Map<string, string>;
    search?: string;
    webgl2?: boolean;
  }) {
    const attributes = new Map<string, string>();
    const sessionStorage = storage
      ? {
          getItem: (k: string) => storage.get(k) ?? null,
          setItem: (k: string, v: string) => void storage.set(k, v),
        }
      : {
          getItem: () => {
            throw new DOMException("Access denied", "SecurityError");
          },
          setItem: () => {
            throw new DOMException("Access denied", "SecurityError");
          },
        };
    const globals = {
      window: { sessionStorage },
      location: { pathname: "/", search, hash: "" },
      matchMedia: () => ({ matches: false }),
      document: {
        documentElement: { setAttribute: (k: string, v: string) => void attributes.set(k, v) },
        createElement: () => ({
          getContext: () => (webgl2 ? { getExtension: () => ({ loseContext: () => {} }) } : null),
        }),
      },
    };
    new Function(...Object.keys(globals), thresholdScript())(...Object.values(globals));
    return attributes.get(THRESHOLD_ATTRIBUTE);
  }

  test("raises it and remembers the visit", () => {
    const storage = new Map<string, string>();
    expect(run({ storage })).toBe("up");
    expect(storage.get(THRESHOLD_SEEN_KEY)).toBe("1");
    expect(run({ storage })).toBeUndefined();
  });

  test("still raises it without storage", () => {
    expect(run({})).toBe("up");
  });

  test("leaves the still path alone", () => {
    expect(run({ storage: new Map(), search: "?scene=still" })).toBeUndefined();
    expect(run({ storage: new Map(), webgl2: false })).toBeUndefined();
  });
});

describe("clearing the Threshold", () => {
  const waiting = { path: undefined, ready: false, scrolled: false, shownFor: 0 } as const;

  test("stays up while the Scene gets ready", () => {
    expect(clearThreshold(waiting)).toBeUndefined();
    expect(clearThreshold({ ...waiting, path: "live", shownFor: 5000 })).toBeUndefined();
  });

  test("fades on the first frame once the floor has passed", () => {
    expect(clearThreshold({ ...waiting, path: "live", ready: true, shownFor: 1200 })).toEqual({
      how: "fade",
      after: 0,
    });
  });

  test("holds a quick first frame to the floor", () => {
    expect(clearThreshold({ ...waiting, path: "live", ready: true, shownFor: 300 })).toEqual({
      how: "fade",
      after: THRESHOLD_FLOOR_MS - 300,
    });
  });

  test("clears at once when the visitor scrolls first", () => {
    expect(clearThreshold({ ...waiting, scrolled: true })).toEqual({ how: "cut" });
    expect(clearThreshold({ ...waiting, path: "live", ready: true, scrolled: true, shownFor: 100 })).toEqual({
      how: "cut",
    });
  });

  test("fades straight away when the path turns out to be the still", () => {
    expect(clearThreshold({ ...waiting, path: "still" })).toEqual({ how: "fade", after: 0 });
  });
});

describe("download progress", () => {
  const downloads = ["/houses/senja/senja.glb", "/houses/senja/interior.ktx2", "/decoders/basis/basis_transcoder.wasm", "/scene/detail/snow-normal.ktx2"];

  test("is the share of the downloads finished", () => {
    expect(downloadProgress(downloads, [])).toBe(0);
    expect(
      downloadProgress(downloads, ["http://localhost:3000/houses/senja/senja.glb", "http://localhost:3000/_next/static/chunk.js"]),
    ).toBe(0.25);
    expect(downloadProgress(downloads, downloads.map((d) => `https://atrium.example${d}`))).toBe(1);
  });

  test("counts a file fetched twice (preload and loader) once", () => {
    expect(downloadProgress(downloads, ["https://a.example/houses/senja/senja.glb", "https://a.example/houses/senja/senja.glb"])).toBe(0.25);
  });

  test("is nothing for nothing to download", () => {
    expect(downloadProgress([], ["/houses/senja/senja.glb"])).toBe(0);
  });
});
