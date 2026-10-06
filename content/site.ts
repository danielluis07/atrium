/** Site-wide copy. Project records live in `content/projects/`. */

import type { Project } from "@/content/schema";

export const studio = {
  name: "Atrium",
  location: "Tromsø, Norway",
  email: "studio@atrium.example",
  founded: 2014,
  /** The one-line description: the site's meta description and the Threshold's line. */
  description: "Atrium is an architecture studio in Tromsø, Norway, designing houses for Arctic sites.",
  /** The Studio Depth's display statement, and the home page description. */
  statement:
    "Atrium designs houses around northern ground, winter light and the weather coming off the sea.",
  paragraphs: [
    "The studio was founded in Tromsø in 2014. Our four completed houses stand across Troms and Nordland, close to the water and open weather.",
    "We begin with the ground. Winter drifts, wind direction and the low path of the sun settle the section before the rooms take shape.",
    "Concrete carries the houses, stone anchors them and timber lines the sheltered parts. Clear glass opens the main rooms to the water; curtains close the rest.",
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
    head: "Let the ground set the section.",
    paragraph:
      "Each house meets the slope on a plinth. Low walls, paths and steps carry the same level out into the snow and shelter the ground beside the rooms.",
    crop: { project: "lyngen", image: "site", focus: "50% 75%" },
  },
  {
    label: "Light",
    head: "Open the rooms to winter light.",
    paragraph:
      "Low sun reaches beneath the roof slabs. At blue hour, clear glass shows the main room while curtains turn the other windows into a softer light.",
    crop: { project: "senja", image: "light", focus: "50% 70%" },
  },
  {
    label: "Material",
    head: "Build with a short palette.",
    paragraph:
      "Board-formed concrete carries the volumes. Stone holds the hearth, chimney or ground, while timber warms the soffits beneath dark metal edges.",
    crop: { project: "kvaloya", image: "material", focus: "50% 60%" },
  },
];

export const contact = {
  line: "Tell us about your site in the north.",
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
