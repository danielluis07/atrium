# Interiors are baked room cards, not geometry

Status: proposed (2026-09-25). It becomes accepted if the Lyngen prototype passes its budget.

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
- It costs about +0.2–0.5 ms per frame on the Vega and +2–3 MB of download (roughly 15.6 → 18 MB of the 24 MB Scene budget). Real furniture behind transparent glass would cost 2–5 ms or more on the Vega, change the glazing model, and need its own interior bake.
- Deriving rooms from the record fixes the grid's errors, such as a double-height window showing two stacked rooms, which furniture would otherwise make obvious.

## Considered options

- **Procedural furniture in the shader, set per House by uniforms:** no download, but it reads as untextured blocks.
- **Real geometry behind see-through glass:** convincing parallax, but too expensive on iGPUs and a large change to the pipeline.
- **CC0 asset-library models:** a foreign style, their own textures and more download weight.

## Consequences

- The schema grows an Interior on glazing openings. The House schema's rule against interior walls and rooms still holds, because an Interior is only a view through the glass, not part of the plan.
- Re-baking a House now also re-renders its Interiors, which adds a few minutes per House on the CPU.
- Exterior props (terrace furniture, lanterns, woodpiles) were deferred. They are not covered here.
