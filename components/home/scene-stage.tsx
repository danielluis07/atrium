import Image from "next/image";

import { LiveScene } from "@/components/home/live-scene";
import { getProjects, getSceneLayout } from "@/content";
import { sceneProject } from "@/content/schema";

/**
 * The Scene at grade (±0.00): a full-viewport stage under the header, held
 * in place while the paper rises over it (`components/home/section-cut.tsx`).
 * The pre-rendered still is the first paint, the loading state and the
 * whole view without JavaScript; on a live path the Canvas fades in over it.
 */
export function SceneStage() {
  return (
    <section aria-label="Scene" data-depth={0} className="relative h-[calc(var(--stage-height)+var(--cut))]">
      <div
        data-slot="scene-stage"
        className="sticky top-0 h-(--stage-height) overflow-hidden bg-[oklch(0.26_0.06_262)]">
        <Image
          src="/scene/still.avif"
          alt="Four concrete houses on a snowy slope above a fjord at blue hour, their windows lit."
          fill
          preload
          sizes="100vw"
          className="object-cover object-bottom"
        />
        <LiveScene layout={getSceneLayout()} projects={getProjects().map(sceneProject)} />
      </div>
    </section>
  );
}
