/**
 * Site-wide copy. Project records live in `content/projects/`.
 * The Studio, Approach and Contact copy is placeholder until it is drafted.
 */

import type { Project } from "@/content/schema";

export const studio = {
  name: "Atrium",
  location: "Tromsø, Norway",
  email: "studio@atrium.example",
  founded: 2014,
  /** The Studio Depth's display statement, and the home page description. */
  statement:
    "Atrium designs houses for the far north, where the sun stays low for half the year and the ground is snow.",
  paragraphs: [
    "The studio was founded in Tromsø in 2014. We work on a few houses at a time, in Troms and Nordland, for people who want to live close to the weather.",
    "Each house starts on its site: where the snow drifts, where the wind comes from, where the sun sits in December. The plan follows from that.",
    "We build in concrete, stone and timber, and keep the palette small so the light has something to work on.",
  ],
} as const;

/** A detail crop cut from one of a Project's images. */
type Crop = {
  project: string;
  image: keyof Project["images"];
  /** CSS object-position of the crop within the image. */
  focus: string;
};

/** The Approach Depth's rows, in order. */
export const approach: { label: string; head: string; paragraph: string; crop: Crop }[] = [
  {
    label: "Site",
    head: "Start from the ground.",
    paragraph:
      "A house stands on a concrete plinth above the snow, set where the drifts leave it clear. We walk each site in winter before we draw anything.",
    crop: { project: "lyngen", image: "site", focus: "50% 75%" },
  },
  {
    label: "Light",
    head: "Hold the low sun.",
    paragraph:
      "In winter the sun barely clears the mountains. The glazing faces the long views, and the roof slabs reach out to keep the snow off the glass, so the rooms glow at blue hour.",
    crop: { project: "senja", image: "light", focus: "50% 70%" },
  },
  {
    label: "Material",
    head: "Few materials, left as they are.",
    paragraph:
      "Board-formed concrete, one stone mass and timber under the roofs. Nothing is clad or painted, so each house weathers into its site.",
    crop: { project: "kvaloya", image: "material", focus: "50% 60%" },
  },
];

export const contact = {
  line: "Write to us about a site in the north.",
} as const;

/** The home page Depths the header links to, in page order. */
export const depths = [
  { id: "projects", label: "Projects", depth: -1 },
  { id: "studio", label: "Studio", depth: -2 },
  { id: "approach", label: "Approach", depth: -3 },
  { id: "contact", label: "Contact", depth: -4 },
] as const;

export const footer = {
  line: "Atrium is a fictional studio.",
} as const;

export const notFound = {
  line: "Nothing is built here.",
  link: "See the Projects",
} as const;
