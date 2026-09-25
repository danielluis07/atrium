# Interiors are baked room cards, not geometry

Status: superseded by ADR 0005 (2026-09-25). The Lyngen prototype (#57) passed its frame and download budget (see Evidence), but orbiting a selected House showed the furniture as flat drawings sliding over the floor. Its code was not kept.

Each House's windows look into Interiors. Until now these were the same procedural box room in every pane: a fixed 3.3 × 3.3 × 5 m grid with a flat sofa and artwork drawn in the glazing shader. We want each House's Interiors to be furnished differently and textured for real, and they have to stay cheap on a laptop iGPU (the Vega 10 starts at rung 4, Lean).

## Decision

The Interior is still a fake seen through the glass: interior mapping in the glazing shader, with no furniture geometry and no see-through glass.

- **Data.** A `glazing` opening in the House record carries its Interior: a kind (lounge, dining, kitchen, library, bedroom) plus a few named options, such as a fireplace, lamp type or shelving. Each kind has one template in the builder, and there is no per-House code. Glazing Faces that look into the same volume must carry the same Interior. Only Glazing Faces on seen faces have Interiors. Glazing on unseen faces keeps the generic procedural room.
- **Bake.** Headless Blender (ADR 0001) builds each Interior from one shared furniture kit, sized from the record: the Glazing Face's width, the Level height (double where the volume spans two Levels) and the volume's depth. Cycles renders two layers per Interior, the back wall and a cut-out mid-ground furniture card. They are packed into a per-House KTX2 atlas.
- **Live.** The glazing shader derives each room from the same numbers. It adds one ray-plane test for the furniture card and samples the atlas. Hover and selection lift the whole card through the existing glow. The lamps don't change on their own.
- **Consistency.** A Project's interior image shows the Interior behind the Glazing Face it names, described from the same data.
- The Drawings don't show furniture.

## Why

- Textured, lit furniture comes from Cycles. That's the same reason the Houses are baked, and it avoids flat procedural blocks.
- It costs about +0.2–0.5 ms per frame on the Vega and +2–3 MB of download (roughly 15.6 → 18 MB of the 24 MB Scene budget). Real furniture behind transparent glass was estimated at 2–5 ms or more on the Vega, and it would change the glazing model and need its own interior bake. ADR 0005 revisits that estimate.
- Deriving rooms from the record fixes the grid's errors, such as a double-height window showing two stacked rooms, which furniture would otherwise make obvious.

## Considered options

- **Procedural furniture in the shader, set per House by uniforms:** no download, but it reads as untextured blocks.
- **Real geometry behind see-through glass:** convincing parallax, but too expensive on iGPUs and a large change to the pipeline.
- **CC0 asset-library models:** a foreign style, their own textures and more download weight.

## Consequences

- The schema grows an Interior on glazing openings. The House schema's rule against interior walls and rooms still holds, because an Interior is only a view through the glass, not part of the plan.
- Re-baking a House now also re-renders its Interiors, which adds a few minutes per House on the CPU.
- Exterior props (terrace furniture, lanterns, woodpiles) were deferred. They are not covered here.

## Evidence

Measured on the dev machine (Radeon Vega 10, ANGLE D3D11, 1600×900) against `main`, with Lyngen's fireplace lounge behind `living-front` as the only Interior, in final bakes (#57):

- **Frame cost at rung 4 (Lean):** GPU time per frame from WebGL timer queries, rung 4 held for 15 s, 7 runs per build in alternating order. GPU p90 changed by −0.56 ms (mean of runs) or +0.24 ms (median) at the overview, and by +0.12 ms or +0.41 ms at the selected Lyngen camera, inside the run-to-run spread of ±3 ms from the GPU's thermal state. Everything else ran the same.
- **Step-downs:** unpinned, both builds step down the same way (to rung 5, or 6 on a warm GPU); the Interiors add none.
- **Download:** the atlas is 0.21 MB (a 1060×544 UASTC atlas, 0.77 MB of GPU memory as BC7). The Scene went from 14.76 to 14.97 MB over the wire, of 24 MB.
- **Bake:** the Interior adds about 3 minutes to a final bake of Lyngen (512 px layers, 192 spp), and 30 s to a draft.

## Why it was superseded

The cards are two flat layers. Straight on, they give some depth, but a selected House is seen from an orbit of about ±50°, and from the side the furniture on the card slides against the floor and reads as a drawing. More layers would only soften that. The Houses' look depends on being solid from every angle of the arc, so the hero room became real geometry (ADR 0005).
