# The hero Interior is real baked geometry

Status: proposed (2026-09-25). It becomes accepted if the Lyngen prototype passes its budget. It supersedes ADR 0004.

The room cards of ADR 0004 were cheap, but they read as flat drawings when a selected House is orbited. Real furniture is part of the design. Its frame cost stays small if it is baked like the Houses: the lighting is in lightmaps, and the Vega is limited by pixel work and post-processing, not triangles. So we pay for real geometry, and we bound it by the number of rooms, not by removing glass.

## Decision

- **One hero Interior per House.** It is the room inside the volume behind the Glazing Face the Project's interior image names. It is a real room shell (floor, walls, ceiling) with furniture from one shared kit, and every Glazing Face into that volume looks into it. Other seen glazing keeps the procedural room, sized from the record. If the Vega allows it later, more rooms get furnished. If not, they get warm curtains or blinds instead.
- **Every Glazing Face stays.** Glass is not removed to save cost. A room is paid for once, however many faces look into it.
- **Bake.** Headless Blender (ADR 0001) builds the shell and furniture from the record and a template per kind, with no per-House code. Cycles bakes them with the room's lamps and downlights into the House's lightmaps. Furniture is low-poly and sized to be read from the arc distance. It is merged by material.
- **Live.** A hero Glazing Face is drawn as glass over the real room, with the existing sky reflection and hover glow. No real-time lights.
- **Consistency.** A Project's interior image shows its hero Interior. The Drawings don't show furniture.

## Why

- Only geometry holds up from every angle of the ±50° arc.
- One room per House keeps the extra draw calls, lightmap texels and bake time bounded. The estimate is about +0.5–1.5 ms at rung 4 on the Vega, +1–3 MB per House (the Scene is ~15 of 24 MB), and +5–10 min per final bake. The prototype measures it.
- Removing glass would cut warm light, hover and interior images, which are the core of the design, and save little, because a room seen through two faces costs the same as one.

## Considered options

- **Room cards (ADR 0004):** they passed the budget but failed visually.
- **Real rooms behind every seen Glazing Face:** held back until the hero room is measured.
- **Removing Glazing Faces from Senja and Kvaløya:** rejected. It saves no rooms, and it takes away the Houses' warmth and their interior images.

## Consequences

- The House schema's rule against interior walls and rooms is relaxed for the hero room only: a room shell, not a plan.
- The record-derived room sizing and the Interior validation from the archived prototype (`interiors-prototype` branch) carry over.
