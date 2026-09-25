# House schema

How a Project describes its **House** as data, and what the builder hands back to the Scene. Decided in "Design the House schema" (issue #10). Terms in **bold** are defined in `CONTEXT.md`.

The House lives in the Project's record (`content/projects/<slug>.ts`) and is validated by zod plus a geometric check in TS. A Bun script exports it as JSON to the headless-Blender builder (`docs/adr/0001-houses-baked-offline-in-headless-blender.md`), which trusts its input.

## Frame and units

- Metres. House frame: **x** to the right when facing the front, **y** going back, **z** up. The front faces −y.
- The origin is the **datum**: ±0.00 at the finished floor of the entrance Level, at the centre of the plan's bounding box.
- The GLB is y-up (glTF), with the front along +z and its origin at the datum. R3F never sees the authoring axes.
- Geometry is **orthogonal only**: axis-aligned boxes in the House frame. Only the whole House is rotated, by the Scene layout. A House that needs something new gets a new shared part, never per-House code.

## Levels

`levels` is declared once: each **Level** has a name (`L-1`, `L0`, `L1`…), a floor elevation relative to the datum and a floor-to-floor height. Parts reference Levels by name, so a floor height changes in one place. Levels also drive the drawings and the gross floor area.

## Authored parts

| Part | Placed by | Notes |
| --- | --- | --- |
| **volume** | plan rectangle, `from`/`to` Level | Board-formed concrete, the one wall finish. Optional top override for parapets and frames that rise past their Level. May cantilever over nothing. |
| **stone mass** | plan rectangle, `from`/`to` Level (or top override) | Chimney, hearth or wall. One per House. |
| **slab** | plan rectangle, Level | Roof, canopy or balcony: thickness, fascia depth, soffit yes/no. The overhang is what extends past the volumes below. |
| **opening** | `volume` + `face` (`front`/`back`/`left`/`right`), `at` + `width`, `level` | `at` is the offset from the face's left edge, seen from outside. Sill and head default to full height (the Level floor to the underside of what is above) with optional overrides. `depth` sets the recess. May span Levels; the builder adds a transom at each Level line it crosses. Fill: `glazing`, `door` (timber), `terrace` (recess with glazed back wall, snow floor, glass balustrade, timber ceiling) or `void` (a covered cut-through). Optional `mullions` count. |
| **balustrade** | slab + edge(s) | Glass with a metal rail, for balconies outside a terrace recess. |

Every opening has a required `name`, unique within the House and stable (e.g. `living-front`). A glazing opening is a **Glazing Face**: the image briefs, the drawings and the GLB all key on its name.

Also on the House: `section`, one authored cut (axis and offset) for the section drawing.

Out of the vocabulary on purpose: steps, landscape walls, flues, timber wall cladding, interior walls and rooms.

Field-level choices (the zod schema in `lib/house/schema.ts` is the reference):

- Exactly one Level sits at elevation 0: the entrance Level.
- A volume or the stone mass runs from the floor of `from` to the top of `to` (elevation plus height), unless `top` overrides it. A double-height room is one volume on one Level with a raised `top`, so it counts once in the gross floor area.
- A slab's underside sits at the top of its `level`, and it rises by `thickness`.
- An opening's `sill` and `head` are measured up from the floor of its `level`. It spans up to `to` when given.
- `section` is `{ axis, at }`: the cut plane `axis = at`.
- Only `glazing` openings are Glazing Faces. A Project's interior image names one.

## Derived by the builder, never authored

- Fascia geometry around slabs and frame tops.
- Roof, terrace and stone-top snow.
- Soffit downlights on a fixed pitch along each soffit's outer edge.
- Soffits clipped to the overhang only; buried faces culled before unwrapping.
- The snow plinth: the footprint plus a margin, flat at the lowest exposed floor. Its edges fade into the sloped live terrain. When solids start below the entrance Level (Senja), the House is set into the slope: the plinth stands at ±0.00 behind their back faces (uphill, +y) and at their floor in front, so the step falls on the walls that hold it. Past each end of their run, the snow falls from grade to the lower floor across a fan (`GRADE_FAN`). A gap in the run has nothing holding the step, which is a builder warning.
- Each Glazing Face's compass **bearing**: House-frame normal → rotated by the Scene layout → one of 8 points. `content/scene.ts` declares north (the fjord lies north, so fronts face roughly north over the water).
- Seen/unseen faces from the overview and arc cameras (see `DESIGN.md` § Scene). An opening that is entirely unseen is a builder warning, not an error.

Detail values are **builder-wide constants in one config file**, never per House: mullion pitch (1.65 m), frame and fascia thickness, bevel widths, snow cushion depth, downlight pitch, plinth margin and the unseen texel ratio.

## Placement

`content/scene.ts` holds each House's position, rotation and ground height, plus north and the overview camera, so the overview composition is edited in one place. The Project's camera block is relative to its House's frame, so moving a House carries its hero angle along. Elevation (`+40 m`) is Project copy, not House data.

## Validation

zod checks shape. `validateHouse` (TS) checks that references exist, openings fit their faces and don't overlap, every slab touches a volume or stone mass, opening names are unique, and the gross floor area (from volumes and Levels) is within ±15% of the Project's authored m². The Bun export refuses invalid data and names the offending parts. The JSON carries `schemaVersion`. The per-House bake cache hashes the House JSON, its placement, camera block and the overview camera (all change the bake: sky direction, seen faces) and the builder version.

## GLB contract

One GLB per House:

- Root node `house:<slug>`, origin at the datum.
- `shell`: every opaque baked surface (concrete, stone, timber, metal, snow), with the base + spill lightmap UV (`TEXCOORD_1`) and a first UV set (`TEXCOORD_0`) in metres by dominant axis, boards horizontal on walls, which the shared detail maps (`lib/scene/detail.ts`) tile on.
- `glazing:<name>`: one node per Glazing Face, so interior mapping gets each window's frame and hover or image capture can target one. Each is one outward quad with a 0..1 UV (u from the left edge seen from outside, v up).
- `balustrade`, `downlights`, `plinth`. A terrace's glazed back wall isn't a Glazing Face, so its glass rides in `balustrade` with material `glazing`.
- Materials named from a fixed enum: `concrete, stone, timber, metal, snow, glazing, balustrade, downlight, plinth`. R3F swaps materials by name.
- Root `extras`: `schemaVersion`, datum, bbox, the bake hash, and per Glazing Face its size, normal, bearing and seen flag. R3F reads these rather than recomputing them. In detail (`HouseExtras` in `lib/house/glb-contract.ts`): `datum` is the entrance Level's name and the plinth's elevation (its lower floor, when it steps; grade is always ±0.00); `bbox` is min/max in glTF axes, without the plinth; each Glazing Face's `size` is width × height in metres, its `normal` is in glTF axes and `seen` is whether the overview or arc cameras see any of it; `lightmaps` names the KTX2 files beside the GLB, per node (`shell`, `plinth`) and layer (`base`, `spill`); `mode` is `draft` or `final`.
- Picking raycasts `shell` and `glazing:*`; `plinth` is never picked.

`bun test` checks every committed GLB against its House record (`tests/unit/lib/house/glb-contract.test.ts`).

## Drawings

The Project page's plan and section are **massing drawings**: volume outlines as poché, glazing as thin lines, the stone mass hatched, slab overhangs dashed, no rooms. The plan is cut at the entrance Level; the section follows the House's `section` field and marks ±0.00 and each Level.

`lib/drawings` writes them as SVG strings, server-rendered, no client JS. The conventions:

- The plan cuts 1.2 m above ±0.00 (`PLAN_CUT`), with the front facing down the sheet. Whatever the plane crosses is cut: volumes as poché, the stone mass hatched. Anything wholly above is dashed (slabs, upper volumes), and anything wholly below is outlined. A chain line marks the section's cut, A–A.
- The section always looks along +x or +y: cut across x, it looks toward +x with the front on the right; cut across y, it looks toward the back, like the front elevation. Cut parts are poché. Parts beyond the plane are outlined, including the rest of each cut volume, which shows through a `void`. Parts behind the viewer are left out.
- An opening the drawing cuts leaves its recess (`depth`) open in the poché, and a thin line marks where its fill sits (`glazing`, `door` or `terrace`; a `void` has none). The recess placement comes from `openingRecess` in `lib/house/derive.ts`, which mirrors the builder's `FaceFrame`.
- The poché is a concrete tone of ink rather than solid ink, so the glazing lines on its edges still read. Strokes are 1px hairlines at any size. Both drawings print at one scale (28 px/m), shrinking to fit.

## The four Houses

The same parts in four compositions. Dimensions are written when each record is authored; the validator keeps them within the m² range.

- **Lyngen House** (L0–L1, ~300 m²): the reference, translated. A low west wing with a timber garage door, the stone chimney, a double-height glazed main volume under a large cantilevered roof slab, and an upper east frame with a recessed terrace.
- **Senja House** (L-1–L0, ~220 m²): set into the slope. A lower volume fully glazed toward the fjord, and an upper long bar cantilevering about 4 m past it with a glazed end face. A long stone wall runs perpendicular to the bar.
- **Kvaløya House** (L0, ~160 m²): low and wide. Three volumes pinwheel around a stone hearth under one continuous roof slab with deep overhangs; a `void` opening makes a covered cut-through to the view.
- **Reine House** (L0–L2, ~240 m²): a compact stack. Volumes shift their offsets Level by Level, balcony slabs with glass balustrades sit on the overhangs, and a full-height stone wall runs up one side.
