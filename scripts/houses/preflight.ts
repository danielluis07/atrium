/**
 * Checks the tools a bake needs before it starts, so a missing one fails in
 * a second with its name and how to get it, not minutes into a bake.
 */

export const BUILDER_DIR = "scripts/houses/builder";

/** Runs a command and reports whether it exited 0. Missing executables are not ok. */
export type Run = (cmd: string[]) => { ok: boolean; stdout: string };

export const run: Run = (cmd) => {
  try {
    const result = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
    return { ok: result.exitCode === 0, stdout: result.stdout.toString() };
  } catch {
    return { ok: false, stdout: "" };
  }
};

/** One line per missing or unusable tool, naming it. Empty when a bake can run. */
export function preflight(exec: Run = run): string[] {
  const problems: string[] = [];

  const uv = exec(["uv", "--version"]);
  if (!uv.ok) {
    problems.push("uv is missing: install it from https://docs.astral.sh/uv/ (it runs the builder's Python 3.13)");
  } else {
    const bpy = exec([
      "uv", "run", "--no-sync", "--project", BUILDER_DIR,
      "python", "-c", "import bpy; print(bpy.app.version_string)",
    ]);
    const version = bpy.stdout.trim().split(/\s/)[0];
    if (!bpy.ok || !version) {
      problems.push(`bpy is missing from the builder environment: run \`uv sync --project ${BUILDER_DIR}\``);
    } else if (!version.startsWith("5.2.")) {
      problems.push(`bpy ${version} is installed, the builder needs 5.2.x: run \`uv sync --project ${BUILDER_DIR}\``);
    }
  }

  const ktx = exec(["ktx", "--version"]);
  const major = Number(ktx.stdout.match(/v(\d+)\./)?.[1]);
  if (!ktx.ok) {
    problems.push(
      "KTX-Software (ktx) is missing: install 5.0 or later from https://github.com/KhronosGroup/KTX-Software/releases and put its bin directory on PATH",
    );
  } else if (!(major >= 5)) {
    problems.push(`KTX-Software ${ktx.stdout.trim()} is too old: UASTC HDR encoding needs 5.0 or later`);
  }

  if (!exec(["bun", "x", "--no-install", "gltf-transform", "--version"]).ok) {
    problems.push("gltf-transform is missing: run `bun install`");
  }
  return problems;
}
