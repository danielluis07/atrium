# The Section Cut replaces the Whiteout

Status: accepted (2026-09-23)

Amended 2026-09-28: the DOM cut remains, but its visible hairline and snow-strata hatch were removed. The Scene's shadowed foreground snow and the below-grade page now share one colour and meet without a painted seam.

The hero was going to hand off to the paper site through a **Whiteout**: fog thickening until the frame became the exact paper color. We replaced it with a **Section Cut**. The camera drops toward the ground, and the shadowed foreground snow continues into the site "below grade", where its sections are **Depths** (−1.00 Projects … −4.00 Contact).

## Why

- It turns the site's drawing-set language into the transition itself. The page below the Scene is the underground half of a section drawing, rather than a vague fade.
- A hard edge hides the seam. The Whiteout had to match the CSS background pixel for pixel through tone mapping, bloom and AO (the scene-rendering research found fog alone lands visibly grey). The cut needs no color match.
- It degrades cleanly. Reduced-motion and no-WebGL visitors get the same line and hatch over the pre-rendered still, with no camera move.

## Considered options

- **Whiteout (fog to paper):** decided earlier, and it needs a depth-aware post effect after tone mapping plus neutralising bloom, AO and grain.
- **Dive into the snow:** the camera sinks until snow fills the frame. That's a Whiteout made of snow, and it has the same color-match problem.
- **Dive, then cut:** a hybrid, with more motion for little gain.

## Consequences

- The Whiteout paper-mix post effect, the sky dome's whiteout uniform, and fading bloom, AO and grain toward paper (from the scene-rendering research) are no longer needed. What the Section Cut needs from the Scene (the camera drop, and where the line meets the rendered snow) is settled in ADR 0003.
- "Level" is kept for a floor of a House. Home sections are "Depths".
