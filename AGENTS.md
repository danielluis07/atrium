<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# What this is

Atrium is the website of a fictional architecture studio based in northern Norway. The home page hero is an interactive 3D Scene: four modernist Houses on a snowy slope above a fjord at blue hour. Each House is one of the studio's Projects, and selecting it opens a Project Panel with a link to the Project's own page. Scrolling down, a Section Cut slices through the snow, and the site continues "below grade" on light snow paper, one Depth after another: Projects, Studio, Approach and Contact.

It is a showcase site. It has no backend or auth, and Project content lives in local data.

- Vocabulary: `CONTEXT.md`. Use its terms (Project, House, Scene, Project Panel, Project Index, Section Cut, Depth, Level).
- Visual direction, fonts, palette, Scene and motion rules: `DESIGN.md`.
- Components: shadcn (`base-nova` style, built on Base UI) is the base for all UI.

# Runtime

Use Bun

# Language

English.

# Conventions

Prefer the @ alias for imports (configured in tsconfig.json).
