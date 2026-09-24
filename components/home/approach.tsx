import Image from "next/image";

import { Depth, sectionHeadClass } from "@/components/home/depth";
import { labelClass } from "@/components/site/label";
import { getProject } from "@/content";
import { approach } from "@/content/site";
import { formatIndex } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * −3.00 Approach: Site, Light and Material, each a rail label, a head, a
 * paragraph and a detail crop cut from one of the Projects' images.
 */
export function Approach() {
  return (
    <Depth id="approach">
      <ol className="col-span-12 space-y-16 md:space-y-24">
        {approach.map(({ label, head, paragraph, crop }, i) => {
          const image = getProject(crop.project)!.images[crop.image];
          return (
            <li key={label} className="page-grid gap-y-6">
              <p className={cn(labelClass, "col-span-12 md:col-span-2 md:pt-3")}>
                {formatIndex(i + 1)} {label}
              </p>
              <div className="col-span-12 md:col-span-5 md:col-start-3">
                <h3 className={sectionHeadClass}>{head}</h3>
                <p className="mt-6 max-w-[65ch]">{paragraph}</p>
              </div>
              <figure className="relative col-span-12 aspect-4/3 overflow-hidden bg-muted md:col-span-4 md:col-start-9">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes="(min-width: 48rem) 60vw, 180vw"
                  className="scale-[1.8] object-cover"
                  style={{ objectPosition: crop.focus, transformOrigin: crop.focus }}
                />
              </figure>
            </li>
          );
        })}
      </ol>
    </Depth>
  );
}
