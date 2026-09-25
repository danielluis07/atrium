import type { Project } from "@/content/schema";

/**
 * Lyngen House: the reference House, translated from the prototype massing.
 * Copy is placeholder until the write-up is drafted from the baked House.
 */
export const lyngen = {
  name: "Lyngen House",
  slug: "lyngen",
  location: "Lyngen, Troms",
  elevation: 40,
  year: 2021,
  floorArea: 290,
  lede: "A low concrete house under one long roof, facing the fjord across a slope of snow.",
  writeUp: {
    site: [
      "The house sits on a shelf above the fjord, with the Lyngen Alps behind it. A low wing holds the garage and the entrance and takes the weather off the main room.",
    ],
    light: [
      "The main room is double height and glazed toward the water. In winter the light comes low and blue across the fjord, and the roof slab reaches out to keep the snow off the glass.",
    ],
    material: [
      "Board-formed concrete throughout, a stone chimney that runs past the roof, and timber for the soffits, the garage door and the terrace ceiling.",
    ],
  },
  images: {
    hero: { src: "/projects/lyngen/hero.avif", alt: "Lyngen House at blue hour, lit from within, above the fjord." },
    site: { src: "/projects/lyngen/site.avif", alt: "Lyngen House on its snow shelf with the mountains behind." },
    light: { src: "/projects/lyngen/light.avif", alt: "The glazed main room glowing under the roof slab." },
    interior: {
      src: "/projects/lyngen/interior.avif",
      alt: "The double-height main room looking out over the fjord.",
      glazingFace: "living-front",
    },
    material: { src: "/projects/lyngen/material.avif", alt: "Board-formed concrete meeting the stone chimney." },
  },
  camera: {
    azimuth: -25,
    pitch: 14,
    distance: 34,
    lookAt: [3, 0, 3],
    arc: 50,
  },
  house: {
    levels: [
      { name: "L0", elevation: 0, height: 3.5 },
      { name: "L1", elevation: 3.5, height: 3.3 },
    ],
    volumes: [
      { name: "wing", rect: { x0: -12.6, y0: -5.0, x1: -5.0, y1: 4.0 }, from: "L0", to: "L0" },
      // double height under the roof slab, so it counts once in the floor area
      {
        name: "main", rect: { x0: -3.4, y0: -4.4, x1: 4.6, y1: 5.0 }, from: "L0", to: "L0", top: 6.8,
        interior: { kind: "lounge", fireplace: true, lamp: "floor", shelving: true },
      },
      { name: "lower", rect: { x0: 4.6, y0: -3.4, x1: 11.4, y1: 5.0 }, from: "L0", to: "L0" },
      // the upper frame rises past its Level
      { name: "frame", rect: { x0: 5.0, y0: -5.0, x1: 12.6, y1: 5.4 }, from: "L1", to: "L1", top: 7.2 },
    ],
    stone: { name: "chimney", rect: { x0: -5.0, y0: -5.4, x1: -3.4, y1: 2.0 }, from: "L0", to: "L1", top: 8.4 },
    slabs: [
      { name: "roof-main", rect: { x0: -3.9, y0: -7.6, x1: 6.0, y1: 5.5 }, level: "L1", thickness: 0.5, fascia: 0.55, soffit: true },
      { name: "canopy", rect: { x0: -1.4, y0: -6.5, x1: 5.2, y1: -4.4 }, level: "L0", thickness: 0.32, fascia: 0.34, soffit: true },
      { name: "roof-west", rect: { x0: -12.7, y0: -5.1, x1: -5.0, y1: 4.1 }, level: "L0", thickness: 0, fascia: 0.6, soffit: false },
    ],
    openings: [
      { name: "garage", volume: "wing", face: "front", at: 0.8, width: 4.8, level: "L0", head: 2.6, depth: 0.3, fill: "door" },
      { name: "hall-front", volume: "wing", face: "front", at: 6.1, width: 1.0, level: "L0", sill: 0.4, head: 2.9, depth: 0.25, fill: "glazing" },
      { name: "living-front", volume: "main", face: "front", at: 0.8, width: 6.6, level: "L0", to: "L1", depth: 0.3, fill: "glazing", mullions: 3 },
      { name: "living-side", volume: "main", face: "left", at: 0.4, width: 2.4, level: "L1", sill: 0.4, depth: 0.25, fill: "glazing" },
      { name: "dining-front", volume: "lower", face: "front", at: 0.8, width: 5.4, level: "L0", depth: 0.3, fill: "glazing", mullions: 2 },
      { name: "terrace", volume: "frame", face: "front", at: 0.35, width: 6.9, level: "L1", depth: 1.6, fill: "terrace", mullions: 3 },
      { name: "study-side", volume: "frame", face: "right", at: 3.0, width: 6.0, level: "L1", sill: 0.7, head: 3.1, depth: 0.25, fill: "glazing" },
    ],
    balustrades: [],
    section: { axis: "x", at: 0.6 },
  },
} satisfies Project;
