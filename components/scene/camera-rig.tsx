"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { PerspectiveCamera } from "three";

import type { SceneLayout } from "@/content/schema";
import { flyTo, overviewFov, rigPose, startRig, stepRig, type CameraPose } from "@/lib/scene/camera";
import { toThree } from "@/lib/scene/frame";
import { isFlying, type SelectionStore } from "@/lib/scene/selection";

/**
 * Moves the camera (`lib/scene/camera.ts`). At overview: the slow idle drift
 * and a slight lean toward the cursor, which only a mouse or pen has. On
 * each new flight in the selection store it flies from wherever it is to the
 * selected House's hero angle, or back out to overview, and reports the
 * landing; while it flies, the Houses under a still pointer are picked
 * again. The lens widens on narrow viewports. The wheel is left alone, so
 * it always scrolls the page.
 */
export function CameraRig({
  overview,
  heroes,
  store,
}: {
  overview: SceneLayout["overview"];
  /** Each House's hero angle, by Project slug. */
  heroes: Record<string, CameraPose>;
  store: SelectionStore;
}) {
  const get = useThree((s) => s.get);
  const canvas = useThree((s) => s.gl.domElement);
  const aspect = useThree((s) => s.size.width / s.size.height);
  const events = useThree((s) => s.events);
  const rig = useRef(startRig());
  const pointer = useRef<[number, number]>(undefined);

  useLayoutEffect(() => {
    const camera = get().camera as PerspectiveCamera;
    camera.fov = overviewFov(aspect);
    camera.updateProjectionMatrix();
  }, [get, aspect]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = canvas.getBoundingClientRect();
      pointer.current = [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2];
    };
    const leave = () => {
      pointer.current = undefined;
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    return () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
    };
  }, [canvas]);

  useEffect(
    () =>
      store.subscribe((next, prev) => {
        if (next.flight === prev.flight) return;
        const shot = next.selected ? heroes[next.selected] : "overview";
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        rig.current = flyTo(overview, rig.current, shot, { reducedMotion });
      }),
    [store, overview, heroes],
  );

  useFrame(({ camera }, dt) => {
    const flying = !!rig.current.flight;
    rig.current = stepRig(rig.current, { dt, pointer: pointer.current });
    const pose = rigPose(overview, rig.current);
    camera.position.set(...toThree(pose.position));
    camera.lookAt(...toThree(pose.lookAt));
    // the Houses move under the pointer, which picks only when it moves itself
    if (flying && pointer.current) {
      camera.updateMatrixWorld();
      events.update?.();
    }

    const { phase, flight } = store.get();
    if (isFlying(phase) && !rig.current.flight) {
      store.dispatch({ type: "arrive", flight });
    }
  });

  return null;
}
