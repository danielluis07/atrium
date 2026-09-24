import type { Project } from "@/content/schema";

/**
 * Senja House: set into the slope. A glazed lower volume under a long bar
 * that cantilevers 4 m toward the fjord, with a stone wall across the slope.
 * Copy is placeholder until the write-up is drafted from the baked House.
 */
export const senja = {
  name: "Senja House",
  slug: "senja",
  location: "Senja, Troms",
  elevation: 25,
  year: 2018,
  floorArea: 220,
  lede: "A long concrete bar laid across the slope, reaching four metres out past the room below it.",
  writeUp: {
    site: [
      "The slope was cut once. The lower room sits in the cut with its back to the hill, and the bar lies across it at the level of the snow behind. A stone wall holds the ground on the west side.",
    ],
    light: [
      "The lower room is glazed along its whole front. The bar ends in one window facing north, so the last of the light comes down its length.",
    ],
    material: [
      "Board-formed concrete for the bar and the lower room, and a dry-laid stone wall that runs from the cut out into the slope.",
    ],
  },
  images: {
    hero: { src: "/projects/senja/hero.avif", alt: "Senja House at blue hour, the bar reaching out over the lit room below." },
    site: { src: "/projects/senja/site.avif", alt: "Senja House set into the snow slope above the water." },
    light: { src: "/projects/senja/light.avif", alt: "The glazed lower room glowing under the cantilever." },
    interior: {
      src: "/projects/senja/interior.avif",
      alt: "The end of the bar, one wide window looking north over the fjord.",
      glazingFace: "bar-end",
    },
    material: { src: "/projects/senja/material.avif", alt: "The stone wall meeting the concrete bar." },
  },
  camera: {
    azimuth: 35,
    pitch: 12,
    distance: 36,
    lookAt: [3, -2, 0],
    arc: 50,
  },
  house: {
    levels: [
      { name: "L-1", elevation: -3.2, height: 3.2 },
      { name: "L0", elevation: 0, height: 3.3 },
    ],
    volumes: [
      { name: "lower", rect: { x0: -10.0, y0: -6.0, x1: 4.0, y1: 1.0 }, from: "L-1", to: "L-1" },
      // cantilevers 4 m past the lower room's front
      { name: "bar", rect: { x0: -6.0, y0: -10.0, x1: 0.0, y1: 10.0 }, from: "L0", to: "L0" },
    ],
    stone: { name: "wall", rect: { x0: 0.0, y0: 1.0, x1: 10.0, y1: 1.8 }, from: "L-1", to: "L0" },
    slabs: [
      { name: "roof", rect: { x0: -6.4, y0: -10.4, x1: 0.4, y1: 10.4 }, level: "L0", thickness: 0.35, fascia: 0.4, soffit: true },
      { name: "ledge-east", rect: { x0: -10.4, y0: -6.6, x1: -6.0, y1: 1.0 }, level: "L-1", thickness: 0.25, fascia: 0.3, soffit: true },
      { name: "ledge-west", rect: { x0: 0.0, y0: -6.6, x1: 4.4, y1: 1.0 }, level: "L-1", thickness: 0.25, fascia: 0.3, soffit: true },
    ],
    openings: [
      { name: "lower-front", volume: "lower", face: "front", at: 0.5, width: 13.0, level: "L-1", depth: 0.35, fill: "glazing", mullions: 7 },
      { name: "lower-side", volume: "lower", face: "left", at: 1.0, width: 4.4, level: "L-1", depth: 0.25, fill: "glazing" },
      { name: "bar-end", volume: "bar", face: "front", at: 0.3, width: 5.4, level: "L0", depth: 0.4, fill: "glazing", mullions: 2 },
      { name: "bar-side", volume: "bar", face: "left", at: 3.0, width: 9.0, level: "L0", sill: 0.9, head: 2.6, depth: 0.25, fill: "glazing", mullions: 4 },
      { name: "entry", volume: "bar", face: "back", at: 2.4, width: 1.2, level: "L0", head: 2.4, depth: 0.3, fill: "door" },
    ],
    balustrades: [],
    // along the bar: the cantilever over the lower room
    section: { axis: "x", at: -3 },
  },
} satisfies Project;
