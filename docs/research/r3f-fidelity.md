# Can R3F/three.js reach arch-viz sharpness for a House?

Research for [#2](https://github.com/danielluis07/atrium/issues/2), part of the map [#1](https://github.com/danielluis07/atrium/issues/1). Researched 2026-09-23 against three.js r186, @react-three/fiber 9.8.0 (v10 in alpha), @react-three/drei 10.7.8 (v11 in alpha), postprocessing 6.39.5 / @react-three/postprocessing 3.1.2, and n8ao 2.0.1.

Terms follow `CONTEXT.md` (House, Scene, Project Panel). The architecture reference is `docs/design/reference-house.png`.

## Short answer

Yes, provided the lighting is **baked**. A static House under static blue-hour light is close to the best case for real-time rendering. Global illumination, soft sky occlusion and warm window spill onto snow can all be precomputed offline (headless Blender Cycles) and cost almost nothing at runtime. Commercial browser arch-viz does it this way: Shapespark ships WebGL walkthroughs with path-traced, baked lightmaps ([Shapespark](https://www.shapespark.com/), [bake docs](https://help.shapespark.com/hc/en-us/articles/360009198617-Bake-Lightmap-baking)).

What reads as "sharp" up close comes from four things, and none of them needs WebGPU:

1. **Real micro-bevels** on every concrete edge, so specular light catches the edges.
2. **Enough pixels**: device pixel ratio up to 2 plus MSAA, and no blurry temporal AA.
3. **High texel density** on board-form concrete, using tiled detail maps rather than one unique texture.
4. **Baked GI and AO**, with a thin real-time AO pass for contact detail.

Recommendation: **WebGLRenderer on the stable pmndrs stack now**, with lighting baked in a headless Blender build step and materials kept to standard PBR so a later move to WebGPURenderer stays cheap. Details and risks are at the end.

## 1. Edges and edge sharpness

In a render, a perfectly sharp 90° box edge looks CG. Real concrete has a small arris or chamfer that catches a line of light, and that line is most of what reads as "crisp" in the reference image (roof slabs, fascias, stone mass).

- **Geometry bevels.** three.js ships `ExtrudeGeometry` with `bevelEnabled`, `bevelThickness`, `bevelSize`, `bevelOffset` and `bevelSegments` ([source, r186](https://github.com/mrdoob/three.js/blob/r186/src/geometries/ExtrudeGeometry.js)), and `RoundedBoxGeometry` in addons, which the official AO example uses ([webgpu_postprocessing_ao](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_postprocessing_ao.html)). For architecture, one or two segments at 5–15 mm is enough. Use more only on the stone mass.
- **Normals.** Bevels only work with correct smoothing: flat faces with smoothed bevels (weighted normals). In headless Blender that is the Bevel modifier plus Weighted Normal modifier. Done procedurally, the part generator must emit split normals itself.
- **Cost.** A bevelled box has about 3–5x the triangles of a plain box. For four Houses built from roughly 50–150 parts each, that stays in the tens of thousands of triangles, which is trivial for a desktop GPU. Bevels are the cheapest sharpness gain on this list, but the overview LOD should drop them (see §8).
- **Lines and outlines** (drei `Edges`/`Outlines`) are a stylised look and don't belong in arch-viz. Leave them out.

## 2. Anti-aliasing

| Technique | three.js / R3F support | Look | Rough cost at 1440p desktop* |
| --- | --- | --- | --- |
| MSAA 4x | `WebGLRenderer({antialias})` (R3F default `antialias=true`, [Canvas docs](https://r3f.docs.pmnd.rs/api/canvas)). With post-processing, use the `EffectComposer` `multisampling` option. `WebGPURenderer({antialias, samples})` ([docs](https://threejs.org/docs/pages/WebGPURenderer.html)) | Sharpest geometric edges. Does nothing for specular or texture shimmer | Low (about 0.3–1 ms) |
| SMAA | `SMAAEffect` in pmndrs postprocessing v6; `SMAANode` in TSL | Good on edges, keeps sharpness, slight crawling on thin lines | about 0.5–1 ms |
| FXAA | both stacks | Soft, cheap | about 0.2 ms |
| TRAA / TAA | TSL only: `TRAANode`, and `TAAUNode` for upscaling with `SharpenNode` ([webgpu_postprocessing_traa](https://threejs.org/examples/webgpu_postprocessing_traa.html), [webgpu_upscaling_taau](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_upscaling_taau.html)). pmndrs postprocessing v6 has no TAA ([effects list](https://github.com/pmndrs/postprocessing/tree/main/src/effects)) | Best stability on shimmer, but softens and ghosts during motion. The source says: "MSAA must be disabled when TRAA is in use" ([TRAANode.js](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/tsl/display/TRAANode.js)) | about 0.5–1.5 ms plus a velocity buffer |
| SSAA / supersampling | `SSAAPassNode`, or simply a higher DPR | Reference quality | 2–4x the whole frame |

\* These are order-of-magnitude estimates, not published figures. Neither three.js nor pmndrs publish per-effect GPU timings, so the prototype ticket must measure them (see Risks).

**For Atrium:** the fly-to ends with the camera **at rest**, and that is where arch-viz sharpness matters. Use **MSAA 4x + SMAA** (or MSAA alone) at DPR `[1, 2]`. Optionally, once the camera has settled, raise DPR for a few frames or accumulate a jittered supersample (the "progressive refinement when still" trick, which is how `AccumulativeShadows` in drei and pathtracer demos converge). TRAA's softness works against the "sharp" goal, and its ghosting would show during the 1.5 s flight.

## 3. Ambient occlusion (SSAO / GTAO)

- **Baked AO carries most of the load.** Cycles bakes AO, or AO inside a Combined bake, into the lightmap, so the large-scale occlusion (soffits, snow against walls, recessed glazing) is free at runtime.
- **Screen-space AO adds contact detail and ties together what isn't baked** (snow particles, dimming). On the WebGL stack the best option is **N8AO**, which works with pmndrs postprocessing. Its README publishes quality presets, from Performance (8 AO samples / 4 denoise) to Ultra (64 / 16), and says half-res mode gives "a performance boost (generally 2x-4x)" with depth-aware upsampling at "a fixed cost of around 1ms" ([n8ao README](https://github.com/N8python/n8ao)). v2 adds a neural denoise mode.
- **On the WebGPU/TSL stack**, `GTAONode` (it needs temporal denoising, so it is paired with TRAA) and a new self-denoised `SSAONode` ship in core. The official example runs GTAO at `resolutionScale: 0.5` with 16 samples, noting that "SSAO is self-denoised so it can skip TRAA and use MSAA for edge anti-aliasing instead" ([webgpu_postprocessing_ao, r186](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_postprocessing_ao.html); SSAONode added in r186, [release notes](https://github.com/mrdoob/three.js/releases/tag/r186)).
- **Cost:** about 1–3 ms at 1440p half-res (estimate). Keep the radius small, because baked AO already covers large scales.

## 4. Baked lightmaps and AO (the core technique)

**How it works in three.js.** `lightMap` and `aoMap` on `MeshStandardMaterial` / `MeshPhysicalMaterial` each "requires a second set of UVs". The lightMap docs say: "most `lightMap` textures set `texture.colorSpace = LinearSRGBColorSpace` and use float-type formats such as `.exr` or `.hdr`" ([MeshStandardMaterial.js r186](https://github.com/mrdoob/three.js/blob/r186/src/materials/MeshStandardMaterial.js)). `Texture.channel` selects the UV set (`1` = `uv1`) ([Texture.js](https://github.com/mrdoob/three.js/blob/r186/src/textures/Texture.js)).

**Baking.** Cycles "Bake" in Blender (5.2 LTS manual) supports Combined, Ambient Occlusion, Diffuse and other passes, with per-pass contribution toggles ([Render Baking](https://docs.blender.org/manual/en/latest/render/cycles/baking.html)). It can be scripted with `blender -b -P bake.py`. A documented R3F workflow uses a single 4096² Combined bake with 4 px margins, 128 samples and a denoise pass ([tchayen, Baked lighting in r3f](https://tchayen.github.io/posts/baked-lighting-in-r3f)). Shapespark recommends at least 800 samples for final lightmaps. An in-browser alternative exists (`@react-three/lightmap`, WebGL half-cubemap gathering with multiple bounces), but its author calls it "good enough for a draft sketch" ([unframework](https://unframework.com/portfolio/simple-global-illumination-lightmap-baker-for-threejs/)). Use it for prototyping only.

**Proposal: split lightmaps for interactivity.** `DESIGN.md` requires hovered windows to brighten and other Houses to dim on select. A single Combined bake freezes both. Bake **two linear lightmap layers per House** instead:

- `L_sky`: blue-hour sky dome plus bounce.
- `L_warm`: window and downlight emitters only.

At runtime combine them as `L_sky + k · L_warm`, where `k` is a per-House uniform driven by hover and select. Blending two textures costs next to nothing, and the warm spill on the snow then follows the windows' emissive intensity. It needs one small shader hook (`onBeforeCompile` on WebGL, or a TSL node on WebGPU) or two material passes.

**Encoding and size.** A lightmap needs HDR range. `KTX2Loader` in r186 supports **Basis UASTC HDR**, transcoded to BC6H on desktop, alongside ETC1S and UASTC LDR ([KTX2Loader.js](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/loaders/KTX2Loader.js)). An 8-bit fallback with `lightMapIntensity` scaling also works for the low-contrast blue-hour range. As a rough budget, 2 layers × 4 Houses × 2048² in UASTC HDR (1 byte/texel before supercompression) comes to about 32 MB of GPU memory and single-digit MB on the wire, before mip trimming. That is an estimate to confirm in the prototype.

**Texel density.** Lighting is low-frequency, so about 50–100 lightmap texels per metre is enough, while material detail comes from tiled maps (§5). This split is the standard way to get close-up sharpness without huge unique textures.

**Implication for the authoring pipeline (#3).** Baking needs the final geometry and a non-overlapping `uv1` at build time. If Houses are "built procedurally in react-three-fiber" (`DESIGN.md`), the same generator must run in the build: data → geometry → glTF → headless Blender bakes → glTF + KTX2 lightmaps shipped to the client. A purely runtime-generated House cannot carry a baked lightmap.

## 5. PBR concrete and board-form texturing

- **Material:** `MeshStandardMaterial`, with roughness about 0.7–0.9 and metalness 0. Use `MeshPhysicalMaterial` only for glass (transmission is expensive; see below).
- **Board-form pattern:** tiled albedo, normal and roughness maps at about 512–1024 px per metre of wall (boards about 10–15 cm wide show 50–150 px per board). Add a second, lower-frequency macro-variation texture or vertex colour to break tiling. Tiling means a single 2048² set can serve every House. Use triplanar or box UVs on `uv0`, and keep `uv1` for the lightmap.
- **Compression:** KTX2 UASTC for normals and ETC1S or UASTC for albedo/roughness, which is Bruno Simon's folio-2025 practice: "compressed using GPU-friendly formats like ETC1S and UASTC", with DRACO quantisation for meshes ([Awwwards case study](https://www.awwwards.com/brunos-portfolio-case-study.html)). `@gltf-transform/cli` 4.5 or gltfpack 1.2 (meshoptimizer) can run this as a build step.
- **Other reference materials:** a timber soffit (tiled wood plus the baked downlight pools), dark metal fascias (roughness about 0.4, which is where bevel highlights matter most) and the stone mass (a tiled stone set with parallax-free normal detail).
- **Glass and interiors:** real transmission (`MeshPhysicalMaterial.transmission`, drei `MeshTransmissionMaterial`) adds an extra scene render and isn't worth it here. The standard game and arch-viz trick is **interior mapping**: a fake room from a baked cubemap sampled in the fragment shader behind a reflective glass surface ([van Dongen, "Interior Mapping", CGI 2008](https://www.proun-game.com/Oogst3D/CODING/InteriorMapping/InteriorMapping.pdf)). Combine it with an environment-map reflection of the sky. It is cheap (one shader, one cubemap per room type) but needs custom shader code on either renderer.
- **Snow on roofs and terraces:** separate geometry with a soft top bevel, baked into the same lightmap.

## 6. WebGPURenderer vs WebGL2 in current three.js

**Status (r186, 2026-09-08).** `WebGPURenderer` "tries to use a WebGPU backend if the browser supports WebGPU. If not, `WebGPURenderer` falls backs to a WebGL 2 backend" (`forceWebGL` forces the fallback) ([docs](https://threejs.org/docs/pages/WebGPURenderer.html)). r186 still carries a steady stream of MSAA, WebGL-backend and XR fixes ([release notes](https://github.com/mrdoob/three.js/releases/tag/r186)). The TSL post suite is broad: `TRAANode`, `TAAUNode`, `FSR1Node`, `GTAONode`, `SSAONode`, `SSGINode`, `SSRNode`, `SSSNode`, `BloomNode`, `SMAANode` and `SharpenNode` ([examples/jsm/tsl/display](https://github.com/mrdoob/three.js/tree/r186/examples/jsm/tsl/display)). New lighting tools such as `SunLight` and `LightProbeGrid` ship with examples ([webgpu_lights_sunlight](https://threejs.org/examples/webgpu_lights_sunlight.html), [webgpu_lightprobes_sponza](https://threejs.org/examples/webgpu_lightprobes_sponza.html)).

**Browsers.** WebGPU ships in Chrome/Edge 113+, Safari 26 on macOS and iOS, Firefox 141 on Windows and Firefox 147 on Apple Silicon macOS. Firefox on Linux and Android is still Nightly only ([gpuweb Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)). The WebGL2 fallback covers the rest.

**React ecosystem (the deciding factor):**

- R3F v9 stable supports WebGPU through an async `gl` factory ([Canvas docs](https://r3f.docs.pmnd.rs/api/canvas)). 9.8.0 (2026-09-22) fixed async-renderer root sync and Strict Mode problems ([release](https://github.com/pmndrs/react-three-fiber/releases/tag/v9.8.0)), but [#3782](https://github.com/pmndrs/react-three-fiber/issues/3782) is still open: a re-render during the async factory can create two renderers on one canvas.
- First-class WebGPU/TSL support (`useRenderPipeline`, `useUniforms`) is **R3F v10, still alpha** (10.0.0-alpha.5, 2026-09-08) ([releases](https://github.com/pmndrs/react-three-fiber/releases)). drei's WebGPU entry is **v11 alpha** ([drei releases](https://github.com/pmndrs/drei/releases)).
- pmndrs **postprocessing is WebGL-only**. Its maintainer says it "will eventually support `WebGPURenderer`, but it's not the focus right now" ([postprocessing #700](https://github.com/pmndrs/postprocessing/issues/700)). N8AO depends on it.
- Showcase evidence: Bruno Simon's folio 2025 runs on WebGPU where available via TSL, "delivering better performance without any additional work", with lower presets on mobile (reduced shadow maps, no DoF) ([Awwwards case study](https://www.awwwards.com/brunos-portfolio-case-study.html)). It is vanilla three.js, not R3F.

**For a static, baked House scene**, WebGPU's advantages (compute, cheaper draw submission, the TSL post suite) matter little. WebGL2 with the pmndrs stack is stable today and covers every effect Atrium needs. The cost of choosing WebGL now is a later port of custom shader hooks (lightmap blend, interior mapping) to TSL. Keeping everything else on stock `MeshStandardMaterial`/`MeshPhysicalMaterial` keeps that port small, because WebGPURenderer converts standard materials to node materials.

## 7. Post-processing: bloom for window light

- Render windows and downlights as **HDR emissive** (`emissiveIntensity` > 1, `toneMapped` left on) and use a **luminance-threshold bloom**: `BloomEffect` with `mipmapBlur` and `luminanceThreshold` near 1 in pmndrs postprocessing, or `BloomNode` in TSL ([webgpu_postprocessing_bloom_emissive](https://threejs.org/examples/webgpu_postprocessing_bloom_emissive.html)). A threshold avoids the cost and complexity of selective-bloom layers, because in this Scene only the windows exceed 1.0.
- Keep it subtle: a small radius and low intensity. Arch-viz bloom is a glow on the glass, not a haze. Tone mapping: AgX or ACES, then an optional LUT for the blue-hour grade (`LUT3DEffect` / `Lut3DNode`).
- pmndrs `EffectPass` merges effects into one fullscreen pass ([README](https://github.com/pmndrs/postprocessing)), so bloom, tone mapping, LUT, vignette and SMAA cost about the same as a couple of passes.
- **Cost:** about 0.5–1.5 ms for mip bloom at 1440p (estimate).
- Skip SSR (baked environment reflections suffice for concrete and snow; the glass uses an environment map), SSGI (already baked) and DoF during interaction (it hides sharpness). A very light DoF could be tried on the Project Panel close-up.

## 8. LOD

The camera runs on rails with two known framings, overview and per-House close-up, so **selection-driven LOD** is more predictable than distance thresholds:

- **Overview LOD (always loaded):** merged House mesh without bevels, simplified glazing (emissive plus a baked reflection, no interior mapping), one lightmap at 1024², and shared tiled materials at low mips. Target about 5–15 draw calls per House. `gltfpack` or `gltf-transform simplify` (meshoptimizer) can produce this automatically from the full model.
- **Close-up LOD (loaded on hover or select, swapped during the 1.5 s fly-to):** bevelled geometry, a 2048² split lightmap, interior-mapped glazing and full-resolution detail maps.
- drei `<Detailed distances>` wraps `THREE.LOD` if distance switching is ever needed ([docs](https://github.com/pmndrs/drei/blob/master/docs/performances/detailed.mdx)). drei `<PerformanceMonitor>` and `<AdaptiveDpr>` handle dynamic quality on weaker GPUs.
- Mobile uses the overview LOD only, with no screen-space AO, DPR capped at 1.5 and bloom at half resolution, matching `DESIGN.md`'s lighter Scene.

## Reference sites and demos

| Example | What it shows | Numbers published |
| --- | --- | --- |
| [Shapespark](https://www.shapespark.com/) | Commercial arch-viz in WebGL with path-traced baked lightmaps, which is closest to our target | Recommends ≥800 bake samples ([docs](https://help.shapespark.com/hc/en-us/articles/360009198617-Bake-Lightmap-baking)) |
| [Bruno Simon folio 2025](https://www.awwwards.com/brunos-portfolio-case-study.html) | WebGPU-first via TSL with WebGL fallback, Blender-authored, KTX2 ETC1S/UASTC, mobile quality presets | Qualitative only |
| [Igloo Inc (abeto)](https://www.awwwards.com/igloo-inc-case-study.html) | High-end product-site three.js, custom geometry exporters, attention to load time and shader compile time | Qualitative only |
| [tchayen, baked lighting in R3F](https://tchayen.github.io/posts/baked-lighting-in-r3f) | End-to-end Blender → glTF → R3F lightmap | 4096², 128 samples, 4 px margin |
| [three.js webgpu_postprocessing_ao](https://threejs.org/examples/webgpu_postprocessing_ao.html) | GTAO + TRAA vs SSAO + MSAA on a RoundedBox scene | Default 16 samples, 0.5 resolution |
| [n8ao](https://github.com/N8python/n8ao) | SSAO for WebGL/pmndrs | Half-res 2–4x faster, about 1 ms upsample |

No reputable source publishes frame-time numbers for an arch-viz house in three.js. Every "ms" figure here is an estimate that the prototype ticket must replace with measurements.

## Estimated desktop frame budget (close-up, 1440p, DPR 1.5–2)

| Item | Estimate |
| --- | --- |
| Scene draw: 4 Houses (1 at close-up LOD), terrain, pines (instanced), snow particles, all baked-lit | 2–4 ms |
| N8AO half-res | 1–2 ms |
| Bloom, tone map, LUT, SMAA (merged `EffectPass`) | 1–2 ms |
| MSAA 4x resolve | about 0.5 ms |
| **Total** | **about 5–9 ms**, well inside 16.6 ms on a mid-range discrete GPU. Integrated GPUs may need DPR 1 or AO off |

Measure with GPU timer queries (`EXT_disjoint_timer_query_webgl2`, which three exposes through its timestamp query pool) and `renderer.info` for draw calls and memory.

## Recommendation

1. **Renderer:** use `WebGLRenderer` via **R3F 9.x stable**, drei 10.x, and @react-three/postprocessing 3.x with **N8AO**. Revisit WebGPURenderer when R3F v10 and drei v11 are stable and postprocessing (or a TSL replacement) covers AO and bloom. The Scene's look doesn't depend on that move.
2. **Lighting:** **fully baked** in headless Blender Cycles in a build step, as **two linear HDR lightmap layers per House** (sky, warm), shipped as KTX2 UASTC HDR on `uv1` and blended at runtime so hover and dimming work. There are no real-time shadows on desktop either: the blue-hour light is static.
3. **Sharpness:** real 5–15 mm bevels with weighted normals on close-up geometry. **MSAA 4x + SMAA**, no TAA. DPR `[1, 2]`, with an optional supersample burst once the fly-to settles.
4. **Materials:** stock PBR with **tiled board-form detail maps** (about 512–1024 px/m) on `uv0` plus macro variation. Glazing uses **interior mapping** plus an environment reflection. No transmission.
5. **Post:** threshold HDR bloom for windows, AgX or ACES with a blue-hour LUT, and N8AO at small radius. No SSR, SSGI or DoF.
6. **LOD:** two LODs per House, generated in the build (meshoptimizer), swapped on select during the fly-to. Mobile gets overview LOD only.
7. **Next step (for the prototype, #5):** build one House end to end on this pipeline and measure GPU ms, draw calls, texture memory and download size against the budget above.

## Open risks

- **Procedural vs baked conflict.** Baking requires the geometry to be generated in the build, not at runtime in R3F. The authoring pipeline (#3) must run the House generator headlessly and hand its output to Blender. If Houses must stay runtime-procedural, fall back to real-time lighting (hemisphere light, a few spot/rect lights, N8AO, maybe `LightProbeGrid` on WebGPU). That loses most of the arch-viz look.
- **Headless Blender in CI.** Cycles on CPU-only runners makes bake time grow with samples × texels × Houses (roughly minutes to tens of minutes; unmeasured). Cache bakes by content hash and commit or artifact the KTX2 outputs. Blender is also a large build dependency (5.2 LTS) for a Bun/Next project.
- **UV1 unwrapping quality.** Automatic lightmap UVs (Smart UV Project or Lightmap Pack) can seam or bleed on thin fascias and soffits. Margins and padding need tuning.
- **Split-lightmap shader hook.** Blending `L_sky + k·L_warm` needs `onBeforeCompile` on WebGL, which is fragile across three upgrades and must be rewritten in TSL if we later move to WebGPU. Interior mapping has the same issue.
- **HDR lightmap support.** UASTC HDR transcodes to BC6H on desktop, but browser and GPU support (ASTC HDR, BC6H) varies. An 8-bit fallback path must exist and be checked for banding in the dark blue range.
- **No published frame-time data.** Every millisecond figure here is an estimate and must be measured in the prototype on at least one integrated GPU (such as an Intel/AMD laptop) and one discrete GPU.
- **Ecosystem churn.** R3F v10 and drei v11 alphas may change the WebGPU story within months. [R3F #3782](https://github.com/pmndrs/react-three-fiber/issues/3782) (double renderer from the async `gl` factory) is a concrete bug if we try WebGPU on v9.
- **AA versus fine detail.** Board-form normal maps and pine needles can shimmer under MSAA + SMAA without TAA. Mitigations: mipmapped KTX2, normal-map roughness adjustment (Toksvig/LEAN, or pre-filtered roughness from the build), and lower normal strength at distance.
- **Whiteout interaction.** three.js applies fog before tone mapping, the LUT and bloom, so a fogged pixel won't come out as the exact `--background` colour. The Whiteout needs its fog colour pre-compensated for the tone mapper, or a final full-screen blend to paper colour after post-processing. Verify pixel-exact output in the prototype.
