# ADR 0008: Project images are AI-assisted editorial renders

## Status

Accepted.

## Context

The Project pages need five photographic views of each House: hero, Site, Light, Hero Interior and Material. The original AVIFs were low-detail placeholders made before the final Interiors, Site Works and Balcony Furniture. They no longer described the Houses in the Scene.

The Scene itself remains the source of truth for a House's composition. A fallback still must match the live overview closely enough that replacing it with WebGL does not produce a visible framing jump.

## Decision

Project images are produced as AI-assisted, photorealistic editorial architecture renders. Each image uses the final House records, the design reference and current Scene evidence as constraints. A Project's five images form one visual set, but each has a distinct job:

- **Hero:** the whole House and its identifying composition.
- **Site:** the House in its Site Works and wider Arctic setting.
- **Light:** glazing, Interior light and the warm/cold contrast.
- **Interior:** the Project's named Hero Interior, looking through its named Glazing Face.
- **Material:** a close construction junction using the House's authored materials.

The images are stored as high-quality AVIFs under `public/projects/<slug>/`. They contain no people, text, logos or invented Project branding. Prompts must name the authored features that distinguish the House rather than asking for a generic Nordic villa.

`public/scene/still.avif` is not generated. It is recaptured from the live target Scene at the overview camera with `bun run scene:capture-still`, at 1600×900, after the Scene reports ready and settles. This keeps its 16:9 frame and snow line aligned with the live Scene and Section Cut.

## Consequences

The Project images can be more photographic than the real-time renderer while remaining accountable to the authored Houses. They are curated assets, not mechanically derived elevations, so later changes to a House require reviewing and, where affected, regenerating its five-image set.

The fallback still remains deterministic and must be recaptured after changes to House geometry, placement, lighting, terrain or the overview camera.
