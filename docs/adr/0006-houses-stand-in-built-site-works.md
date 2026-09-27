# Houses stand in built site works

Status: accepted (2026-09-27). The Lyngen pilot ([#86](https://github.com/danielluis07/atrium/issues/86), draft PR [#89](https://github.com/danielluis07/atrium/pull/89)) was judged a go (see Evidence). The kit that makes it real is #91, and #92–#94 give Senja, Kvaløya and Reine theirs.

`DESIGN.md` said the ground is plain snow, so detail goes into the Houses. At every angle of a House's arc, that left the lower third of the frame as bare snow, and the Houses stood on nothing. The pilot built site works around Lyngen and asked whether they could fill that ground and still look polished in this pipeline. They could: the long wall gives the House a base line, and the snow against the pieces holds up at the arc distance.

## Decision

- **Built site works around each House.** Walls, steps, paths, terraces and aprons, in the House's own materials (concrete, stone, timber, snow, dark metal) and its detail maps, with no new textures. They are real geometry with real thickness, and their snow is in relief: caps on every top, drifts against walls, the lip and berms of a path cut into the snow. They are baked with the House, like its Interiors (ADR 0005). No decals, no paths painted into a texture, no billboards.
- **Snow shrubs.** A few low shrubs almost buried in snow. Each is a soft snow mound with dark twig tips showing, modelled and baked, with a shape of its own. No leaves, no alpha-tested cards and nothing animated. Leafy planting and gardens stay out of the Scene.
- **Set-in lights.** Small warm lights set into walls and steps, baked, and few enough that the windows stay the brightest thing. No posts or bollards.
- **Framing pines.** Placed by hand where a House's arc needs them, standing on the plinth where it bends onto the slope. From every arc camera and from the overview, no framing pine covers any House, its own or one behind it. Pines stay live, not baked.
- **Designed for the arc.** Like the House, site works are designed for the overview and the House's arc. At the overview they only need to read as a silhouette. Nothing is built that neither sees.
- **Budgets, per House.** These are the gates #86 used:
  - At the selected camera, at rung 4 and rung 6, the site works' own draws plus any change under "plinths" come to **≤ 0.5 ms**, and the whole-frame p50 moves by no more than that plus about 0.5 ms. Measured with the probe check in `scripts/perf`, 3 loads of each build.
  - Download grows by **≤ 0.5 MB**, inside the 16 MB Houses budget.
  - The overview doesn't read busier.

  #91 may tighten these once the kit is measured, and amends this ADR if it does.

## Why

- A House on bare snow has no base. Walls and steps in its own concrete and stone tie it to the slope, and they fill the lower third of every arc frame with detail that belongs to the architecture.
- It keeps the Scene winter. The reference house (`docs/design/reference-house.png`) is summer, with a garden. In snow, a garden would be buried, so the only planting that belongs is what still shows: twig tips through a mound.
- Only geometry holds up across the ±50° arc. Its pitch is low (8–30°), so anything flat on the ground reads as flat. That was ADR 0005's reason for real Interiors, and it holds for the ground too.
- Baking keeps the frame cost to draw calls and pixels, not lighting. The Vega is limited by pixel work, so the budget is measured in ms at the selected camera, where the pieces are largest on screen.

## Considered options

- **Plain snow (as before):** no cost, but the bare lower third of every arc frame.
- **Gardens and leafy planting:** foreign to a winter Scene, and they need alpha-tested cards or dense geometry. Rejected.
- **Decals or paths painted into the plinth's texture:** cheap, but flat under the arc's low pitch, and they can't give the snow any relief. Rejected.
- **Posts, bollards or lanterns:** clutter at the overview, and they compete with the windows for warmth. Rejected in favour of set-in lights.

## Consequences

- **The House record grows site works** (#91): an optional field for the terrace, walls and their gaps, steps, path runs, apron, set-in lights and snow shrubs, validated against the House and part of the bake hash. `docs/design/house-schema.md` leaves steps and landscape walls out of the vocabulary on purpose, so #91 relaxes that rule for site works.
- **The GLB grows an optional `site` node** with the shell's materials, which `scenePart` counts as its own "site works" line.
- **The snow the pieces meet is the open cost.** In the pilot it was the plinth, refined over the site so it joins the pieces with no seam against the plinth's bake, edge fade or live shadow mask. That refinement costs 0.4–0.8 ms under "plinths" on top of the pieces' own draws. #91 finds a cheaper way that keeps those seams closed.
- **The lightmap is #91's choice:** share the shell's atlas, as the pilot did, which dropped Lyngen's seen shell from about 25 to 21 texels/m, or give the `site` node its own at about 0.45 MB per House.
- **Every House is baked again** when the builder version moves for the kit.
- **The Project images change** (#76): Lyngen's hero, site and light images show its site works, and the other Houses' do once they have theirs.

## Evidence

The pilot, #86 on Lyngen, with its code on the branch `prototype-lyngen-site-works` (#89, closed unmerged). The pieces were hard-coded for Lyngen in the builder:

- a stone lounge terrace in front of `living-front`, bare under the canopy, with thin snow beyond its drip line;
- a board-formed concrete wall 0.45 m above the terrace, running on in front of `lower`, with snow caps, a drift against its outer face and the snow falling 0.3 m beyond it;
- three stone risers down through the wall between sloping cheeks, and a stone path along the wall's foot to a concrete apron at the `garage` door, cut into the snow with a lip and berms;
- four small warm lights (the `DOWNLIGHT` colour, 6 W spots, baked), two in the cheeks and two in the wall's face;
- three framing pines, west and front-left.

The before and after arc contact sheets (overview, hero, arc0–arc6, final bakes of both) are on #86.

- **Frame cost.** Measured on the dev machine (Radeon Vega 10, ANGLE D3D11) with the probe check, 3 loads of `main` and 3 of the branch per rung in the order A B B A A B, one server, no bake running. Medians of the loads:

  | Camera | Rung | Site works | Plinths (`main` → branch) | Whole-frame p50 (`main` → branch) |
  |---|---|---|---|---|
  | Overview | 4 | 0.09 ms | 3.87 → 4.24 ms | 23.79 → 25.24 ms (+1.45) |
  | Lyngen | 4 | 0.54 ms | 6.42 → 7.24 ms | 21.90 → 24.67 ms (+2.77) |
  | Overview | 6 | 0.08 ms | 2.79 → 3.23 ms | 10.89 → 15.97 ms (+5.1) |
  | Lyngen | 6 | 0.37 ms | 4.37 → 4.94 ms | 14.22 → 14.74 ms (+0.52) |

  The pieces' own draws passed the 0.5 ms gate except at the selected camera at rung 4, which missed narrowly. With the refined plinth added, no selected-camera measurement passed. At the rung-6 overview, all three branch loads sat in the Vega's slow state and only one of `main`'s did (the bimodal overview of #62), so most of that frame delta is GPU state. A first, heavier version cost 0.61 ms and +1.2 ms under plinths at rung 4. One slab per path run, no bevels narrower than a pixel and a coarser snow grid in depth brought it down with no visible change.
- **Download.** Lyngen's files grew by 0.11 MB (3,320,537 → 3,428,688 bytes: the GLB from 212 to 253 KB, lightmaps the same size). The Houses came to 13.82 MB, of 16 MB.
- **Overview.** The site works show only as a thin light line at Lyngen's base. The three framing pines add dark silhouettes beside it, so the overview reads a little busier there.
- **Verdict.** Go: the look holds up across the arc, and the gates that failed point at the refined plinth, which #91 replaces. The other Houses get site works in the same language, with a few snow shrubs added.
