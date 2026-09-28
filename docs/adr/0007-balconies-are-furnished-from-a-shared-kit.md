# Balconies are furnished from a shared kit

Status: accepted (2026-09-28), with Reine House's balconies ([#100](https://github.com/danielluis07/atrium/issues/100)).

ADR 0004 left exterior props (terrace furniture, lanterns, woodpiles) for later, and ADR 0006 built the ground around each House but nothing on its balconies. Reine's two balconies were bare slabs under snow: the lower one under the top floor's overhang, reached by no door, and the upper one beside the bedroom, open to the sky. This ADR records that they now get **Balcony Furniture** (`CONTEXT.md`), a door and a pergola, and how that differs from Site Works.

## Decision

- **Balcony Furniture, from one kit.** A House's record sets out pieces on a balcony slab (`balconyFurniture`: the slab and its pieces). Each piece is a kind, a plan point and a facing: a lounge chair (with a sheepskin), a low table (with a lantern), a dwarf pine in a pot, an open hot tub, a fire bowl, a bench and a telescope. Each kind has one size and one function in the builder's kit (`builder/balcony.py`), seeded by the House and the piece's place in the record. There is no per-House code. The pieces are built in the House's own materials (timber, dark metal, concrete, stone, and the snow material for the sheepskins), so they add no textures.
- **On a slab, not on the plinth.** That is the whole difference from Site Works, and it keeps the two apart. In the schema, `balconyFurniture` is its own field beside `siteWorks`. In the builder it has its own kit and its own builder JSON (`derived.balcony`). It shapes no snow: a slab that is furnished or under a pergola gets no roof snow, and neither do the pieces. Site Works stand on the plinth, shape its snow and bend with it onto the slope in the Scene (the `site` node). The pieces join the shell, and don't bend.
- **Baked, like everything else.** The pieces join the shell and bake on its lightmap, their seen faces at half its texel density. Only three pieces give light, and all three are baked: the lantern, the fire bowl and the glow in the tub's water. No steam, flame or water moves. The lantern's glass and the fire join the `downlights` node, which the Scene draws glowing. There is no new GLB node and no new material.
- **The pergola is architecture.** Slatted timber over a whole balcony on slender dark metal posts (`pergolas`: a slab and the slats' top). Its beams bear on a solid wherever one stands along the slab's edge, and posts stand everywhere else. It belongs to the House: the drawings show it like a slab. It gets no downlights.
- **A door above the entrance Level opens onto a balcony.** The slab's top must be level with the door's sill and reach 0.9 m out in front of it, and no piece may stand in that way. The Interior the door opens from shows it as a closed door in its wall.
- **Designed for the arc.** As with the House and its Site Works, only what the overview or the House's arc sees is built.

## Why

- A furnished balcony tells you a House is lived in, and does it on the House rather than on the ground, which the Site Works already fill. Reine's arc sees both balconies, and they were its emptiest surfaces after the snow.
- A shared kit, sized in one place and mirrored in TS (`PIECE_SIZE`), lets validation check a layout without the builder: every piece on its slab, clear of the edges, the House, the other pieces, the pergola's posts and a door's way.
- Joining the shell adds triangles but no draw calls. The pieces use materials the shell already draws, so a balcony costs only its pixels.
- Half the texel density is enough for pieces a metre or so across, seen from 30 m. Unwrapped at full density, the pieces and the pergola's thin slats, one island each with its margin, took about 20% of the shell's texel density. At half density, with each slat, beam and post unwrapped as one strip, they take about 6%.

## Considered options

- **Folding Balcony Furniture into Site Works:** one field and one kit, but the Site Works' snow, holes in the plinth and bending onto the slope all assume the plinth. Rejected: a balcony is none of that.
- **Its own GLB node, drawn apart like `site`:** the probe could count it apart, but at the cost of a draw per material. Rejected: joined to the shell, the pieces cost no draws, and the whole-frame gate is what they must pass.
- **A new material for the sheepskins, the pines or the water:** truer colours, but a change to the GLB contract and the Scene for a few square metres. Rejected: the sheepskins take the snow material, the pines' needles and the tub's water the dark metal, which reflects the sky like water.
- **Steam over the tub, or a live flame:** alive, but not baked, and the Scene has nothing else that moves on a House. Rejected.

## Consequences

- **The House record grows** optional `pergolas` and `balconyFurniture` fields, validated against the House (`checkBalconies` in `lib/house/balcony.ts`). A House without them exports the same builder JSON as before, so its bake hash doesn't change, and the schema version stays at 4.
- **The builder grows** `balcony.py`. A House without balconies builds exactly as before: its slabs keep their snow, and an Interior with no door in its walls is furnished as before. So only Reine is baked again, and the builder version stays.
- **Reine's shell loses about 6% of its texel density** to its balconies: in the final bake, 24.9 → 23.4 texels/m over the rest of the shell, with the pieces and the pergola at half that.

## Evidence

Reine's final bake with its balconies, against `main` (#100). The arc sheets are in `docs/evidence/100-reine-balconies/`: Reine's overview, hero and arc0–6, and Lyngen's arc, where Reine stands in the background.

- **Frame cost.** Measured with the probe check in `scripts/perf`, Reine selected, one server, no bake running, 6 loads of each build per rung in two runs of opposite order (A B B A A B, then B A A B B A). Medians:

  | Camera | Rung | House shells (`main` → branch) | Whole-frame p50 (`main` → branch) |
  |---|---|---|---|
  | Overview | 4 | 0.81 → 0.83 ms | 19.56 → 19.66 ms (+0.10) |
  | Reine | 4 | 1.80 → 2.04 ms | 17.37 → 17.97 ms (+0.60) |
  | Overview | 6 | 0.53 → 0.59 ms | 8.54 → 8.77 ms (+0.23) |
  | Reine | 6 | 0.87 → 1.07 ms | 7.55 → 7.78 ms (+0.23) |

  The pieces and the pergola are drawn with the shell, so their cost is the shells' rise at the selected camera: about 0.2 ms at both rungs. At rung 4 at Reine, the whole frame rose more than the per-draw sum did (19.25 → 19.16 ms). Leaving out each build's cold first load, it rose +0.41 ms. That is at the edge of the 0.5 ms gate, and the tightest number here. At rung 6, three branch loads hit the Vega's slow state, which lifts the untouched parts (terrain snow, plinths) as much as the shells.
- **Download.** Reine's files grew by 0.10 MB over the wire (the GLB from 239 to 274 KB, the shell lightmaps by 84 KB; the Interiors' textures are within 11 KB). The Houses come to 14.28 MB of the 16 MB budget.
- **Overview.** The pergola shows as a thin dark outline over Reine's east balcony, and the rest is too small to read, so the overview doesn't read busier. In Lyngen's arc4–6, Reine's balconies show at the top edge of the frame and cover nothing.
