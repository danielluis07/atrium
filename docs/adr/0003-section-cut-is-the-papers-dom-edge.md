# The Section Cut is the paper's DOM edge, with the camera keyed to it

Status: accepted (2026-09-24)

ADR 0002 left one question open: where the ink section line meets the rendered snow. This answers it.

## Decision

The section line is not drawn in the Scene. It is the **top edge of the paper page** (the Depths), a DOM element that scrolls up over the Scene's stage: an ink hairline with the snow-strata hatch band in SVG right under it (`components/home/section-cut.tsx`). The Scene is keyed to the edge, not the other way round.

- **The stage** is a full-viewport sticky element under a clear header. It is held while the paper rises over it.
- **The live Scene:** the stage is held until the line reaches the header's baseline and the paper covers it. Scroll progress, from the line at the stage's foot to the line at the header, drives the camera drop as a pure function (`lib/scene/cut.ts`). The camera descends from where it is to eye height over the snow or fjord, and turns to the overview's heading. Its pitch keeps the lowest point of the snow skyline, sampled from the terrain heightfield across the viewport, where it was until the rising line reaches it. From then on it holds it a few pixels above the line. When the paper covers the stage, the Scene stops rendering.
- **A House selected:** scrolling closes the Project Panel. The camera does not fly out to overview and then drop. It holds where the fly-back had it and drops from there, one move (`cutRig`). Scrolling back to the top reverses the drop exactly, and the camera then flies on to overview.
- **The still** (reduced motion, no WebGL): the stage is held until the line meets the still's snow line. After that the still rides up with the line, which stays just under it. This is plain CSS: the stage's sticky range ends there, so it works without JavaScript. The still's aspect and snow-line height are constants beside the drop (`STILL`), and a recaptured still updates them.
- **The header** is clear and paper-coloured over the Scene. It cuts to ink, with no fade, when the paper crosses its baseline, which an IntersectionObserver reports.

## Why

- A DOM edge is crisp at any DPR, zoom or render rung. The line never has to be matched to rendered pixels, and it doesn't depend on tone mapping, bloom or AO.
- The still and the live Scene get the same line and hatch from the same markup.
- Keying the camera to the edge, rather than drawing the edge from the camera, keeps the Scene the only thing that changes with the render path. The rest of the page is ordinary scrolling HTML.

## Considered options

- **A line drawn in the Scene** (a post effect, or a ground plane clipped at the camera's height): it has to be matched to a DOM hatch below it, which reopens the pixel-matching problem the Whiteout had.
- **A scroll-jacked transition:** the page would stop scrolling while the camera moved. It breaks the rule that the wheel always scrolls the page.

## Consequences

- The drop's end pose (`GRADE`), the kept snow (`SNOW_GAP`) and the hatch pattern are tuning knobs. They can change without revisiting this decision.
- The Houses stand on the slope below the far skyline, so they go under the paper as the line rises. The line cuts the ground, not the Houses.
- Only the observer knows where the line is, so without JavaScript the header stays ink throughout (`@media (scripting: enabled)` gates the clear header).
