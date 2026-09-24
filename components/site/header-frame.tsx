"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Surface = "scene" | "paper";

/**
 * The header's own element, which knows what it sits over. On a page with a
 * Section Cut it is over the Scene until the paper's top edge, the section
 * line, crosses its baseline, and over paper from then on (`data-surface`,
 * styled in `app/globals.css`). A page without a Scene is paper throughout.
 */
export function HeaderFrame({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const pathname = usePathname();
  // Keyed by path, so a stale reading never shows after a navigation.
  const [reading, setReading] = useState<{ pathname: string; surface: Surface }>();

  useEffect(() => {
    const header = ref.current;
    const paper = document.querySelector<HTMLElement>('[data-slot="paper"]');
    if (!header || !paper) return;

    // The paper meets the strip above the header's baseline exactly while the line has crossed it.
    let observer: IntersectionObserver | undefined;
    const observe = () => {
      observer?.disconnect();
      const baseline = header.getBoundingClientRect().bottom;
      const below = Math.max(0, window.innerHeight - Math.round(baseline));
      observer = new IntersectionObserver(
        ([entry]) =>
          setReading({ pathname, surface: entry.boundingClientRect.top > baseline ? "scene" : "paper" }),
        { rootMargin: `0px 0px -${below}px 0px` },
      );
      observer.observe(paper);
    };

    observe();
    window.addEventListener("resize", observe);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", observe);
    };
  }, [pathname]);

  return (
    <header
      ref={ref}
      data-slot="site-header"
      data-surface={reading?.pathname === pathname ? reading.surface : undefined}
      className={className}>
      {children}
    </header>
  );
}
