import Image from "next/image";
import Link from "next/link";

import { Depth } from "@/components/home/depth";
import { focusClass, labelClass } from "@/components/site/label";
import { getProjects } from "@/content";
import { formatArea, formatElevation } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * −1.00 Project Index: the schedule of Projects, one hairline row each.
 * On desktop the data sits in mono columns and a crop of the hero image
 * shows on hover or focus. On mobile a row is the name over one mono line.
 */
export function ProjectIndex() {
  const projects = getProjects();
  return (
    <Depth id="projects">
      <div className="col-span-12 md:col-span-10 md:col-start-3">
        <div
          aria-hidden="true"
          className={cn(labelClass, "hidden grid-cols-10 gap-x-(--gutter) pb-3 md:grid")}>
          <span className="col-span-4">Project</span>
          <span className="col-span-2">Location</span>
          <span>Elevation</span>
          <span>Year</span>
          <span>Area</span>
        </div>
        <ol className="border-t">
          {projects.map((p) => (
            <li key={p.slug} className="border-b">
              <Link
                href={`/projects/${p.slug}`}
                className={cn(
                  "group grid grid-cols-10 items-center gap-x-(--gutter) gap-y-1.5 py-5 md:py-4",
                  focusClass,
                  "focus-visible:outline-offset-0",
                )}>
                <span className="col-span-10 font-heading text-[clamp(1.625rem,2.4vw,2.25rem)] leading-[1.1] tracking-[-0.01em] transition-colors duration-200 group-hover:text-muted-foreground md:col-span-4">
                  {p.name}
                </span>
                <span className="col-span-10 flex flex-wrap gap-x-2 font-mono text-xs text-muted-foreground md:contents md:text-sm md:text-foreground">
                  <span className="md:col-span-2">{p.location}</span>
                  <Dot />
                  <span>{formatElevation(p.elevation)}</span>
                  <Dot />
                  <span>{p.year}</span>
                  <Dot />
                  <span>{formatArea(p.floorArea)}</span>
                </span>
                <span
                  data-slot="index-thumbnail"
                  className="relative hidden aspect-4/3 overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 md:block">
                  <Image
                    src={p.images.hero.src}
                    alt=""
                    fill
                    sizes="(min-width: 96rem) 7rem, 8vw"
                    className="scale-125 object-cover"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Depth>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="md:hidden">
      ·
    </span>
  );
}
