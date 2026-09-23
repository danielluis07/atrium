# Houses are baked offline in headless Blender

Status: accepted (2026-09-23)

## Context

Houses must reach arch-viz sharpness at close range. The look depends on blue-hour bounce light: warm window spill on the snow and glowing soffit downlights. Building Houses procedurally in three.js cannot produce this. Browser-side lightmappers are direct-only or indirect-only, and their CSG and bevels are experimental. Nobody on the project will use the Blender GUI.

## Decision

Each House is compiled at build time by a headless Blender (`bpy` 5.2.x wheel, Python 3.13, managed with `uv`) script:

- **Source.** Each Project's record in TS holds its House description, validated with zod and exported to JSON. The schema is strictly declarative: shared parts only (volumes, levels, cantilevered slabs, glazing faces, fascia, stone mass), with no per-House code.
- **Bake.** Blender builds the parts, bevels them with harden normals, unwraps lightmap UVs and bakes with Cycles. It bakes sky/ambient light, bounce light and AO, soffit downlights and roof/terrace snow geometry. Window spill goes into a **separate second lightmap layer**. Each House is baked with its own snow plinth. Output is meshopt GLB + KTX2.
- **Live in R3F.** Window emissive and hover (emissive plus the spill layer's intensity), plain live snow terrain, snowfall, fog/Whiteout, sky dome, camera, instanced pines, and N8AO on desktop. Houses get no real-time lights.
- **Artifacts.** Baked outputs are committed under `public/houses/` as normal files, so `next build` never needs Blender. The builder has draft and final modes and a per-House hash cache. A preflight check verifies `bpy` and KTX-Software.

## Alternatives rejected

- **Procedural R3F:** no baked GI, and it has the highest runtime cost.
- **JS geometry baked in Blender (hybrid):** a GLB round trip for little gain, since agents write Python parts as easily as TS.
- **Baking the whole Scene as one:** every edit becomes a 30+ minute CPU re-bake, and it breaks per-House caching and LOD.
- **Git LFS or CI bakes:** unnecessary at about 20–40 MB. Moving to LFS later is cheap.

## Consequences

- There are two languages: the JSON schema is the contract, validated on both sides.
- Re-baking needs CPU time on this machine (about 72 s at 1024² and about 400 s at 2048² per House), so the cache and draft mode are essential.
- Open risks for the prototype: lightmap texel density at close range, HDR lightmap encoding, bake denoising, glass in the bake, colour calibration.

Evidence: `docs/research/house-authoring.md` on branch `research/house-authoring`; issues #2, #3, #4, #5.
