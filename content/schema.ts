import { z } from "zod";

import { House } from "@/lib/house/schema";
import { validateHouse, type HouseIssue } from "@/lib/house/validate";

const Image = z.object({
  /** Path under `public/`, e.g. `/projects/lyngen/hero.avif`. */
  src: z.string().startsWith("/"),
  alt: z.string().min(1),
});

/**
 * Where the camera looks at a House from when it is selected, relative to
 * the House's frame so moving the House carries it along.
 */
export const CameraBlock = z.object({
  /** Degrees around the House from straight-on to its front, clockwise seen from above. */
  azimuth: z.number().min(-180).max(180),
  /** Degrees above the horizon. */
  pitch: z.number().min(8).max(30),
  /** Metres from the look-at point. */
  distance: z.number().positive(),
  /** Look-at point in the House frame (x, y, z metres), offset so the Project Panel never covers the House. */
  lookAt: z.tuple([z.number(), z.number(), z.number()]),
  /** How far the orbit may swing either side of the hero angle, in degrees. */
  arc: z.number().positive().max(50),
});

export const Project = z.object({
  name: z.string().regex(/ House$/, "a Project is named “<Place> House”"),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  /** Place and county, `Lyngen, Troms`. */
  location: z.string().regex(/^[^,]+, [^,]+$/, "write the location as “Place, County”"),
  /** Metres above sea level, rounded. */
  elevation: z.number().int(),
  year: z.number().int().min(2017).max(2025),
  /** Authored gross floor area, m². */
  floorArea: z.number().min(140).max(320),
  lede: z.string().min(1),
  writeUp: z.object({
    site: z.array(z.string().min(1)).min(1),
    light: z.array(z.string().min(1)).min(1),
    material: z.array(z.string().min(1)).min(1),
  }),
  images: z.object({
    hero: Image,
    site: Image,
    light: Image,
    /** Looks out through a real Glazing Face of the House, named here. */
    interior: Image.extend({ glazingFace: z.string() }),
    material: Image,
  }),
  camera: CameraBlock,
  house: House,
});

/** Where a House stands in the Scene. */
export const Placement = z.object({
  /** Datum position in the layout frame, metres (x, y). */
  position: z.tuple([z.number(), z.number()]),
  /** Degrees counter-clockwise seen from above. */
  rotation: z.number(),
  /** Ground height at the datum, metres. */
  ground: z.number(),
});

const Point = z.tuple([z.number(), z.number(), z.number()]);

export const SceneLayout = z.object({
  /** Direction of north in the layout frame, degrees counter-clockwise from +y. */
  north: z.number(),
  /**
   * The overview camera in the layout frame (x, y, z metres, z on the same
   * datum as the ground heights). The builder bakes what it and each
   * House's arc can see at full lightmap texel density.
   */
  overview: z.object({ position: Point, lookAt: Point }),
  houses: z.record(z.string(), Placement),
});

export type CameraBlock = z.infer<typeof CameraBlock>;
export type Project = z.infer<typeof Project>;
export type Placement = z.infer<typeof Placement>;
export type SceneLayout = z.infer<typeof SceneLayout>;

/** Everything `validateHouse` checks, plus the parts of the record that point into the House. */
export function validateProject(project: Project): HouseIssue[] {
  const issues = validateHouse(project.house, { floorArea: project.floorArea });
  const face = project.images.interior.glazingFace;
  const opening = project.house.openings.find((o) => o.name === face);
  if (!opening || opening.fill !== "glazing") {
    issues.push({
      part: "images.interior",
      message: `looks out through ${face}, which is not a Glazing Face of the House`,
    });
  }
  return issues;
}
