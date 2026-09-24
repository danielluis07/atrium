"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { PerspectiveCamera } from "three";

import type { SceneLayout } from "@/content/schema";
import { overviewFov, overviewPose, startOverview, stepOverview } from "@/lib/scene/camera";
import { toThree } from "@/lib/scene/frame";

/**
 * Moves the camera at overview (`lib/scene/camera.ts`): the slow idle drift
 * and a slight lean toward the cursor, which only a mouse or pen has. The
 * lens widens on narrow viewports. The wheel is left alone, so it always
 * scrolls the page.
 */
export function CameraRig({ overview }: { overview: SceneLayout["overview"] }) {
  const get = useThree((s) => s.get);
  const canvas = useThree((s) => s.gl.domElement);
  const aspect = useThree((s) => s.size.width / s.size.height);
  const rig = useRef(startOverview());
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

  useFrame(({ camera }, dt) => {
    rig.current = stepOverview(rig.current, { dt, pointer: pointer.current });
    const pose = overviewPose(overview, rig.current);
    camera.position.set(...toThree(pose.position));
    camera.lookAt(...toThree(pose.lookAt));
  });

  return null;
}
