import type { Project } from "@/content/schema";

/** Casa Kvaløya: three volumes around a stone hearth beneath one roof. */
export const kvaloya = {
  name: "Casa Kvaløya",
  slug: "kvaloya",
  location: "Kvaløya, Troms",
  elevation: 15,
  year: 2023,
  floorArea: 160,
  lede: "Três alas térreas giram em torno de uma lareira de pedra sob uma ampla cobertura.",
  writeUp: {
    site: [
      "A casa se assenta sobre uma plataforma pavimentada, perto da água. Suas três alas deixam um canto aberto como pátio abrigado, enquanto uma passagem pelo ateliê conduz o acesso da encosta até a vista.",
    ],
    light: [
      "O vidro envolve a sala de jantar em dois lados, com a mesa voltada para o fiorde e uma pequena área de estar junto ao pátio. A cobertura avança além de todas as paredes, de modo que o sol baixo do inverno passa por baixo de sua borda.",
    ],
    material: [
      "O concreto aparente de fôrma de tábuas envolve as três alas. Uma lareira quadrada de pedra sobe pelo centro, e a cobertura de concreto é forrada de madeira sob uma borda de metal escuro.",
    ],
  },
  images: {
    hero: { src: "/projects/kvaloya/hero.avif", alt: "A Casa Kvaløya, baixa sob uma ampla cobertura quadrada, na neve." },
    site: { src: "/projects/kvaloya/site.avif", alt: "O pátio pavimentado e a passagem coberta da Casa Kvaløya, junto ao estreito." },
    light: { src: "/projects/kvaloya/light.avif", alt: "A sala de jantar envidraçada iluminando o pátio abrigado da Casa Kvaløya." },
    interior: {
      src: "/projects/kvaloya/interior.avif",
      alt: "A sala de jantar da Casa Kvaløya, olhando por cinco painéis de vidro em direção ao fiorde.",
      glazingFace: "living-front",
    },
    material: { src: "/projects/kvaloya/material.avif", alt: "A lareira quadrada de pedra subindo pela cobertura da Casa Kvaløya, coberta de neve." },
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
        // a kitchen, dining and living room: seating at the left end by the court's glass, and the table for
        // eight facing the fjord in the rest, a kitchen run behind it
        interior: { kind: "dining", lamp: "pendant", kitchen: true, seating: "left" },
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
      { name: "studio-front", volume: "studio", face: "front", at: 3.8, width: 2.8, level: "L0", depth: 0.3, fill: "glazing", curtain: true },
      { name: "sleeping-side", volume: "sleeping", face: "right", at: 1.5, width: 5.0, level: "L0", sill: 0.9, depth: 0.25, fill: "glazing", mullions: 2, curtain: true },
      { name: "entry", volume: "sleeping", face: "back", at: 2.0, width: 1.2, level: "L0", head: 2.4, depth: 0.3, fill: "door" },
    ],
    balustrades: [],
    // through the passage, the court and the roof's front overhang
    section: { axis: "x", at: -6 },
    siteWorks: {
      // stone paving under the whole roof, cleared, with the snow cut back along its drip line
      terrace: { rect: { x0: -9.6, y0: -9.2, x1: 9.6, y1: 8.8 }, level: "L0" },
      walls: [
        // the living room's front face carried east past its end, out into the snow
        { name: "east", rect: { x0: 8.0, y0: -7.2, x1: 13.4, y1: -6.9 }, top: 0.45 },
      ],
      steps: [],
      paths: [],
      aprons: [],
      lights: [
        { wall: "east", face: "front", at: 11.0 },
        { wall: "east", face: "front", at: 12.8 },
      ],
      shrubs: [
        // round the wall's end
        { at: [14.2, -6.6], size: 0.9 },
        { at: [12.9, -8.0], size: 0.7 },
        { at: [13.1, -5.9], size: 0.6 },
      ],
    },
  },
} satisfies Project;
