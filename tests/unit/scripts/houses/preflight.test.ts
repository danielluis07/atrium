import { describe, expect, test } from "bun:test";

import { preflight, run, type Run } from "@/scripts/houses/preflight";

/** A runner where every tool is present, except those overridden. */
const fake =
  (overrides: Record<string, { ok: boolean; stdout?: string }> = {}): Run =>
  (cmd) => {
    const key = cmd.includes("gltf-transform") ? "gltf-transform" : cmd.some((c) => c.includes("bpy")) ? "bpy" : cmd[0];
    const found = overrides[key];
    if (found) return { ok: found.ok, stdout: found.stdout ?? "" };
    const stdout = { uv: "uv 0.12.18", bpy: "5.2.2 LTS\n", ktx: "ktx version: v5.0.0-rc2~3", "gltf-transform": "4.5.0" }[key];
    return { ok: true, stdout: stdout ?? "" };
  };

describe("preflight", () => {
  test("passes when every tool is present", () => {
    expect(preflight(fake())).toEqual([]);
  });

  test("names each missing tool", () => {
    expect(preflight(fake({ ktx: { ok: false } }))).toEqual([expect.stringContaining("KTX-Software (ktx) is missing")]);
    expect(preflight(fake({ uv: { ok: false } }))).toEqual([expect.stringContaining("uv is missing")]);
    expect(preflight(fake({ bpy: { ok: false } }))).toEqual([expect.stringContaining("bpy is missing")]);
    expect(preflight(fake({ "gltf-transform": { ok: false } }))).toEqual([
      expect.stringContaining("gltf-transform is missing"),
    ]);
  });

  test("reports every missing tool at once", () => {
    const problems = preflight(fake({ uv: { ok: false }, ktx: { ok: false }, "gltf-transform": { ok: false } }));
    expect(problems).toHaveLength(3);
  });

  test("refuses the wrong bpy and a KTX-Software without UASTC HDR", () => {
    expect(preflight(fake({ bpy: { ok: true, stdout: "4.4.0" } }))).toEqual([
      expect.stringContaining("bpy 4.4.0 is installed, the builder needs 5.2.x"),
    ]);
    expect(preflight(fake({ ktx: { ok: true, stdout: "ktx version: v4.4.2" } }))).toEqual([
      expect.stringContaining("too old"),
    ]);
  });

  test("a missing executable counts as missing, not as a crash", () => {
    expect(run(["atrium-no-such-tool-xyz", "--version"])).toEqual({ ok: false, stdout: "" });
  });
});
