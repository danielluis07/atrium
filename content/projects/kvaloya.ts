import type { Project } from "@/content/schema";

/**
 * Kvaløya House: low and wide. Three volumes pinwheel around a stone hearth
 * under one roof, with a covered cut-through to the view.
 * Copy is placeholder until the write-up is drafted from the baked House.
 */
export const kvaloya = {
  name: "Kvaløya House",
  slug: "kvaloya",
  location: "Kvaløya, Troms",
  elevation: 15,
  year: 2023,
  floorArea: 160,
  lede: "Three rooms turned around one stone hearth, under a single roof that reaches well past their walls.",
  writeUp: {
    site: [
      "The house is one storey on a flat piece of the shore. Its three rooms turn around the hearth and leave the north-east corner open, a court under the roof that looks down the sound.",
    ],
    light: [
      "The deep overhangs keep the high summer sun off the glass and let the low winter light in under them. A passage cut through the east room frames the water from the slope behind.",
    ],
    material: [
      "Board-formed concrete walls, a stone hearth that rises through the roof, and one thin concrete roof over everything.",
    ],
  },
  images: {
    hero: { src: "/projects/kvaloya/hero.avif", alt: "Kvaløya House at blue hour, low under its wide roof." },
    site: { src: "/projects/kvaloya/site.avif", alt: "Kvaløya House on the shore with the sound beyond." },
    light: { src: "/projects/kvaloya/light.avif", alt: "The covered court lit by the glazed living room." },
    interior: {
      src: "/projects/kvaloya/interior.avif",
      alt: "The living room looking north under the roof's edge.",
      glazingFace: "living-front",
    },
    material: { src: "/projects/kvaloya/material.avif", alt: "The stone hearth rising through the concrete roof." },
  },
  camera: {
    azimuth: -30,
    pitch: 16,
    distance: 30,
    lookAt: [2, 0, 2],
    arc: 50,
  },
  house: {
    levels: [{ name: "L0", elevation: 0, height: 3.2 }],
    // a pinwheel around the hearth, leaving the front-left quadrant open as a court
    volumes: [
      {
        name: "living", rect: { x0: -1.2, y0: -7.2, x1: 8.0, y1: -1.2 }, from: "L0", to: "L0",
        interior: { kind: "dining", lamp: "pendant" },
      },
      { name: "sleeping", rect: { x0: 1.2, y0: -1.2, x1: 7.2, y1: 7.2 }, from: "L0", to: "L0" },
      { name: "studio", rect: { x0: -8.0, y0: 1.2, x1: 1.2, y1: 7.2 }, from: "L0", to: "L0" },
    ],
    stone: { name: "hearth", rect: { x0: -1.2, y0: -1.2, x1: 1.2, y1: 1.2 }, from: "L0", to: "L0", top: 5.0 },
    slabs: [
      { name: "roof", rect: { x0: -9.6, y0: -9.2, x1: 9.6, y1: 8.8 }, level: "L0", thickness: 0.45, fascia: 0.5, soffit: true },
    ],
    openings: [
      { name: "living-front", volume: "living", face: "front", at: 0.6, width: 8.0, level: "L0", depth: 0.3, fill: "glazing", mullions: 4 },
      { name: "living-court", volume: "living", face: "left", at: 0.8, width: 4.0, level: "L0", depth: 0.3, fill: "glazing", mullions: 1 },
      // the full depth of the studio: a covered way through from the slope
      { name: "passage", volume: "studio", face: "front", at: 0.6, width: 2.6, level: "L0", depth: 6.0, fill: "void" },
      { name: "studio-front", volume: "studio", face: "front", at: 3.8, width: 2.8, level: "L0", depth: 0.3, fill: "glazing" },
      { name: "sleeping-side", volume: "sleeping", face: "right", at: 1.5, width: 5.0, level: "L0", sill: 0.9, depth: 0.25, fill: "glazing", mullions: 2 },
      { name: "entry", volume: "sleeping", face: "back", at: 2.0, width: 1.2, level: "L0", head: 2.4, depth: 0.3, fill: "door" },
    ],
    balustrades: [],
    // through the passage, the court and the roof's front overhang
    section: { axis: "x", at: -6 },
  },
} satisfies Project;
