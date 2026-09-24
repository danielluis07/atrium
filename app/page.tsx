import type { Metadata } from "next";

import { Approach } from "@/components/home/approach";
import { Contact } from "@/components/home/contact";
import { ProjectIndex } from "@/components/home/project-index";
import { SceneStage } from "@/components/home/scene-stage";
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
      <SceneStage />
      <ProjectIndex />
      <Studio />
      <Approach />
      <Contact />
    </main>
  );
}
