# The hero Interior is real baked geometry

Status: accepted (2026-09-25). The Lyngen prototype (#59) passed its frame and download budget on the Vega 10 (see Evidence). It supersedes ADR 0004.

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
- The record-derived room sizing and the Interior validation from the #57 prototype carried over into #60.
- The Interior lives on its volume in the House record, and every Glazing Face into that volume looks into it. A volume with an Interior spans one Level, and no void or terrace cuts through it.

## Evidence

### Lyngen (#59)

Built as #59 on Lyngen: a fireplace lounge in the double-height main volume, seen through `living-front` and `living-side`. The template puts the fireplace on the wall the stone chimney stands behind.

- **The room.** The builder hollows the volume to a shell inside 0.3 m walls and cuts the glass through to it. The walls, floor, ceiling and furniture come to 3,186 triangles after culling, with 18 lamps (16 downlights, the floor lamp and the fire). Instead of sharing the House's lightmaps, the room bakes into its own texture, `interior.ktx2`: its light (denoised), its colours and its glow, combined into one HDR texture. The Scene draws it as one mesh with one unlit material, one draw call, after the House's other opaque parts, so the depth test drops what the walls hide.
- **Frame cost.** Measured on the dev machine (Radeon Vega 10, ANGLE D3D11, headed Chromium at 1600×900) against `main`, with final bakes of all four Houses and no bake running, one production server at a time. As in #57, each frame's GPU time comes from WebGL timer queries, the rung is held for 15 s at each camera, and the builds alternate. GPU p90, branch minus `main`, as mean / median of runs:

  | Rung | Runs per build | Overview | Lyngen selected |
  |---|---|---|---|
  | 4 (Lean), GPU warm from the bakes | 7 | −0.10 / −0.04 ms | +0.77 / +0.90 ms |
  | 6 (DPR 0.75, no bloom), held from the start | 4 | −0.11 / −0.44 ms | −0.56 / −0.97 ms |

  The spread between runs is several ms, from the GPU's thermal state. The warm GPU sat near 33 ms at the overview, so two more pairs were run on a cold GPU. The pair that started cold differed by +0.08 ms at the overview. In the other pair the branch ran last and warmest.
- **Step-downs.** In 3 alternating pairs with the rung left free, both builds start at rung 4 and settle at rung 6 in every run. The branch adds no step-down.
- **Download.** `interior.ktx2` is 1.05 MB (1024², UASTC HDR; 1.40 MB of GPU memory as BC6H), and Lyngen's GLB grew by 0.03 MB over the wire. The Scene (Target and Lean) went from 14.76 to 15.84 MB over the wire, of 24 MB, and the Houses from 9.11 to 10.20 MB, of 16 MB.
- **Bake.** The room adds about 6 minutes to Lyngen's final bake (1024², 256 spp) and about 1 minute to a draft (512², 64 spp).

### Kvaløya (#62)

A dining room in `living` (L0, 9.2 × 6 m), seen through `living-front` and `living-court`: a 2.8 m walnut table for eight facing the fjord, two pendants over it, and a sideboard under a canvas on the back wall. It is built from the dining template with no builder change.

- **The room.** 852 triangles after culling, with 10 lamps (8 downlights and the 2 pendants). At the overview, two hero Interiors are on screen: Lyngen's and Kvaløya's.
- **Frame cost.** Measured the same way against `main` at ca7f23d (Lyngen's Interior only), with no bake running and the selected camera on Kvaløya. The GPU ran cooler than in #59: about 20 ms at the overview at rung 4. GPU p90, branch minus `main`, as mean / median of runs:

  | Rung | Runs per build | Overview | Kvaløya selected |
  |---|---|---|---|
  | 4 (Lean), held | 7 | +1.30 / +0.52 ms | +0.41 / +0.33 ms |
  | 6 (DPR 0.75, no bloom), held from the start | 12 | +1.89 / +2.92 ms | +1.13 / +0.23 ms |

  Rung 4 is inside the +1.5 ms bar. At rung 6 the overview's p90 is over it. That tail comes from runs in which the whole frame slows (overview p50 of 14–18 ms against about 10 ms), which both builds have: `main`'s p90 went over 12 ms in 5 of 12 runs, the branch's in 8. The branch was higher in 7 of 12 alternating pairs, and a sign-flip test puts the paired gap at p = 0.14, so 12 pairs can't separate it from the GPU's state. The median p50s show the room's steady cost: +0.30 ms at the overview at either rung, and +0.68 ms at the selected camera at rung 4, higher in all 7 pairs, as Lyngen's was.
- **Step-downs.** In 3 alternating pairs with the rung left free, both builds start at rung 4 and settle at rung 6 in every run. The branch adds no step-down.
- **Download.** `interior.ktx2` is 0.87 MB (1024², UASTC HDR; 1.40 MB of GPU memory as BC6H), and Kvaløya's GLB grew by 0.02 MB over the wire. The Scene (Target and Lean) went from 15.84 to 16.69 MB over the wire, of 24 MB, and the Houses from 10.20 to 11.04 MB, of 16 MB.
- **Bake.** The room adds about 9.5 minutes to Kvaløya's final bake (16 minutes in all).

### Reine (#63)

A kitchen in `middle` (L1, 10 × 8 m), seen through `living-front` and `living-side`: walnut units with a stone worktop along the back wall under open shelves, and an island with four stools under three pendants. It is built from the kitchen template with no builder change. From the arc's height the fascia hides most of the back wall, so the island and pendants carry the room.

- **The room.** 1,140 triangles after culling, with 18 lamps (15 downlights and the 3 pendants). At the overview, three hero Interiors are on screen: Lyngen's, Kvaløya's and Reine's.
- **Frame cost.** Measured the same way against `main` at fc70cbc (Lyngen's and Kvaløya's Interiors), with no bake running and the selected camera on Reine. GPU p90, branch minus `main`, as mean / median of runs:

  | Rung | Runs per build | Overview | Reine selected |
  |---|---|---|---|
  | 4 (Lean), held | 7 | +0.43 / +0.19 ms | +0.18 / +0.52 ms |
  | 6 (DPR 0.75, no bloom), held from the start | 12 | −0.17 / +0.02 ms | −0.39 / +0.07 ms |

  Both rungs are inside the +1.5 ms bar. At rung 6, 3 of the 12 pairs fell into the whole-frame slow state seen in #62, in both builds. The median p50s show the room's steady cost at rung 4: +0.29 ms at the overview and +0.49 ms at the selected camera, higher in all 7 pairs, as Lyngen's and Kvaløya's were.
- **Step-downs.** In 3 alternating pairs with the rung left free, both builds start at rung 4 and settle at rung 6 in every run. The branch adds no step-down.
- **Download.** `interior.ktx2` is 0.75 MB (1024², UASTC HDR; 1.40 MB of GPU memory as BC6H), and Reine's GLB grew by 0.01 MB over the wire. The Scene (Target and Lean) went from 16.69 to 17.38 MB over the wire, of 24 MB, and the Houses from 11.04 to 11.74 MB, of 16 MB.
- **Bake.** The room adds about 8 minutes to Reine's final bake (15.5 minutes in all).
