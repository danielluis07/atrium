import Image from "next/image";

import { LiveScene } from "@/components/home/live-scene";
import { getSceneLayout } from "@/content";

/**
 * The Scene at grade (±0.00): a stage held under the header while the
 * section scrolls. The pre-rendered still is the first paint, the loading
 * state and the whole view without JavaScript; on a live path the Canvas
 * fades in over it. The Section Cut will lengthen the section so that
 * scrolling drives the camera drop; for now the stage scrolls away with it.
 */
export function SceneStage() {
  return (
    <section aria-label="Scene" data-depth={0} className="relative">
      <div
        data-slot="scene-stage"
        className="sticky top-(--header-height) h-[calc(100svh-var(--header-height))] min-h-96 overflow-hidden bg-[oklch(0.26_0.06_262)]">
        <Image
          src="/scene/still.avif"
          alt="Four concrete houses on a snowy slope above a fjord at blue hour, their windows lit."
          fill
          preload
          sizes="100vw"
          className="object-cover object-bottom"
        />
        <LiveScene layout={getSceneLayout()} />
      </div>
    </section>
  );
}
