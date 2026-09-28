import type { Project } from "@/content/schema";

/** Reine House: three shifted Levels beside a full-height stone wall. */
export const reine = {
  name: "Reine House",
  slug: "reine",
  location: "Reine, Nordland",
  elevation: 12,
  year: 2025,
  floorArea: 235,
  lede: "Three concrete floors shift across a narrow plot, making a terrace from each roof below.",
  writeUp: {
    site: [
      "The narrow plot keeps the house to a compact stack. A stone wall runs the full height and extends into the snow; the entry path passes through a gap in its lower end before turning beneath the first overhang.",
    ],
    light: [
      "Clear glass wraps the kitchen on the middle floor and the bedroom above it. The lower balcony shelters two chairs beneath the bedroom, while the upper terrace sits under a timber pergola with a fire bowl and a view along the water.",
    ],
    material: [
      "Board-formed concrete defines the shifted floors. The stone wall braces the stack, while glass balustrades and a timber pergola keep the two terraces open to the view.",
    ],
  },
  images: {
    hero: { src: "/projects/reine/hero.avif", alt: "The three shifted floors of Reine House lit above the snow." },
    site: { src: "/projects/reine/site.avif", alt: "Reine House rising beside a full-height stone wall near the water." },
    light: { src: "/projects/reine/light.avif", alt: "Warm kitchen and bedroom glazing opening onto Reine House's two terraces." },
    interior: {
      src: "/projects/reine/interior.avif",
      alt: "The kitchen at Reine House looking through five glass panels toward the water.",
      glazingFace: "living-front",
    },
    material: { src: "/projects/reine/material.avif", alt: "The stone wall beside offset concrete slabs, glass rails and a timber pergola." },
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
      {
        name: "top", rect: { x0: -7.2, y0: -3.0, x1: 1.8, y1: 5.0 }, from: "L2", to: "L2",
        // the bedroom, seen side-on through bedroom-front: the bed's head on the right wall, back past bedroom-side's
        // glass, and a wall TV facing it from the left
        interior: { kind: "bedroom", bedside: "right", tv: true, lamp: "floor" },
      },
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
      // from the kitchen onto the lower balcony, toward the back, clear of the island
      { name: "balcony", volume: "middle", face: "left", at: 1.4, width: 1.0, level: "L1", sill: 0.3, head: 2.4, depth: 0.2, fill: "door" },
      { name: "base-front", volume: "base", face: "front", at: 3.0, width: 5.6, level: "L0", depth: 0.3, fill: "glazing", mullions: 2, curtain: true },
      { name: "stair", volume: "base", face: "right", at: 2.0, width: 0.8, level: "L0", sill: 0.3, head: 2.8, depth: 0.25, fill: "glazing", curtain: true },
      { name: "living-front", volume: "middle", face: "front", at: 0.6, width: 8.8, level: "L1", depth: 0.3, fill: "glazing", mullions: 4 },
      { name: "living-side", volume: "middle", face: "right", at: 1.0, width: 6.0, level: "L1", depth: 0.3, fill: "glazing", mullions: 2 },
      { name: "bedroom-front", volume: "top", face: "front", at: 3.0, width: 5.0, level: "L2", depth: 0.3, fill: "glazing", mullions: 2 },
      { name: "bedroom-side", volume: "top", face: "right", at: 1.0, width: 3.2, level: "L2", depth: 0.25, fill: "glazing" },
    ],
    balustrades: [
      { slab: "balcony-upper", edges: ["front", "right"] },
      { slab: "balcony-lower", edges: ["front", "left"] },
    ],
    // slatted timber over the whole upper balcony, below the roof
    pergolas: [{ slab: "balcony-upper", top: 9.0 }],
    balconyFurniture: [
      {
        // under the top's overhang: two lounge chairs facing the water, a table with a lantern, pines in the corner
        slab: "balcony-lower",
        pieces: [
          { kind: "chair", at: [-4.55, -2.1], sheepskin: true },
          { kind: "chair", at: [-3.05, -2.1], sheepskin: true },
          { kind: "table", at: [-3.8, -3.3], lantern: true },
          { kind: "pine", at: [-5.1, -4.1] },
          { kind: "pine", at: [-5.1, -3.3] },
        ],
      },
      {
        // a hot tub against the top's wall, a fire bowl with a bench, and the telescope alone at the corner
        slab: "balcony-upper",
        pieces: [
          { kind: "tub", at: [2.9, -2.35] },
          { kind: "fire-bowl", at: [5.4, -3.3] },
          { kind: "bench", at: [5.4, -2.2] },
          { kind: "telescope", at: [7.85, -4.85] },
        ],
      },
    ],
    // through all three Levels, showing how each one shifts
    section: { axis: "x", at: 0.5 },
    siteWorks: {
      // stone paving under the overhangs round the base, cleared to the middle's drip line; the base stands on it
      terrace: { rect: { x0: -5.0, y0: -5.0, x1: 8.0, y1: 4.0 }, level: "L0" },
      walls: [
        // the stone wall's outer line carried forward along the plot's edge, open for the path
        { name: "west", rect: { x0: -8.0, y0: -9.0, x1: -7.7, y1: -4.0 }, top: 0.45, gaps: [{ from: -7.0, to: -5.8 }] },
      ],
      steps: [],
      paths: [
        // out from the paving at the entry, then west through the wall and off the plot
        { name: "entry-path", width: 1.2, line: [[-3.4, -5.0], [-3.4, -6.4], [-9.8, -6.4]], from: 0, to: 0 },
      ],
      aprons: [],
      lights: [
        { wall: "west", face: "left", at: -8.0 },
        { wall: "west", face: "left", at: -4.9 },
        { wall: "west", face: "right", at: -8.0 },
      ],
      shrubs: [
        // outside by the gap, at the wall's end inside, at the path's turn, and at the paving's corner
        { at: [-8.75, -5.2], size: 0.9 },
        { at: [-7.1, -8.7], size: 0.6 },
        { at: [-2.3, -7.3], size: 0.7 },
        { at: [8.45, -5.45], size: 0.8 },
      ],
    },
  },
} satisfies Project;
