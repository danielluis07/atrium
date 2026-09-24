"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { formatDepth } from "@/lib/depth";
import { cn } from "@/lib/utils";

/**
 * The header's current Depth: the last `[data-depth]` mark on the page whose
 * top has passed the header's baseline. `±0.00` over the Scene, `▽ −1.00`…
 * below grade. A page without marks shows nothing.
 */
export function DepthReadout({ className }: { className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const pathname = usePathname();
  // Keyed by path, so a stale reading never shows after a navigation.
  const [reading, setReading] = useState<{ pathname: string; depth: number } | null>(null);

  useEffect(() => {
    const marks = [...document.querySelectorAll<HTMLElement>("[data-depth]")];
    if (!marks.length) return;
    const header = ref.current?.closest("header");

    const update = () => {
      const baseline = header?.getBoundingClientRect().bottom ?? 0;
      let current = marks[0];
      for (const mark of marks) {
        if (mark.getBoundingClientRect().top <= baseline + 1) current = mark;
      }
      setReading({ pathname, depth: Number(current.dataset.depth) });
    };

    // A 1px line just under the header: a mark crossing it changes the reading.
    let observer: IntersectionObserver | undefined;
    const observe = () => {
      observer?.disconnect();
      const baseline = Math.round(header?.getBoundingClientRect().bottom ?? 0);
      const below = Math.max(0, window.innerHeight - baseline - 1);
      observer = new IntersectionObserver(update, {
        rootMargin: `-${baseline}px 0px -${below}px 0px`,
      });
      for (const mark of marks) observer.observe(mark);
    };

    observe();
    window.addEventListener("resize", observe);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", observe);
    };
  }, [pathname]);

  const depth = reading?.pathname === pathname ? reading.depth : null;
  return (
    <p
      ref={ref}
      aria-hidden="true"
      data-slot="depth-readout"
      className={cn("min-w-[8ch] text-right font-mono text-xs tracking-[0.12em] tabular-nums", className)}>
      {depth === null ? null : formatDepth(depth)}
    </p>
  );
}
