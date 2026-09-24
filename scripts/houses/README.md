# House builder

Compiles each Project's House into the baked files the Scene loads, per `docs/adr/0001-houses-baked-offline-in-headless-blender.md` and `docs/design/house-schema.md`. The outputs are committed under `public/houses/<slug>/`, so `next build` never needs Blender.

```sh
bun run houses:bake lyngen   # validate + export, then bake one House (draft)
bun run houses:bake          # every House, one at a time
bun run houses:export        # validate + export the builder JSON only
```

A bake writes `public/houses/<slug>/<slug>.glb` (meshopt, 16-bit texcoords) and one KTX2 per lightmap (UASTC HDR 4x4, Zstandard, mipmapped): `lm-shell-base`, `lm-shell-spill`, `lm-plinth-base`, `lm-plinth-spill`. `bun test` then checks every committed GLB against its House record.

Draft mode (512² shell, 256² plinth, 64 spp) takes about 90 s per House on the dev laptop. Run one bake at a time, and never alongside browser measurements: the two fight over RAM and memory bandwidth.

## Setup, once

The preflight names whichever of these is missing before a bake starts.

- **uv**, which runs the builder's Python 3.13: <https://docs.astral.sh/uv/>. Then install `bpy` 5.2.x into the builder's environment (about 400 MB):

  ```sh
  uv sync --project scripts/houses/builder
  ```

- **KTX-Software 5.0 or later** (5.0.0-rc2 is the first release that encodes UASTC HDR), with its `bin` directory on `PATH`: <https://github.com/KhronosGroup/KTX-Software/releases>. The Windows installer asks for admin rights. Without them, unpack it with 7-Zip (`7z x KTX-Software-*-Windows-x64.exe -o<dir>`) and add `<dir>\bin` to `PATH`.
- **gltf-transform**, from `bun install`.

## Layout

- `builder/build.py`: the House compiler, promoted from the one-House prototype (#6). It reads the exported JSON, builds the shared parts, derives fascias, snow, downlights, clipped soffits and the snow plinth, culls buried faces, bevels, unwraps lightmap UVs, bakes base and window-spill lightmaps with Cycles, and exports the raw GLB with the contract extras.
- `builder/denoise.py`: OIDN denoise of one lightmap through the compositor, run by `build.py` in a fresh process.
- `builder/config.py`: every builder-wide constant (detail sizes, bevels, light, materials, bake modes).
- `builder/pyproject.toml`: its `version` is the builder version in every bake hash. Bump it when a builder change alters what it bakes.
- `preflight.ts`: the tool check. `../bake-houses.ts` and `../export-houses.ts`: the Bun entry points.
- `out/` (ignored): the exported JSON and the raw GLB, EXR lightmaps and timings of the last bake.

To debug geometry without baking, run the builder directly. `--preview` also renders `out/<slug>/preview.png`:

```sh
cd scripts/houses/builder
uv run python build.py --json ../out/lyngen.json --out ../out/lyngen --bake-hash debug --no-bake --preview
```
