"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { preload } from "react-dom";

import { ProjectPanel } from "@/components/home/project-panel";
import { useSelection } from "@/components/scene/use-selection";
import type { SceneLayout, SceneProject } from "@/content/schema";
import { sceneDownloads } from "@/lib/scene/assets";
import { classifyGpu } from "@/lib/scene/gpu";
import { readLowestRung, rememberRung } from "@/lib/scene/memory";
import {
  chooseScenePath,
  chooseWithoutGpu,
  sceneOverride,
  type SceneCapabilities,
  type SceneChoice,
} from "@/lib/scene/policy";
import { createSelectionStore } from "@/lib/scene/selection";
import { cn } from "@/lib/utils";

const Scene = dynamic(() => import("@/components/scene/scene"), { ssr: false });

/**
 * The live Scene over the still. Picks the Scene path once per session: when
 * the GPU's tier decides it, the Scene's downloads start while detect-gpu
 * classifies, and the Canvas mounts only once the path and start rung are
 * known, so the pipeline compiles once. The Canvas fades in over the still
 * once its first frame is drawn, renders only while the stage is on screen
 * and the tab is visible, and steps down the ladder when frames run long.
 * Selecting a House opens its Project Panel beside it; the selection lives
 * here, so every visit starts at overview.
 */
export function LiveScene({ layout, projects }: { layout: SceneLayout; projects: SceneProject[] }) {
  const decision = useSyncExternalStore(onDecision, getDecision, () => undefined);
  const tabVisible = useSyncExternalStore(onVisibilityChange, isTabVisible, () => true);
  const [onScreen, setOnScreen] = useState(true);
  const [ready, setReady] = useState(false);
  const [stepped, setStepped] = useState<number>();
  const [store] = useState(createSelectionStore);
  const hovered = useSelection(store, (s) => !!s.hovered);
  const ref = useRef<HTMLDivElement>(null);
  const choice = decision?.choice;
  // the mobile Scene isn't built yet, so touch keeps the still
  const live = choice && (choice.path === "target" || choice.path === "lean") ? choice : undefined;
  const rung = live && (stepped ?? live.rung);

  if (live || decision?.preload) {
    for (const url of sceneDownloads(Object.keys(layout.houses))) {
      preload(url, { as: "fetch", crossOrigin: "anonymous" });
    }
  }

  useEffect(() => {
    const stage = ref.current;
    if (!live || !stage) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(stage);
    return () => observer.disconnect();
  }, [live]);

  const rendering = !!live && onScreen && tabVisible;

  const stepDown = (next: number) => {
    setStepped(next);
    if (!decision?.forced) rememberRung("desktop", next);
  };

  return (
    // focusable so the Project Panel can hand focus back to the Scene
    <div
      ref={ref}
      tabIndex={live ? -1 : undefined}
      aria-label={live ? "Scene" : undefined}
      aria-hidden={live ? undefined : "true"}
      role={live ? "group" : undefined}
      data-slot="live-scene"
      data-scene-path={choice?.path}
      data-scene-rung={rung}
      data-scene-ready={live ? ready : undefined}
      data-rendering={live ? rendering : undefined}
      className={cn(
        "absolute inset-0 outline-none transition-opacity focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-background duration-400 ease-in-out",
        ready ? "opacity-100" : "opacity-0",
        hovered && "cursor-pointer",
      )}>
      {live && rung && (
        <StillOnError>
          <Scene
            layout={layout}
            projects={projects}
            store={store}
            ladder="desktop"
            rung={rung}
            onStepDown={stepDown}
            active={rendering}
            onReady={() => setReady(true)}
          />
          <ProjectPanel store={store} projects={projects} scene={ref} />
        </StillOnError>
      )}
    </div>
  );
}

/** A Scene that fails leaves the still in place rather than taking the page down with it. */
class StillOnError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("The live Scene failed; showing the still.", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// ---------------------------------------------------------------- the path, chosen once per session

type Decision = {
  /** Undefined while the GPU's tier is being classified. */
  choice?: SceneChoice;
  /** Whether `?scene=` forced the path; a forced session leaves no memory. */
  forced: boolean;
  /** Whether the desktop Scene's downloads are worth starting before the tier is in. */
  preload: boolean;
};

let caps: SceneCapabilities | undefined;
let decision: Decision | undefined;
let classifying: Promise<void> | undefined;
const listeners = new Set<() => void>();

function getDecision(): Decision {
  if (decision) return decision;
  caps = capabilities();
  const settled = chooseWithoutGpu(caps);
  decision = { choice: settled, forced: !!caps.override, preload: !settled && !caps.touchPrimary };
  return decision;
}

/** Starts the GPU classification on the first subscriber, when the path waits on it. */
function onDecision(callback: () => void) {
  listeners.add(callback);
  if (!getDecision().choice && !classifying) {
    classifying = classifyGpu().then((gpu) => {
      const lowest = { desktop: readLowestRung("desktop"), mobile: readLowestRung("mobile") };
      decision = { ...getDecision(), choice: chooseScenePath({ ...caps!, gpu, lowest }) };
      for (const listener of listeners) listener();
    });
  }
  return () => {
    listeners.delete(callback);
  };
}

function capabilities(): SceneCapabilities {
  const media = (query: string) => window.matchMedia(query).matches;
  const override = sceneOverride(window.location.search);
  if (override) return { override, reducedMotion: false, touchPrimary: false, webgl2: true };
  const reducedMotion = media("(prefers-reduced-motion: reduce)");
  const touchPrimary = media("(pointer: coarse)") && !media("(hover: hover)");
  // only probe the GPU when nothing else has decided
  if (reducedMotion) return { reducedMotion, touchPrimary, webgl2: true };
  return { reducedMotion, touchPrimary, ...probeWebGL() };
}

/** Whether a WebGL2 context comes up without a major performance caveat, and on what renderer. */
function probeWebGL(): { webgl2: boolean; renderer?: string } {
  try {
    const gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return { webgl2: false };
    let renderer = String(gl.getParameter(gl.RENDERER));
    // Chrome masks RENDERER; Firefox deprecated the extension and unmasks RENDERER instead
    if (/^webkit webgl$/i.test(renderer)) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { webgl2: true, renderer };
  } catch {
    return { webgl2: false };
  }
}

// ---------------------------------------------------------------- tab visibility

function onVisibilityChange(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

const isTabVisible = () => document.visibilityState === "visible";
