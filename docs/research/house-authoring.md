# How should Houses be authored?

Research for #3 (map: #1). Question: should the four Houses come from procedural three.js/R3F geometry at runtime, from headless-Blender Python scripts that bake lighting and export GLB, or from a hybrid? The human won't open Blender. Agents may run it in a build step.

Researched 2026-09-23 against Blender 5.2 LTS, three.js r186 (`dev` branch), glTF-Transform 4.5.0 and drei 10.7.8. Claims link to the docs or source that own them. Items marked **measured** were run on the dev machine (Ryzen 7 3700U, Radeon Vega 10 iGPU, Windows 11, Bun 1.4.2, Python 3.13.15).

## TL;DR

**Recommendation: route 2, Blender as a build-time compiler, with a thin live layer in R3F.** Project data (TypeScript) is written out as JSON. A headless Blender Python script builds each House from the shared parts (volume, slab, glazing, fascia, stone mass), bevels it, unwraps a lightmap UV, bakes lighting with Cycles and exports a meshopt GLB. glTF-Transform then compresses the textures to KTX2. At runtime R3F loads the GLB, attaches the lightmap and adds everything that has to stay live: window emissive for hover, snow, fog/Whiteout, camera. The baked files are committed, so `next build` never needs Blender.

The reason is the look DESIGN.md describes. At blue hour, the Scene's warm light comes from windows and soffit downlights spilling onto snow and concrete. That is many small area lights plus bounce light. Only a path-traced bake gets that at arch-viz sharpness for a fixed runtime cost. Every browser-side option is either limited to direct light and shadow maps, or unmaintained.

This contradicts one line of `DESIGN.md` ("Houses are **built procedurally** in react-three-fiber"). If this recommendation is accepted, change that line to "built procedurally from shared parts by a build script". The idea of data-driven shared parts stays; the parts become Python functions instead of R3F components.

## The three routes

### Route 1: procedural three.js/R3F at runtime

**Pipeline.** `projects.ts` → R3F components `<Volume>`, `<Slab>`, `<Glazing>`, `<Fascia>`, `<StoneMass>` → `BufferGeometry` built on the client → lit live (env map, a few lights, shadow maps, screen-space AO).

**Detail ceiling.**
- Bevels: available. `ExtrudeGeometry` has `bevelEnabled`, `bevelThickness`, `bevelSize`, `bevelOffset` and `bevelSegments` ([source](https://github.com/mrdoob/three.js/blob/dev/src/geometries/ExtrudeGeometry.js)), but only along the extrusion caps, and "bevels not supported for path extrusion". `RoundedBoxGeometry` ([addon](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/geometries/RoundedBoxGeometry.js)) gives rounded boxes with UVs. drei wraps it as `<RoundedBox>`. Neither has anything like Blender's "harden normals" on bevels. Getting crisp flat faces with soft edge highlights takes hand-written normal fixes.
- Openings and booleans (window reveals cut into volumes): `three-bvh-csg` is fast ("more than 100 times faster than other BSP-based three.js CSG libraries"). It is also "experimental, in progress". It requires two-manifold inputs and warns the output "may not be correctly completely two-manifold" ([README](https://github.com/gkjohnson/three-bvh-csg)). Latest npm version is 0.0.18.
- Baked GI: this is where route 1 falls short. The options:
  - Runtime AO: `GTAOPass`/`SAOPass`/`SSAOPass` in WebGL, `GTAONode`/`SSGINode` in WebGPU/TSL ([three.js postprocessing](https://github.com/mrdoob/three.js/tree/dev/examples/jsm/postprocessing), [tsl/display](https://github.com/mrdoob/three.js/tree/dev/examples/jsm/tsl/display)). These are screen-space, cost frame time every frame, and see only what is on screen.
  - drei `<AccumulativeShadows>` is "a planar, Y-up oriented shadow-catcher" ([docs](https://github.com/pmndrs/drei/blob/master/docs/staging/accumulative-shadows.mdx)). It works for ground contact shadows. It cannot light facades or soffits.
- UVs: whatever the generator writes. Tiling board-formed concrete from world-space UVs is easy. A second non-overlapping UV for lightmaps would need xatlas in wasm (`xatlas-three` 0.2.1, last pushed 2024-09).

**Agent iteration speed.** Best of the three. Edit TS, HMR, look. Checking it visually still means running the dev server and taking browser screenshots.

**Windows + Bun tooling.** None beyond the app itself.

**File size.** Near zero for geometry, since Project data is a few KB. Download cost is textures (tiling concrete, timber, stone) and code. Cost moves to the visitor's GPU: live lights, shadows and screen-space AO on every frame.

### Route 2: headless Blender → baked GLB

**Pipeline.**

```
lib/projects.ts ──bun script──▶ build/houses/<slug>.json
      │
      ▼
blender -b --factory-startup --python-exit-code 1 -P scripts/house/build.py -- <slug>.json
   parts → Bevel modifier (harden normals) → apply → join
   UVMap (tiling materials) + Lightmap UV (lightmap_pack / smart_project)
   Cycles bake → lightmap (+ AO) images
   export_scene.gltf(GLB, meshopt, WebP)
      │
      ▼
gltf-transform (KTX2 UASTC/ETC1S for textures + lightmap, resize, dedup)
      │
      ▼
public/houses/<slug>.glb + <slug>-lightmap.ktx2   (committed)
      │
      ▼
R3F: useGLTF → assign material.lightMap (texture.channel = 1) → live layers
```

**The facts behind each step.**
- CLI: `-b/--background` "Run in background (often used for UI-less rendering)". `-P/--python <filepath>` runs a script. `--python-exit-code <code>` sets the exit code "if a Python exception is raised". `--factory-startup` skips the user's startup.blend. `--` means "End option processing, following arguments passed unchanged. Access via Python's `sys.argv`" ([Blender 5.2 CLI arguments](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html)). With `--python-exit-code`, a failing build fails the Bun script instead of hanging or silently succeeding.
- Blender without Blender: `bpy` is published on PyPI as "Blender as a Python module", version 5.2.2, `requires_python ==3.13.*`, with `win_amd64` wheels ([PyPI](https://pypi.org/project/bpy/)). The dev machine has Python 3.13.15, so `pip install bpy==5.2.2` works with no Blender install (**measured**). The regular install is also on winget as `BlenderFoundation.Blender` 5.2.1.
- Bevels: the Bevel modifier has segments, profile shape, angle-based limits, clamp overlap and **Harden Normals**: "the normals of the bevel faces are adjusted to match the surrounding faces … This will keep the surrounding faces flat … with the bevel faces shading smoothly into them" ([Bevel modifier](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/bevel.html)). This is the thin catch-light on the arrises of concrete and fascia that reads as "sharp".
- Lightmap UVs: Lightmap Pack "places each selected face separately on the UV map … prioritize using as much of the texture as possible". With Share Texture Space, several meshes share one lightmap without overlap, and New UV Map writes to a second UV layer ([UV unwrapping](https://docs.blender.org/manual/en/latest/modeling/meshes/editing/uv.html)).
- Bake: "Baking requires a mesh to have a UV map, and either a Color Attribute or an Image Texture node … The Active Image Texture node … is used as the baking target". Bake types include Combined, Ambient Occlusion, Shadow, Diffuse (with Direct/Indirect/Color toggles), Emit and Normal. The manual lists "Creating light maps to provide global illumination" as a purpose ([Render Baking](https://docs.blender.org/manual/en/latest/render/cycles/baking.html)). `bpy.ops.object.bake(type=…, pass_filter=…, width, height, margin, uv_layer=…)` bakes to a named UV layer ([bpy.ops.object](https://docs.blender.org/api/current/bpy.ops.object.html)).
- Export: the glTF add-on exports `KHR_draco_mesh_compression`, `EXT_meshopt_compression`/`KHR_meshopt_compression`, `KHR_materials_emissive_strength`, `KHR_materials_transmission`/`volume`/`ior` and `EXT_mesh_gpu_instancing`. It also has an "Apply Modifiers" option and a WebP image format option ([glTF 2.0 add-on](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html)). It does **not** export KTX2. Baked AO has a slot: a node group named `glTF Material Output` with an `Occlusion` input is written as the glTF occlusion texture, in the R channel.
- There is no lightmap slot in core glTF. three.js maps `TEXCOORD_1` to `uv1`, and `Texture.channel` picks the UV set: "`0` for `uv`, `1` for `uv1`…" ([GLTFLoader](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/GLTFLoader.js), [Texture.js](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)). So the lightmap ships as a sidecar texture (or rides on an unused texture slot) and is attached in a few lines after `useGLTF`. GLTFLoader reads everything the pipeline emits: meshopt (EXT and KHR), `KHR_texture_basisu` (KTX2), `EXT_texture_webp`, Draco and `KHR_materials_emissive_strength`. drei's `useGLTF(path, useDraco = true, useMeshOpt = true)` turns the decoders on by default ([drei useGLTF](https://github.com/pmndrs/drei/blob/master/docs/loaders/gltf-use-gltf.mdx)).

**Detail ceiling.** Highest. You get real bevels with hardened normals and robust modifiers (Boolean, Solidify, Array for mullions and board-form strips). The bake is path-traced GI: window spill on snow, downlight pools on timber soffits, bounce light under cantilevers, contact darkening where the stone mass meets the slab. The limit is lightmap texel density, not the tools (see risks).

**Agent iteration speed.** Slower, but workable with two build modes.

**Measured** with the `bpy` 5.2.2 wheel, CPU Cycles, on a probe House: two stacked beveled volumes, a cantilevered slab, a stone mass, a glazing panel and ground; 766 triangles after bevel; blue sky plus a low sun; Diffuse direct+indirect bake to a second UV layer. Probe script: built from data in about 120 lines of Python.

| Lightmap | Samples | Bake time | Whole script |
| --- | --- | --- | --- |
| 512² | 16 | 2.4 s | 2.9 s |
| 1024² | 128 | 72 s | 73 s |
| 2048² | 256 | 399 s | 400 s |

- Bake time scales with texels × samples. Geometry build, UV pack and export each take under 1 s.
- This machine gets **no GPU acceleration**. Cycles HIP "requires an AMD graphics card with the RDNA1 architecture or newer" ([GPU rendering](https://docs.blender.org/manual/en/latest/render/cycles/gpu_rendering.html)), and Vega 10 is older. A final bake of four Houses at 2048²/256 would take roughly 30 min or more on this laptop. That is fine for a final step, bad for a tweak loop.
- So an agent needs a **draft mode** (no bake, or 512²/16 in about 3 s per House) and a **final mode**. Cache by a hash of House data + script, so only changed Houses re-bake.
- Blender can also render a preview PNG of each House headless. An agent can look at it without starting the site.

**Windows + Bun tooling.**
- Blender or the `bpy` wheel (above). Bun calls it with `Bun.spawn`/`Bun.$`.
- glTF-Transform CLI runs under `bunx @gltf-transform/cli@4.5.0` on Windows (**measured**). `inspect` and `optimize` work. `optimize` defaults to `--compress meshopt` and `--texture-compress auto` ([CLI source](https://github.com/donmccurdy/glTF-Transform/blob/main/packages/cli/src/cli.ts)). The website's example line shows draco/webp.
- KTX2 (`uastc`, `etc1s`, `--texture-compress ktx2`) shells out to KTX-Software. Without it, the command fails with `Command "ktx" not found. Please install KTX-Software 4.4.0+` (**measured**). KTX-Software 4.4.2 ships `Windows-x64.exe` installers ([releases](https://github.com/KhronosGroup/KTX-Software/releases)). WebP/AVIF use `sharp`, which is already a trusted dependency in `package.json`.
- Vercel/CI build machines won't have Blender. Keep baking an offline agent step and commit the outputs.

**File size.**
- Geometry is small. The probe exported at 41 KB from Blender with meshopt but float32 attributes and an extra UV set. `gltf-transform optimize` (quantize + meshopt) took it to 13.8 KB (**measured**). A real House with mullions, fascia, balustrades and roof snow might have 10–50× the triangles. That is still a few hundred KB per House at most, which is an estimate.
- Lightmaps dominate. KTX2/UASTC is about 1 byte/texel before zstd (≈4 MB for 2048², less after supercompression). ETC1S is several times smaller at lower quality; glTF-Transform's own help suggests UASTC for normal maps and ETC1S for others. Four Houses at 2048² UASTC land in the ~8–16 MB range before tuning. Needs a budget from the performance ticket.
- The raw HDR bake was 9.4 MB. It is a build intermediate and never shipped.

### Route 3: hybrid

Two readings of the ticket:

**3a. JS geometry, baked in the browser at load.**
- `ProgressiveLightMap` (three.js addon) accumulates shadow-map samples into a lightmap on the visitor's GPU. It rewrites each mesh's `uv1` by box-packing the existing `uv` with potpack, so each mesh's own `uv` must already be a clean 0–1 unwrap. It sees only the lights you jitter ([source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/misc/ProgressiveLightMap.js)). That makes it soft direct shadowing, not path-traced bounce.
- `@react-three/lightmap` ("In-browser lightmap/AO baker") had its last npm release, 0.0.8, in January 2022. Its README says "currently the lightmap is indirect-only" and lists denoising as a wishlist item ([README](https://github.com/pmndrs/react-three-lightmap)).
- `three-gpu-pathtracer` is an actively maintained path tracer (pushed 2026-09). Its README exposes a render target, not a lightmap baker ([README](https://github.com/gkjohnson/three-gpu-pathtracer)). It fits the pre-rendered still for no-WebGL visitors (map, "Not yet specified"), not lightmaps.
- Verdict: the baking costs the visitor seconds of GPU time on every visit and produces lower-quality light. Not recommended.

**3b. JS geometry, exported and baked offline in Blender.**
- Generate geometry in TS, write GLB (GLTFExporter), import into headless Blender for UV + bake, re-export.
- This keeps one geometry source for a live preview and the final bake. The price is a GLB round trip, JS-side bevel quality (no harden normals, experimental CSG) and two toolchains touching the same mesh.
- For an agent, writing the parts in Python costs the same as writing them in TS. The round trip buys little.
- Consider it only if a live, un-baked preview in the real Scene during authoring turns out to be essential. Route 2's draft mode (3 s per House) covers most of that need.

## Comparison

| | 1. Procedural R3F | 2. Blender → baked GLB | 3a. JS + in-browser bake | 3b. JS geometry → Blender bake |
| --- | --- | --- | --- | --- |
| Bevels | Extrude/RoundedBox, no harden normals | Bevel modifier + harden normals | as 1 | as 1 |
| Booleans/openings | three-bvh-csg (experimental) | Boolean modifier | as 1 | as 1 |
| Lightmap UV | xatlas-three wasm or hand-written | lightmap_pack / smart_project | needs clean `uv` | Blender |
| Baked GI | none (screen-space AO only) | Cycles path-traced | direct-only or indirect-only, unmaintained | Cycles |
| Agent loop | HMR, seconds | draft ~3 s per House; final minutes (CPU here) | HMR plus visitor-side bake | JS edit + export + bake |
| Tooling | none | bpy wheel / Blender + KTX-Software | none | both |
| Download | smallest | geometry small; lightmaps several MB | small | as 2 |
| Runtime cost | highest (live lights + SSAO) | lowest (lightmap lookup) | bake at load, then low | lowest |

## Recommendation

Route 2, with these specifics:

1. **Data stays in TS.** `lib/projects.ts` is the single source. A Bun script writes one JSON per House for Blender. The House schema (volumes, levels, cantilevers, glazing faces) is designed once and read by both the Python builder and the site (the Project Panel, and hover targets by object name).
2. **Shared parts as Python functions** in `scripts/house/parts.py`. Pin the `bpy`/Blender version (5.2 LTS) in the repo.
3. **Two lightmap layers per House: base (sky + ambient) and window spill.** Hover "windows brighten" (DESIGN.md) then works as `emissiveIntensity` on the glass plus a runtime-scaled spill layer. A single baked lightmap would freeze the spill.
4. **Object naming contract** in the GLB (`glazing`, `soffit`, `house-root`…). R3F finds hover and emissive targets by name, so runtime code stays generic.
5. **Live in R3F:** snow particles, fog/Whiteout, camera rails, window emissive, sparse pines (instanced), terrain. Also real-time shadows on desktop only if wanted. Blue hour has no hard sun, so baked light may be enough.
6. **Draft/final build modes and per-House hash cache.** Commit final outputs under `public/houses/`.
7. **Prototype ticket (#5, blocked by this):** build one House end to end at final settings and check close-range sharpness. That sets lightmap resolution and the texture budget.

## Open risks

- **Texel density at close range.** A 10 m facade across a shared 2048² atlas is roughly 1–2 cm per texel at best, and soft or blocky contact shadows show when the camera is close. Mitigations: per-part atlases, a higher-res lightmap only for the selected House (LOD), detail normal/roughness maps on concrete, and runtime GTAO blended on top. The prototype must test this.
- **Lightmap encoding.** A blue-hour lightmap is HDR (bright window spill over dim snow). Basis UASTC HDR exists and KTX2Loader lists "BasisU HDR" support ([KTX2Loader](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/KTX2Loader.js)), but the pipeline is unproven here. The fallback is RGBM/log-encoded LDR KTX2 decoded in a small shader chunk.
- **Bake noise and denoising.** The probe bakes were not visually graded. Cycles bake output may need an explicit denoise step (OIDN via the compositor, or an image-space filter) to hold up at 128 samples. Not verified.
- **Glass in the bake.** Full-height glazing and glass balustrades must not block sky light in the bake, yet should still pick up reflections at runtime. They need their own bake visibility rules and runtime material (transmission is costly; a cheaper env-map reflection with alpha is likely).
- **Colour and light units.** Cycles bakes linear radiance. three.js tone mapping, exposure and `lightMapIntensity` must be calibrated once so baked and live elements (snow, emissive glass) match.
- **CPU-only bakes on this machine.** A full final re-bake is on the order of 30+ minutes. The hash cache and draft mode are essential, not optional.
- **Two languages.** The builder is Python and the site is TS. The JSON schema is the contract; validate it on both sides (e.g., zod in TS, a light check in Python).
- **DESIGN.md wording** has to change if this is accepted (see TL;DR).
- **External binaries:** Blender/bpy (pinned to Python 3.13) and KTX-Software must be installed by whoever re-bakes. Document this in a script README or preflight check.
