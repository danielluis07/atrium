import { labelClass } from "@/components/site/label";
import { depths } from "@/content/site";
import { formatDepth } from "@/lib/depth";
import { cn } from "@/lib/utils";

type DepthId = (typeof depths)[number]["id"];

/**
 * One home page Depth: a section below grade, anchored by its id, with its
 * level mark in the margin rail (`▽ −1.00 · PROJECTS`) and a hairline
 * across the sheet where it starts. Children sit on the 12-column grid.
 */
export function Depth({
  id,
  className,
  children,
}: {
  id: DepthId;
  className?: string;
  children: React.ReactNode;
}) {
  const { label, depth } = depths.find((d) => d.id === id)!;
  return (
    <section id={id} data-depth={depth} aria-labelledby={`${id}-label`} className="page-frame">
      <div className={cn("page-grid content-start gap-y-10 border-t pt-6 pb-24 md:pb-40", className)}>
        <h2 id={`${id}-label`} className={cn(labelClass, "col-span-12 md:col-span-2")}>
          <span aria-hidden="true">{formatDepth(depth)} · </span>
          {label}
        </h2>
        {children}
      </div>
    </section>
  );
}

/** A section head in Newsreader, at the section scale. */
export const sectionHeadClass =
  "font-heading text-[clamp(1.75rem,3vw,2.75rem)] leading-[1.1] font-light tracking-[-0.015em]";
