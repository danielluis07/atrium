import { describe, expect, test } from "bun:test";

import {
  chooseScenePath,
  isDiscreteGpu,
  isSoftwareRenderer,
  sceneOverride,
  type GpuClass,
  type SceneCapabilities,
  type SceneChoice,
} from "@/lib/scene/policy";
import { renderConfig } from "@/lib/scene/rungs";

const IGPU: GpuClass = { tier: 2, gpu: "amd radeon vega 10 graphics" };
const DISCRETE_TIER_2: GpuClass = { tier: 2, gpu: "nvidia geforce gtx 1650" };
const TIER_3: GpuClass = { tier: 3, gpu: "nvidia geforce rtx 3080" };

const desktop: SceneCapabilities = {
  reducedMotion: false,
  touchPrimary: false,
  webgl2: true,
  renderer: "ANGLE (AMD, Radeon Vega 10)",
  gpu: IGPU,
};
const touch: SceneCapabilities = { ...desktop, touchPrimary: true, renderer: "Adreno (TM) 730", gpu: { tier: 3 } };

const TARGET: SceneChoice = { path: "target", rung: 1 };
const LEAN: SceneChoice = { path: "lean", rung: 4 };
const MOBILE: SceneChoice = { path: "mobile", rung: 1 };
const STILL: SceneChoice = { path: "still" };

describe("sceneOverride", () => {
  test("reads a known path from the query", () => {
    for (const path of ["target", "lean", "mobile", "still"] as const) {
      expect(sceneOverride(`?foo=1&scene=${path}`)).toBe(path);
    }
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

describe("isDiscreteGpu", () => {
  test("names NVIDIA, AMD RX and Radeon Pro parts", () => {
    for (const gpu of [
      "nvidia geforce rtx 3080",
      "nvidia quadro p2000",
      "amd radeon rx 6800 xt",
      "amd radeon rx vega 64",
      "amd radeon pro 5500m",
    ]) {
      expect({ gpu, discrete: isDiscreteGpu(gpu) }).toEqual({ gpu, discrete: true });
    }
  });

  test("passes integrated and unknown GPUs", () => {
    for (const gpu of [
      "amd radeon vega 10 graphics",
      "amd radeon rx vega 11 graphics",
      "intel iris xe graphics",
      "apple m2",
      "apple gpu",
    ]) {
      expect({ gpu, discrete: isDiscreteGpu(gpu) }).toEqual({ gpu, discrete: false });
    }
  });
});

describe("chooseScenePath", () => {
  test("a discrete desktop GPU starts on Target, at rung 1", () => {
    expect(chooseScenePath({ ...desktop, gpu: TIER_3 })).toEqual(TARGET);
    expect(chooseScenePath({ ...desktop, gpu: DISCRETE_TIER_2 })).toEqual(TARGET);
  });

  test("everything else starts on Lean, at rung 4", () => {
    expect(chooseScenePath(desktop)).toEqual(LEAN);
    expect(chooseScenePath({ ...desktop, gpu: { tier: 1, gpu: "nvidia geforce gt 710" } })).toEqual(LEAN);
    expect(chooseScenePath({ ...desktop, gpu: { tier: 2, gpu: "apple gpu" } })).toEqual(LEAN);
    expect(chooseScenePath({ ...desktop, gpu: { tier: 2 } })).toEqual(LEAN);
  });

  test("an integrated GPU starts on Lean even at tier 3", () => {
    for (const gpu of ["apple m2 max", "apple gpu", "intel iris xe graphics", "amd radeon 780m"]) {
      expect({ gpu, choice: chooseScenePath({ ...desktop, gpu: { tier: 3, gpu } }) }).toEqual({ gpu, choice: LEAN });
    }
    expect(chooseScenePath({ ...desktop, gpu: { tier: 3 } })).toEqual(LEAN);
  });

  test("a detect-gpu timeout or error falls back to Lean", () => {
    expect(chooseScenePath({ ...desktop, gpu: "timeout" })).toEqual(LEAN);
    expect(chooseScenePath({ ...desktop, gpu: "error" })).toEqual(LEAN);
  });

  test("tier 0 gets the still, on any input", () => {
    expect(chooseScenePath({ ...desktop, gpu: { tier: 0 } })).toEqual(STILL);
    expect(chooseScenePath({ ...touch, gpu: { tier: 0 } })).toEqual(STILL);
  });

  test("touch-primary input gets the mobile Scene, whatever the GPU", () => {
    expect(chooseScenePath(touch)).toEqual(MOBILE);
    expect(chooseScenePath({ ...touch, gpu: TIER_3 })).toEqual(MOBILE);
    expect(chooseScenePath({ ...touch, gpu: "timeout" })).toEqual(MOBILE);
  });

  test("reduced motion, no WebGL2 or a software renderer get the still, whatever the input or tier", () => {
    for (const base of [desktop, touch]) {
      for (const gpu of [TIER_3, IGPU, "timeout" as const]) {
        expect(chooseScenePath({ ...base, gpu, reducedMotion: true })).toEqual(STILL);
        expect(chooseScenePath({ ...base, gpu, webgl2: false })).toEqual(STILL);
        expect(chooseScenePath({ ...base, gpu, renderer: "Google SwiftShader" })).toEqual(STILL);
      }
    }
  });

  test("an override beats every other rule", () => {
    const worst: SceneCapabilities = { ...touch, reducedMotion: true, webgl2: false, gpu: { tier: 0 } };
    expect(chooseScenePath({ ...worst, override: "target" })).toEqual(TARGET);
    expect(chooseScenePath({ ...worst, override: "lean" })).toEqual(LEAN);
    expect(chooseScenePath({ ...worst, override: "mobile" })).toEqual(MOBILE);
    expect(chooseScenePath({ ...desktop, gpu: TIER_3, override: "still" })).toEqual(STILL);
  });

  test("resumes at the lowest rung this session reached, never above the start", () => {
    expect(chooseScenePath({ ...desktop, gpu: TIER_3, lowest: { desktop: 2 } })).toEqual({ path: "target", rung: 2 });
    expect(chooseScenePath({ ...desktop, gpu: TIER_3, lowest: { desktop: 5 } })).toEqual({ path: "lean", rung: 5 });
    expect(chooseScenePath({ ...desktop, lowest: { desktop: 2 } })).toEqual(LEAN);
    expect(chooseScenePath({ ...desktop, lowest: { desktop: 99 } })).toEqual({ path: "lean", rung: 6 });
    expect(chooseScenePath({ ...desktop, lowest: { mobile: 3 } })).toEqual(LEAN);
    expect(chooseScenePath({ ...touch, lowest: { mobile: 2 } })).toEqual({ path: "mobile", rung: 2 });
  });

  test("an override ignores session memory", () => {
    expect(chooseScenePath({ ...desktop, override: "target", lowest: { desktop: 6 } })).toEqual(TARGET);
  });
});

describe("renderConfig", () => {
  test("Target is MSAA + SMAA + N8AO + bloom at DPR 2", () => {
    expect(renderConfig("desktop", 1)).toEqual({ dpr: 2, msaa: 4, smaa: true, ao: "full", bloom: true });
  });

  test("the desktop ladder loses the cheapest look first", () => {
    expect(renderConfig("desktop", 2)).toEqual({ dpr: 1.5, msaa: 4, smaa: true, ao: "full", bloom: true });
    expect(renderConfig("desktop", 3)).toEqual({ dpr: 1.5, msaa: 4, smaa: true, ao: "half", bloom: true });
    expect(renderConfig("desktop", 5)).toEqual({ dpr: 0.75, msaa: 4, smaa: false, ao: false, bloom: true });
    expect(renderConfig("desktop", 6)).toEqual({ dpr: 0.75, msaa: 4, smaa: false, ao: false, bloom: false });
  });

  test("Lean is MSAA + bloom at DPR 1", () => {
    expect(renderConfig("desktop", 4)).toEqual({ dpr: 1, msaa: 4, smaa: false, ao: false, bloom: true });
  });

  test("the mobile ladder only drops the DPR", () => {
    expect([1, 2, 3].map((rung) => renderConfig("mobile", rung).dpr)).toEqual([1.5, 1, 0.75]);
  });
});
