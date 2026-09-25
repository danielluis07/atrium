# House builder

Compiles each Project's House into the baked files the Scene loads, per `docs/adr/0001-houses-baked-offline-in-headless-blender.md` and `docs/design/house-schema.md`. The outputs are committed under `public/houses/<slug>/`, so `next build` never needs Blender.

```sh
bun run houses:bake lyngen               # validate + export, then bake one House (draft)
bun run houses:bake                      # every House, one at a time
bun run houses:bake --mode final lyngen  # final mode
bun run houses:bake --force lyngen       # re-bake even when the committed bake is current
bun run houses:export                    # validate + export the builder JSON only
```

A bake writes `public/houses/<slug>/<slug>.glb` (meshopt, 16-bit texcoords) and one KTX2 per lightmap (UASTC HDR 4x4, Zstandard, mipmapped): `lm-shell-base`, `lm-shell-spill`, `lm-plinth-base`, `lm-plinth-spill`. `bun test` then checks every committed GLB against its House record, and fails on a stale bake.

Draft mode (512² shell, 256² plinth, 64 spp) takes about 90 s per House on the dev laptop; final mode (1024² shell, 512² plinth, 256 spp) about 10 min. Run one bake at a time, and never alongside browser measurements: the two fight over RAM and memory bandwidth.

## The cache

Every bake writes its bake hash to the GLB extras: a sha256 of the House's exported JSON (the House, its placement, its camera block and the overview camera) and the builder version. A House whose committed GLB carries the current hash, in the mode asked for or a better one (a final bake satisfies a draft run), with its lightmaps beside it, is skipped without starting Blender. Anything else re-bakes. The GLB-contract test fails when a committed hash differs from the current one, so an edit to a House record, `content/scene.ts` or the builder can't ship without its bake.

## The download budget

`bun test` also measures the committed files against the download budget (`lib/scene/budget.ts`): all four Houses' GLBs and lightmaps at most 16 MB over the wire, and everything the Scene downloads (`sceneDownloads` in `lib/scene/assets.ts`) at most 24 MB. A file's wire size is its gzip size where that is smaller. The test prints every file, the totals and the lightmaps' estimated GPU memory (BC6H or ASTC HDR, and the RGBA16F fallback), which isn't gated. A file the Scene starts to download belongs in `sceneDownloads`, so the budget counts it.

## Seen and unseen faces

Only the overview camera (`content/scene.ts`) and each House's arc (its camera block, every 10° across ± `arc`, at pitch 8°, the authored pitch and 30°) ever see a House. The builder casts rays from each shell face to those viewpoints, with only the House itself in the way, and bakes the faces none of them reach at `UNSEEN_TEXEL_RATIO` (¼) of the texel density. Each Glazing Face gets a `seen` flag in the extras. One that no viewpoint sees prints a warning naming it: that glazing needs no design, or the House or its camera block needs another look.

## Setup, once

The preflight names whichever of these is missing before a bake starts.

- **uv**, which runs the builder's Python 3.13: <https://docs.astral.sh/uv/>. Then install `bpy` 5.2.x into the builder's environment (about 400 MB):

  ```sh
  uv sync --project scripts/houses/builder
  ```

- **KTX-Software 5.0 or later** (5.0.0-rc2 is the first release that encodes UASTC HDR), with its `bin` directory on `PATH`: <https://github.com/KhronosGroup/KTX-Software/releases>. The Windows installer asks for admin rights. Without them, unpack it with 7-Zip (`7z x KTX-Software-*-Windows-x64.exe -o<dir>`) and add `<dir>\bin` to `PATH`.
- **gltf-transform**, from `bun install`.

## Layout

- `builder/build.py`: the House compiler, promoted from the one-House prototype (#6). It reads the exported JSON, builds the shared parts, derives fascias, snow, downlights, clipped soffits and the snow plinth (stepped for a House set into the slope), culls buried faces, bevels, marks seen and unseen faces, unwraps lightmap UVs, bakes base and window-spill lightmaps with Cycles, and exports the raw GLB with the contract extras.
- `builder/denoise.py`: OIDN denoise of one lightmap through the compositor, run by `build.py` in a fresh process.
- `builder/config.py`: every builder-wide constant (detail sizes, bevels, light, materials, bake modes, the unseen texel ratio).
- `builder/pyproject.toml`: its `version` is the builder version in every bake hash. Bump it when a builder change alters what it bakes.
- `lib/house/cameras.ts`: the overview and arc viewpoints in each House's frame, exported in the builder JSON as `derived.viewpoints`.
- `preflight.ts`: the tool check. `../bake-houses.ts` and `../export-houses.ts`: the Bun entry points.
- `out/` (ignored): the exported JSON and the raw GLB, EXR lightmaps and timings of the last bake.

To debug geometry without baking, run the builder directly. `--preview` also renders `out/<slug>/preview.png`:

```sh
cd scripts/houses/builder
uv run python build.py --json ../out/lyngen.json --out ../out/lyngen --bake-hash debug --no-bake --preview
```
