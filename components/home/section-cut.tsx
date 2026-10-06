import type { CSSProperties, ReactNode } from "react";

import { SheetGuides } from "@/components/site/sheet-guides";
import { GRADE_LINE, SNOW_GAP, STILL } from "@/lib/scene/cut";

/**
 * The Section Cut (ADR 0003): the Scene's stage is held at the top of the
 * viewport and the paper page, the Depths, scrolls up over it behind its
 * Grade Line (ADR 0009). The invisible cut marker sits at the Grade Line's
 * troughs. Over the still the stage is held until the rising troughs meet
 * the still's snow line, and from there the still rides up with them; over
 * the live Scene it is held until the paper covers it, and the camera's drop
 * keeps the snow just above the troughs (`lib/scene/cut.ts`). A band of
 * plain snow lies between the Grade Line and the first Depth, where the
 * sheet's guides start. The lengths are in `app/globals.css`.
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
        <GradeLine />
        <CutMarker />
        <div data-slot="grade-band" className="h-(--grade-band)" />
        <SheetGuides className="absolute top-(--grade-band)" />
        {children}
      </div>
    </div>
  );
}

/**
 * The drifts rising above the paper's top edge: a silhouette in the paper's
 * own colour, its troughs on the edge.
 */
function GradeLine() {
  return (
    <svg
      data-slot="grade-line"
      aria-hidden="true"
      viewBox={`0 0 ${GRADE_LINE.width} ${GRADE_LINE.foot}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-full h-(--grade-line) w-full overflow-visible fill-background">
      <path d={GRADE_LINE.path} />
    </svg>
  );
}

/**
 * The camera and header need an exact DOM edge to follow: the Grade Line's
 * troughs, the paper's top edge. The marker itself is unpainted.
 */
function CutMarker() {
  return <div data-slot="section-line" aria-hidden="true" />;
}
