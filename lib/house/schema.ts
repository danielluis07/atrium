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
export const SCHEMA_VERSION = 4;

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

/** A side wall of an Interior's room, as seen from outside its window. */
const Side = z.enum(["left", "right"]);

/**
 * The furnished room inside a volume (ADR 0005): a kind and the few named
 * options its template in the builder honours. Each kind accepts only its
 * own options. It is a room shell, not a plan: the drawings never show it.
 * A House may have several. A `partition` (bedroom, lounge) is the one
 * exception, a wall with a door across the room this many metres in from
 * the window wall: the room is furnished in front of it, and the room
 * behind it is left empty. A lounge's `door` is a closed door in a side
 * wall, into the room beside it: another volume on its floor stands against
 * that wall. A lounge's `tv` is a dark wall TV on the side wall it names,
 * left or right as seen from outside, with the sofa facing it side-on to
 * the glass; it takes the fire's place, so a lounge has one or the other.
 * A dining room's `kitchen` is a kitchen run along its back wall, behind
 * the table. A bedroom's bed faces the window with its head to the back
 * wall, or with `bedside` its head to the side wall it names, left or right
 * as seen from outside, so the glass sees it side-on; its `tv` is a dark
 * wall TV over a low walnut unit on the side wall across from the bed,
 * facing it, so it needs a `bedside`. A library's `desk` is a long walnut
 * desk with a computer against the side wall it names, left or right as
 * seen from outside, so the window sees it side-on. Its `door` is a
 * closed walnut door toward the back of the side wall it names, into the
 * rest of the House.
 */
export const Interior = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("lounge"),
    fireplace: z.boolean().optional(),
    lamp: Lamp.optional(),
    shelving: z.boolean().optional(),
    partition: positive.optional(),
    door: z.boolean().optional(),
    tv: Side.optional(),
  }),
  z.strictObject({ kind: z.literal("dining"), lamp: Lamp.optional(), shelving: z.boolean().optional(), kitchen: z.boolean().optional() }),
  z.strictObject({ kind: z.literal("kitchen"), lamp: Lamp.optional(), shelving: z.boolean().optional() }),
  z.strictObject({
    kind: z.literal("library"),
    fireplace: z.boolean().optional(),
    lamp: Lamp.optional(),
    desk: Side.optional(),
    door: Side.optional(),
  }),
  z.strictObject({
    kind: z.literal("bedroom"),
    lamp: Lamp.optional(),
    partition: positive.optional(),
    bedside: Side.optional(),
    tv: z.boolean().optional(),
  }),
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
 * volume's top). A glazing opening is a Glazing Face. A Glazing Face
 * that looks into no Interior may hang a Curtain (`curtain`), a sheer
 * closed across all of its glass.
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
  curtain: z.boolean().optional(),
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

/** A point in plan, in the House frame. */
const PlanPoint = z.tuple([metres, metres]);

/**
 * Stone paving around a House, level with the floor of `level`, bounded by
 * walls or the House. `snow` is the part of it the snow lies on, thinning
 * toward its edges inside the terrace (a canopy's drip line).
 */
export const Terrace = z.object({ rect: Rect, level: levelName, snow: Rect.optional() });

/**
 * A low board-formed concrete wall in the snow, from under the snow up to
 * `top` (relative to the datum). It runs along its plan's longer side, and
 * each gap is a span along it (from, to) left open for steps. With `lower`,
 * it runs along x and holds the snow behind it: in front of it (toward −y)
 * the snow lies at `lower`, and past its ends it falls away in a bank.
 */
export const SiteWall = z.object({
  name,
  rect: Rect,
  top: metres,
  gaps: z.array(z.object({ from: metres, to: metres })).optional(),
  lower: metres.optional(),
});

/**
 * A stone flight descending toward the face `down`, from `top` at its upper
 * edge to `foot` at its lower one, in `risers` equal treads, between two
 * sloping concrete cheeks. With `lights`, each cheek holds a set-in light.
 */
export const SiteSteps = z.object({
  name,
  rect: Rect,
  down: Face,
  top: metres,
  foot: metres,
  risers: z.number().int().min(1),
  lights: z.boolean().optional(),
});

/**
 * A stone path of `width` along a centre line of straight, axis-aligned
 * runs, cut into the snow. Its level rises or falls evenly along the line,
 * from `from` at its first point to `to` at its last.
 */
export const SitePath = z.object({
  name,
  width: positive,
  line: z.array(PlanPoint).min(2),
  from: metres,
  to: metres,
});

/** Concrete in front of a door `opening`, level with its floor, reaching `depth` out from the face. */
export const Apron = z.object({ opening: name, depth: positive });

/** A small warm light set into one of a wall's long faces, `at` along its length. */
export const SetInLight = z.object({ wall: name, face: Face, at: metres });

/** A Snow Shrub standing `at` a plan point, `size` metres across. */
export const SnowShrub = z.object({ at: PlanPoint, size: z.number().min(0.5).max(1.1) });

/**
 * The House's Site Works (ADR 0006): the built pieces around it, and the
 * Snow Shrubs among them. The snow they shape is derived by the builder.
 */
export const SiteWorks = z.object({
  terrace: Terrace.optional(),
  walls: z.array(SiteWall),
  steps: z.array(SiteSteps),
  paths: z.array(SitePath),
  aprons: z.array(Apron),
  lights: z.array(SetInLight),
  shrubs: z.array(SnowShrub),
});

/**
 * Slatted timber over a whole balcony slab, on slender dark metal posts,
 * its slats' tops at `top` (relative to the datum). It is architecture:
 * the drawings show it like a slab.
 */
export const Pergola = z.object({ slab: name, top: metres });

/**
 * One piece of Balcony Furniture, standing on its slab with its middle
 * `at` a plan point and its front toward `facing` (the front of the House
 * when left out). Each kind has one size, in the builder's kit. A `chair`
 * is a low timber lounge chair, with a sheepskin over it when `sheepskin`;
 * a `table` is a low table, with a lantern on it when `lantern`; a `pine`
 * is a dwarf pine in a concrete pot; a `tub` is an open round timber hot
 * tub with a warm glow in its water; a `fire-bowl` is a dark metal bowl of
 * fire; a `bench` is a timber bench; a `telescope` stands on a tripod,
 * pointed out past its front. Only the lantern, the fire bowl and the tub
 * give light.
 */
export const BalconyPiece = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("chair"), at: PlanPoint, facing: Face.optional(), sheepskin: z.boolean().optional() }),
  z.strictObject({ kind: z.literal("table"), at: PlanPoint, facing: Face.optional(), lantern: z.boolean().optional() }),
  z.strictObject({ kind: z.literal("pine"), at: PlanPoint, facing: Face.optional() }),
  z.strictObject({ kind: z.literal("tub"), at: PlanPoint, facing: Face.optional() }),
  z.strictObject({ kind: z.literal("fire-bowl"), at: PlanPoint, facing: Face.optional() }),
  z.strictObject({ kind: z.literal("bench"), at: PlanPoint, facing: Face.optional() }),
  z.strictObject({ kind: z.literal("telescope"), at: PlanPoint, facing: Face.optional() }),
]);

/**
 * The Balcony Furniture on one slab: the pieces set out on it. Unlike Site
 * Works, it stands on a slab, not on the plinth.
 */
export const BalconyFurniture = z.object({ slab: name, pieces: z.array(BalconyPiece).min(1) });

export const House = z.object({
  levels: z.array(Level).min(1),
  volumes: z.array(Volume).min(1),
  stone: StoneMass,
  slabs: z.array(Slab),
  openings: z.array(Opening),
  balustrades: z.array(Balustrade),
  section: Section,
  siteWorks: SiteWorks.optional(),
  pergolas: z.array(Pergola).optional(),
  balconyFurniture: z.array(BalconyFurniture).optional(),
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
export type SiteWall = z.infer<typeof SiteWall>;
export type SiteSteps = z.infer<typeof SiteSteps>;
export type SitePath = z.infer<typeof SitePath>;
export type SiteWorks = z.infer<typeof SiteWorks>;
export type Pergola = z.infer<typeof Pergola>;
export type BalconyPiece = z.infer<typeof BalconyPiece>;
export type BalconyFurniture = z.infer<typeof BalconyFurniture>;
export type House = z.infer<typeof House>;
