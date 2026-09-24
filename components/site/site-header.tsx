import Link from "next/link";

import { DepthReadout } from "@/components/site/depth-readout";
import { HeaderFrame } from "@/components/site/header-frame";
import { focusClass } from "@/components/site/label";
import { MobileNav } from "@/components/site/mobile-nav";
import { Wordmark } from "@/components/site/wordmark";
import { depths } from "@/content/site";
import { depthHref } from "@/lib/depth";
import { cn } from "@/lib/utils";

/**
 * Fixed and quiet: paper-coloured over the Scene, ink on paper below the
 * Section Cut (`HeaderFrame`). Nothing in it fades between the two, so the
 * change is a cut.
 */
export function SiteHeader() {
  return (
    <HeaderFrame className="fixed inset-x-0 top-0 z-40 border-b bg-background text-foreground">
      <div className="page-frame flex h-(--header-height) items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-4 md:gap-8">
          <nav aria-label="Site" className="hidden md:block">
            <ul className="flex gap-8">
              {depths.map((d) => (
                <li key={d.id}>
                  <Link
                    href={depthHref(d.id)}
                    className={cn(
                      "font-mono text-xs tracking-[0.12em] uppercase text-foreground hover:text-muted-foreground",
                      focusClass,
                    )}>
                    {d.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <DepthReadout />
          <div className="md:hidden">
            <MobileNav />
          </div>
        </div>
      </div>
    </HeaderFrame>
  );
}
