# The hero Interior is real baked geometry

Status: accepted (2026-09-25), amended (2026-09-26, #74: a House may have several Interiors, and glass may be walled up for composition; #75: Reine's second Interior, a bedroom; 2026-09-28, #101: an Interior may stand behind a terrace recess, and Lyngen's second Interior, a library; #105: seating in Kvaløya's dining room, and a kit of small things). The Lyngen prototype (#59) passed its frame and download budget on the Vega 10 (see Evidence). It supersedes ADR 0004.

The room cards of ADR 0004 were cheap, but they read as flat drawings when a selected House is orbited. Real furniture is part of the design. Its frame cost stays small if it is baked like the Houses: the lighting is in lightmaps, and the Vega is limited by pixel work and post-processing, not triangles. So we pay for real geometry, and we bound it by the number of rooms, not by removing glass.

## Decision

- **A hero Interior per House, and more Interiors where they earn it.** The hero Interior is the room inside the volume behind the Glazing Face the Project's interior image names. Each Interior is a real room shell (floor, walls, ceiling) with furniture from one shared kit, and every Glazing Face into its volume looks into it. After the grilling in #65, a House may have several: Senja's lower room, whose glass was the largest in the Scene, is a living room besides its hero bedroom (#74), Reine's top floor is a bedroom above its hero kitchen (#75), and Lyngen's upper frame is a library behind its terrace (#101). Other seen glazing keeps the procedural room, sized from the record, behind a warm Curtain.
- **Glass is not removed to save cost.** A room is paid for once, however many faces look into it. Glass may be walled up for composition, where a House reads better with less of it: Senja's `lower-side`, and the half of `lower-front` away from the stone wall (#74).
- **Bake.** Headless Blender (ADR 0001) builds the shell and furniture from the record and a template per kind, with no per-House code. Cycles bakes them with the room's lamps and downlights into the House's lightmaps. Furniture is low-poly and sized to be read from the arc distance. It is merged by material.
- **Live.** A hero Glazing Face is drawn as glass over the real room, with the existing sky reflection and hover glow. No real-time lights.
- **Consistency.** A Project's interior image shows its hero Interior. The Drawings don't show furniture.

## Why

- Only geometry holds up from every angle of the ±50° arc.
- One room per House keeps the extra draw calls, lightmap texels and bake time bounded. The estimate is about +0.5–1.5 ms at rung 4 on the Vega, +1–3 MB per House (the Scene is ~15 of 24 MB), and +5–10 min per final bake. The prototype measures it.
- Removing glass would cut warm light, hover and interior images, which are the core of the design, and save little, because a room seen through two faces costs the same as one. Removing it for composition is another matter: Senja's 13 m `lower-front` outweighed its hero `bar-end` from every camera (#65), and halving it puts the living room behind it under the bar.

## Considered options

- **Room cards (ADR 0004):** they passed the budget but failed visually.
- **Real rooms behind every seen Glazing Face:** held back until the hero room is measured.
- **Removing Glazing Faces from Senja and Kvaløya to save cost:** rejected. It saves no rooms, and it takes away the Houses' warmth and their interior images. Senja's lower glass was later cut back for composition instead (#74).

## Consequences

- The House schema's rule against interior walls and rooms is relaxed for the hero room only: a room shell, not a plan. The one wall inside it is a `partition`: a wall with a closed door across the room, which furnishes the room at the glass and leaves the room behind it empty. A bedroom takes one (Senja, #64), with a hinged door, and so does a lounge (Lyngen, #72), with a wide walnut pivot door off-centre, away from the fire. Either leaves 3.5 m in front of it and 1 m behind. A lounge may also have a closed `door` in a side wall, into the room beside it, where another volume on its floor stands against that wall. The partition and the door are part of the Interior, so the drawings don't show them. A dining room may take a `kitchen` (Kvaløya, #73): the kitchen template's run of units along its back wall, behind the table, in place of the sideboard.
- The record-derived room sizing and the Interior validation from the #57 prototype carried over into #60.
- An Interior lives on its volume in the House record, and every Glazing Face into that volume looks into it. A volume with an Interior spans one Level, and no void cuts through it. A terrace may cut into it (#101): the room shell starts at the recess's glazed back wall (`interiorShell`), and that glass is one of the room's windows. It isn't a Glazing Face, so it has no Curtain, hover glow or interior image of its own, but it can be the window a non-hero Interior turns to, when it is its largest glass. The builder cuts the recess through to the room and exports its glass as its own node, `terrace:<name>`, which the Scene draws as glass over the room.
- **Several Interiors** (#74). Each has a window, the Glazing Face its template turns to and its options are measured from: the interior image's face for the hero, and its largest Glazing Face for another (`interiors` in `lib/house/derive.ts`, which lists the hero first). Each is its own GLB node and bakes into its own texture: the hero keeps `interior` and `interior.ktx2`, and another is `interior:<volume>` with `interior-<volume>.ktx2`. The builder JSON gives the others as `otherInteriors`, only when there are some, so the Houses with one Interior kept their bake hashes and weren't baked again. The Scene loads every texture and gives each room its own unlit material; they share one shader program, one draw call per room.
- A lounge may take a `tv` (Senja, #74) in place of a fireplace: a dark wall TV over a walnut media unit on the side wall it names, with the sofa facing it side-on to the glass and a canvas over a sideboard on the back wall behind the seating.
- A bedroom may take a `bedside` (Reine, #75): the side wall its bed's head is against, so the glass sees the bed side-on, and with it a `tv`: the lounge's wall TV and media unit on the other side wall, facing the bed.
- A library (Lyngen, #101) has shelving along its back wall and on along each side wall without a desk or fire, either side of its glass. It may take a `desk`: a long walnut desk with a computer centred along the side wall it names, whose screen's dim, cool glow is the only cool light in the Houses. It may also take a `door`, a closed walnut door toward the back of the side wall it names. With a desk, a large plant stands in the window's corner on that side and a low daybed under the widest glass in the other side wall. Without a fire, the armchairs turn toward the window.
- A dining room may take `seating` (Kvaløya, #105): the third of the room at the end it names is a living room, and the table moves to the rest. The dining and kitchen templates also place a kit of small things wherever they fit, as the vase always was: a runner and candles on a dining table, a cutting board and bowls on a worktop, plates, bowls and jars on a worktop's open shelves, two pot plants by the glass, and a canvas on a free side wall.

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

### Senja (#64)

A bedroom at the end of `bar` (L0, 5.4 × 19.4 m inside), seen through `bar-end`: a partition with a closed walnut door 5.2 m in from the glass, the bed's head against it facing north, nightstands with table lamps, a bench at the foot of the bed, a wardrobe on the right wall, and a reading chair and floor lamp in the window's left corner. The issue asked for a library, but a library's furniture would sit at the far end of a 20 m bar, and the owner of the site asked instead for a bedroom by the glass with the rest of the bar left empty. That needed the `partition` option and a wardrobe and bench in the bedroom template. No other House has a bedroom, so the other bakes are unchanged and the builder version stays. `bar-side` looks into the empty part behind the partition, lit by its downlights, so every Glazing Face into the volume still looks into the same room.

- **The room.** 1,541 triangles after culling, with 27 lamps (24 downlights, the two table lamps and the floor lamp). At the overview, all four hero Interiors are on screen.
- **Jambs.** `bar-end` is as wide as the room, so the reveals of its jambs lie in the planes of the room's side walls. The builder used to take them for room walls and then cull them as outside the room, which left the jambs as thin strips standing clear of the glass. It now keeps a face in a wall's plane but beyond the room on the shell. No other House's glass reaches its room's walls, and their builds are unchanged. The frame costs above were measured before this fix, which adds the two 0.3 m reveals to the shell.
- **Texture.** It stays at 1024². The seen faces get 49 texels/m, against 62 in Reine's kitchen and 85 in Kvaløya's dining room, which is finer than a pixel at the arc's distance. In screenshots across the arc the bed, wardrobe and door read sharp, so the 2048² allowance (+3 MB) isn't needed.
- **Frame cost.** Measured the same way against `main` at d73a844 (Lyngen's, Kvaløya's and Reine's Interiors), with no bake running and the selected camera on Senja. GPU p90, branch minus `main`, as mean / median of runs:

  | Rung | Runs per build | Overview | Senja selected |
  |---|---|---|---|
  | 4 (Lean), held | 7 | +0.43 / +0.38 ms | +0.79 / +0.53 ms |
  | 6 (DPR 0.75, no bloom), held from the start | 12 | −0.51 / −0.21 ms | +0.34 / +0.22 ms |

  Both rungs are inside the +1.5 ms bar. At rung 6 a few runs fell into the whole-frame slow state seen in #62, in both builds (overview p90 over 12 ms in two `main` runs and one branch run). The median p50s show the room's steady cost at rung 4: +0.43 ms at the overview and +0.60 ms at the selected camera, higher in 6 of 7 pairs. The rung-6 runs were split across two sessions by an overnight stop, 6 pairs each, with the order kept.
- **Step-downs.** In 3 alternating pairs with the rung left free, both builds start at rung 4. `main` settles at rung 6 in every run, and the branch at rung 6 in two and rung 5 in one. The branch adds no step-down.
- **Download.** `interior.ktx2` is 0.71 MB (1024², UASTC HDR; 1.40 MB of GPU memory as BC6H), and Senja's GLB grew by 0.01 MB over the wire. The Scene (Target and Lean) went from 17.38 to 17.99 MB over the wire, of 24 MB, and the Houses from 11.74 to 12.35 MB, of 16 MB.
- **Bake.** The room adds about 7 minutes to Senja's final bake (12 minutes in all).

### Lyngen's partition and loft (#72)

After the grilling in #65, Lyngen's lounge loses its shelving and gains a partition 5.8 m in from `living-front`, with a closed walnut pivot door 1.6 m wide, 1 m from the right wall, away from the fire. That needed `partition` on the lounge. It is in the schema, in `validateProject` (with the same 3.5 m in front and 1 m behind as a bedroom's) and in the builder. There, the lounge template takes the partition for its back wall and clips the hearth at it.

In review, the owner of the site asked for three more changes:

- **A ceiling.** The double-height `main` becomes the lounge on L0, 3.46 m high, with a new volume, `loft`, over it on L1. `living-front` now spans L0 only. The loft has its own Glazing Faces with Curtains: `loft-front` above it, and `loft-side`, which was `living-side`. The pivot door comes down to 2.7 m.
- **A door into the room beside it.** A lounge option, `door`, puts a closed walnut door on a wall that another volume on its floor stands against. `validateProject` checks that there is one, and the builder finds it (`beside`). At Lyngen that is the right wall, into the dining room in `lower`.
- **The record.** The gross floor area goes from 280 to 355 m². The authored `floorArea` goes from 290 to 320, the top of the range in `DESIGN.md`, which is within 15 %. The copy no longer calls the room double height.

The sideboard and canvas are centred on the plaster left of the pivot door. The seating is sized from the lounge in front of the partition, so the sofa (1.74 m) and the chimney breast (2.09 m) are a little smaller than before. No other House has a lounge, so the other bakes are unchanged and the builder version stays.

- **The room.** 1,822 triangles after culling (3,186 with the shelving), with 14 lamps (12 downlights, the floor lamp and the fire).
- **Reading.** Across the arc, the curtained loft glows over the lounge. From the hero camera to the chimney end, the pivot door and the canvas read on the partition, and the side door reads on the right wall. The canopy hides the ceiling line, and near the hero camera the floor lamp and an armchair stand in front of the pivot door. At the arc's other end, the room is seen only at a grazing angle through the jamb.
- **Frame cost.** The probe check (`scripts/perf/README.md`) against `main` at 94c667a: rung 4, 3 loads per build in A B B A A B order, no bake running. The first `main` load was cold (overview p50 14.7 ms), and one branch load had a slow spell at the selected camera (p50 23.6 ms). Medians of loads, ms per frame:

  | | Overview | Lyngen selected |
  |---|---|---|
  | Interiors, `main` → branch | 0.12 → 0.12 | 0.34 → 0.23 |
  | Glazing, `main` → branch | 0.12 → 0.14 | 0.27 → 0.40 |
  | Whole-frame GPU p50, `main` → branch | 18.21 → 18.23 | 18.09 → 17.85 |

  The Interiors part doesn't rise, since the room is half as high. The loft's glass moves from clear glass over the room to the glazing shader's curtained room, and glazing rises by 0.13 ms at the selected camera. The whole-frame p50 moves by +0.02 and −0.24 ms, and every load stayed at rung 4.
- **Download.** `interior.ktx2` is 0.88 MB (from 1.05). The Houses went from 12.35 to 12.16 MB over the wire, of 16 MB, and the Scene from 17.99 to 17.80 MB, of 24 MB.
- **Bake.** Lyngen alone, final mode: 15.8 minutes, of which the room takes 10.5.

### Kvaløya's kitchen run (#73)

After the grilling in #65, Kvaløya's dining room gets a kitchen. A dining option, `kitchen`, replaces the sideboard and canvas with the kitchen template's run of units: walnut base units, a stone worktop, a ceramic splashback and walnut cupboards above (open shelves with `shelving`). The builder's new `worktop` builds the run for both templates. The kitchen template's output is unchanged, so Reine keeps its bake and the builder version stays. Reine stays the kitchen House, so here the table stays the room's subject. The run is centred behind the table, 5.2 m long and 1.7 m short of either side wall, which keeps it clear of `living-court`'s glass in the left wall. In a shallow room the table moves forward to keep clear of the run. At Kvaløya (5.4 m deep) the table stays where it was, with 1.4 m between the far chairs and the worktop.

- **The room.** 70 pieces and 1,064 triangles before culling, as before: the run is four boxes, as the sideboard and canvas were. The culled room has 185 m² of surface, up from 166, and the same 10 lamps. Open shelves, tried in a draft, came to 1,316 triangles and looked no different from the arc's height.
- **Reading.** At the arc's pitch, the canopy cuts off the back wall at about 0.95 m. From the hero camera to either end of the arc, the run reads as a solid walnut counter behind the far chairs. Dragged to a lower pitch, the whole run shows behind the table and its two pendants: base units, worktop, the light splashback and the cupboards. Through `living-court` the room is seen edge-on past the table.
- **Frame cost.** The probe check (`scripts/perf/README.md`) against `main` at 71508d6: rung 4, 3 loads per build in A B B A A B order, no bake running. The first `main` load was cold (overview p50 14.1 ms). Medians of loads, ms per frame:

  | | Overview | Kvaløya selected |
  |---|---|---|
  | Interiors, `main` → branch | 0.12 → 0.12 | 0.13 → 0.12 |
  | Whole-frame GPU p50, `main` → branch | 18.41 → 18.57 | 16.55 → 16.62 |

  The Interiors part moves by 0.00 and −0.01 ms, inside the 0.5 ms bar. The whole-frame p50 moves by +0.16 and +0.07 ms, under 0.5 ms. Every load stayed at rung 4.
- **Download.** `interior.ktx2` is 0.92 MB (from 0.87). The Houses went from 12.16 to 12.21 MB over the wire, of 16 MB, and the Scene from 17.80 to 17.85 MB, of 24 MB.
- **Bake.** Kvaløya alone, final mode: 14.3 minutes, of which the room takes 8.4.

### Senja's living room (#74)

After the grilling in #65, Senja's lower floor becomes a second Interior, and part of its glass becomes wall. `lower-side` is wall, and `lower-front` keeps its right half, 6.5 m toward the stone wall, with 3 mullions (4 panes, as before). `lower` gets a `lounge` with the new `tv` option and a floor lamp, and fills the whole volume (13.4 × 6.4 m inside, 3.16 m high). The bedroom in `bar` stays the hero Interior, behind `bar-end`, and its build is unchanged: the same 1,541 triangles after culling. The builder now takes a list of Interiors, but for a House with one it builds, names and seeds its room as before, so the builder version stays and Lyngen, Kvaløya and Reine keep their bakes and bake hashes.

- **Which wall the TV is on.** The issue put the TV on the left wall. In the builder's room frame, left and right are as seen from outside, and no viewpoint sees that wall: the glass that is left is the room's right half, and the arc looks into the room from the left. Of the overview and 33 arc cameras, 24 see the right wall through `lower-front` and none sees the left wall. So the TV is on the right wall, which is the left one to someone inside facing the fjord. The option names its wall (`tv: "right"`), so moving it is a one-word change and a bake.
- **The room.** A dark 75-inch TV (1.65 × 0.95 m) in a thin black frame over a 2.6 m walnut media unit, centred on the right wall. The sofa faces it 3.7 m out, side-on to the glass, with the linen and rust armchairs either side of a stone coffee table on a rug, a side table and the floor lamp. A walnut sideboard under a canvas stands on the back wall behind the seating, where the glass looks. 73 pieces and 1,614 triangles after culling, with 22 lamps (21 downlights and the floor lamp).
- **Reading.** From the hero camera to the middle of the arc, the sofa, the armchairs, the rug and the floor lamp read through `lower-front`, under the lit bedroom. The media unit and the TV read on the right wall from about the middle of the arc, where the ledge's fascia no longer hides the upper wall. At the arc's far end, the ledge and the bar hide the lower glass. The left half of the room, behind the new wall, is seen from nowhere and is baked at the unseen texel density.
- **Texture.** It stays at 1024². The seen faces get 70 texels/m, finer than the bedroom's 49, and across the arc the TV, the unit and the chairs read sharp, so the 2048² allowance isn't needed.
- **Frame cost.** The probe check (`scripts/perf/README.md`) against `main` at 503e9d4: rung 4, 3 loads per build in A B B A A B order, no bake running. The first `main` load was cold (overview p50 13.9 ms). Medians of loads, ms per frame:

  | | Overview | Senja selected |
  |---|---|---|
  | Interiors, `main` → branch | 0.12 → 0.14 | 0.23 → 0.32 |
  | House shells, `main` → branch | 0.78 → 0.80 | 1.77 → 1.91 |
  | Glazing, `main` → branch | 0.14 → 0.11 | 0.20 → 0.08 |
  | The three together | 1.04 → 1.05 | 2.20 → 2.31 |
  | Whole-frame GPU p50, `main` → branch | 18.51 → 18.63 | 18.04 → 18.44 |

  The three parts rise by 0.01 and 0.11 ms, inside the 0.5 ms bar: the room costs a little, and glazing falls, since half the glass is gone and the rest is clear glass over the room rather than the procedural room. The whole-frame p50 moves by +0.12 and +0.40 ms, within the parts' rise plus 0.5 ms. Every load stayed at rung 4.
- **Download.** `interior-lower.ktx2` is 0.90 MB (1024², UASTC HDR; 1.40 MB of GPU memory as BC6H). Senja's shell lightmaps shrank by 0.16 MB with less glass. The Houses went from 12.21 to 12.94 MB over the wire, of 16 MB, and the Scene from 17.85 to 18.58 MB, of 24 MB.
- **Bake.** Senja alone, final mode: 21.2 minutes, of which the living room takes 9.4 and the bedroom 6.9.
- **Not changed.** The plinth leaves a hole under each Interior's whole room shell. Under Senja's bar that includes the snow below the cantilever, 3.2 m under the bedroom's floor, where the terrain shows through as a darker patch in front of `lower-front`. It was there before this change (#64), and fixing it changes Reine's plinth too, so it is left for its own issue. #84 fixed it (see "The plinth hole").

### Reine's bedroom (#75)

After the grilling in #65, Reine's top floor becomes a second Interior: a bedroom in `top` (L2, 8.4 × 7.4 m inside, 3.06 m high), seen through `bedroom-front`, its largest Glazing Face. The kitchen in `middle` stays the hero Interior, and its build is unchanged: the same 1,140 triangles after culling. `kitchen-front`, which opens into `base`, is renamed `base-front`. `bedroom-side` now looks into the bedroom, so it loses its Curtain.

- **Two bedroom options.** `bedside` puts the bed's head against the side wall it names, as far back as the back wall or partition allow, so the glass sees it side-on; the wardrobe moves to the back wall, on the far side from the bed, and the reading chair to the window's corner on that side. `tv` hangs the lounge's wall TV over its walnut media unit on the other side wall, facing the bed, so it needs a `bedside`. `validateProject` checks that the bed and the TV each have the 3.3 m of their wall in front of the back wall or partition free of glass and doors, and that the room is at least 3.5 m across. Without `bedside` the template builds exactly what it did: for Senja's bedroom and four other rooms, main's and this branch's `interior.py` give the same pieces, vertices and lamps, so Senja keeps its bake and the builder version stays.
- **The room.** The bed's head is on the right wall, 4.15 to 7.1 m in from the glass with its nightstands, clear of `bedroom-side` (0.7 to 3.9 m in). The TV and a 2.6 m walnut unit face it from the left wall, a wardrobe stands on the back wall, and a reading chair and floor lamp are in the window's left corner. 64 pieces and 1,276 triangles after culling, with 15 lamps (12 downlights, the two table lamps and the floor lamp).
- **Reading.** From the hero camera toward the stone wall, the bed, its lamps and the bench read side-on through `bedroom-front`, until the wall hides the room near the arc's end. From the arc's other end, the TV over its unit reads on the left wall, with the wardrobe beside it on the back wall, and the bed shows through `bedroom-side`.
- **Texture.** It stays at 1024², in its own `interior-top.ktx2`. The seen faces get 61 texels/m, as the kitchen's 62, and across the arc the bed, the TV and the wardrobe read sharp.
- **Frame cost.** The probe check (`scripts/perf/README.md`) against `main` at a054f4b: rung 4, 3 loads per build in A B B A A B order, no bake running. The first `main` load was cold (overview p50 14.0 ms). Every load stayed at rung 4. Medians of loads, ms per frame:

  | | Overview | Reine selected |
  |---|---|---|
  | Interiors, `main` → branch | 0.14 → 0.18 | 0.10 → 0.23 |
  | House shells, `main` → branch | 0.84 → 0.84 | 1.88 → 1.82 |
  | Glazing, `main` → branch | 0.13 → 0.13 | 0.15 → 0.08 |
  | Whole-frame GPU p50, `main` → branch | 19.75 → 20.27 | 17.26 → 17.66 |

  The Interiors part rises by 0.04 and 0.13 ms, inside the 0.5 ms bar, and glazing falls at the selected camera, where the bedroom's glass is clear glass over the room rather than the procedural room. The whole-frame p50 moves by +0.52 and +0.40 ms, within the part's rise plus 0.5 ms. At the overview that gap comes from the cold first `main` load: in the two warm pairs the branch differs by +0.24 and −0.08 ms.
- **Download.** `interior-top.ktx2` is 0.84 MB (1024², UASTC HDR; 1.40 MB of GPU memory as BC6H). Reine's shell lightmaps shrank by 0.07 MB and its GLB grew by 0.02 MB. The Houses went from 12.94 to 13.71 MB over the wire, of 16 MB, and the Scene from 18.58 to 19.35 MB, of 24 MB.
- **Bake.** Reine alone, final mode: 19.4 minutes, of which the bedroom takes 7.7 and the kitchen 6.3.
- **Not changed.** The plinth hole (#84) now also runs under `top`'s room shell, including the strip where `top` overhangs `base` beside the stone wall. In screenshots from the hero camera and across the arc, the snow there looks the same as on `main`, where `middle`'s overhang already has one. #84 fixed both (see "The plinth hole").

### The plinth hole (#84)

The builder cut a hole in the snow plinth under each Interior's whole room shell, so the live plinth, which wins the depth test with a polygon offset, wouldn't cover the room's floor. It now skips a plinth quad only where the quad lies inside a room's shell and all four of its corners are at the room's floor, within 1 cm. Everywhere else the snow runs on under the room. The builder version goes to 1.3.1, and all four Houses were baked again in final mode.

- **Where the hole stays.** Lyngen's lounge, Kvaløya's dining room and Senja's living room stand on the plinth, and so does the part of Senja's bar behind `lower`, where the snow steps up to ±0.00. They keep the same hole, quad for quad. Lyngen's and Kvaløya's bakes come out the same as before, apart from the bake hash in the GLB: the same lightmaps, textures and GLB size.
- **Where the snow comes back.** Under Senja's cantilever the plinth is 3.2 m below the bedroom's floor, and under Reine's kitchen and bedroom (L1 and L2) the whole shell is above the snow. Reine's plinth now has no hole at all. No quad in any House lies part-way between the two heights.
- **Reading.** From the hero camera and across the arc, the blue patch under Senja's cantilever, in front of `lower-front`, is gone: the snow there is lit as the rest of the plinth is. At Reine, the snow under `middle`'s overhang and in front of `base-front` was a large blue patch on `main`, and so was the strip under `top`'s overhang beside the stone wall. Both are now snow, with the glass's spill on them. Nothing z-fights with an Interior's floor in any House.
- **Download.** The Houses went from 13.71 to 13.73 MB over the wire, of 16 MB, and the Scene from 19.35 to 19.38 MB, of 24 MB. The plinth's draws don't change.
- **Bake.** All four, final mode, one at a time: Lyngen 15.4, Senja 23.3, Kvaløya 14.1 and Reine 18.9 minutes.
- **Not changed.** In front of Reine's `base-front`, a soft, curved shadow edge crosses the snow that the hole used to hide. It isn't in the bake: the Scene's shadow mask is resolved on the live terrain, which sits on the slope wherever the slope runs below a plinth (`terrainHeight` in `lib/scene/platform.ts`). There, the slope is 1 to 1.5 m below the plinth, so a House's shadow lands on the flat plinth where it would fall on the slope. It is the same on the downhill side of every plinth, so it is left for its own issue (#88).

### Lyngen's library (#101)

After a grilling, Lyngen's upper `frame` (L1, 7.2 m top), the empty room behind the terrace recess, becomes its second Interior: a library, a study with no fireplace, since the chimney stands at the other end of the House. The lounge stays the hero Interior. Until now a terrace couldn't cut into an Interior. Now it can: the room shell starts at the recess's glazed back wall, 1.6 m in, and that glass is the room's window, the largest glass into `frame` (6.9 × 3.3 m against `study-side`'s 6 × 2.4). `study-side` looks into the same room from the east, so it loses its Curtain. A void still cuts through an Interior and is refused. The owner of the site also asked for a door into the room.

- **Two library options.** `desk` puts a long walnut desk with a computer centred along the side wall it names: a slim monitor on a stand, a keyboard, a brass task lamp and a task chair. The screen has a dim, cool glow (`INTERIOR_SCREEN`) and a faint cool light in front of it, the only cool light in the Houses. `door` puts a closed walnut door toward the back of the side wall it names. `validateProject` keeps the desk's 2.6 m and the door's 0.9 m of wall free of glass and doors, and apart. With a desk, a large plant stands in the window's corner on that side, and a low daybed under the widest glass in the other side wall. The shelving runs along the back wall and on along each side wall without the desk or a fire, either side of its glass (`glass_in` in `build.py` hands the template the glass in the room's walls). Without a fire, the armchairs turn toward the window. No other House has a library, so the template's rewrite changes no other bake.
- **The builder.** The terrace is cut through to the room, and its glass is its own node, `terrace:terrace`, hidden in the room's bake as the Glazing Faces are, and drawn by the Scene as glass over the room. It selects the House, as the wall behind it did. `roof-main` runs 0.65 m into the frame and would have stood inside the room's top edge: a slab that runs into a room shell is now cut back to it, as the volume is (`clear_rooms`). A fascia hanging its 2 cm drop below a slab that sits on a room's ceiling doesn't count, or Senja's and Reine's fascias would have been cut. With `main`'s builder and this branch's, Senja, Kvaløya and Reine build byte-identical raw GLBs (`--no-bake`), so the builder version stays and their bakes are current.
- **The room.** 7.0 × 8.5 × 3.66 m, facing the terrace. The desk and the door are on the left wall, the daybed is under `study-side` on the right, the armchairs, their side table and the floor lamp are on a rug in the middle, and the plant stands in the front-left corner. 316 pieces and 4,160 triangles after culling, most of them books, with 15 lamps. That's the most of any room: Lyngen's lounge had 3,186 with its shelving (#59).
- **Reading.** From the hero camera, through the terrace glass, the desk reads side-on with the screen's cool glow, and so do the shelves across the back wall, the armchairs and floor lamp, and the plant. From the arc's east end, through `study-side`, the desk and screen read head-on, with the door beside the back shelves. From its west end, the daybed shows under `study-side`. The terrace's balustrade rail crosses the glass at 1 m, as it did the Curtain before.
- **Texture.** It stays at 1024², in `interior-frame.ktx2`. The seen faces get 39 texels/m, below the bedroom's 49 in Senja, since the room is tall and seen through two large faces. Across the arc the desk, the shelves and the chairs read sharp, and 2048² (+3 MB) wouldn't fit the Houses' budget.
- **Frame cost.** Measured as for #59–#64 against `main` at c97e5bd, with the selected camera on Lyngen and no bake running. GPU p90, branch minus `main`, as median / mean of runs:

  | Rung | Pairs | Overview | Lyngen selected |
  |---|---|---|---|
  | 4 (Lean), held | 6 of 7 | +0.06 / −0.27 ms | +0.76 / +0.49 ms |
  | 6 (DPR 0.75, no bloom), held from the start | 12 | −0.90 / −0.42 ms | +0.09 / +0.14 ms |

  Both rungs are inside the +1.5 ms bar. One rung-4 pair was left out because `main`'s run stepped to rung 5 at the selected camera. The steady cost shows in the p50s at the selected camera: +0.58 ms at rung 4 and +0.25 ms at rung 6, higher in every pair (p 0.016 and < 0.001). At the overview it is lost in the noise. A first rung-4 run earlier in the day put the selected camera's p90 at +2.77 / +1.89 ms (5 valid pairs). The probe check that followed (6 loads, A B B A A B) put the change's own draws at +0.24 ms there: Interiors 0.22 → 0.46 ms, the Interior glass ("House lights") 0.10 → 0.23, and glazing 0.33 → 0.20, since `study-side` and the terrace no longer draw procedural rooms. The rest of that run's gap came from whole-frame slow spells, the state #62 describes: one branch probe load at the selected camera ran at 16.15 ms against 13.3–14.1. The second run, above, is the one recorded.
- **Step-downs.** In 3 alternating pairs with the rung left free, run warm after the frame runs, both builds start at rung 4 and settle at rung 5 in every run, after 2 s. The branch adds no step-down.
- **Download.** `interior-frame.ktx2` is 1.05 MB (1024², UASTC HDR; 1.40 MB of GPU memory as BC6H). Lyngen's GLB grew by 0.04 MB over the wire, and its shell lightmaps shrank by 0.02 MB. The Houses went from 14.28 to 15.35 MB over the wire, of 16 MB, and the Scene from 19.92 to 20.99 MB, of 24 MB.
- **Bake.** Lyngen alone, final mode: about 23 minutes, of which the library takes 4.0 and the lounge 11.9.

### Kvaløya's seating and the small things (#105)

After a grilling, Kvaløya's dining room becomes a kitchen, dining and living room, and Reine's kitchen shelves, which read as a library's, get kitchen things. An Interior keeps one kind, what the room is mainly for, and its furnishing may give it other uses (`CONTEXT.md`).

- **No fire.** The issue asked for a fire in the hearth wall at the left end of the back wall, with seating round it. A draft built it, but at Kvaløya's hero pitch (16°) the roof's front fascia hides the whole back wall, fire and stone breast with it. It read at 12°, but the owner of the site chose to keep the camera and drop the fire. So there is no dining `fireplace`, and no firewood in the kit.
- **Seating.** A dining option, `seating`, names an end of the room, left or right as seen from outside. Its third of the room becomes a living room turned toward the glass: a 2 m sofa facing the window, a low stone table in front of it, and the rust armchair across the table from the end wall, its back to the dining table, on a rug, with a floor lamp by the glass, where its lit shade clears the fascia. The table moves to the rest of the room, 1.2 m short of the far wall, and the kitchen run stays centred behind it. `validateProject` checks that the room is at least 7 m wide. At Kvaløya the seating is at the left end, by `living-court`, the table is 2.55 m long (8 chairs, as before) and centred 6.3 m along the room, and the run is 3.35 m long.
- **The small things.** Low-poly, baked, and placed by the dining and kitchen templates wherever they fit: a linen runner and three lit candles on a dining table, a cutting board and two bowls on a worktop, stacks of plates, nested bowls and rows of jars on a worktop's open shelves in place of the books (a dining room's `shelving` without a kitchen keeps its books), two pot plants in the corners of the window wall, and a canvas on the side wall with the longest run clear of glass and doors. At Reine that is the left wall, beside the balcony door. The kitchen stays a kitchen with its island. Its interior image's alt now says kitchen.
- **Other Houses.** Lyngen and Senja have no dining or kitchen Interior. For their four rooms and Reine's bedroom, `main`'s `interior.py` and this branch's give the same pieces, vertices and lamps, so the builder version stays and they keep their bakes. Reine's record is unchanged, so its bake hash is too: it was re-baked with `--force`.
- **The rooms.** Kvaløya's: 126 pieces and 2,256 triangles after culling, with 11 lamps (8 downlights, the 2 pendants and the floor lamp); its seen faces get 72 texels/m. Reine's kitchen: 146 pieces and 3,014 triangles after culling (the crockery is most of the rise), with the same 18 lamps; 83 texels/m.
- **Reading.** From Kvaløya's hero camera, through `living-front`, the sofa, stone table, armchair and rug read at the left end, with the floor lamp's shade lit by the glass and a pot plant in the corner, and the table with its runner and candles at the right. From the arc's west end the sofa is seen head-on. At Reine the back wall is hidden from the hero camera by the upper balcony; from the front of the arc the shelves read as a kitchen's, plates and bowls and jars, with the canvas on the left wall and a pot plant by the glass.
- **Frame cost.** Measured as for #59–#64 against `main` at 69e2e27, with no bake running, once with Kvaløya selected and once with Reine. GPU p90, branch minus `main`, as median / mean of paired runs:

  | Rung | Pairs | Overview | Selected |
  |---|---|---|---|
  | 4 (Lean), held, Kvaløya | 7 | −0.01 / +2.36 ms | +0.18 / +1.22 ms |
  | 4 (Lean), held, Reine | 6 of 7 | −0.46 / −0.96 ms | −4.36 / −4.47 ms |
  | 6 (DPR 0.75, no bloom), held from the start, Kvaløya | 12 | +0.15 / −0.48 ms | −0.13 / −0.81 ms |
  | 6 (DPR 0.75, no bloom), held from the start, Reine | 12 | +0.38 / +0.63 ms | −0.05 / +0.62 ms |

  Every median is inside the +0.5 ms bar, and no gap is separated from the GPU's state (sign-flip p 0.14 or more). The means are pulled by whole-frame slow spells (#62), which both builds had: at rung 4, runs of either build sat at 25–28 ms where the rest sat at 16–19, and most of the Reine rung-6 pairs ran in the slow state (overview near 16 ms against 9). The median paired p50s put the rooms' steady cost at the selected camera at +0.13 ms for Kvaløya and −0.01 ms for Reine at rung 4, and +0.04 and 0.00 ms at rung 6. One rung-4 Reine pair was left out because the branch's run stepped from rung 4 to 5 at the selected camera, with the rung held.
- **Step-downs.** In 3 alternating pairs with the rung left free (`settle.ts`, 60 s at the overview), run warm after the frame runs, both builds start at rung 4, reach rung 5 after 2 s and settle at rung 6 after 12 s in every run. The branch adds no step-down.
- **Download.** Kvaløya's `interior.ktx2` went from 0.92 to 0.99 MB and its GLB grew by 0.02 MB over the wire; Reine's `interior.ktx2` from 0.76 to 1.02 MB, and its GLB by 0.02 MB. The Houses went from 15.35 to 15.72 MB over the wire, of 16 MB, and the Scene from 20.99 to 21.36 MB, of 24 MB, so the Houses' budget stays.
- **Bake.** Kvaløya alone, final mode: 14.1 minutes, of which the room takes 7.0. Reine alone: 21.6 minutes, of which the kitchen takes 7.7 and the bedroom 8.4.
