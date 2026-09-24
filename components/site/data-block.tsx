import { labelClass } from "@/components/site/label";
import { cn } from "@/lib/utils";

/**
 * Mono data cells separated by hairlines, like the title block of a drawing:
 * the label on the left, the value beside it.
 */
export function DataBlock({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("border-t", className)}>
      {items.map(({ label, value }) => (
        <div key={label} className="flex items-baseline justify-between gap-4 border-b py-3">
          <dt className={labelClass}>{label}</dt>
          <dd className="text-right font-mono text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
