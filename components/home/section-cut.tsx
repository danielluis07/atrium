import type { CSSProperties, ReactNode } from "react";

import { SheetGuides } from "@/components/site/sheet-guides";
import { SNOW_GAP, STILL } from "@/lib/scene/cut";

/**
 * The Section Cut (ADR 0003): the Scene's stage is held at the top of the
 * viewport and the paper page, the Depths, scrolls up over it. The paper's
 * top edge is an invisible cut marker, so the matched snow surfaces meet
 * without a drawn seam. Over the still the stage is held until the rising
 * edge meets the still's snow line, and from there the still rides up with
 * it; over the live Scene it is held until the paper covers it, and the camera's
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
        <CutMarker />
        <SheetGuides className="absolute" />
        {children}
      </div>
    </div>
  );
}

/**
 * The camera and header still need an exact DOM edge to follow, but the edge
 * itself stays unpainted so the Scene's foreground snow flows into the page.
 */
function CutMarker() {
  return <div data-slot="section-line" aria-hidden="true" />;
}
