"use client";

import Link from "next/link";
import { useState, type RefObject } from "react";

import { useSelection } from "@/components/scene/use-selection";
import { DataBlock } from "@/components/site/data-block";
import { focusClass, labelClass } from "@/components/site/label";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { SceneProject } from "@/content/schema";
import { formatArea, formatElevation, formatIndex } from "@/lib/format";
import type { SelectionStore } from "@/lib/scene/selection";
import { cn } from "@/lib/utils";

/**
 * The Project Panel: the selected House's Project as the title block of a
 * drawing set, on a paper sheet from the right, or from the bottom on the
 * mobile Scene. It leaves the Scene live
 * beside it, so another House can be clicked, and only Esc, its close
 * button or a click on empty snow closes it. Focus moves into it on open
 * and back to `scene` on close.
 */
export function ProjectPanel({
  store,
  projects,
  scene,
  side,
}: {
  store: SelectionStore;
  projects: SceneProject[];
  scene: RefObject<HTMLElement | null>;
  side: "right" | "bottom";
}) {
  const selected = useSelection(store, (s) => s.selected);
  const index = projects.findIndex((p) => p.slug === selected);
  // the Panel keeps showing its Project while it slides out
  const [shown, setShown] = useState(index);
  if (index >= 0 && index !== shown) setShown(index);
  const project = projects[shown];

  return (
    <Sheet
      open={index >= 0}
      onOpenChange={(open) => {
        if (!open) store.dispatch({ type: "close" });
      }}
      modal={false}
      disablePointerDismissal>
      <SheetContent
        side={side}
        showOverlay={false}
        finalFocus={scene}
        data-slot="project-panel"
        // under the header, which stays in view, or up to the lower part of the screen, clear of the House;
        // a short slide either way (`DESIGN.md` § Motion)
        className={cn(
          "gap-0 bg-card shadow-none",
          "data-[side=right]:top-(--header-height) data-[side=right]:h-auto data-[side=right]:w-full data-[side=right]:data-ending-style:translate-x-4 data-[side=right]:data-starting-style:translate-x-4 data-[side=right]:sm:max-w-md",
          "data-[side=bottom]:max-h-[60dvh] data-[side=bottom]:overflow-y-auto data-[side=bottom]:data-ending-style:translate-y-4 data-[side=bottom]:data-starting-style:translate-y-4",
        )}>
        {project && (
          <>
            <SheetHeader className="gap-0 px-6 pt-6 pb-10 in-data-[side=bottom]:pb-6">
              <p className={labelClass}>
                Project {formatIndex(shown + 1)} / {formatIndex(projects.length)}
              </p>
              <SheetTitle className="mt-10 font-heading in-data-[side=bottom]:mt-4 text-[clamp(2rem,3vw,2.75rem)] leading-[1.05] font-light tracking-[-0.02em]">
                {project.name}
              </SheetTitle>
            </SheetHeader>
            <DataBlock
              className="mx-6"
              items={[
                { label: "Location", value: project.location },
                { label: "Elevation", value: formatElevation(project.elevation) },
                { label: "Year", value: project.year },
                { label: "Area", value: formatArea(project.floorArea) },
              ]}
            />
            <SheetDescription className="px-6 pt-8 text-base text-foreground in-data-[side=bottom]:pt-6">{project.lede}</SheetDescription>
            <div className="mt-auto border-t p-6">
              <Link
                href={`/projects/${project.slug}`}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 w-full justify-between px-4 font-mono text-xs tracking-[0.12em] uppercase",
                  focusClass,
                )}>
                View project <span aria-hidden="true">→</span>
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

