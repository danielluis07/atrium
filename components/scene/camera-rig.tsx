"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { PerspectiveCamera } from "three";

import type { CameraBlock, Placement, SceneLayout } from "@/content/schema";
import {
  cutPose,
  cutRig,
  flyTo,
  houseShot,
  orbitRig,
  overviewFov,
  panelAim,
  startRig,
  stepRig,
} from "@/lib/scene/camera";
import type { Cut } from "@/lib/scene/cut";
import { toThree } from "@/lib/scene/frame";
import { moveGesture, pressGesture, releaseGesture, type Gesture } from "@/lib/scene/gesture";
import { dragAngle, stepAngle } from "@/lib/scene/orbit";
import { isFlying, type SelectionStore } from "@/lib/scene/selection";

/** What the rig needs of a House: its camera block and where it stands. */
export type HouseCamera = { camera: CameraBlock; placement: Placement };

/**
 * Moves the camera (`lib/scene/camera.ts`). At overview: the slow idle drift
 * and a slight lean toward the cursor, which only a mouse or pen has. On
 * each new flight in the selection store it flies from wherever it is to the
 * selected House's hero angle, or back out to overview, and reports the
 * landing; while it flies, the Houses under a still pointer are picked
 * again. The lens widens on narrow viewports. The wheel is left alone, so
 * it always scrolls the page, and the scroll drops the camera toward the
 * snow as the Section Cut's line rises (`lib/scene/cut.ts`).
 *
 * It also reads every press on the Scene (`lib/scene/gesture.ts`): a click
 * selects the House pressed (the Houses mark it in `gesture`) or closes, and
 * a mouse or pen drag at a selected House orbits it. With the Scene focused,
 * ←/→ step the orbit.
 *
 * The mobile Scene's camera is calmer: a smaller drift and sway, no lean,
 * and no orbit at all, so a selected House holds its hero angle, raised
 * above the bottom-sheet Panel.
 */
export function CameraRig({
  overview,
  houses,
  store,
  gesture,
  cut,
  mobile = false,
}: {
  overview: SceneLayout["overview"];
  /** Each House's camera block and placement, by Project slug. */
  houses: Record<string, HouseCamera>;
  store: SelectionStore;
  /** The press under way, shared with the Houses. */
  gesture: RefObject<Gesture | undefined>;
  /** Where the section line is on the stage, read every frame. */
  cut: RefObject<Cut>;
  /** Whether this is the mobile Scene's camera: calm, with no lean and no orbit. */
  mobile?: boolean;
}) {
  const get = useThree((s) => s.get);
  const canvas = useThree((s) => s.gl.domElement);
  const aspect = useThree((s) => s.size.width / s.size.height);
  const events = useThree((s) => s.events);
  // the path never changes mid-session, so the rig is calm from its start or never
  const rig = useRef(startRig({ calm: mobile }));
  const pointer = useRef<[number, number]>(undefined);

  useLayoutEffect(() => {
    const camera = get().camera as PerspectiveCamera;
    camera.fov = overviewFov(aspect);
    camera.updateProjectionMatrix();
  }, [get, aspect]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      gesture.current = pressGesture(e.clientX, e.clientY);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && !mobile) {
        const r = canvas.getBoundingClientRect();
        pointer.current = [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2];
      }
      if (!gesture.current || !e.isPrimary) return;
      const { gesture: next, drag } = moveGesture(gesture.current, e.clientX, e.clientY);
      const started = next.dragging && !gesture.current.dragging;
      gesture.current = next;
      // touch, and the mobile Scene, have no orbit: a touch drag scrolls the page
      if (!drag || e.pointerType === "touch" || mobile) return;
      if (started) {
        store.dispatch({ type: "drag", dragging: true });
        if (store.get().dragging) canvas.setPointerCapture(e.pointerId);
      }
      if (store.get().dragging) rig.current = orbitRig(rig.current, (camera, t) => dragAngle(camera, t, ...drag));
    };
    const up = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || !e.isPrimary) return;
      gesture.current = undefined;
      store.dispatch({ type: "drag", dragging: false });
      const release = releaseGesture(g);
      if (release.type !== "none") store.dispatch(release);
    };
    const cancel = () => {
      gesture.current = undefined;
      store.dispatch({ type: "drag", dragging: false });
    };
    const leave = () => {
      pointer.current = undefined;
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (mobile || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // the Scene is focused: the element that holds the canvas, not the page (the body holds it too) or
      // a control inside the Project Panel
      const focused = document.activeElement;
      const onScene = !!focused && focused !== document.body && focused !== document.documentElement;
      if (!onScene || !focused.contains(canvas) || store.get().phase !== "at-house") return;
      e.preventDefault();
      const direction = e.key === "ArrowLeft" ? -1 : 1;
      rig.current = orbitRig(rig.current, (camera, t) => stepAngle(camera, t, direction));
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("pointerleave", leave);
    window.addEventListener("keydown", key);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("pointerleave", leave);
      window.removeEventListener("keydown", key);
    };
  }, [canvas, store, gesture, mobile]);

  useEffect(
    () =>
      store.subscribe((next, prev) => {
        if (next.flight === prev.flight) return;
        const house = next.selected ? houses[next.selected] : undefined;
        // a new shot each time, so selecting the House again starts from its hero angle
        // aimed for the Panel as the viewport is shaped now
        const { size } = get();
        const aim = panelAim(mobile ? "bottom" : "right", size.width / size.height);
        const shot = house ? houseShot(house.camera, house.placement, aim) : "overview";
        rig.current = flyTo(overview, rig.current, shot, { reducedMotion: reducedMotion() });
      }),
    [store, overview, houses, get, mobile],
  );

  useFrame(({ camera }, dt) => {
    const flying = !!rig.current.flight;
    const { progress } = cut.current;
    rig.current = cutRig(overview, rig.current, progress, { reducedMotion: !!rig.current.held && reducedMotion() });
    rig.current = stepRig(rig.current, { dt, pointer: pointer.current });
    const pose = cutPose(overview, rig.current, cut.current, aspect);
    camera.position.set(...toThree(pose.position));
    camera.lookAt(...toThree(pose.lookAt));
    // the Houses move under the pointer, which picks only when it moves itself
    if ((flying || progress > 0) && pointer.current) {
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

let motion: MediaQueryList | undefined;
const reducedMotion = () => (motion ??= window.matchMedia("(prefers-reduced-motion: reduce)")).matches;
