"use client";

// the fog chunks must be replaced before anything compiles
import "@/components/scene/fog";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useLayoutEffect, useRef } from "react";
import type { PerspectiveCamera } from "three";

import { Atmosphere } from "@/components/scene/atmosphere";
import { Houses } from "@/components/scene/houses";
import type { SceneLayout } from "@/content/schema";
import { overviewFov } from "@/lib/scene/camera";
import { toThree } from "@/lib/scene/frame";

/** Exposure into the AgX tone mapper, tuned on the one-House prototype. */
const EXPOSURE = 0.8;

export type SceneProps = {
  layout: SceneLayout;
  /** Whether to render: false while the stage is off screen or the tab is hidden. */
  active: boolean;
  /** Called once the Houses have rendered their first frame. */
  onReady: () => void;
};

/**
 * The live Scene at the Lean look (MSAA 4x + bloom at DPR 1): the blue-hour
 * sky and fog, the snow slope, the fjord and the four baked Houses, seen
 * from the overview camera. Client-only; the home page loads it with SSR off.
 */
export default function Scene({ layout, active, onReady }: SceneProps) {
  return (
    <Canvas
      dpr={1}
      frameloop={active ? "always" : "never"}
      gl={{ antialias: false, stencil: false, powerPreference: "high-performance" }}
      camera={{ near: 0.5, far: 4000 }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = EXPOSURE;
      }}>
      <OverviewCamera overview={layout.overview} />
      <Atmosphere north={layout.north} />
      {/* Loaders suspend inside the Canvas: a suspension that reached the page would unmount the
          Canvas, and R3F would dispose the renderer with it. */}
      <Suspense fallback={null}>
        <Houses layout={layout} />
        <FirstFrame onReady={onReady} />
      </Suspense>
      <EffectComposer multisampling={4} enableNormalPass={false}>
        <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.55} radius={0.6} />
        <ToneMapping mode={ToneMappingMode.AGX} />
      </EffectComposer>
    </Canvas>
  );
}

/** Stands the camera at the layout's overview, widening the lens on narrow viewports. */
function OverviewCamera({ overview }: { overview: SceneLayout["overview"] }) {
  const get = useThree((s) => s.get);
  const aspect = useThree((s) => s.size.width / s.size.height);
  useLayoutEffect(() => {
    const camera = get().camera as PerspectiveCamera;
    camera.position.set(...toThree(overview.position));
    camera.lookAt(...toThree(overview.lookAt));
    camera.fov = overviewFov(aspect);
    camera.updateProjectionMatrix();
  }, [get, overview, aspect]);
  return null;
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
