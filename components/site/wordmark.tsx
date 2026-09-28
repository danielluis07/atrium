import Link from "next/link";

import { focusClass } from "@/components/site/label";
import { cn } from "@/lib/utils";

/** Atrium's modernist house mark: offset volumes around a central court. */
export function AtriumMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-5", className)}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 3h15v3h5v15H8v-3H2V3Zm6 5h8v8H8V8Z"
      />
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
      <AtriumMark />
      <span className="font-heading text-2xl leading-none font-normal lowercase">
        atrium
      </span>
    </Link>
  );
}
