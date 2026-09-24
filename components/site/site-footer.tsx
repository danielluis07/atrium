import { focusClass, labelClass } from "@/components/site/label";
import { Wordmark } from "@/components/site/wordmark";
import { footer, studio } from "@/content/site";
import { cn } from "@/lib/utils";

export function SiteFooter() {
  return (
    <footer>
      <div className="page-frame">
        <div className="page-grid gap-y-6 border-t py-10">
          <div className="col-span-12 md:col-span-2">
            <Wordmark />
          </div>
          <p className={cn(labelClass, "col-span-12 self-center md:col-span-3 md:col-start-3")}>
            {studio.location}
          </p>
          <a
            href={`mailto:${studio.email}`}
            className={cn(
              "col-span-12 self-center font-mono text-sm md:col-span-3",
              focusClass,
            )}>
            {studio.email}
          </a>
          <p className="col-span-12 self-center text-sm text-muted-foreground md:col-span-4 md:text-right">
            {footer.line}
          </p>
        </div>
      </div>
    </footer>
  );
}
