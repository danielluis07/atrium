# Atrium: Design Direction

Terms in **bold** are defined in `CONTEXT.md`.

## Concept: warm light, cold ground

Modernist concrete Houses standing in Arctic snow at blue hour, with warm amber light from full-height windows. The whole site plays off that contrast: a cold, quiet, precise surface with a small amount of warmth. It should feel like an architectural drawing set, with thin lines, exact data and plenty of empty space, and never like a real-estate listing.

## Architecture reference

`docs/design/reference-house.png` sets the vocabulary for every **House**:

- Stacked, board-formed **concrete volumes** with flat roofs.
- **Cantilevered roof slabs** with warm timber soffits, and small recessed downlights on the underside.
- **Full-height glazing** in thin dark frames, with warm interiors glowing through.
- **Dark metal fascias** edging the roofs and balconies.
- **Glass balustrades** on upper terraces.
- One **stone mass** (a chimney or wall) that anchors the composition.

The reference is summer. In the **Scene** the same buildings stand in snow: snow on the roofs and terraces, and landscaping replaced by snowdrifts and sparse pines.

Houses are **assembled from shared parts** (volume, stone mass, slab, opening, balustrade; fascias, snow and downlights are derived) and baked offline in headless Blender, then rendered in react-three-fiber (see `docs/adr/0001-houses-baked-offline-in-headless-blender.md`). Each Project describes its House as data: Levels, orthogonal volumes, slabs and named openings. The schema, the GLB contract and the four compositions are in `docs/design/house-schema.md`. The ground is plain snow, so detail goes into the Houses. All four Houses share one language and differ in composition, not style.

## Scene

- **Setting:** four Houses spread across a snowy slope above a fjord. Sparse pines, mountains fading into fog, light snowfall.
- **Light:** blue hour. A deep-blue sky that fades toward the horizon. Snow in cool blue shadow. The only warm light in the Scene comes from the windows and soffit downlights.
- **Camera:** no free-fly, and the camera never goes below the terrain or behind the mountains. At overview there is no drag: a slow idle drift plus a slight parallax toward the cursor. The wheel always scrolls the page, and there is no zoom anywhere.
  - **At a selected House:** dragging orbits along an arc of about ±50° around the House's authored hero angle (a House may narrow it), with pitch held between 8° and 30° and a fixed distance. On release the camera stays where it was left (damped) and the idle drift sways around that angle. Selecting the House again starts from the hero angle. With the Scene focused, ←/→ step the orbit by about 10°.
  - Each Project's record carries a camera block (azimuth, pitch, distance, look-at offset, arc). The Project Panel opens on the right, so the look-at is offset to keep the House in the left ~55–60% of the viewport across the whole arc.
  - Movement under ~5 px is a click, anything more an orbit, and a drag never closes the Panel. Over the Scene, the cursor shows `grab`/`grabbing` while a House is selected. A dragging pointer doesn't hover or select other Houses.
  - **Keyboard and screen readers:** Tab reaches the Scene, which assistive tech reads as a listbox of the four Projects in Project order. ↑/↓ (and Home/End) move between the Houses; the one the keyboard is on lights and shows its label as if hovered. Enter or Space selects it. Focus moves into the Project Panel when it opens and back to the Scene, on the same House, when it closes. A polite status announces the open Project.
  - **Detail budget:** only the overview and each House's arc can see a House, so the builder samples those cameras and marks faces as seen or unseen. Unseen faces (the back, and the sides beyond the arc) keep their bevels and bake at about ¼ of the lightmap texel density, with no interior mapping, and their glazing needs no design.
  - **Hero Interior:** a House's main room, the one its interior image looks out of (so far only Lyngen's), is real baked geometry: a room shell furnished from one shared low-poly kit, lit by its lamps and downlights in the bake, and seen through clear glass that only reflects the sky, so it holds up from every angle of the arc. Every other window looks into a procedural warm room sized from the record, one room however many Levels its glass spans (`docs/adr/0005-hero-interior-is-real-baked-geometry.md`).
- **Hover:** the House's windows brighten and a small mono label with the Project name appears in the Scene. The cursor changes to a pointer.
- **Select:** the camera flies to the House's hero angle (about 1.5s, ease-in-out), the other Houses dim, and the **Project Panel** slides in from the right. Clicking another House flies straight to it. Esc or a click on empty snow closes the panel and flies the camera back.
- **Section Cut:** scrolling past the hero drops the camera toward the ground, and the snow surface becomes a crisp ink **section line** across the viewport, with the dark Scene above and snow paper below. Right under the line runs a narrow band of section hatch (snow strata). The line scrolls up and away, and the page continues below grade. It is a cut, not a fade, so no fog has to match the paper color. If a House is selected, scrolling closes the Project Panel and its fly-back folds into the drop (one camera move, not two). The line is the paper page's top edge in the DOM, and the camera drop is keyed to it. See `docs/adr/0002-section-cut-replaces-whiteout.md` and `docs/adr/0003-section-cut-is-the-papers-dom-edge.md`.
- **Degradation:**
  - Touch-primary devices (`(pointer: coarse)` without `(hover: hover)`) get a lighter live Scene, the mobile Scene: fewer snow particles, no real-time shadows, reduced camera motion. Touch has no orbit: a selected House holds its hero angle, and swipes always scroll. The choice follows input, not GPU power, so a mouse on a weak laptop still gets orbit.
  - `prefers-reduced-motion`, no WebGL, a software renderer (SwiftShader, llvmpipe, or `failIfMajorPerformanceCaveat` failing) or a `detect-gpu` tier 0 gets a pre-rendered still of the Scene, cropped so its snow line sits on the same section line and hatch band (a static cut, no camera move). Mobile gets the real camera drop, only shorter.
  - The **Project Index** is always there, so no Project depends on 3D to be reached.
- **Render tiers:** the desktop Scene runs on a ladder of rungs, cheapest visual loss first:
  1. *Target* at DPR 2 (MSAA 4x + SMAA + N8AO + bloom)
  2. *Target* at DPR 1.5
  3. *Target* with N8AO at half resolution
  4. *Lean* (MSAA 4x + bloom, DPR 1)
  5. *Lean* at DPR 0.75
  6. *Lean* without bloom (the floor)

  The mobile Scene has its own short ladder: DPR 1.5 → 1 → 0.75.
  - **Start rung:** pmndrs `detect-gpu`, with its benchmark JSON self-hosted under `public/` so there is no third-party request. A desktop at tier 3, or tier 2 with a discrete vendor (NVIDIA, AMD "RX", Radeon Pro), starts at rung 1. Everything else starts at rung 4: laptop iGPUs, "Apple GPU", unknown renderers. The Canvas waits for the tier before mounting, so the pipeline compiles once. The classifier runs alongside the GLB and KTX2 downloads, and on a 1.5 s timeout or an error the Scene falls back to Lean.
  - **Stepping down:** frame time is judged against a fixed 16.7 ms budget, whatever the display's refresh rate. When the p90 frame time over a rolling 3 s window is above 18 ms, the Scene steps down one rung, then waits 3 s before judging again. It never steps up, so the image never flickers between looks. The monitor ignores shader compile after load, the first frame after the tab becomes visible, and the first 500 ms of a fly-to. It pauses while the Scene is off screen or the tab is hidden. At the floor it stops. The Scene never switches to the mobile Scene or the still mid-session.
  - **Memory:** the lowest rung reached is kept in `sessionStorage` (read in try/catch), so returning from a Project page doesn't stutter down the ladder again. Nothing persists across visits.
  - **Override:** `?scene=target|lean|mobile|still` forces a path, for testing, screenshots and capturing the pre-rendered still. There is no visible quality control.
  - The rung costs were measured on a Vega 10 iGPU only. The `detect-gpu` cut-offs and the thresholds are build-time tuning, to be checked on a discrete GPU during execution.

## Theme

Light only, with no dark mode. The Scene is the only dark surface on the site.

Map these onto shadcn's CSS variables in `app/globals.css` (`:root`), and remove the `.dark` block.

| Role | Token | Value | Notes |
| --- | --- | --- | --- |
| Snow paper | `--background` | `oklch(0.975 0.004 240)` | Cool white with a hint of blue-grey. The page "below grade", under the Section Cut. |
| Sheet | `--card`, `--popover` | `oklch(0.99 0.002 240)` | Project Panel and raised surfaces. |
| Basalt ink | `--foreground`, `--primary` | `oklch(0.2 0.01 250)` | Text and primary buttons. Never pure black. |
| Ink on basalt | `--primary-foreground` | `oklch(0.975 0.004 240)` | |
| Concrete light | `--muted`, `--secondary`, `--accent` | `oklch(0.945 0.005 240)` | shadcn's `--accent` is the hover/highlight surface. It is **not** the brand accent. |
| Concrete mid | `--muted-foreground` | `oklch(0.52 0.01 250)` | Secondary text, mono labels. |
| Hairline | `--border`, `--input` | `oklch(0.88 0.006 240)` | 1px everywhere. |
| Focus | `--ring` | `oklch(0.2 0.01 250)` | Ink, so focus stays visible on paper. |
| Destructive | `--destructive` | `oklch(0.55 0.18 27)` | Rare; forms only. |
| **Window light** | `--window` (custom) | `oklch(0.8 0.13 70)` | The brand accent. Use it for markers, the selected state and small highlights, never for large fills. It fails contrast as text on paper, so pair it with ink. |
| Window light, text | `--window-ink` (custom) | `oklch(0.55 0.13 60)` | For the rare case amber must be text. |
| Dusk blue | `--dusk` (custom) | `oklch(0.42 0.08 255)` | A quiet emphasis, used sparingly. |

Register custom tokens in `@theme inline` (`--color-window`, `--color-window-ink`, `--color-dusk`) so they work as Tailwind utilities.

Scene palette (three.js, not CSS):

- Sky: `oklch(0.26 0.06 262)` at the zenith, `oklch(0.55 0.06 250)` at the horizon.
- Snow in shadow: `oklch(0.62 0.04 250)`. Lit snow: `oklch(0.8 0.03 245)`.
- Concrete: `oklch(0.6 0.01 250)`, pushed blue by the ambient light.
- Window emissive: about `oklch(0.82 0.12 70)`.

## Typography

All from Google Fonts via `next/font` in `fonts/index.ts`. Inter is dropped.

| Role | Family | CSS variable | Use |
| --- | --- | --- | --- |
| Display | **Newsreader** (optical sizes) | `--font-heading` | Page titles, Project names, section heads. Light (300) at large sizes, regular (400) at smaller sizes. Used sparingly: one display moment per viewport. |
| Body / UI | **Geist** | `--font-sans` | Paragraphs, navigation, buttons, forms. |
| Data | **Geist Mono** | `--font-mono` | Project data: location, elevation, year, floor area (m²). Also Scene labels. |

Rules:

- **Data labels:** Geist Mono at 11–12px, uppercase, tracking `0.12em`, in `--muted-foreground`. Values sit below or beside them in Geist Mono at normal case. Model them on the legend of an architectural drawing.
- **Scale (display):** `clamp(2.5rem, 6vw, 5.5rem)` for the page title, `clamp(1.75rem, 3vw, 2.75rem)` for section heads, with tight leading (1.05–1.15) and slight negative tracking.
- **Body:** 16–17px with 1.6 leading, and a measure of about 65ch.
- Newsreader never appears in buttons or UI chrome.

## Components (shadcn)

shadcn `base-nova` (Base UI primitives) is the base for all UI. Add components with the shadcn CLI and restyle them through tokens. Don't fork their structure unless a component needs it.

- **Radius 0.** Set `--radius: 0`. Every corner is sharp.
- **Hairlines, no shadows.** Separate surfaces with 1px `--border` and whitespace, never with drop shadows.
- **A visible grid.** A 12-column layout with generous gutters. Columns 1–2 are the **margin rail** for mono labels (Depth markers, data labels, figure numbers). Content sits in columns 3–12: running text in columns 3–8 (about 65ch), with data or images beside it in 9–12. Three faint full-height hairline guides mark the page edges and the rail edge, like the frame of a drawing sheet. On mobile the rail folds into a label above each block, and only the page-edge guides remain.
- **Buttons:** ink fill with paper text for primary, a hairline outline for secondary. No gradients.
- **Icons:** lucide at a 1.5px stroke, used sparingly.

### Project Panel

A paper sheet (`--card`) that slides in over the Scene, set out like the **title block of a drawing set**:

- The Project name in Newsreader.
- A grid of mono data cells separated by hairlines: location, elevation, year, floor area.
- The Project's lede (one sentence) in Geist.
- A "View project →" link to `/projects/[slug]`.
- On desktop it opens from the right side. On mobile it is a bottom sheet. Base it on shadcn `Sheet`.

## Site structure

Routes: `/`, `/projects/[slug]` and a styled 404. Nothing else: no `/projects` page (the Project Index lives on the home page), no legal page, no People or team section.

### Header and footer

- **Header:** fixed and quiet: the wordmark on the left, anchor links (Projects, Studio, Approach, Contact) in mono 12px uppercase, and the current Depth on the right (`±0.00` over the Scene, then `▽ −2.00` etc.), which replaces an active-link underline. Over the Scene it is paper-colored. It cuts to ink with no fade when the section line crosses its baseline. On Project pages the links go to `/#…`. On mobile the links collapse into a shadcn `Sheet`.
- **Footer:** shared by every page, a hairline-topped strip like the edge of a drawing sheet: the wordmark, the studio's location (`Tromsø, Norway`) in mono, the contact email, and the line "Atrium is a fictional studio."

### Home (`/`)

The Scene is at grade (`±0.00`). Below the **Section Cut**, each section is a **Depth**, labelled in the margin rail as `▽ −1.00 · PROJECTS`. The labels are the only depth effect: no parallax earth layers, and no darkening as you go deeper.

1. **Scene** (`±0.00`), then the **Section Cut**.
2. **Project Index** (`−1.00`): a schedule, one hairline-separated row per Project: the name in Newsreader, then location, elevation, year and m² in mono columns. A small thumbnail (a crop of the Project's hero image) appears on row hover. On mobile the rows stack: the name, then one mono line of data.
3. **Studio** (`−2.00`): one Newsreader statement (the display moment), 2–3 short paragraphs in columns 3–8, and a mono data block in 9–12 (Founded, Based: Tromsø, Norway, Projects: 4). No image.
4. **Approach** (`−3.00`): three rows, Site, Light and Material. Each has its rail label (`01 SITE`), a short Newsreader head, a paragraph, and a detail crop from a Project image on the right (the snow plinth, a glowing window, board-formed concrete).
5. **Contact** (`−4.00`): one Newsreader line, the email as the primary `mailto:` link, and `Tromsø, Norway` in a data block. No form and no map. The footer follows.

### Project page (`/projects/[slug]`)

Paper from the top, like unfolding the Project Panel into the full sheet:

1. **Title block:** the Project name in Newsreader, the lede and the full data grid (a larger Project Panel).
2. The hero image.
3. The write-up in three parts, **Site, Light, Material** (mirroring Approach), alternating with images: Site with the wide image, Light with the exterior glow and then the interior view out, Material with the close-up.
4. **Drawings:** a plan and a section of the House, drawn as SVG from its House data.
5. A next-Project row ("Next project: Senja House →", wrapping around), then the footer.

### 404

A paper page with the header and footer, a rail label `▽ −∞`, one Newsreader line ("Nothing is built here."), and a link to the Project Index. No Scene.

## Motion

Slow and heavy, like moving a heavy object.

- Camera: 1.2–2s, ease-in-out.
- UI: 200–400ms fades and short slides (8–16px). No bounce and no springs.
- Snowfall and idle drift are the only continuous motion.
- `prefers-reduced-motion` removes camera flights (cut instead), snowfall and drift.

## Wordmark

- **Mark:** a square outline with a square void in the center, the plan view of an atrium. Draw it as SVG with hairline strokes, in ink.
- **Wordmark:** "atrium" in lowercase Newsreader, set beside the mark.

## Voice and naming

- The four Projects are **Lyngen House, Senja House, Kvaløya House and Reine House**, named after real places in Troms and Nordland. Location is written as place and county (`Lyngen, Troms`). Elevation is a plausible rounded value for that place (`+40 m`), not a surveyed point. There are no coordinates anywhere on the site, for Projects or the studio.
- Copy is short, declarative and understated. Say what the building does with site, light and material. No marketing adjectives ("stunning", "luxurious", "breathtaking").
- English throughout.
- Fictional facts only need to agree with each other: the studio was founded in 2014, Projects were completed between 2017 and 2025, and floor areas run 140–320 m².
- The contact email is `studio@atrium.example`: a reserved domain, so no `mailto:` reaches a real inbox. No street address and no credit line.

## Content

All copy and Project data is local TypeScript, with no MDX and no CMS.

- **One module per Project**, `content/projects/<slug>.ts`: name, slug, location, elevation, year, floor area, a one-sentence **lede**, the write-up in three parts (Site, Light, Material), the image set, the camera block and the House data. `content/projects/index.ts` sets the order used by the Project Index and the next-Project wrap.
- **`content/site.ts`** holds everything else: the Studio statement, paragraphs and data block, the three Approach rows, the Contact line, the 404 line and the footer line.
- **Drafting:** an agent drafts all copy to the voice rules above. The human runs the `humanizer` skill over it and reviews it before it ships. There are no automated copy tests.
- **Order:** a Project's House record comes first, then its write-up is drafted from it (the copy must match the massing), then its images are made from the baked House. Studio, Approach, Contact, 404 and footer copy have no dependency.
- **Metadata:** titles are `Lyngen House — Atrium`, and descriptions come from the lede. A Project's OG image is its hero image. The home page's description comes from the Studio statement, and its OG image is the pre-rendered Scene still.

### Images

Project images are AI-generated by the human's image agent, one variant at a time (a rejected image is simply regenerated). They are committed as optimised AVIF/WebP under `public/projects/<slug>/` and served with `next/image`. Every image is at blue hour, in snow.

- **Exteriors** are image-to-image from the baked House, captured at a set camera in the live Scene, so the massing matches the Scene and the plan and section drawings. An image whose massing drifts is rejected.
- **Five per Project:** *hero* (the hero angle; its crop is the Project Index thumbnail), *site* (wide, the House in its landscape), *light* (glowing glazing and soffit), *interior* (a view out) and *material* (a close-up of stone, board-formed concrete or fascia).
- **The interior** is framed by one real glazing face of the House, with the same proportions and mullions, and it looks out in that face's direction. The room is sparse, and its only warm light comes from lamps and downlights. The image brief names the glazing face.
- The three Approach detail crops are cut from these images, so they need no separate generation.
