import type { SceneLayout } from "@/content/schema";

/**
 * The overview composition: where each House stands on the slope, keyed by
 * Project slug. The layout frame is the House frame's convention (z up,
 * metres). The fjord lies north, down the slope toward −y, so the Houses'
 * fronts face roughly north over the water. The ground rises toward +y,
 * and each House turns a little toward the middle of the fjord.
 */
export const sceneLayout: SceneLayout = {
  north: 180,
  // out over the fjord, looking up the slope at the four Houses
  overview: { position: [-6, -118, 30], lookAt: [0, 8, 4] },
  houses: {
    lyngen: {
      position: [0, 0],
      rotation: 10,
      ground: 0,
      // front-left, framing its arc: further in, one would stand in front of the garage wing from the
      // overview or from the arc's west end
      framing: [
        [-20, -8.5, 11],
        [-17, -11.5, 9.5],
        [-15.5, -14.5, 8],
      ],
    },
    senja: { position: [-46, 12], rotation: 8, ground: 3.5 },
    kvaloya: { position: [42, -10], rotation: -12, ground: -3 },
    reine: { position: [22, 26], rotation: -4, ground: 7.5 },
  },
};
