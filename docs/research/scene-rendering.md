# Scene rendering: blue-hour light, fog and the Whiteout

> **Superseded in part (2026-09-23):** the Whiteout was replaced by the Section Cut (`docs/adr/0002-section-cut-replaces-whiteout.md`). The Whiteout sections (§2.3, the sky's whiteout uniform, and fading bloom, AO and grain toward paper) no longer apply. The rest still stands.

Research for issue #4 (map: #1). Question: how is the blue-hour **Scene** in `DESIGN.md` lit and rendered? That covers the sky, the height and distance fog that drives the **Whiteout** to the exact paper color, snow shading, emissive windows and soffit downlights with bloom, shadows, snowfall and the lighter mobile Scene. It also notes which choices depend on the **House** authoring pipeline.

Versions checked (npm `latest`, 2026-09-23): `three@0.186.0` (r186), `@react-three/fiber@9.8.0`, `@react-three/drei@10.7.8`, `@react-three/postprocessing@3.1.2`, `postprocessing@6.39.5`, `n8ao@2.0.1`. Claims about library behavior come from the published source of these versions (links pin the tag) unless another source is cited. Color numbers were computed with the OKLab reference matrices [S1] and three.js's own tone-mapping GLSL ported 1:1 to JS.

---

## TL;DR

1. **Renderer: WebGL2 (`WebGLRenderer`) with pmndrs `postprocessing` on desktop.** WebGPU/TSL is viable (all major browsers ship it, and `WebGPURenderer` falls back to WebGL2), but the pmndrs post stack, drei's shader helpers and `onBeforeCompile` are all WebGL-only. Keep WebGPU as a later migration.
2. **The Whiteout cannot be "just fog".** The paper color `oklch(0.975 0.004 240)` is sRGB **`#f4f7f9`** (linear `0.908, 0.931, 0.949`). Tone mapping it gives `#dfe0e1` with ACES (R3F's default), `#c6c7c8` with AgX and `#e9ecee` with Neutral, all visibly grey against the page. Where fog is mixed depends on the path. The plain renderer mixes fog *after* tone mapping and sRGB encoding, which is exact. The EffectComposer path mixes it *before* a ToneMapping effect, which is wrong.
3. **Recommended Whiteout:** atmospheric fog stays a scene effect in a blue-hour color. The Whiteout itself is a **final full-screen mix to paper after tone mapping** (a custom post effect on desktop, fog color in output space on the no-composer mobile path). It is depth-aware so near things fade last, and it reaches exactly paper at `t = 1`. Then the canvas is hidden over a `var(--background)` parent and the render loop stops. Bloom, AO, vignette, grain and dithering must be neutralised as `t → 1`.
4. **Sky:** a custom gradient dome (`ShaderMaterial`, zenith→horizon from `DESIGN.md`, plus a whiteout uniform), not three's `Sky` (Preetham daylight model: sun-driven, no fog, hard to art-direct to exact colors).
5. **Fog:** replace three's distance-only fog with **analytic exponential height + distance fog** by overriding the `fog_*` shader chunks globally. That one change covers built-in materials, GLB materials and particles.
6. **Light:** hemisphere light for the cool sky fill, one weak cool directional "twilight key", and warm light only from emissives. Bloom threshold ≥ 1 with `toneMapped={false}` HDR emissives. Window spill on snow and soffit downlights are faked (additive decals and emissive discs), not dozens of real point lights.
7. **Shadows:** the Scene is static, so on desktop a single shadow map is **rendered once** (`BakeShadows`), plus N8AO for contact occlusion. Mobile has no shadow map, only pre-baked contact or AO textures. Whether AO/GI is baked offline is the main thing that **depends on the House pipeline**: procedural geometry means runtime AO; headless-Blender GLBs can carry baked AO/lightmaps.
8. **Snowfall:** one `THREE.Points` (or instanced quads) animated fully in the vertex shader, wrapped in a camera-local box. Desktop ~6–10k flakes, mobile ~1.5–2.5k.

---

## 1. Renderer: WebGL2 vs WebGPU/TSL

**Status of WebGPU.** Chrome/Edge shipped it on desktop in 113 and on Android (ARM/Qualcomm) in 121. Safari has it on by default in macOS/iOS/iPadOS 26. Firefox has it on Windows (141) and macOS (145/147), with Linux and Android still pending [S2]. three.js `WebGPURenderer` falls back to a WebGL2 backend when WebGPU is missing (`forceWebGL` option, "WebGPU is not available, running under WebGL2 backend") [S3]. R3F 9 accepts an async `gl` factory specifically so `WebGPURenderer` can be used [S4].

**Why WebGL2 anyway, for now:**

- pmndrs `postprocessing` / `@react-three/postprocessing` (Bloom, N8AO, SMAA, ToneMapping) target `WebGLRenderer`. WebGPU post goes through TSL's `RenderPipeline` (renamed from `PostProcessing` in r183) [S5], which is a different ecosystem.
- `Material.onBeforeCompile` and `ShaderChunk` overrides (the cheapest way to get height fog and snow sparkle into standard materials) are WebGL-program features. Under node materials you write TSL instead. TSL does ship `exponentialHeightFogFactor` [S6], so height fog is easier there.
- three's own `Sky` says it "can only be used with WebGLRenderer. When using WebGPURenderer, use SkyMesh" [S7]. That split exists across much of `examples/jsm`.
- R3F v10 and drei v11 exist only as alphas (tags `v10.0.0-alpha.5`, `v11.0.0-alpha.7`). The stable pair is fiber 9 / drei 10.

The **Whiteout pitfall is identical under WebGPU**: `NodeMaterial.setupFog` mixes fog into the material output [S6b], and tone mapping and output conversion happen later in the renderer output. So switching renderer does not remove the need for §2.

## 2. Color pipeline and the Whiteout (the hard constraint)

### 2.1 Facts from the three.js source

- **Color management is on by default.** `ColorManagement.enabled: true`, working space `LinearSRGBColorSpace` [S8]. `Color.setStyle`/hex inputs are treated as sRGB and converted to linear working space.
- **`Color.setStyle` does not parse `oklch()`.** It handles `rgb/rgba/hsl/hsla`, hex and names, and warns "Unknown color model" otherwise [S9]. OKLCH tokens from `DESIGN.md` must be converted to sRGB hex (or linear floats) by our own code, e.g. `culori` at build time or a 20-line function. Don't hand them to `new Color('oklch(...)')`.
- **R3F defaults:** `gl.outputColorSpace = SRGBColorSpace` (`linear` prop off) and `gl.toneMapping = ACESFilmicToneMapping` (`flat` prop off) [S4][S10].
- **Where fog is mixed.** In every built-in lit material the fragment tail is `opaque → tonemapping → colorspace → fog → premultiplied_alpha → dithering` [S11]. Fog is `gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor)` [S12]. The fog uniform is filled with `fog.color.getRGB(..., getUnlitUniformColorSpace(renderer))` [S13]. That function returns `renderer.outputColorSpace` when drawing to the screen and the (linear) working space when drawing into a render target [S14].
- **Tone mapping only applies to the screen.** `WebGLPrograms` enables `renderer.toneMapping` only when `currentRenderTarget === null` (or XR) and `material.toneMapped` is true [S15].
- **`@react-three/postprocessing`'s `<EffectComposer>` forces `gl.toneMapping = NoToneMapping`** while mounted (a ref-counted guard), with `frameBufferType = HalfFloatType` and `multisampling = 8` [S16]. Tone mapping then only happens if you add a `<ToneMapping>` effect, which runs the same curves [S17].

**Consequences:**

| Path | Where fog is mixed | Paper fog reaches the screen as |
| --- | --- | --- |
| Plain renderer, any tone mapping | After tone mapping and sRGB encode, with fog color in output (sRGB) space | **exactly `#f4f7f9`** at `fogFactor = 1` |
| EffectComposer, no `<ToneMapping>` | Linear HDR buffer, then encoded to sRGB at the end | `#f4f7f9` (half-float precision near 0.9 is ~5e-4, far under one 8-bit step ≈ 8e-3 linear) **but no tone mapping at all**, so HDR windows clip |
| EffectComposer + `<ToneMapping>` (ACES/AgX/Neutral) | Linear, **before** tone mapping | **grey**, see the table below |

### 2.2 What each tone mapper does to the paper color

Linear paper `(0.90798, 0.93109, 0.94878)` at exposure 1, run through three r186's GLSL [S18]:

| Tone mapping | Screen sRGB | vs page `#f4f7f9` |
| --- | --- | --- |
| None | `#f4f7f9` (244,247,249) | exact |
| ACESFilmic (R3F default) | `#dfe0e1` (223,224,225) | −21 levels, loses the blue tint |
| AgX | `#c6c7c8` (198,199,200) | −46 levels |
| Neutral (Khronos PBR Neutral) | `#e9ecee` (233,236,238) | −11 levels |

All three put a visible seam at the canvas edge. Pre-compensating the fog color with an inverse tone curve is possible in principle for ACES, but it is fragile. It breaks on any exposure change, the curves mix channels, and AgX desaturates highlights. Don't do it.

Other things that break an exact match even when the math above is right:

- **Bloom.** Its default `luminanceThreshold` is 0.9 [S19]. Paper's linear luminance is ≈ 0.93, so a fully whited-out frame would bloom. Keep the threshold ≥ 1 (HDR emissives only), or ramp bloom intensity to 0 with the Whiteout.
- **N8AO/SSAO, vignette, noise/grain, chromatic aberration.** All are screen-space and act on the fogged frame (AO darkens creases even when they are fogged to paper). Fade their intensity to 0 with the Whiteout.
- **Dithering** (`material.dithering`, the pp copy material) shifts by up to ±0.5/255 [S20]. That is usually invisible but can flip 1 LSB. Turn it off on the whited-out frame, or accept a ±1 difference, which is invisible.
- **`drawingBufferColorSpace`.** three sets it from `outputColorSpace` [S21]. Keep sRGB. Opting into Display-P3 output would make the canvas and CSS diverge unless the paper color is re-expressed in P3. `#f4f7f9` is inside sRGB, so browsers render the CSS `oklch()` and the sRGB canvas identically.
- **Canvas alpha/premultiplication.** If the canvas is transparent anywhere during the fade, the HTML behind shows through. Put `var(--background)` on the canvas's parent so that is harmless.

### 2.3 Recommended Whiteout implementation

Split two jobs that `DESIGN.md` describes as one motion:

1. **Atmosphere (always on).** Height + distance fog (§4) in a blue-hour color near the sky horizon (`oklch(0.55 0.06 250)` → `#577594`). It sits in linear HDR before tone mapping, so it is tone mapped like the rest of the Scene. That is correct for the look.
2. **Whiteout (scroll-driven `t ∈ [0,1]`).**
   - **Desktop (composer path):** a small custom `Effect` placed **last, after `<ToneMapping>`**. It reads depth (`EffectAttribute.DEPTH`) and computes `k = saturate(t * a + depthFactor(t))` so the fog appears to thicken from far to near. It outputs `mix(inputColor.rgb, paperLinear, k)`. At `t = 1`, `k = 1` everywhere, and the composer's final sRGB encode gives exactly `#f4f7f9`. At the same time, ramp scene fog density up, and bloom, AO and vignette down, so the frame looks like fog thickening, not an overlay.
   - **Mobile (no composer):** the renderer's own tone mapping is used, and fog is mixed after it in output space (§2.1). So animating `scene.fog.color` toward paper and the fog factor to 1 is exact by construction. The sky dome's whiteout uniform must follow the same curve, because the dome is not fogged (see §3).
   - **Hand-off to the page:** at `t ≥ ~0.98`, set the canvas to `visibility: hidden` over a parent whose background is `var(--background)`. Both are `#f4f7f9`, so nothing changes visually. Then pause the loop (R3F `frameloop="demand"`/`"never"` [S4]). This removes any residual ±1 LSB mismatch and saves battery below the fold.
   - Source the paper color from **one place**: convert the `--background` OKLCH once (build-time constant, or read `getComputedStyle` and convert) and feed the same numbers to CSS and three.

## 3. Sky

three's `Sky` is the Preetham analytic daylight model driven by `turbidity`, `rayleigh`, `mieCoefficient` and a sun position [S7][S22]. It models daylight scattering, not the post-sunset twilight of blue hour. Its fragment shader includes tone mapping and colorspace but **no fog chunk** [S7], so it could not whiten on its own. It also cannot be pinned to the two OKLCH stops in `DESIGN.md`.

**Use a custom dome:** a large inverted sphere (or a full-screen triangle drawn at depth 1) with a `ShaderMaterial`. It mixes zenith `#132341` → horizon `#577594` by view-direction elevation, with a slight horizon band toward the fog color so the mountains dissolve into the sky. `depthWrite: false`, `fog: false`. Add a `uWhiteout` uniform that mixes toward paper. Set `toneMapped` on purpose. On the composer path the final Whiteout effect covers the sky anyway. On the mobile path `toneMapped: false` with colors authored in display terms is simplest. Cost is negligible. Same on both tiers.

Computed sRGB for the `DESIGN.md` Scene palette (all inside the sRGB gamut): sky zenith `#132341`, horizon `#577594`, snow in shadow `#74889e`, lit snow `#aec0d0`, concrete `#7c8186`, window emissive `#f6b669`. Note: these are *display* targets. Under ACES/Neutral a material albedo of `#aec0d0` will not display as `#aec0d0`, so they are tuning targets for the final frame, not material inputs.

## 4. Fog: height + distance

three's `Fog`/`FogExp2` depend only on view depth (`vFogDepth = -mvPosition.z`) [S23][S12]. They can't make fog pool in the fjord or thin with altitude. Two WebGL routes:

- **Global chunk override (recommended).** `WebGLProgram` resolves `#include <x>` through the mutable `ShaderChunk` object at compile time [S24]. Replacing `ShaderChunk.fog_pars_vertex`, `fog_vertex`, `fog_pars_fragment` and `fog_fragment` before first render changes fog for **every** built-in material, `GLTFLoader` materials, `Points`, and any `ShaderMaterial` with `fog: true` (three's own `Water` does exactly that include [S25]). Pass the world position as a varying and evaluate the analytic integral of exponential height fog along the view ray, `fog = (a/b)·e^{-b·camY}·(1 − e^{-b·rayY·dist}) / rayY` [S26], combined with distance fog. Extra uniforms (height falloff, base height) go on a shared object patched into `uniforms` via `onBeforeCompile`, or into `scene.fog` subclass fields read in the refresh path.
- **Per-material `onBeforeCompile`** [S27], with `customProgramCacheKey` so variants cache correctly. This is more local but must be applied to every material, including GLB ones.

Snowfall particles should use the same fog (they are `Points`), so distant flakes melt into the atmosphere.

## 5. Snow shading

- **Terrain:** `MeshStandardMaterial` with a cool white albedo, roughness ~0.8–0.9, a tiling normal map (wind ripples and drift noise), and low-frequency albedo/roughness variation from world-space noise so it doesn't tile. The blue shadow side comes from the lighting (§6), not from paint.
- **Roof and terrace snow:** a separate, slightly inset and bevelled slab on each roof or terrace, with a soft rounded edge and a small overhang at the drip edge. **Pipeline-dependent:** trivial and parametric if Houses are procedural (derived from the same slab data); must be modelled or generated in Blender if Houses are baked GLBs.
- **Sparkle:** added via `onBeforeCompile` to the snow material. Hash a jittered world-space cell grid, give each cell a random micro-normal, and add a tiny HDR specular spike when `dot(reflect(-V, n_micro), L)` exceeds a tight threshold. Fade it by distance and screen-space derivatives to avoid shimmer. With bloom on, the spikes bloom slightly. Desktop only. Mobile turns it off, or keeps only the near-camera band. (This is a design proposal, not a library feature. Prototype it.)
- **Subsurface feel:** not physically simulated. Tint the shadow side with the hemisphere ground color and slightly lift albedo blue. `MeshPhysicalMaterial` sheen or transmission is not worth its cost here.

## 6. Lighting, emissive windows, soffit downlights, bloom

- **Sky fill:** `HemisphereLight` (sky ≈ horizon blue, ground ≈ shadowed snow) does most of the work at blue hour. An env map is optional: a tiny prefiltered gradient cubemap gives concrete and glass believable cool reflections, and glass needs *something* to reflect.
- **Twilight key:** one weak, cool, low-angle `DirectionalLight`. It is the only real shadow caster (§7).
- **Warm light** comes only from emissives, as `DESIGN.md` requires:
  - Window glass/interior planes: `emissive` ≈ `#f6b669` with `emissiveIntensity` > 1 and `toneMapped={false}` so values stay above 1 for bloom. The Bloom docs say bloom is "selective by default... by lifting their colors out of 0–1 range", that `toneMapped` must be false "because it would otherwise clamp colors", and that `mipmapBlur` is the recommended blur [S19]. Set `luminanceThreshold` ≥ 1 (paper-safe, see §2.2). Interiors can be a flat emissive or a cheap parallax "interior mapping" card for depth at close range.
  - **Hover:** the House's windows brighten, which is a per-House emissive-intensity uniform. Each House needs its own material instance (or an instanced attribute) for its glazing.
  - **Soffit downlights:** small emissive discs in the timber soffit (they bloom into points), plus a soft additive cone or decal on the wall and ground below. No real `PointLight`/`SpotLight` per fixture: in forward rendering every light adds per-fragment cost to every lit material, and four Houses × many downlights would blow the budget. At most, spend 1–2 real non-shadowed spot lights for the *selected* House at close range.
  - **Window light spilling onto snow:** projected additive decals (drei `Decal` or a custom quad with a soft warm gradient, `blending: AdditiveBlending`, `depthWrite: false`) on the snow in front of each glazing face. This is cheap and art-directable, and it matches the reference image's warm pools. **Pipeline-dependent:** procedural Houses know their glazing faces and can place these automatically. GLBs need glazing faces tagged by naming convention or `extras`.
- **Tone mapping choice:** ACES shifts saturated oranges toward yellow and flattens contrast. AgX desaturates bright warm colors strongly. Neutral keeps base colors closest to their authored values, which matters because `DESIGN.md` specifies target colors. Start with **Neutral or ACES** and compare against the reference in the prototype. Either way, §2.3 makes the choice independent of the Whiteout.

## 7. Shadows and ambient occlusion

At blue hour there is no hard sun, so shadow *maps* matter less than **contact grounding** (AO where walls meet snow, under cantilevers, in soffits). The Scene is static except for camera, particles and emissive changes.

- **Desktop:** one directional shadow map (`PCFSoftShadowMap`, 2048², frustum fitted to the four Houses) **rendered once**. drei `BakeShadows` sets `gl.shadowMap.autoUpdate = false; needsUpdate = true` [S28], so the per-frame shadow cost is zero after the first frame. Add **N8AO** (bundled in `@react-three/postprocessing` 3 as `<N8AO>`, with `halfRes`, `aoRadius`, `quality` and `denoiseSamples` props [S16b]) for contact occlusion that works on any geometry without UVs. Fade N8AO to 0 during the Whiteout.
- **Mobile:** no shadow map (per `DESIGN.md`) and no screen-space AO. Ground each House with a pre-rendered soft contact shadow texture on the snow, generated once at load, e.g. drei `ContactShadows` with `frames={1}` [S29], or `AccumulativeShadows` with a frame limit [S29b]. Both project onto a plane, so on a sloped terrain use one small patch per House.
- **Baked AO/lightmaps (the pipeline fork).**
  - *Procedural Houses:* no offline bake without extra tooling. Options are runtime AO (N8AO), vertex AO computed at generation time from the known volumes (cheap, and very effective for boxy architecture), or a runtime lightmapper. `@react-three/lightmap` exists but is at `0.0.8`, so treat it as unproven.
  - *Headless-Blender GLBs:* Cycles can bake AO (or full GI) into a second UV set exported as glTF `occlusionTexture`/lightmap. This gives the best close-range arch-viz quality and lets mobile keep AO with no runtime cost. The price is UV unwrapping, texture memory and a build step.

## 8. Snowfall particles

- One `THREE.Points` with a `ShaderMaterial` (or `PointsMaterial` patched via `onBeforeCompile`). Random positions go in a static buffer once. The vertex shader offsets by `uTime * fallSpeed + sin(...)` sway and wraps with `mod()` inside a box that follows the camera. That means **zero CPU work per frame** and one draw call. Size by distance with the `gl_PointSize *= 1.0 / -viewPosition.z` pattern (drei's `Sparkles` uses it [S30]) and include the fog chunks so far flakes fade.
- Point sprites have a driver-dependent maximum size (`ALIASED_POINT_SIZE_RANGE`, which may be as small as 1 per the WebGL spec [S31]). Large foreground flakes near the camera are safer as a small `InstancedMesh` of camera-facing quads.
- Counts: desktop ~6–10k, mobile ~1.5–2.5k with a smaller box. `prefers-reduced-motion` removes snowfall entirely (`DESIGN.md`).
- drei `Sparkles` could stand in for a quick prototype, but it is built for floating glitter, not falling snow.

## 9. The lighter mobile Scene

| Feature | Desktop | Mobile / low-power |
| --- | --- | --- |
| Renderer path | WebGL2 + EffectComposer (HalfFloat, MSAA or SMAA) | WebGL2, **no composer**, renderer tone mapping, `antialias: true` |
| DPR | `[1, 2]` | `[1, 1.5]`, with drei `AdaptiveDpr`/`PerformanceMonitor` stepping down |
| Shadows | 1 map, rendered once | none; pre-baked contact textures |
| AO | N8AO (half-res if needed) | none (or baked, if GLB pipeline) |
| Bloom | pmndrs Bloom, `mipmapBlur`, threshold ≥ 1 | none; additive glow billboards on windows and downlights |
| Snow sparkle | on | off / near band only |
| Snowfall | ~6–10k | ~1.5–2.5k |
| Height fog, sky dome, emissives, window decals | on | on (cheap) |
| Whiteout | final post effect after ToneMapping | fog color in output space + sky uniform (exact by construction) |

Tier detection: `drei`'s `useDetectGPU` wraps `detect-gpu` [S32], combined with viewport, `navigator.hardwareConcurrency` and a runtime `PerformanceMonitor` fallback. Both tiers must land on the same paper color. The two Whiteout mechanisms differ, so the prototype should screenshot-diff the final frame against `#f4f7f9` on both.

## 10. What depends on the House authoring pipeline

| Choice | Procedural (R3F, per `DESIGN.md`) | Baked GLB (headless Blender) |
| --- | --- | --- |
| AO / GI | Runtime N8AO or generated vertex AO; no bake | Offline Cycles AO/lightmap bakes on UV2, best close-range quality, also usable on mobile |
| Board-formed concrete texture | No UVs by default, so **triplanar** mapping in shader (extra `onBeforeCompile` work) | UV-mapped textures authored in Blender |
| Roof/terrace snow | Parametric from slab data | Modelled or generated per House |
| Glazing emissive + hover | Direct per-House materials | Material/mesh naming convention or glTF `extras` to find glazing, fascia and soffit parts |
| Window spill decals, downlight positions | Derived automatically from glazing and soffit data | Needs tagged empties/nodes exported from Blender |
| Draw calls | Shared parts can be `InstancedMesh`/merged by construction | Needs `gltf-transform` dedup/merge/instancing and Draco/Meshopt compression |
| Fog, sky, sparkle, Whiteout, bloom, snowfall | **Independent**: the global chunk override works on both, because GLTFLoader produces `MeshStandardMaterial`/`MeshPhysicalMaterial` | same |

## 11. Recommendation

- WebGL2 `WebGLRenderer` via R3F 9 + drei 10. Desktop post via `@react-three/postprocessing` 3: N8AO → Bloom (mipmap, threshold ≥ 1) → ToneMapping (Neutral or ACES, decided in the prototype) → **custom Whiteout effect** → SMAA if MSAA is off. Revisit WebGPU/TSL when R3F 10 is stable.
- Colors: convert the `DESIGN.md` OKLCH values to sRGB once, from a single module shared by CSS tokens and three. Never pass `oklch()` strings to `THREE.Color`.
- Whiteout as in §2.3: final mix to paper after tone mapping, depth-aware, then hide the canvas over a paper-colored parent and pause rendering. Neutralise bloom, AO, vignette, grain and dithering as `t → 1`.
- Custom gradient sky dome with a whiteout uniform. Global `ShaderChunk` height + distance fog.
- Hemisphere fill + one weak shadow-casting directional, shadow map rendered once. Warm light only from HDR emissives, fake downlights and spill decals.
- Snowfall as GPU-animated `Points`.
- If the pipeline decision (the sibling tickets) lands on **procedural**, plan for triplanar concrete and generated vertex AO, since close-range quality depends on them. If it lands on **baked GLB**, reserve a UV2/lightmap slot and a glTF naming contract for glazing, soffit and fascia parts.

## 12. Open risks

1. **Seam verification.** Only a pixel read (`gl.readPixels` on the final frame vs `#f4f7f9`) on real devices proves the match. Safari and Chrome color-manage canvas and CSS the same way in sRGB, but this was not tested here. Add it to the prototype acceptance.
2. **Tone-mapper choice vs palette.** No curve reproduces the `DESIGN.md` Scene colors exactly. Expect to tune albedos and lights against rendered screenshots, not hex values.
3. **Sparkle and fine detail aliasing** at DPR 1 and on the moving camera. It needs distance/derivative fades, and possibly TAA-free tricks, since pmndrs has no TAA.
4. **Height-fog chunk override** is tied to three's internal chunk names, which can change between releases. Pin `three` and add a render test.
5. **N8AO and transparency:** glass balustrades and particles don't write depth normally, so AO and depth-aware Whiteout may treat them as the background behind them. Check glass and snow in the prototype.
6. **Mobile bloom substitute** (billboard glows) may read as cheap next to desktop. Budget prototype time.
7. **Static shadow map** assumes nothing casting moves. If Houses animate (e.g. hover lift), shadows must update on demand (`gl.shadowMap.needsUpdate = true` per change).
8. **`@react-three/postprocessing` forcing `NoToneMapping`** is global to the renderer. Mounting or unmounting the composer between tiers at runtime switches the tone-mapping path, which changes the whole look. Choose the tier once, before first render.

---

## Sources

- [S1] Björn Ottosson, "A perceptual color space for image processing" (OKLab reference matrices): https://bottosson.github.io/posts/oklab/
- [S2] gpuweb, WebGPU Implementation Status: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- [S3] three.js r186 `src/renderers/webgpu/WebGPURenderer.js` (`forceWebGL`, WebGL2 fallback): https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgpu/WebGPURenderer.js
- [S4] R3F Canvas API (defaults for `gl`, `flat`, `linear`, `shadows`, `dpr`, `frameloop`; async `gl` for WebGPU): https://r3f.docs.pmnd.rs/api/canvas
- [S5] three.js r186 `src/renderers/common/PostProcessing.js` ("renamed to RenderPipeline", r183) and `RenderPipeline.js`: https://github.com/mrdoob/three.js/blob/r186/src/renderers/common/PostProcessing.js
- [S6] three.js r186 `src/nodes/fog/Fog.js` (`rangeFogFactor`, `densityFogFactor`, `exponentialHeightFogFactor`): https://github.com/mrdoob/three.js/blob/r186/src/nodes/fog/Fog.js
- [S6b] three.js r186 `src/materials/nodes/NodeMaterial.js` (`setupFog`): https://github.com/mrdoob/three.js/blob/r186/src/materials/nodes/NodeMaterial.js
- [S7] three.js r186 `examples/jsm/objects/Sky.js`: https://github.com/mrdoob/three.js/blob/r186/examples/jsm/objects/Sky.js
- [S8] three.js r186 `src/math/ColorManagement.js`: https://github.com/mrdoob/three.js/blob/r186/src/math/ColorManagement.js
- [S9] three.js r186 `src/math/Color.js` (`setStyle`): https://github.com/mrdoob/three.js/blob/r186/src/math/Color.js
- [S10] `@react-three/fiber@9.8.0` `dist/events-*.esm.js`: `gl.outputColorSpace = linear ? LinearSRGBColorSpace : SRGBColorSpace; gl.toneMapping = flat ? NoToneMapping : ACESFilmicToneMapping`
- [S11] three.js r186 `src/renderers/shaders/ShaderLib/meshphysical.glsl.js` (fragment tail order): https://github.com/mrdoob/three.js/blob/r186/src/renderers/shaders/ShaderLib/meshphysical.glsl.js
- [S12] three.js r186 `src/renderers/shaders/ShaderChunk/fog_fragment.glsl.js`: https://github.com/mrdoob/three.js/blob/r186/src/renderers/shaders/ShaderChunk/fog_fragment.glsl.js
- [S13] three.js r186 `src/renderers/webgl/WebGLMaterials.js` (`refreshFogUniforms`): https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLMaterials.js
- [S14] three.js r186 `src/renderers/shaders/UniformsUtils.js` (`getUnlitUniformColorSpace`): https://github.com/mrdoob/three.js/blob/r186/src/renderers/shaders/UniformsUtils.js
- [S15] three.js r186 `src/renderers/webgl/WebGLPrograms.js` (tone mapping only when render target is null): https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLPrograms.js
- [S16] `@react-three/postprocessing@3.1.2` `EffectComposer` (defaults `multisampling = 8`, `frameBufferType = HalfFloatType`; `toneMappingGuard.acquire(gl, NoToneMapping)`): https://github.com/pmndrs/react-postprocessing/blob/v3.1.2/src/EffectComposer.tsx
- [S16b] `@react-three/postprocessing@3.1.2` N8AO pass (wraps `n8ao`'s `N8AOPostPass`): https://github.com/pmndrs/react-postprocessing/tree/v3.1.2/src/passes
- [S17] `postprocessing@6.39.5` `ToneMappingEffect` (ACES/AgX/Neutral modes): https://github.com/pmndrs/postprocessing/tree/v6.39.5/src/effects
- [S18] three.js r186 `src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js`: https://github.com/mrdoob/three.js/blob/r186/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js
- [S19] React Postprocessing docs, Bloom: https://react-postprocessing.docs.pmnd.rs/effects/bloom
- [S20] three.js r186 `src/renderers/shaders/ShaderChunk/dithering_pars_fragment.glsl.js`: https://github.com/mrdoob/three.js/blob/r186/src/renderers/shaders/ShaderChunk/dithering_pars_fragment.glsl.js
- [S21] three.js r186 `src/renderers/WebGLRenderer.js` (`drawingBufferColorSpace`): https://github.com/mrdoob/three.js/blob/r186/src/renderers/WebGLRenderer.js
- [S22] Preetham, Shirley, Smits, "A Practical Analytic Model for Daylight" (SIGGRAPH 1999), cited in `Sky.js`.
- [S23] three.js r186 `src/renderers/shaders/ShaderChunk/fog_vertex.glsl.js`: https://github.com/mrdoob/three.js/blob/r186/src/renderers/shaders/ShaderChunk/fog_vertex.glsl.js
- [S24] three.js r186 `src/renderers/webgl/WebGLProgram.js` (`resolveIncludes` reads `ShaderChunk[include]`): https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgl/WebGLProgram.js
- [S25] three.js r186 `examples/jsm/objects/Water.js` (ShaderMaterial including fog chunks): https://github.com/mrdoob/three.js/blob/r186/examples/jsm/objects/Water.js
- [S26] Iñigo Quílez, "Better fog" (analytic height fog integral): https://iquilezles.org/articles/fog/
- [S27] three.js docs, `Material.onBeforeCompile` / `customProgramCacheKey`: https://threejs.org/docs/#api/en/materials/Material.onBeforeCompile
- [S28] `@react-three/drei@10.7.8` `core/BakeShadows.js`: https://github.com/pmndrs/drei/blob/master/src/core/BakeShadows.tsx
- [S29] drei docs, ContactShadows (`frames`): https://drei.docs.pmnd.rs/staging/contact-shadows
- [S29b] drei docs, AccumulativeShadows (`frames`, `limit`, `temporal`): https://drei.docs.pmnd.rs/staging/accumulative-shadows
- [S30] `@react-three/drei@10.7.8` `core/Sparkles.js` (point-size attenuation): https://github.com/pmndrs/drei/blob/master/src/core/Sparkles.tsx
- [S31] Khronos WebGL 1.0 spec / GLES 2.0 `ALIASED_POINT_SIZE_RANGE` (minimum maximum point size is 1): https://registry.khronos.org/webgl/specs/latest/1.0/
- [S32] `@react-three/drei@10.7.8` `core/DetectGPU.d.ts` (wraps `detect-gpu`): https://github.com/pmndrs/drei/blob/master/src/core/DetectGPU.tsx
