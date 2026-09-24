import { Depth, sectionHeadClass } from "@/components/home/depth";
import { DataBlock } from "@/components/site/data-block";
import { focusClass } from "@/components/site/label";
import { contact, studio } from "@/content/site";
import { cn } from "@/lib/utils";

/**
 * −4.00 Contact: one line, the email and the location. It fills the rest of
 * the viewport so its anchor can bring it up under the header.
 */
export function Contact() {
  return (
    <Depth id="contact" className="min-h-[calc(100svh-var(--header-height))]">
      <div className="col-span-12 md:col-span-6 md:col-start-3">
        <p className={sectionHeadClass}>{contact.line}</p>
        <a
          href={`mailto:${studio.email}`}
          className={cn(
            "mt-10 inline-block border-b border-foreground pb-0.5 text-lg md:text-xl",
            focusClass,
          )}>
          {studio.email}
        </a>
      </div>
      <DataBlock
        className="col-span-12 self-start md:col-span-3 md:col-start-10"
        items={[{ label: "Based", value: studio.location }]}
      />
    </Depth>
  );
}
