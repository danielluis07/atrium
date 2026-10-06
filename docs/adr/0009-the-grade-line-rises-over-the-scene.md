# The Grade Line rises over the Scene

Status: accepted (2026-10-06)

Supersedes the 2026-09-28 amendments to ADR 0002 and ADR 0003 (the seamless, unpainted edge). The rest of ADR 0003 stands: the Section Cut is still the below-grade page's DOM edge, and the Scene is still keyed to it.

## Context

Since the 2026-09-28 amendment, the paper's top edge has been a straight, unpainted line in the same colour as the Scene's shadowed foreground snow, and the camera keeps the rendered snow skyline `SNOW_GAP` (6px) above it. In practice, as soon as the visitor scrolls, the undulating skyline is pressed flat onto a straight line, and the descent reads as a flat panel sliding up, not as going underground.

## Decision

The below-grade page's top edge becomes the **Grade Line**: a static, soft, irregular snow-drift profile (one SVG path stretched across the width, about 48px tall on desktop and 28px on mobile), filled with `--below-grade`.

- **The camera is keyed to the troughs.** The rendered snow skyline is held at the Grade Line's lowest points, not at its crests. The drifts above the troughs then stand dark against the lit snow, mountains and sky for the whole scroll, like a ground line drawn in section.
- **The marker stays.** The invisible `section-line` marker moves to the Grade Line's trough height. The header still switches surface when the line crosses its baseline.
- **The still path** gets the same Grade Line, with its troughs at the still's snow line.
- **A band of plain below-grade snow** (about 50svh) lies between the Grade Line and the first Depth, so the visitor passes through ground before the content starts.

## Why

- The undulation has to show against something. Over colour-matched snow a wavy edge is as invisible as a straight one. Only with the troughs at the skyline do the drifts stay readable.
- It stays a DOM edge, so it's crisp at every render rung, DPR and zoom, and needs no pixel matching (ADR 0003's reasons hold).

## Considered options

- **Keep the real terrain visible longer** (raise `SNOW_GAP` a lot): the undulation is the Scene's own, but it flattens out as the camera nears grade, and it doesn't exist on the still path.
- **Key the skyline to the crests:** the drifts stay hidden in matching snow until the paper passes the skyline, which is the problem we started with.
- **A wavy edge echoing the terrain profile:** it ties the DOM to the heightfield and changes with the viewport, for little visible gain.

## Consequences

- `SNOW_GAP` and the still's cut length are measured to the Grade Line's troughs. The profile's height is a tuning knob, like `GRADE`.
- DESIGN.md's "no hairline or strata hatch" rule stands: the Grade Line is a silhouette, not a drawn line.
