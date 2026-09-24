"use client";

// the fog chunks must be replaced before anything compiles
import "@/components/scene/fog";

import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import { Atmosphere } from "@/components/scene/atmosphere";
import { CameraRig, type HouseCamera } from "@/components/scene/camera-rig";
import { HoverLabel, type LabelPoint } from "@/components/scene/hover-label";
import { Houses } from "@/components/scene/houses";
import { Mountains } from "@/components/scene/mountains";
import { Snowfall } from "@/components/scene/snowfall";
import type { SceneLayout, SceneProject } from "@/content/schema";
import type { Gesture } from "@/lib/scene/gesture";
import { monitor, startMonitor, type MonitorEvent } from "@/lib/scene/monitor";
import { ladderOf, renderConfig, type Ladder } from "@/lib/scene/rungs";
import type { SelectionStore } from "@/lib/scene/selection";

/** Exposure into the AgX tone mapper, tuned on the one-House prototype. */
const EXPOSURE = 0.8;
/** Snowflakes in the air around the camera: the mobile Scene gets fewer. */
const SNOWFLAKES = { desktop: 6000, mobile: 2000 } as const;

export type SceneProps = {
  layout: SceneLayout;
  /** The Projects the Houses stand for, with their camera blocks. */
  projects: SceneProject[];
  /** Hover and selection, shared with the Project Panel. */
  store: SelectionStore;
  ladder: Ladder;
  /** The rung the Scene renders at; it only ever moves down, through `onStepDown`. */
  rung: number;
  /** Called with the next rung when frames run long. */
  onStepDown: (rung: number) => void;
  /** Whether to render: false while the stage is off screen or the tab is hidden. */
  active: boolean;
  /** Called once the Houses have rendered their first frame. */
  onReady: () => void;
};

/**
 * The live Scene: the blue-hour sky and fog, the snow slope with its sparse
 * pines, the fjord, the distant mountains, the four baked Houses and the
 * falling snow, seen from the drifting overview camera, rendered at the
 * rung's config (DPR, MSAA, SMAA, N8AO, bloom). Hovering a House names it;
 * clicking one selects it and flies to its hero angle, where a drag or ←/→
 * orbits it, and a click on empty snow closes it. Client-only; the home
 * page loads it with SSR off.
 */
export default function Scene({ layout, projects, store, ladder, rung, onStepDown, active, onReady }: SceneProps) {
  const config = renderConfig(ladder, rung);
  const label = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>(undefined);
  const houses = useMemo(
    () =>
      Object.fromEntries(
        projects.map((p): [string, HouseCamera] => [p.slug, { camera: p.camera, placement: layout.houses[p.slug] }]),
      ),
    [projects, layout],
  );
  const placeLabel = (at: LabelPoint | undefined) => {
    const el = label.current;
    if (!el) return;
    el.style.visibility = at ? "visible" : "hidden";
    if (at) el.style.transform = `translate(${at.x}px, ${at.y}px)`;
  };
  return (
    <>
      <Canvas
        dpr={config.dpr}
        frameloop={active ? "always" : "never"}
        gl={{ antialias: false, stencil: false, powerPreference: "high-performance" }}
        camera={{ near: 0.5, far: 4000 }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = EXPOSURE;
        }}>
        <CameraRig overview={layout.overview} houses={houses} store={store} gesture={gesture} />
        <Atmosphere north={layout.north} />
        <Mountains />
        <Snowfall count={SNOWFLAKES[ladder]} />
        {/* Loaders suspend inside the Canvas: a suspension that reached the page would unmount the
            Canvas, and R3F would dispose the renderer with it. */}
        <Suspense fallback={null}>
          {/* the mobile Scene has no shadow */}
          <Houses
            layout={layout}
            shadows={ladder === "desktop"}
            store={store}
            gesture={gesture}
            onLabel={placeLabel}
          />
          <FirstFrame onReady={onReady} />
          <RungMonitor ladder={ladder} rung={rung} active={active} onStepDown={onStepDown} store={store} />
        </Suspense>
        {/* keyed by rung: the composer sizes its buffers from the canvas's CSS size, so a new DPR needs
            a new composer */}
        <EffectComposer key={rung} multisampling={config.msaa} enableNormalPass={false}>
          {config.ao && (
            <N8AO
              halfRes={config.ao === "half"}
              quality="medium"
              aoRadius={2}
              distanceFalloff={1}
              intensity={2}
            />
          )}
          {config.bloom && (
            <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.55} radius={0.6} />
          )}
          <ToneMapping mode={ToneMappingMode.AGX} />
          {config.smaa && <SMAA />}
        </EffectComposer>
      </Canvas>
      <HoverLabel ref={label} store={store} projects={projects} />
    </>
  );
}

/** Reports ready on the frame after the first one with the Houses in it. */
function FirstFrame({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 2) onReady();
  });
  return null;
}

/** Frames drawn before the monitor counts: the shader compile after load. */
const COMPILE_FRAMES = 3;

/**
 * Times every frame and steps the Scene down the ladder when they run long
 * (`lib/scene/monitor.ts`). Mounted with the Houses, so the loading and the
 * first compile are behind it. Each camera flight's start is excluded.
 */
function RungMonitor({
  ladder,
  rung,
  active,
  onStepDown,
  store,
}: Omit<SceneProps, "layout" | "projects" | "onReady">) {
  const state = useRef(startMonitor(rung, ladderOf(ladder).length));
  const frames = useRef(0);
  const last = useRef<number>(undefined);
  const onStep = useRef(onStepDown);
  useLayoutEffect(() => {
    onStep.current = onStepDown;
  });

  const dispatch = (event: MonitorEvent) => {
    const before = state.current.rung;
    state.current = monitor(state.current, event);
    if (state.current.rung !== before) onStep.current(state.current.rung);
  };

  useEffect(() => {
    dispatch({ type: "compile", compiling: true });
  }, []);

  useEffect(() => {
    dispatch({ type: "visible", visible: active });
    if (!active) last.current = undefined;
  }, [active]);

  useEffect(
    () =>
      store.subscribe((next, prev) => {
        if (next.flight !== prev.flight) dispatch({ type: "fly-to", t: performance.now() });
      }),
    [store],
  );

  useFrame(() => {
    const t = performance.now();
    const previous = last.current;
    last.current = t;
    frames.current += 1;
    if (frames.current === COMPILE_FRAMES) dispatch({ type: "compile", compiling: false });
    if (previous !== undefined) dispatch({ type: "frame", t, ms: t - previous });
  });
  return null;
}
