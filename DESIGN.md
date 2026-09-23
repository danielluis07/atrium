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

Houses are **assembled from shared parts** (volume, slab, glazing, fascia, stone mass) and baked offline in headless Blender, then rendered in react-three-fiber (see `docs/adr/0001-houses-baked-offline-in-headless-blender.md`). Each Project describes its House as data: volumes, levels, cantilevers and glazing faces. The ground is plain snow, so detail goes into the Houses. All four Houses share one language and differ in composition, not style.

## Scene

- **Setting:** four Houses spread across a snowy slope above a fjord. Sparse pines, mountains fading into fog, light snowfall.
- **Light:** blue hour. A deep-blue sky that fades toward the horizon. Snow in cool blue shadow. The only warm light in the Scene comes from the windows and soffit downlights.
- **Camera:** limited orbit on rails (no free-fly), slow idle drift. The camera never goes below the terrain or behind the mountains.
- **Hover:** the House's windows brighten and a small mono label with the Project name appears in the Scene. The cursor changes to a pointer.
- **Select:** the camera flies to the House (about 1.5s, ease-in-out), the other Houses dim, and the **Project Panel** opens. Esc or a click on empty snow closes the panel and flies the camera back.
- **Section Cut:** scrolling past the hero drops the camera toward the ground, and the snow surface becomes a crisp ink **section line** across the viewport, with the dark Scene above and snow paper below. Right under the line runs a narrow band of section hatch (snow strata). The line scrolls up and away, and the page continues below grade. It is a cut, not a fade, so no fog has to match the paper color. If a House is selected, scrolling closes the Project Panel and its fly-back folds into the drop (one camera move, not two). See `docs/adr/0002-section-cut-replaces-whiteout.md`.
- **Degradation:**
  - Mobile or low-power devices get a lighter live Scene: fewer snow particles, no real-time shadows, reduced camera motion.
  - `prefers-reduced-motion` or no WebGL gets a pre-rendered still of the Scene, cropped so its snow line sits on the same section line and hatch band (a static cut, no camera move). Mobile gets the real camera drop, only shorter.
  - The **Project Index** is always there, so no Project depends on 3D to be reached.

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
| Data | **Geist Mono** | `--font-mono` | Project data: coordinates, floor area (m²), year, elevation, location. Also Scene labels. |

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
- A grid of mono data cells separated by hairlines: location, coordinates, year, floor area, elevation.
- One paragraph of description in Geist.
- A "View project →" link to `/projects/[slug]`.
- On desktop it opens from the right side. On mobile it is a bottom sheet. Base it on shadcn `Sheet`.

## Site structure

Routes: `/`, `/projects/[slug]` and a styled 404. Nothing else: no `/projects` page (the Project Index lives on the home page), no legal page, no People or team section.

### Header and footer

- **Header:** fixed and quiet: the wordmark on the left, anchor links (Projects, Studio, Approach, Contact) in mono 12px uppercase, and the current Depth on the right (`±0.00` over the Scene, then `▽ −2.00` etc.), which replaces an active-link underline. Over the Scene it is paper-colored. It cuts to ink with no fade when the section line crosses its baseline. On Project pages the links go to `/#…`. On mobile the links collapse into a shadcn `Sheet`.
- **Footer:** shared by every page, a hairline-topped strip like the edge of a drawing sheet: the wordmark, the studio's location and coordinates in mono, the contact email, and the line "Atrium is a fictional studio."

### Home (`/`)

The Scene is at grade (`±0.00`). Below the **Section Cut**, each section is a **Depth**, labelled in the margin rail as `▽ −1.00 · PROJECTS`. The labels are the only depth effect: no parallax earth layers, and no darkening as you go deeper.

1. **Scene** (`±0.00`), then the **Section Cut**.
2. **Project Index** (`−1.00`): a schedule, one hairline-separated row per Project: the name in Newsreader, then location, coordinates, year and m² in mono columns. A small render thumbnail appears on row hover. On mobile the rows stack: the name, then one mono line of data.
3. **Studio** (`−2.00`): one Newsreader statement (the display moment), 2–3 short paragraphs in columns 3–8, and a mono data block in 9–12 (Founded, Based: Tromsø with coordinates, Projects: 4). No image.
4. **Approach** (`−3.00`): three rows, Site, Light and Material. Each has its rail label (`01 SITE`), a short Newsreader head, a paragraph, and a detail crop from a House render on the right (the snow plinth, a glowing window, board-formed concrete).
5. **Contact** (`−4.00`): one Newsreader line, the email as the primary `mailto:` link, and address and coordinates in a data block. No form and no map. The footer follows.

### Project page (`/projects/[slug]`)

Paper from the top, like unfolding the Project Panel into the full sheet:

1. **Title block:** the Project name in Newsreader and the full data grid (a larger Project Panel).
2. The first render.
3. The write-up in three parts, **Site, Light, Material** (mirroring Approach), alternating with renders.
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

- Projects are named **"<Place> House"** after real Arctic places, e.g. Lyngen House, Senja House, Kvaløya House, Lofoten House. Coordinates and elevation come from the real place.
- Copy is short, declarative and understated. Say what the building does with site, light and material. No marketing adjectives ("stunning", "luxurious", "breathtaking").
- English throughout.
