"use client";

import dynamic from "next/dynamic";
import {
  Component,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { preload } from "react-dom";

import { ProjectPanel } from "@/components/home/project-panel";
import { useSelection } from "@/components/scene/use-selection";
import type { SceneLayout, SceneProject } from "@/content/schema";
import { sceneDownloads } from "@/lib/scene/assets";
import { isCovered, measureCut, REST, type Cut } from "@/lib/scene/cut";
import { classifyGpu } from "@/lib/scene/gpu";
import { readLowestRung, rememberRung } from "@/lib/scene/memory";
import {
  chooseScenePath,
  chooseWithoutGpu,
  sceneOverride,
  type SceneCapabilities,
  type SceneChoice,
} from "@/lib/scene/policy";
import { createSelectionStore, type Selection } from "@/lib/scene/selection";
import { cn } from "@/lib/utils";

const Scene = dynamic(() => import("@/components/scene/scene"), { ssr: false });

/**
 * The live Scene over the still. Picks the Scene path once per session: when
 * the GPU's tier decides it, the Scene's downloads start while detect-gpu
 * classifies, and the Canvas mounts only once the path and start rung are
 * known, so the pipeline compiles once. The Canvas fades in over the still
 * once its first frame is drawn, renders only until the paper covers the
 * stage and while the tab is visible, and steps down the ladder when frames
 * run long. As the Section Cut's line rises the camera drops toward the
 * snow. Selecting a House opens its Project Panel beside it, and scrolling
 * closes it again; the selection lives here, so every visit starts at
 * overview.
 *
 * To the keyboard and assistive tech the Scene is a listbox of the four
 * Projects: Tab reaches it, ↑/↓ (and Home/End) move between the Houses,
 * lighting and naming the one the keyboard is on, and Enter or Space
 * selects it. ←/→ stay free to orbit a selected House. A status beside the
 * Scene announces the open Project.
 */
export function LiveScene({ layout, projects }: { layout: SceneLayout; projects: SceneProject[] }) {
  const decision = useSyncExternalStore(onDecision, getDecision, () => undefined);
  const tabVisible = useSyncExternalStore(onVisibilityChange, isTabVisible, () => true);
  // where the Section Cut's line is: read by the camera every frame, and whether the paper covers the stage
  const cut = useRef<Cut>(REST);
  const [covered, setCovered] = useState(false);
  const [ready, setReady] = useState(false);
  const [stepped, setStepped] = useState<number>();
  const [store] = useState(createSelectionStore);
  const cursor = useSelection(store, sceneCursor);
  const selected = useSelection(store, (s) => s.selected);
  // the House the keyboard is on; a House the pointer selects becomes it too
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState(selected);
  if (selected !== seen) {
    setSeen(selected);
    const i = projects.findIndex((p) => p.slug === selected);
    if (i >= 0) setActive(i);
  }
  const id = useId();
  const optionId = (slug: string) => `${id}-${slug}`;
  const open = projects.find((p) => p.slug === selected);
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
    const line = stage?.closest('[data-slot="section-cut"]')?.querySelector('[data-slot="section-line"]');
    if (!live || !stage || !line) return;
    const header = document.querySelector("header");
    const measure = () => {
      const { top, height } = stage.getBoundingClientRect();
      const next = measureCut({
        stage: { top, height },
        line: line.getBoundingClientRect().top,
        baseline: header?.getBoundingClientRect().bottom ?? 0,
      });
      // scrolling with a House selected closes it, and the drop absorbs its fly-back
      if (next.progress > 0 && next.progress !== cut.current.progress && store.get().selected) {
        store.dispatch({ type: "close" });
      }
      cut.current = next;
      setCovered(isCovered(next));
    };
    // and again once the Canvas is in, which lengthens the cut (`app/globals.css`)
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [live, store, ready]);

  const rendering = !!live && !covered && tabVisible;

  const stepDown = (next: number) => {
    setStepped(next);
    if (!decision?.forced) rememberRung("desktop", next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const last = projects.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: active === last ? 0 : active + 1,
      ArrowUp: active === 0 ? last : active - 1,
      Home: 0,
      End: last,
    };
    const move = moves[e.key];
    if (move !== undefined) {
      e.preventDefault();
      setActive(move);
      store.dispatch({ type: "focus", slug: projects[move].slug });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      store.dispatch({ type: "focus", slug: projects[active].slug });
      store.dispatch({ type: "select", slug: projects[active].slug });
    }
  };

  return (
    <>
      {/* tabbable once its first frame is in; the Project Panel hands focus back to it */}
      <div
        ref={ref}
        tabIndex={live ? (ready ? 0 : -1) : undefined}
        role={live ? "listbox" : undefined}
        aria-label={live ? "Projects in the Scene" : undefined}
        aria-describedby={live ? `${id}-keys` : undefined}
        aria-activedescendant={live ? optionId(projects[active].slug) : undefined}
        aria-hidden={live ? undefined : "true"}
        onKeyDown={live ? onKeyDown : undefined}
        onFocus={(e) => {
          // a click on the Scene is the pointer's; Tab, or focus handed back by the Panel, lights a House
          if (e.target === e.currentTarget && e.currentTarget.matches(":focus-visible")) {
            store.dispatch({ type: "focus", slug: projects[active].slug });
          }
        }}
        onBlur={(e) => {
          if (e.target === e.currentTarget) store.dispatch({ type: "focus" });
        }}
        data-slot="live-scene"
        data-scene-path={choice?.path}
        data-scene-rung={rung}
        data-scene-ready={live ? ready : undefined}
        data-rendering={live ? rendering : undefined}
        className={cn(
          "absolute inset-0 outline-none transition-opacity focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-background duration-400 ease-in-out",
          ready ? "opacity-100" : "opacity-0",
          cursor,
        )}>
        {live &&
          projects.map((p) => (
            // what assistive tech lists and selects; the Houses themselves are drawn in the Canvas
            <div
              key={p.slug}
              id={optionId(p.slug)}
              role="option"
              aria-selected={p.slug === selected}
              onClick={() => store.dispatch({ type: "select", slug: p.slug })}
              className="sr-only">
              {p.name}
            </div>
          ))}
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
              cut={cut}
              onReady={() => setReady(true)}
            />
          </StillOnError>
        )}
      </div>
      {live && (
        <>
          {/* beside the listbox, not in it: the non-modal Panel is owned (`aria-owns`) and tabbed to where it renders */}
          <ProjectPanel store={store} projects={projects} scene={ref} />
          <p id={`${id}-keys`} hidden>
            Up and down arrows move between the Houses, and Enter opens one. At an open House, left and right
            arrows turn around it.
          </p>
          <p role="status" className="sr-only">
            {open && `${open.name} is open.`}
          </p>
        </>
      )}
    </>
  );
}

/** Over the Scene: grabbing while a drag orbits, a pointer over a House, and grab while a House is selected. */
function sceneCursor({ dragging, hovered, selected }: Selection): string | undefined {
  if (dragging) return "cursor-grabbing";
  if (hovered) return "cursor-pointer";
  if (selected) return "cursor-grab";
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
