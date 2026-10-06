import { useEffect, useState } from "react";

import { AtriumMark } from "@/components/site/wordmark";
import { studio } from "@/content/site";
import {
  clearThreshold,
  downloadProgress,
  THRESHOLD_ATTRIBUTE,
  THRESHOLD_FADE_MS,
  type ThresholdState,
} from "@/lib/scene/threshold";

/**
 * The Threshold (`lib/scene/threshold.ts`): the Mark, the wordmark, the
 * studio's line and the Scene's load on a hairline scale bar, over the dusk
 * sky with slow snow behind. It is always in the markup and shown only while
 * `<html data-threshold>` holds it up (`app/globals.css`), so the inline
 * script can raise it before first paint. It never takes focus.
 */
export function Threshold({ progress }: { progress: number }) {
  const percent = Math.round(progress * 100);
  return (
    <div
      data-slot="threshold"
      className="absolute inset-0 z-10 flex-col items-center justify-center overflow-hidden bg-[oklch(0.26_0.06_262)] px-4 text-primary-foreground">
      <div aria-hidden="true" className="threshold-snow absolute inset-0" />
      <div className="relative flex max-w-sm flex-col items-center text-center">
        <div className="inline-flex items-center gap-3">
          <AtriumMark className="size-7" />
          <span className="font-heading text-4xl leading-none font-normal lowercase">atrium</span>
        </div>
        <p className="mt-6 text-sm leading-relaxed text-primary-foreground/70">{studio.description}</p>
        <div
          role="progressbar"
          aria-label="Loading the Scene"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-10 w-48">
          <p className="font-mono text-[0.6875rem] leading-4 tracking-[0.12em] text-primary-foreground/70 uppercase tabular-nums">
            Loading scene · {percent}%
          </p>
          <div className="mt-2 h-px bg-primary-foreground/20">
            <div
              className="h-full origin-left bg-primary-foreground transition-transform duration-300 ease-out"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const isRaised = () => document.documentElement.hasAttribute(THRESHOLD_ATTRIBUTE);
const lower = () => document.documentElement.removeAttribute(THRESHOLD_ATTRIBUTE);

/**
 * Drives a raised Threshold from the live Scene: reports the share of the
 * Scene's `downloads` finished, from the page's resource timings, and clears
 * it when `clearThreshold` says so. Scroll is only watched, never held.
 */
export function useThreshold({
  path,
  ready,
  downloads,
}: Pick<ThresholdState, "path" | "ready"> & { downloads: string[] }): number {
  const [progress, setProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const wanted = downloads.join(" ");

  useEffect(() => {
    if (!wanted || !isRaised() || typeof PerformanceObserver === "undefined") return;
    const urls = wanted.split(" ");
    const finished = new Set<string>();
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) finished.add(entry.name);
      setProgress(downloadProgress(urls, finished));
    });
    // `buffered` replays what finished before the observer
    observer.observe({ type: "resource", buffered: true });
    return () => observer.disconnect();
  }, [wanted]);

  useEffect(() => {
    if (!isRaised()) return;
    const onScroll = () => {
      if (window.scrollY > 0) setScrolled(true);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!isRaised()) return;
    // the script raised it during the document's first parse, so time on screen is time since navigation
    const clear = clearThreshold({ path, ready, scrolled, shownFor: performance.now() });
    if (!clear) return;
    if (clear.how === "cut") return lower();
    const fade = setTimeout(() => document.documentElement.setAttribute(THRESHOLD_ATTRIBUTE, "clearing"), clear.after);
    const gone = setTimeout(lower, clear.after + THRESHOLD_FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [path, ready, scrolled]);

  return ready ? 1 : progress;
}
