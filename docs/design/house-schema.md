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
| **opening** | `volume` + `face` (`front`/`back`/`left`/`right`), `at` + `width`, `level` | `at` is the offset from the face's left edge, seen from outside. Sill and head default to full height (the Level floor to the underside of what is above) with optional overrides. `depth` sets the recess. May span Levels; the builder adds a transom at each Level line it crosses. Fill: `glazing`, `door` (timber), `terrace` (recess with glazed back wall, snow floor, glass balustrade, timber ceiling) or `void` (a covered cut-through). Optional `mullions` count. A Glazing Face may hang a **Curtain** (`curtain: true`), a sheer closed across all of its glass. |
| **balustrade** | slab + edge(s) | Glass with a metal rail, for balconies outside a terrace recess. |
| **Interior** | on a volume | The furnished room inside that volume (`docs/adr/0005-hero-interior-is-real-baked-geometry.md`), seen through every Glazing Face into it: a `kind` (`lounge`, `dining`, `kitchen`, `library`, `bedroom`) plus the options its template honours: `fireplace` (lounge, library), `lamp` (`floor` or `pendant`, every kind), `shelving` (lounge, dining, kitchen), `kitchen` (dining: the kitchen template's run of units along the back wall behind the table, in place of the sideboard; with `shelving`, open shelves over it instead of cupboards), `partition` (bedroom, lounge: a wall with a closed door across the room, this many metres in from its window; the room is furnished in front of it and the room behind it is left empty. A bedroom's door is hinged, a lounge's a wide pivot door), `door` (lounge: a closed door in a side wall, into the room beside it), `tv` (lounge: a dark wall TV on the side wall it names, `left` or `right` as seen from outside, over a media unit, with the seating turned to it, the sofa side-on to the glass; it takes the fire's place. Bedroom: `true`, a dark wall TV over a low walnut unit on the side wall across from the bed, facing it) and `bedside` (bedroom: the side wall the bed's head is against, `left` or `right` as seen from outside, as far back as the back wall or partition allow, so the glass sees the bed side-on; without it the bed faces the window, its head to the back wall). A room shell, not a plan. A House may have several. |

| **Site Works** | `siteWorks`, optional, in plan around the House | The built pieces around it (`docs/adr/0006-houses-stand-in-built-site-works.md`): a `terrace` (a plan rectangle of stone paving level with the floor of a Level, and the part of it the `snow` lies on), `walls` (board-formed concrete, each a plan rectangle and a `top`, with `gaps` along it for steps; with `lower`, a wall along x holds the snow behind it, and the snow in front of it lies at that level), `steps` (a plan rectangle descending toward a face `down`, from `top` to `foot` in equal `risers`, between two sloping cheeks, with a set-in light in each cheek when `lights`), `paths` (a `width` along a centre `line` of straight axis-aligned runs, its level rising evenly `from` its first point `to` its last), `aprons` (concrete at a door `opening`, reaching `depth` out from the face), `lights` (set-in lights in a wall's long `face`, `at` along its length) and Snow Shrubs, `shrubs` (a plan point `at` and a `size` across, 0.5 to 1.1 m). |

Every opening has a required `name`, unique within the House and stable (e.g. `living-front`). A glazing opening is a **Glazing Face**: the image briefs, the drawings and the GLB all key on its name.

Also on the House: `section`, one authored cut (axis and offset) for the section drawing.

Out of the vocabulary on purpose: flues, timber wall cladding, interior walls and rooms. The exceptions are an Interior's room shell, and a partition inside it, and the Site Works' walls and steps around the House, none of which the drawings show.

Field-level choices (the zod schema in `lib/house/schema.ts` is the reference):

- Exactly one Level sits at elevation 0: the entrance Level.
- A volume or the stone mass runs from the floor of `from` to the top of `to` (elevation plus height), unless `top` overrides it. A double-height room is one volume on one Level with a raised `top`, so it counts once in the gross floor area.
- A slab's underside sits at the top of its `level`, and it rises by `thickness`.
- An opening's `sill` and `head` are measured up from the floor of its `level`. It spans up to `to` when given.
- `section` is `{ axis, at }`: the cut plane `axis = at`.
- Only `glazing` openings are Glazing Faces. A Project's interior image names one.
- Only a Glazing Face hangs a Curtain, and only where no furnished room is seen: into a volume without an Interior, or into an Interior's volume only when all its glass lies behind a partition (Senja's `bar-side`), measured in from its window.
- A House may have several Interiors. Each one's volume spans one Level, some Glazing Face looks into it, and no `void` or `terrace` cuts through it. Each has a window, the Glazing Face its template turns to and its options are measured in from: for the Hero Interior, the one the interior image looks out through; for another, its largest Glazing Face (the first of equals). A partition leaves at least 3.5 m in front of it for the furniture and 1 m behind it. A lounge's `door` needs another volume on the same floor, at least 2.4 m high, standing against one of the room's walls for at least 2.1 m in front of any partition. A lounge with a partition can't have a fireplace when the stone mass stands behind its back wall, which the partition hides, and a lounge has a fireplace or a `tv`, not both. A bedroom's `tv` needs a `bedside`. A bed against a side wall takes the 3.3 m of that wall in front of the back wall or partition, and its TV the same span of the other side wall: no glass or door may be there, and the room must be at least 3.5 m across. When a House has Interiors, its interior image looks out through a Glazing Face into one of them, and that one is the Hero Interior, so the image shows it.

- Site Works stand in plan, orthogonal like the House. Nothing stands inside a volume or the stone mass (a volume whose floor is below a piece's top). Steps, paths and aprons cross a wall only through one of its gaps, so a flight through a wall needs a gap there. Every path reaches a door: one end of its line lies on an apron or at a door. A path's line runs along x or y and turns square, and every run is longer than the path is wide. A set-in light sits in one of a wall's long faces, not in a gap. A wall with `lower` runs along x. A Snow Shrub stands clear of the volumes and every piece, no nearer than 3 m in front of a Glazing Face, and not across a wall's base line: in front of a wall's long face, only within 0.9 m of one of its ends or a gap's edge.

## Derived by the builder, never authored

- Fascia geometry around slabs and frame tops.
- Roof, terrace and stone-top snow.
- Soffit downlights on a fixed pitch along each soffit's outer edge.
- Soffits clipped to the overhang only; buried faces culled before unwrapping.
- The snow plinth: the footprint plus a margin, flat at the lowest exposed floor. Its edges fade into the sloped live terrain. When solids start below the entrance Level (Senja), the House is set into the slope: the plinth stands at ±0.00 behind their back faces (uphill, +y) and at their floor in front, so the step falls on the walls that hold it. Past each end of their run, the snow falls from grade to the lower floor across a fan (`GRADE_FAN`). A gap in the run has nothing holding the step, which is a builder warning.
- Each Glazing Face's compass **bearing**: House-frame normal → rotated by the Scene layout → one of 8 points. `content/scene.ts` declares north (the fjord lies north, so fronts face roughly north over the water).
- Seen/unseen faces from the overview and arc cameras (see `DESIGN.md` § Scene). An opening that is entirely unseen is a builder warning, not an error.
- The room behind each Glazing Face (`interiorRoom` in `lib/house/derive.ts`, exported in the builder JSON): as wide as the glass and as deep as the volume behind the recess. It stands on the floor of the opening's Level and rises to that Level's top, except in a volume of one Level, whose room rises to the volume's top, so a double-height room is one room. The glazing shader draws every window's procedural room from these numbers.
- Each Interior's room shell (`interiorShell`): its volume's plan inside walls `INTERIOR_WALL` (0.3 m) thick, from its floor to its top. The builder hollows the volume to it and cuts the Glazing Faces into the volume through to it. Its template turns to its window (`interiors` in `lib/house/derive.ts`, which lists the Hero Interior first), and a fireplace goes on the wall the stone mass stands behind, when the stone touches the volume. The builder JSON carries the Hero Interior's as `interior` and any others' as `otherInteriors`, a key left out when there are none, so a House with one Interior keeps the bake hash it had before a House could have several.
- The Site Works as plan pieces (`sitePlan` in `lib/house/site.ts`, in the builder JSON as `derived.site`): each wall's boxes between its gaps, each flight's treads and its two cheeks (0.25 m wide, from the wall it passes through to its foot, falling from the wall's top to 0.25 m over its last tread), each path's slabs, one to each straight run and each corner square, with the path's level at their corners, and each apron from out in front of its door up to the door in its recess. The builder gives them their height and thickness, snow caps, the terrace's snow, the set-in lights and each Snow Shrub's shape, seeded by the House and its place in the record, from `builder/siteworks.py`.
- The snow the Site Works shape, which the plinth takes: a drift against the low face of a wall that holds the snow, falling to the lower snow in front of it, a bank past its ends, a little snow banked against every other wall face, and along each path and apron an edge just above the stone with a shovelled berm beside it. The plinth leaves holes under the terrace, the steps, the paths and the aprons, and is refined only along them.
- An Interior's furnishing: the kind's template (`TEMPLATES` in `scripts/houses/builder/interior.py`), built from one shared low-poly furniture kit and sized from the room, with no per-House code.

Detail values are **builder-wide constants in one config file**, never per House: mullion pitch (1.65 m), frame and fascia thickness, bevel widths, snow cushion depth, downlight pitch, plinth margin and the unseen texel ratio.

## Placement

`content/scene.ts` holds each House's position, rotation and ground height, plus north and the overview camera, so the overview composition is edited in one place. It also holds each House's framing pines (`framing`: plan x, y in its House frame and a height), placed by hand where its arc needs them. Each stands on the plinth where it bends onto the slope, and none covers any House from an arc camera or the overview (`tests/unit/lib/scene/pines.test.ts`). The Scene draws them live, so the builder JSON leaves them out. The Project's camera block is relative to its House's frame, so moving a House carries its hero angle along. Elevation (`+40 m`) is Project copy, not House data.

## Validation

zod checks shape. `validateHouse` (TS) checks that references exist, openings fit their faces and don't overlap, every slab touches a volume or stone mass, opening names are unique, and the gross floor area (from volumes and Levels) is within ±15% of the Project's authored m². The Bun export refuses invalid data and names the offending parts. The JSON carries `schemaVersion`. The per-House bake cache hashes the House JSON, its placement, camera block and the overview camera (all change the bake: sky direction, seen faces) and the builder version. The JSON leaves out the Curtains: the Scene draws them, so they don't change a bake, and `bun run houses:bake` stamps them into each GLB's extras without starting Blender (`stampCurtains`).

## GLB contract

One GLB per House:

- Root node `house:<slug>`, origin at the datum.
- `shell`: every opaque baked surface (concrete, stone, timber, metal, snow), with the base + spill lightmap UV (`TEXCOORD_1`) and a first UV set (`TEXCOORD_0`) in metres by dominant axis, boards horizontal on walls, which the shared detail maps (`lib/scene/detail.ts`) tile on.
- `glazing:<name>`: one node per Glazing Face, so interior mapping gets each window's frame and hover or image capture can target one. Each is one outward quad with a 0..1 UV (u from the left edge seen from outside, v up).
- `balustrade`, `downlights`, `plinth`.
- `site`, for a House with Site Works: every built piece and Snow Shrub, in the shell's materials and on its lightmap (the same `TEXCOORD_0` and `TEXCOORD_1`), split out of the shell after the bake so the Scene draws and measures it apart. It's optional in the contract. Its set-in lights ride in `downlights`. A terrace's glazed back wall isn't a Glazing Face, so its glass rides in `balustrade` with material `glazing`.
- One node per Interior: its walls, floor, ceiling and furniture as one mesh with material `interior` and one UV set (`TEXCOORD_0`), on which a KTX2 texture beside the GLB holds its baked light with its colours (UASTC HDR, as the lightmaps are). It is drawn unlit. The Hero Interior's node is `interior`, with `interior.ktx2`; another's is `interior:<volume>`, with `interior-<volume>.ktx2` (`interiorTexture`).
- Materials named from a fixed enum: `concrete, stone, timber, metal, snow, glazing, balustrade, downlight, plinth, interior`. R3F swaps materials by name.
- Root `extras`: `schemaVersion`, datum, bbox, the bake hash, and per Glazing Face its size, normal, bearing and seen flag. R3F reads these rather than recomputing them. In detail (`HouseExtras` in `lib/house/glb-contract.ts`): `datum` is the entrance Level's name and the plinth's elevation (its lower floor, when it steps; grade is always ±0.00); `bbox` is min/max in glTF axes, without the plinth; each Glazing Face's `size` is width × height in metres, its `normal` is in glTF axes and `seen` is whether the overview or arc cameras see any of it; its `room` is the procedural room it looks into, `size` (width, height, depth) and `sill` (the glass's height above the room's floor), and `interior` is whether it looks into an Interior instead, drawn as glass over the room; `curtain` is whether it hangs a Curtain, stamped from the record after the bake; `interior`, for a House with Interiors, names the Hero Interior's volume, its kind and its `texture`, and `otherInteriors`, for a House with more than one, lists the others the same way; `lightmaps` names the KTX2 files beside the GLB, per node (`shell`, `plinth`) and layer (`base`, `spill`); `mode` is `draft` or `final`.
- Picking raycasts `shell` and `glazing:*`; `plinth` and `site` are never picked.

`bun test` checks every committed GLB against its House record (`tests/unit/lib/house/glb-contract.test.ts`), its Interiors included: each in the volume and of the kind the record gives, with its texture, and every Glazing Face into their volumes marked, and every Curtain stamped as the record gives it.

## Drawings

The Project page's plan and section are **massing drawings**: volume outlines as poché, glazing as thin lines, the stone mass hatched, slab overhangs dashed, no rooms. The plan is cut at the entrance Level; the section follows the House's `section` field and marks ±0.00 and each Level.

`lib/drawings` writes them as SVG strings, server-rendered, no client JS. The conventions:

- The plan cuts 1.2 m above ±0.00 (`PLAN_CUT`), with the front facing down the sheet. Whatever the plane crosses is cut: volumes as poché, the stone mass hatched. Anything wholly above is dashed (slabs, upper volumes), and anything wholly below is outlined. A chain line marks the section's cut, A–A.
- The section always looks along +x or +y: cut across x, it looks toward +x with the front on the right; cut across y, it looks toward the back, like the front elevation. Cut parts are poché. Parts beyond the plane are outlined, including the rest of each cut volume, which shows through a `void`. Parts behind the viewer are left out.
- An opening the drawing cuts leaves its recess (`depth`) open in the poché, and a thin line marks where its fill sits (`glazing`, `door` or `terrace`; a `void` has none). The recess placement comes from `openingRecess` in `lib/house/derive.ts`, which mirrors the builder's `FaceFrame`.
- The poché is a concrete tone of ink rather than solid ink, so the glazing lines on its edges still read. Strokes are 1px hairlines at any size. Both drawings print at one scale (28 px/m), shrinking to fit.

## The four Houses

The same parts in four compositions. Dimensions are written when each record is authored; the validator keeps them within the m² range.

- **Lyngen House** (L0–L1, ~300 m²): the reference, translated. A low west wing with a timber garage door, the stone chimney, a main volume glazed two floors up, the lounge below a curtained loft, under a large cantilevered roof slab, and an upper east frame with a recessed terrace.
- **Senja House** (L-1–L0, ~220 m²): set into the slope. A lower volume glazed toward the fjord across the half of its front by the stone wall, and an upper long bar cantilevering about 4 m past it with a glazed end face. A long stone wall runs perpendicular to the bar.
- **Kvaløya House** (L0, ~160 m²): low and wide. Three volumes pinwheel around a stone hearth under one continuous roof slab with deep overhangs; a `void` opening makes a covered cut-through to the view.
- **Reine House** (L0–L2, ~240 m²): a compact stack. Volumes shift their offsets Level by Level, balcony slabs with glass balustrades sit on the overhangs, and a full-height stone wall runs up one side.
