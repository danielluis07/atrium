import type { Project } from "@/content/schema";

/** Casa Lyngen: the reference House, translated from the prototype massing. */
export const lyngen = {
  name: "Casa Lyngen",
  slug: "lyngen",
  location: "Lyngen, Troms",
  elevation: 40,
  year: 2021,
  floorArea: 320,
  lede: "Uma ampla casa de concreto que sobe de uma ala baixa de garagem até dois ambientes empilhados ao lado de uma chaminé de pedra.",
  writeUp: {
    site: [
      "A casa ocupa um patamar acima do fiorde. Um caminho de pedra liga o pátio da garagem a três degraus iluminados no terraço principal, onde muros baixos seguram a neve longe do vidro.",
    ],
    light: [
      "A sala da lareira e o mezanino com cortinas dividem a alta fachada frontal. Na extremidade oposta, uma biblioteca superior se abre atrás de um terraço recuado e retorna pela parede lateral para encarar a água.",
    ],
    material: [
      "O concreto aparente de fôrma de tábuas forma as três alas. A chaminé é de pedra bruta; metal escuro arremata as lajes da cobertura, com madeira sob a cobertura principal e a marquise da sala.",
    ],
  },
  images: {
    hero: { src: "/projects/lyngen/hero.avif", alt: "A Casa Lyngen se erguendo de sua ala de garagem, ao lado de uma alta chaminé de pedra." },
    site: { src: "/projects/lyngen/site.avif", alt: "A Casa Lyngen num patamar de neve, com um terraço murado voltado para o fiorde." },
    light: { src: "/projects/lyngen/light.avif", alt: "Luz quente atrás do vidro da sala e da biblioteca superior da Casa Lyngen." },
    interior: {
      src: "/projects/lyngen/interior.avif",
      alt: "A sala da lareira da Casa Lyngen, olhando por quatro painéis de vidro em direção ao fiorde.",
      glazingFace: "living-front",
    },
    material: { src: "/projects/lyngen/material.avif", alt: "Lajes de cobertura de concreto cobertas de neve encontrando a chaminé de pedra e o forro de madeira." },
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
      {
        name: "main", rect: { x0: -3.4, y0: -4.4, x1: 4.6, y1: 5.0 }, from: "L0", to: "L0",
        // the lounge round the fire, closed off by a partition with a pivot door, with a door into the dining room
        interior: { kind: "lounge", fireplace: true, lamp: "floor", partition: 5.8, door: true },
      },
      // the room over the lounge, under the roof slab
      { name: "loft", rect: { x0: -3.4, y0: -4.4, x1: 4.6, y1: 5.0 }, from: "L1", to: "L1" },
      { name: "lower", rect: { x0: 4.6, y0: -3.4, x1: 11.4, y1: 5.0 }, from: "L0", to: "L0" },
      // the upper frame rises past its Level: a library behind the terrace, with a desk on its left wall and
      // a door behind it, toward the rest of the House
      {
        name: "frame", rect: { x0: 5.0, y0: -5.0, x1: 12.6, y1: 5.4 }, from: "L1", to: "L1", top: 7.2,
        interior: { kind: "library", lamp: "floor", desk: "left", door: "left" },
      },
    ],
    stone: { name: "chimney", rect: { x0: -5.0, y0: -5.4, x1: -3.4, y1: 2.0 }, from: "L0", to: "L1", top: 8.4 },
    slabs: [
      { name: "roof-main", rect: { x0: -3.9, y0: -7.6, x1: 6.0, y1: 5.5 }, level: "L1", thickness: 0.5, fascia: 0.55, soffit: true },
      { name: "canopy", rect: { x0: -1.4, y0: -6.5, x1: 5.2, y1: -4.4 }, level: "L0", thickness: 0.32, fascia: 0.34, soffit: true },
      { name: "roof-west", rect: { x0: -12.7, y0: -5.1, x1: -5.0, y1: 4.1 }, level: "L0", thickness: 0, fascia: 0.6, soffit: false },
    ],
    openings: [
      { name: "garage", volume: "wing", face: "front", at: 0.8, width: 4.8, level: "L0", head: 2.6, depth: 0.3, fill: "door" },
      { name: "hall-front", volume: "wing", face: "front", at: 6.1, width: 1.0, level: "L0", sill: 0.4, head: 2.9, depth: 0.25, fill: "glazing", curtain: true },
      { name: "living-front", volume: "main", face: "front", at: 0.8, width: 6.6, level: "L0", depth: 0.3, fill: "glazing", mullions: 3 },
      { name: "loft-front", volume: "loft", face: "front", at: 0.8, width: 6.6, level: "L1", depth: 0.3, fill: "glazing", mullions: 3, curtain: true },
      { name: "loft-side", volume: "loft", face: "left", at: 0.4, width: 2.4, level: "L1", sill: 0.4, depth: 0.25, fill: "glazing", curtain: true },
      { name: "dining-front", volume: "lower", face: "front", at: 0.8, width: 5.4, level: "L0", depth: 0.3, fill: "glazing", mullions: 2, curtain: true },
      { name: "terrace", volume: "frame", face: "front", at: 0.35, width: 6.9, level: "L1", depth: 1.6, fill: "terrace", mullions: 3 },
      { name: "study-side", volume: "frame", face: "right", at: 3.0, width: 6.0, level: "L1", sill: 0.7, head: 3.1, depth: 0.25, fill: "glazing" },
    ],
    balustrades: [],
    section: { axis: "x", at: 0.6 },
    siteWorks: {
      // stone paving level with the lounge floor, bare under the canopy and snowed beyond its drip line
      terrace: {
        rect: { x0: -3.4, y0: -8.6, x1: 4.6, y1: -4.3 },
        level: "L0",
        snow: { x0: -3.4, y0: -8.6, x1: 4.6, y1: -6.5 },
      },
      walls: [
        // along the front, open for the steps, holding the snow a step above the lower snow in front
        { name: "front", rect: { x0: -3.7, y0: -8.9, x1: 11.4, y1: -8.6 }, top: 0.45, gaps: [{ from: 1.6, to: 3.0 }], lower: -0.3 },
        // back to the chimney's front, and round the snow garden in front of `lower`
        { name: "west", rect: { x0: -3.7, y0: -8.6, x1: -3.4, y1: -5.4 }, top: 0.45 },
        { name: "divider", rect: { x0: 4.6, y0: -8.6, x1: 4.9, y1: -3.4 }, top: 0.45 },
        { name: "east", rect: { x0: 11.1, y0: -8.6, x1: 11.4, y1: -3.4 }, top: 0.45 },
      ],
      steps: [
        { name: "terrace-steps", rect: { x0: 1.6, y0: -9.6, x1: 3.0, y1: -8.6 }, down: "front", top: 0, foot: -0.45, risers: 3, lights: true },
      ],
      paths: [
        // out from the steps, west along the wall's foot, then north to the garage, rising gently
        { name: "garage-path", width: 1.2, line: [[2.3, -9.6], [2.3, -10.6], [-9.4, -10.6], [-9.4, -6.3]], from: -0.45, to: 0 },
      ],
      aprons: [{ opening: "garage", depth: 1.3 }],
      lights: [
        { wall: "front", face: "front", at: -1.4 },
        { wall: "front", face: "front", at: 8.0 },
      ],
      shrubs: [
        // at the wall's ends, beside the steps, and where the path turns
        { at: [-4.5, -9.3], size: 0.9 },
        { at: [12.2, -9.3], size: 0.8 },
        { at: [3.65, -9.4], size: 0.7 },
        { at: [-10.7, -11.8], size: 1.0 },
        { at: [-8.2, -9.6], size: 0.6 },
      ],
    },
  },
} satisfies Project;
