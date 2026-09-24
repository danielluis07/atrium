import type { Metadata } from "next";

import { Approach } from "@/components/home/approach";
import { Contact } from "@/components/home/contact";
import { HeroStill } from "@/components/home/hero-still";
import { ProjectIndex } from "@/components/home/project-index";
import { Studio } from "@/components/home/studio";
import { studio } from "@/content/site";

export const metadata: Metadata = {
  description: studio.statement,
  openGraph: { title: studio.name, description: studio.statement },
};

export default function Home() {
  return (
    <main className="flex-1">
      <h1 className="sr-only">{studio.name}</h1>
      <HeroStill />
      <ProjectIndex />
      <Studio />
      <Approach />
      <Contact />
    </main>
  );
}
