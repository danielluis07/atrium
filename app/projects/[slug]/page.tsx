import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { sectionHeadClass } from "@/components/home/depth";
import { DataBlock } from "@/components/site/data-block";
import { focusClass, labelClass, RailLabel } from "@/components/site/label";
import { getNextProject, getProject, getProjects } from "@/content";
import type { Project } from "@/content/schema";
import { studio } from "@/content/site";
import { formatArea, formatElevation } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Only the Projects in Content have a page; any other slug is the 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return getProjects().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const project = getProject((await params).slug);
  if (!project) return {};
  return {
    title: project.name,
    description: project.lede,
    openGraph: {
      title: `${project.name} — ${studio.name}`,
      description: project.lede,
      type: "article",
    },
  };
}

/**
 * A Project page: the Project Panel unfolded into a full sheet. The title
 * block, the hero image, the Site / Light / Material write-up alternating
 * with its images, then the next Project.
 */
export default async function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();
  const projects = getProjects();
  const number = projects.findIndex((p) => p.slug === slug) + 1;
  const next = getNextProject(slug);
  const { images, writeUp } = project;

  return (
    <main className="page-frame flex-1">
      <header data-slot="title-block" className="page-grid gap-y-8 pt-16 pb-12 md:pt-24 md:pb-16">
        <RailLabel className="md:pt-4">
          Project {pad(number)} / {pad(projects.length)}
        </RailLabel>
        <div className="col-span-12 md:col-span-6 md:col-start-3">
          <h1 className="text-display">{project.name}</h1>
          <p className="mt-6 max-w-[40ch] font-heading text-[clamp(1.25rem,1.8vw,1.625rem)] leading-[1.3] font-light">
            {project.lede}
          </p>
        </div>
        <DataBlock
          className="col-span-12 self-end md:col-span-3 md:col-start-10"
          items={[
            { label: "Location", value: project.location },
            { label: "Elevation", value: formatElevation(project.elevation) },
            { label: "Year", value: project.year },
            { label: "Area", value: formatArea(project.floorArea) },
          ]}
        />
      </header>

      <figure data-slot="hero" className="relative aspect-4/3 overflow-hidden bg-muted md:aspect-16/9">
        <Image
          src={images.hero.src}
          alt={images.hero.alt}
          fill
          preload
          sizes="(min-width: 96rem) 91rem, 100vw"
          className="object-cover"
        />
      </figure>

      <div className="space-y-20 py-20 md:space-y-32 md:py-32">
        <Part n={1} title="Site" paragraphs={writeUp.site}>
          <Figure image={images.site} className="md:col-span-10 md:col-start-3 md:aspect-16/9" />
        </Part>
        <Part n={2} title="Light" paragraphs={writeUp.light} side="right">
          <Figure image={images.light} className="md:col-span-6 md:col-start-3 md:row-start-1" />
          <Figure image={images.interior} className="md:col-span-8 md:col-start-5 md:aspect-16/9" />
        </Part>
        <Part n={3} title="Material" paragraphs={writeUp.material}>
          <Figure image={images.material} className="md:col-span-5 md:col-start-8 md:row-start-1 md:aspect-4/5" />
        </Part>
      </div>

      <nav aria-label="Next project" className="page-grid border-t">
        <Link
          href={`/projects/${next.slug}`}
          className={cn(
            "group col-span-12 flex items-baseline justify-between gap-6 py-8 md:col-span-10 md:col-start-3 md:py-12",
            focusClass,
            "focus-visible:outline-offset-0",
          )}>
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <span className={labelClass}>Next project:</span>{" "}
            <span className={cn(sectionHeadClass, "transition-colors duration-200 group-hover:text-muted-foreground")}>
              {next.name}
            </span>
          </span>
          <span aria-hidden="true" className={sectionHeadClass}>
            →
          </span>
        </Link>
      </nav>
    </main>
  );
}

/**
 * One part of the write-up: its rail label, the paragraphs, and its images.
 * On desktop the text sits in columns 3–7, or 9–12 beside an image when
 * `side` is right; on mobile everything stacks.
 */
function Part({
  n,
  title,
  paragraphs,
  side = "left",
  children,
}: {
  n: number;
  title: string;
  paragraphs: string[];
  side?: "left" | "right";
  children: React.ReactNode;
}) {
  const id = `write-up-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="page-grid gap-y-8 md:gap-y-16">
      <h2 id={id} className={cn(labelClass, "col-span-12 md:col-span-2 md:row-start-1 md:pt-1.5")}>
        {pad(n)} {title}
      </h2>
      <div
        className={cn(
          "col-span-12 max-w-[65ch] space-y-4 md:row-start-1",
          side === "left" ? "md:col-span-5 md:col-start-3" : "md:col-span-4 md:col-start-9 md:self-end",
        )}>
        {paragraphs.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </div>
      {children}
    </section>
  );
}

function Figure({ image, className }: { image: Project["images"]["hero"]; className?: string }) {
  return (
    <figure className={cn("relative col-span-12 aspect-4/3 overflow-hidden bg-muted", className)}>
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes="(min-width: 96rem) 76rem, (min-width: 48rem) 80vw, 100vw"
        className="object-cover"
      />
    </figure>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
