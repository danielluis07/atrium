import { z } from "zod";

/**
 * The House as data, as decided in `docs/design/house-schema.md`.
 *
 * Metres. House frame: x to the right when facing the front, y going back,
 * z up; the front faces −y. The origin is the datum: ±0.00 at the finished
 * floor of the entrance Level, at the centre of the plan's bounding box.
 * Geometry is axis-aligned boxes only.
 *
 * zod checks shape here; `validateHouse` checks references and geometry.
 */

/** Bumped whenever the builder JSON changes shape. */
export const SCHEMA_VERSION = 3;

const name = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use lowercase-kebab-case");
const levelName = z.string().regex(/^L-?\d+$/, "Levels are named L-1, L0, L1…");
const metres = z.number().finite();
const positive = metres.positive();

/** A plan rectangle in the House frame. */
export const Rect = z
  .object({ x0: metres, y0: metres, x1: metres, y1: metres })
  .refine((r) => r.x1 > r.x0 && r.y1 > r.y0, "x1 and y1 must be greater than x0 and y0");

export const Level = z.object({
  name: levelName,
  /** Finished floor, relative to the datum. The entrance Level sits at 0. */
  elevation: metres,
  /** Floor to floor. */
  height: positive,
});

const Mass = z.object({
  name,
  rect: Rect,
  from: levelName,
  to: levelName,
  top: metres.optional(),
});

export const InteriorKind = z.enum(["lounge", "dining", "kitchen", "library", "bedroom"]);

const Lamp = z.enum(["floor", "pendant"]);

/**
 * The furnished room inside a volume (ADR 0005): a kind and the few named
 * options its template in the builder honours. Each kind accepts only its
 * own options. It is a room shell, not a plan: the drawings never show it.
 * A bedroom's `partition` is the one exception, a wall with a door across
 * the room this many metres in from the window wall: the bedroom is
 * furnished in front of it, and the room behind it is left empty.
 */
export const Interior = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("lounge"), fireplace: z.boolean().optional(), lamp: Lamp.optional(), shelving: z.boolean().optional() }),
  z.strictObject({ kind: z.literal("dining"), lamp: Lamp.optional(), shelving: z.boolean().optional() }),
  z.strictObject({ kind: z.literal("kitchen"), lamp: Lamp.optional(), shelving: z.boolean().optional() }),
  z.strictObject({ kind: z.literal("library"), fireplace: z.boolean().optional(), lamp: Lamp.optional() }),
  z.strictObject({ kind: z.literal("bedroom"), lamp: Lamp.optional(), partition: positive.optional() }),
]);

/**
 * Board-formed concrete from the floor of `from` to the top of `to`
 * (its elevation plus height). `top` overrides that, for parapets,
 * double-height rooms and frames that rise past their Level. With an
 * `interior`, the volume is hollow, and every Glazing Face into it looks
 * into that furnished room.
 */
export const Volume = Mass.extend({ interior: Interior.optional() });

/** Chimney, hearth or wall. One per House. Placed like a volume. */
export const StoneMass = Mass;

/**
 * Roof, canopy or balcony. Its underside sits at the top of `level`
 * (elevation plus height) and it rises by `thickness`.
 */
export const Slab = z.object({
  name,
  rect: Rect,
  level: levelName,
  thickness: metres.nonnegative(),
  fascia: metres.nonnegative(),
  soffit: z.boolean(),
});

export const Face = z.enum(["front", "back", "left", "right"]);

export const Fill = z.enum(["glazing", "door", "terrace", "void"]);

/**
 * A cut in one face of a volume. `at` is the offset from the face's left
 * edge seen from outside. `sill` and `head` are measured up from the floor
 * of `level`; they default to full height, from that floor to the
 * underside of what is above (the top of `to`, or of `level`, capped by the
 * volume's top). A glazing opening is a Glazing Face.
 */
export const Opening = z.object({
  name,
  volume: name,
  face: Face,
  at: metres.nonnegative(),
  width: positive,
  level: levelName,
  to: levelName.optional(),
  sill: metres.nonnegative().optional(),
  head: positive.optional(),
  depth: metres.nonnegative(),
  fill: Fill,
  mullions: z.number().int().nonnegative().optional(),
});

/** Glass with a metal rail along one or more edges of a slab. */
export const Balustrade = z.object({
  slab: name,
  edges: z.array(Face).min(1),
});

/** The one authored cut for the section drawing: the plane `axis` = `at`. */
export const Section = z.object({
  axis: z.enum(["x", "y"]),
  at: metres,
});

export const House = z.object({
  levels: z.array(Level).min(1),
  volumes: z.array(Volume).min(1),
  stone: StoneMass,
  slabs: z.array(Slab),
  openings: z.array(Opening),
  balustrades: z.array(Balustrade),
  section: Section,
});

export type Rect = z.infer<typeof Rect>;
export type Level = z.infer<typeof Level>;
export type InteriorKind = z.infer<typeof InteriorKind>;
export type Interior = z.infer<typeof Interior>;
export type Volume = z.infer<typeof Volume>;
export type StoneMass = z.infer<typeof StoneMass>;
export type Slab = z.infer<typeof Slab>;
export type Face = z.infer<typeof Face>;
export type Fill = z.infer<typeof Fill>;
export type Opening = z.infer<typeof Opening>;
export type Balustrade = z.infer<typeof Balustrade>;
export type Section = z.infer<typeof Section>;
export type House = z.infer<typeof House>;
