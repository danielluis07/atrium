"use client";

import type { Ref } from "react";

import { useSelection } from "@/components/scene/use-selection";
import { labelClass } from "@/components/site/label";
import type { SceneProject } from "@/content/schema";
import type { SelectionStore } from "@/lib/scene/selection";
import { cn } from "@/lib/utils";

/** Where the label points, in CSS pixels over the Canvas. */
export type LabelPoint = { x: number; y: number };

/**
 * The hovered House's Project name, in mono over the Scene, with a hairline
 * leader down to its roof. The Houses place it every frame through `ref`;
 * it never takes the pointer.
 */
export function HoverLabel({
  store,
  projects,
  ref,
}: {
  store: SelectionStore;
  projects: SceneProject[];
  ref: Ref<HTMLDivElement>;
}) {
  const hovered = useSelection(store, (s) => s.hovered);
  const name = projects.find((p) => p.slug === hovered)?.name;
  return (
    <div ref={ref} aria-hidden="true" data-slot="scene-label" className="pointer-events-none absolute top-0 left-0">
      <div
        className={cn(
          labelClass,
          "flex -translate-x-1/2 -translate-y-full flex-col items-center whitespace-nowrap text-background transition-opacity duration-200",
          name ? "opacity-100" : "opacity-0",
        )}>
        {name}
        <span className="mt-1.5 h-6 w-px bg-current opacity-60" />
      </div>
    </div>
  );
}
