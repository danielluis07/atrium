import type { Project } from "@/content/schema";

/**
 * Reine House: a compact stack of three Levels, each shifted off the one
 * below, with balconies on the overhangs and a stone wall up the east side.
 * Copy is placeholder until the write-up is drafted from the baked House.
 */
export const reine = {
  name: "Reine House",
  slug: "reine",
  location: "Reine, Nordland",
  elevation: 12,
  year: 2025,
  floorArea: 235,
  lede: "Three floors stacked on a small plot, each one shifted to find its own view.",
  writeUp: {
    site: [
      "The plot is narrow and close to the water, so the house goes up. Each floor slides off the one below it, and a stone wall on the east side takes the wind off the stack.",
    ],
    light: [
      "The living floor reaches out west over the entrance and is glazed on two sides. Where a floor steps back, the roof below it becomes a balcony, so every Level has a place outside.",
    ],
    material: [
      "Board-formed concrete floors, a stone wall three storeys high, and glass balustrades that leave the edges of the slabs clear.",
    ],
  },
  images: {
    hero: { src: "/projects/reine/hero.avif", alt: "Reine House at blue hour, three shifted floors lit above the snow." },
    site: { src: "/projects/reine/site.avif", alt: "Reine House close to the water, with the peaks behind." },
    light: { src: "/projects/reine/light.avif", alt: "The living floor glowing above the west balcony." },
    interior: {
      src: "/projects/reine/interior.avif",
      alt: "The living floor looking north over the water.",
      glazingFace: "living-front",
    },
    material: { src: "/projects/reine/material.avif", alt: "The stone wall beside the stacked concrete floors." },
  },
  camera: {
    azimuth: 20,
    pitch: 18,
    distance: 32,
    lookAt: [1, 0, 4],
    arc: 50,
  },
  house: {
    levels: [
      { name: "L0", elevation: 0, height: 3.2 },
      { name: "L1", elevation: 3.2, height: 3.1 },
      { name: "L2", elevation: 6.3, height: 3.1 },
    ],
    // each Level shifts: the middle west and forward, the top east and back
    volumes: [
      { name: "base", rect: { x0: -5.0, y0: -4.0, x1: 5.0, y1: 4.0 }, from: "L0", to: "L0" },
      {
        name: "middle", rect: { x0: -2.0, y0: -5.0, x1: 8.0, y1: 3.0 }, from: "L1", to: "L1",
        interior: { kind: "kitchen", lamp: "pendant", shelving: true },
      },
      { name: "top", rect: { x0: -7.2, y0: -3.0, x1: 1.8, y1: 5.0 }, from: "L2", to: "L2" },
    ],
    stone: { name: "wall", rect: { x0: -8.0, y0: -4.0, x1: -7.2, y1: 4.0 }, from: "L0", to: "L2", top: 10.2 },
    slabs: [
      { name: "roof", rect: { x0: -7.6, y0: -3.6, x1: 2.4, y1: 5.4 }, level: "L2", thickness: 0.4, fascia: 0.45, soffit: true },
      // the middle's roof where the top steps back
      { name: "balcony-upper", rect: { x0: 1.8, y0: -5.6, x1: 8.6, y1: 3.0 }, level: "L1", thickness: 0.3, fascia: 0.35, soffit: true },
      // the base's roof, under the top's overhang
      { name: "balcony-lower", rect: { x0: -5.6, y0: -4.6, x1: -2.0, y1: 4.0 }, level: "L0", thickness: 0.3, fascia: 0.35, soffit: true },
    ],
    openings: [
      { name: "entry", volume: "base", face: "front", at: 1.0, width: 1.2, level: "L0", head: 2.4, depth: 0.3, fill: "door" },
      { name: "kitchen-front", volume: "base", face: "front", at: 3.0, width: 5.6, level: "L0", depth: 0.3, fill: "glazing", mullions: 2 },
      { name: "stair", volume: "base", face: "right", at: 2.0, width: 0.8, level: "L0", sill: 0.3, head: 2.8, depth: 0.25, fill: "glazing" },
      { name: "living-front", volume: "middle", face: "front", at: 0.6, width: 8.8, level: "L1", depth: 0.3, fill: "glazing", mullions: 4 },
      { name: "living-side", volume: "middle", face: "right", at: 1.0, width: 6.0, level: "L1", depth: 0.3, fill: "glazing", mullions: 2 },
      { name: "bedroom-front", volume: "top", face: "front", at: 3.0, width: 5.0, level: "L2", depth: 0.3, fill: "glazing", mullions: 2 },
      { name: "bedroom-side", volume: "top", face: "right", at: 1.0, width: 3.2, level: "L2", depth: 0.25, fill: "glazing" },
    ],
    balustrades: [
      { slab: "balcony-upper", edges: ["front", "right"] },
      { slab: "balcony-lower", edges: ["front", "left"] },
    ],
    // through all three Levels, showing how each one shifts
    section: { axis: "x", at: 0.5 },
  },
} satisfies Project;
