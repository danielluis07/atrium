import { describe, expect, test } from "bun:test";

import { chooseScenePath, isSoftwareRenderer, sceneOverride } from "@/lib/scene/policy";

const desktop = { reducedMotion: false, touchPrimary: false, webgl2: true, renderer: "ANGLE (AMD, Radeon Vega 10)" };

describe("sceneOverride", () => {
  test("reads a known path from the query", () => {
    expect(sceneOverride("?scene=lean")).toBe("lean");
    expect(sceneOverride("?foo=1&scene=still")).toBe("still");
  });

  test("ignores a missing or unknown path", () => {
    expect(sceneOverride("")).toBeUndefined();
    expect(sceneOverride("?scene=ultra")).toBeUndefined();
  });
});

describe("isSoftwareRenderer", () => {
  test("names the software rasterizers", () => {
    for (const r of [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)",
    ]) {
      expect(isSoftwareRenderer(r)).toBe(true);
    }
  });

  test("passes hardware renderers", () => {
    expect(isSoftwareRenderer("ANGLE (AMD, AMD Radeon(TM) Vega 10 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(false);
    expect(isSoftwareRenderer("Apple GPU")).toBe(false);
  });
});

describe("chooseScenePath", () => {
  test("a desktop with WebGL2 on a hardware GPU gets the Lean Scene", () => {
    expect(chooseScenePath(desktop)).toBe("lean");
  });

  test("reduced motion, no WebGL2 or a software renderer get the still", () => {
    expect(chooseScenePath({ ...desktop, reducedMotion: true })).toBe("still");
    expect(chooseScenePath({ ...desktop, webgl2: false })).toBe("still");
    expect(chooseScenePath({ ...desktop, renderer: "SwiftShader" })).toBe("still");
  });

  test("touch-primary input gets the still until the mobile Scene exists", () => {
    expect(chooseScenePath({ ...desktop, touchPrimary: true })).toBe("still");
  });

  test("an override beats every other rule", () => {
    expect(chooseScenePath({ ...desktop, override: "still" })).toBe("still");
    expect(chooseScenePath({ ...desktop, reducedMotion: true, webgl2: false, override: "lean" })).toBe("lean");
  });
});
