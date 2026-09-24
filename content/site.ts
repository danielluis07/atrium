/** Site-wide copy. Project records live in `content/projects/`. */

export const studio = {
  name: "Atrium",
  location: "Tromsø, Norway",
  email: "studio@atrium.example",
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
