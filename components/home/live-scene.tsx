"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { preload } from "react-dom";

import type { SceneLayout } from "@/content/schema";
import { sceneDownloads } from "@/lib/scene/assets";
import { chooseScenePath, sceneOverride, type ScenePath } from "@/lib/scene/policy";
import { cn } from "@/lib/utils";

const Scene = dynamic(() => import("@/components/scene/scene"), { ssr: false });

/**
 * The live Scene over the still. Picks the Scene path once per session;
 * on a live path it starts the Scene's code and downloads together, and
 * fades the Canvas in over the still once its first frame is drawn. Renders
 * only while the stage is on screen and the tab is visible.
 */
export function LiveScene({ layout }: { layout: SceneLayout }) {
  const path = useSyncExternalStore(noSubscription, scenePath, () => null);
  const tabVisible = useSyncExternalStore(onVisibilityChange, isTabVisible, () => true);
  const [onScreen, setOnScreen] = useState(true);
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const live = path === "lean";

  if (live) {
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

  const rendering = live && onScreen && tabVisible;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-slot="live-scene"
      data-scene-path={path ?? undefined}
      data-scene-ready={live ? ready : undefined}
      data-rendering={live ? rendering : undefined}
      className={cn(
        "absolute inset-0 transition-opacity duration-400 ease-in-out",
        ready ? "opacity-100" : "opacity-0",
      )}>
      {live && (
        <StillOnError>
          <Scene layout={layout} active={rendering} onReady={() => setReady(true)} />
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

let chosen: ScenePath | undefined;

function scenePath(): ScenePath {
  return (chosen ??= chooseScenePath(capabilities()));
}

const noSubscription = () => () => {};

function capabilities() {
  const media = (query: string) => window.matchMedia(query).matches;
  const override = sceneOverride(window.location.search);
  if (override) return { override, reducedMotion: false, touchPrimary: false, webgl2: true };
  const reducedMotion = media("(prefers-reduced-motion: reduce)");
  const touchPrimary = media("(pointer: coarse)") && !media("(hover: hover)");
  // only probe the GPU when nothing else has decided
  if (reducedMotion || touchPrimary) return { reducedMotion, touchPrimary, webgl2: true };
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
