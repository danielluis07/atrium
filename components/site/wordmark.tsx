import Link from "next/link";

import { focusClass } from "@/components/site/label";
import { cn } from "@/lib/utils";

/** The mark: an atrium in plan, a square with a square void at its center. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      aria-hidden="true"
      className={cn("size-5", className)}>
      <rect x="0.5" y="0.5" width="19" height="19" vectorEffect="non-scaling-stroke" />
      <rect x="7" y="7" width="6" height="6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2.5 text-foreground",
        focusClass,
        className,
      )}>
      <Mark />
      <span className="font-heading text-2xl leading-none font-normal lowercase">
        atrium
      </span>
    </Link>
  );
}
