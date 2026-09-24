import { Depth } from "@/components/home/depth";
import { DataBlock } from "@/components/site/data-block";
import { getProjects } from "@/content";
import { studio } from "@/content/site";

/** −2.00 Studio: the display statement, a few paragraphs and the data block. */
export function Studio() {
  return (
    <Depth id="studio">
      <p className="col-span-12 max-w-[26ch] font-heading text-[clamp(2rem,4.2vw,3.75rem)] leading-[1.08] font-light tracking-[-0.02em] md:col-span-10 md:col-start-3">
        {studio.statement}
      </p>
      <div className="col-span-12 max-w-[65ch] space-y-4 md:col-span-6 md:col-start-3">
        {studio.paragraphs.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </div>
      <DataBlock
        className="col-span-12 self-start md:col-span-3 md:col-start-10"
        items={[
          { label: "Founded", value: studio.founded },
          { label: "Based", value: studio.location },
          { label: "Projects", value: getProjects().length },
        ]}
      />
    </Depth>
  );
}
