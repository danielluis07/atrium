import type { Project } from "@/content/schema";

/** Casa Senja: a lower room beneath a long bar set across the slope. */
export const senja = {
  name: "Casa Senja",
  slug: "senja",
  location: "Senja, Troms",
  elevation: 25,
  year: 2018,
  floorArea: 220,
  lede: "Uma barra de concreto atravessa a encosta e avança quatro metros além de um ambiente inferior escavado na neve.",
  writeUp: {
    site: [
      "A sala inferior fica encostada no morro, com um terraço pavimentado livre sob a barra. Um muro de pedra segura o terreno superior; além de sua extremidade, uma escada iluminada de dezesseis degraus desce pela neve até o terraço.",
    ],
    light: [
      "Uma janela larga fecha o quarto na ponta da barra. Abaixo dela, o vidro se limita à metade da fachada da sala, reunindo a luz quente sob o balanço enquanto o resto do ambiente permanece fechado.",
    ],
    material: [
      "A barra e o ambiente inferior são de concreto aparente de fôrma de tábuas. Um muro de pedra seca continua a partir do corte na encosta, com madeira sob a cobertura e sob dois patamares inferiores.",
    ],
  },
  images: {
    hero: { src: "/projects/senja/hero.avif", alt: "A Casa Senja atravessando a encosta, acima de um ambiente inferior escavado na neve." },
    site: { src: "/projects/senja/site.avif", alt: "O muro de contenção de pedra e a longa escada descendo ao lado da Casa Senja." },
    light: { src: "/projects/senja/light.avif", alt: "A sala inferior iluminada sob o balanço de concreto da Casa Senja." },
    interior: {
      src: "/projects/senja/interior.avif",
      alt: "O quarto da Casa Senja, olhando pela janela de três painéis da extremidade em direção ao fiorde.",
      glazingFace: "bar-end",
    },
    material: { src: "/projects/senja/material.avif", alt: "O muro de pedra seca encontrando a barra de concreto aparente da Casa Senja." },
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
      {
        name: "lower", rect: { x0: -10.0, y0: -6.0, x1: 4.0, y1: 1.0 }, from: "L-1", to: "L-1",
        // the living room: the TV on the right wall, the one the glass and the arc look toward
        interior: { kind: "lounge", tv: "right", lamp: "floor" },
      },
      // cantilevers 4 m past the lower room's front
      {
        name: "bar", rect: { x0: -6.0, y0: -10.0, x1: 0.0, y1: 10.0 }, from: "L0", to: "L0",
        // the bedroom at the end window, walled off from the rest of the bar
        interior: { kind: "bedroom", lamp: "floor", partition: 5.2 },
      },
    ],
    stone: { name: "wall", rect: { x0: 0.0, y0: 1.0, x1: 10.0, y1: 1.8 }, from: "L-1", to: "L0" },
    slabs: [
      { name: "roof", rect: { x0: -6.4, y0: -10.4, x1: 0.4, y1: 10.4 }, level: "L0", thickness: 0.35, fascia: 0.4, soffit: true },
      { name: "ledge-east", rect: { x0: -10.4, y0: -6.6, x1: -6.0, y1: 1.0 }, level: "L-1", thickness: 0.25, fascia: 0.3, soffit: true },
      { name: "ledge-west", rect: { x0: 0.0, y0: -6.6, x1: 4.4, y1: 1.0 }, level: "L-1", thickness: 0.25, fascia: 0.3, soffit: true },
    ],
    openings: [
      // the half of the front by the stone wall; the rest of the lower room's front, and its side, are wall
      { name: "lower-front", volume: "lower", face: "front", at: 7.0, width: 6.5, level: "L-1", depth: 0.35, fill: "glazing", mullions: 3 },
      { name: "bar-end", volume: "bar", face: "front", at: 0.3, width: 5.4, level: "L0", depth: 0.4, fill: "glazing", mullions: 2 },
      { name: "bar-side", volume: "bar", face: "left", at: 3.0, width: 9.0, level: "L0", sill: 0.9, head: 2.6, depth: 0.25, fill: "glazing", mullions: 4, curtain: true },
      { name: "entry", volume: "bar", face: "back", at: 2.4, width: 1.2, level: "L0", head: 2.4, depth: 0.3, fill: "door" },
    ],
    balustrades: [],
    // along the bar: the cantilever over the lower room
    section: { axis: "x", at: -3 },
    siteWorks: {
      // stone paving level with the lower room's floor, under the cantilever and kept clear in front of the glass
      terrace: { rect: { x0: -6.4, y0: -10.4, x1: 4.0, y1: -6.0 }, level: "L-1" },
      walls: [
        // the lower room's end wall, carried forward to hold the terrace's east side
        { name: "terrace-east", rect: { x0: 4.0, y0: -10.4, x1: 4.3, y1: -6.0 }, top: -2.75 },
      ],
      steps: [
        // down the fan past the stone wall's end, from the grade behind it to the lower snow
        { name: "grade-steps", rect: { x0: 11.6, y0: -3.8, x1: 13.0, y1: 2.2 }, down: "front", top: 0, foot: -3.2, risers: 16, lights: true },
      ],
      paths: [],
      aprons: [],
      lights: [
        { wall: "terrace-east", face: "left", at: -9.2 },
        { wall: "terrace-east", face: "left", at: -7.2 },
      ],
      shrubs: [
        // at the stone wall's end, at the foot of the steps, and past the terrace wall's end
        { at: [10.75, 0.2], size: 0.8 },
        { at: [11.0, -4.3], size: 0.7 },
        { at: [13.7, -4.1], size: 0.9 },
        { at: [5.1, -10.9], size: 0.8 },
      ],
    },
  },
} satisfies Project;
