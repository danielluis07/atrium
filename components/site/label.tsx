import { cn } from "@/lib/utils";

/** Drawing-legend type: Geist Mono, 11px, uppercase, tracked, concrete mid. */
export const labelClass =
  "font-mono text-[0.6875rem] leading-4 tracking-[0.12em] uppercase text-muted-foreground";

/** Keyboard focus on paper: an ink hairline, offset from the text. */
export const focusClass =
  "outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-offset-4";

/**
 * A mono label in the margin rail (columns 1–2). On mobile the rail folds
 * and the label sits above its block.
 */
export function RailLabel({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(labelClass, "col-span-12 md:col-span-2", className)}
      {...props}
    />
  );
}
