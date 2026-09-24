import Link from "next/link";

import { focusClass, RailLabel } from "@/components/site/label";
import { notFound } from "@/content/site";
import { depthHref, formatDepth } from "@/lib/depth";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main data-depth={-Infinity} className="page-frame flex-1">
      <div className="page-grid gap-y-6 py-24 md:py-40">
        <RailLabel className="md:pt-4">{formatDepth(-Infinity)}</RailLabel>
        <div className="col-span-12 md:col-span-8 md:col-start-3">
          <h1 className="text-display">{notFound.line}</h1>
          <Link
            href={depthHref("projects")}
            className={cn(
              "mt-10 inline-block border-b border-foreground pb-0.5 text-base",
              focusClass,
            )}>
            {notFound.link} →
          </Link>
        </div>
      </div>
    </main>
  );
}
