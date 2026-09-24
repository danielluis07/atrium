import type { Placement } from "@/content/schema";

type Vec3 = [number, number, number];

/**
 * The layout frame (x, y, z up; `content/scene.ts`) in three.js axes (y up).
 * It is the same turn the builder gives the House frame for glTF, so a House
 * GLB drops into the Scene with only its placement applied.
 */
export const toThree = ([x, y, z]: readonly [number, number, number]): Vec3 => [x, z, y === 0 ? 0 : -y];

/** Where a House's root goes in three.js axes: its datum on the ground, turned about the vertical. */
export function houseTransform(placement: Placement): { position: Vec3; rotationY: number } {
  const [x, y] = placement.position;
  return {
    position: toThree([x, y, placement.ground]),
    // counter-clockwise seen from above in both frames
    rotationY: (placement.rotation * Math.PI) / 180,
  };
}
