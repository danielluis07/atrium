import type { SceneLayout } from "@/content/schema";

/**
 * The overview composition: where each House stands on the slope, keyed by
 * Project slug. The layout frame is the House frame's convention (z up,
 * metres). The fjord lies north, down the slope toward −y, so the Houses'
 * fronts face roughly north over the water.
 */
export const sceneLayout: SceneLayout = {
  north: 180,
  houses: {
    lyngen: { position: [0, 0], rotation: 10, ground: 0 },
  },
};
