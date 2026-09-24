import type { CSSProperties, ReactNode } from "react";

import { SheetGuides } from "@/components/site/sheet-guides";
import { SNOW_GAP, STILL } from "@/lib/scene/cut";

/**
 * The Section Cut (ADR 0003): the Scene's stage is held at the top of the
 * viewport and the paper page, the Depths, scrolls up over it. The paper's
 * top edge is the section line, an ink hairline with the snow-strata hatch
 * under it. Over the still the stage is held until the rising line meets
 * the still's snow line, and from there the still rides up with it; over
 * the live Scene it is held until the paper covers it, and the camera's
 * drop keeps the snow just above the line (`lib/scene/cut.ts`). The
 * lengths are in `app/globals.css`.
 */
export function SectionCut({ scene, children }: { scene: ReactNode; children: ReactNode }) {
  return (
    <div
      data-slot="section-cut"
      className="-mt-(--header-height)"
      style={
        {
          "--snow-gap": `${SNOW_GAP}px`,
          "--still-snow-line": STILL.snowLine,
          "--still-aspect": STILL.aspect,
        } as CSSProperties
      }>
      {scene}
      <div data-slot="paper" className="relative isolate -mt-(--cut) bg-background">
        <SectionLine />
        <SheetGuides className="absolute" />
        {children}
      </div>
    </div>
  );
}

/** Rows of the snow-strata hatch: height in the band, dash pattern (one 120px repeat) and ink strength. */
const STRATA = [
  { y: 2.5, dashes: "34 4 18 4 56 4", opacity: 0.7 },
  { y: 5.5, dashes: "12 3 41 3 26 3 29 3", opacity: 0.55 },
  { y: 7.5, dashes: "52 5 22 5 31 5", opacity: 0.4 },
  { y: 10.5, dashes: "7 2 19 2 44 2 27 2 13 2", opacity: 0.3 },
];

/**
 * The section line: an ink hairline across the viewport where the ground is
 * cut, and under it a narrow band of section hatch, snow in strata, fading
 * as it goes down.
 */
function SectionLine() {
  return (
    <div data-slot="section-line" aria-hidden="true" className="border-t border-foreground">
      <svg className="block h-3 w-full text-foreground" data-slot="section-hatch">
        <defs>
          <pattern id="snow-strata" width="120" height="12" patternUnits="userSpaceOnUse">
            {STRATA.map(({ y, dashes, opacity }) => (
              <line
                key={y}
                x1="0"
                x2="120"
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray={dashes}
                opacity={opacity}
              />
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#snow-strata)" />
      </svg>
    </div>
  );
}
