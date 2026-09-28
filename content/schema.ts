import { z } from "zod";

import { interiors, interiorShell, interiorVolumes, openingRecess, verticalExtent } from "@/lib/house/derive";
import { House, type Face, type Rect } from "@/lib/house/schema";
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
  /**
   * Framing pines placed by hand for the House's arc (ADR 0006), in its
   * House frame: plan x, y and height, metres. Each stands on the plinth
   * where it bends onto the slope, and none covers any House from an arc
   * camera or the overview. The Scene draws them live, so they are no part
   * of the bake.
   */
  framing: z.array(z.tuple([z.number(), z.number(), z.number().positive()])).optional(),
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
/** What the Scene and its Project Panel know of a Project: its title block and camera block, without the House. */
export type SceneProject = ReturnType<typeof sceneProject>;
export type Placement = z.infer<typeof Placement>;
export type SceneLayout = z.infer<typeof SceneLayout>;

/**
 * A Project as the client Scene gets it: none of its House, write-up or
 * images, only its Interiors' GLB nodes, the hero Interior first, whose
 * baked textures join the Scene's downloads.
 */
export const sceneProject = ({ slug, name, location, elevation, year, floorArea, lede, camera, house, images }: Project) => ({
  slug,
  name,
  location,
  elevation,
  year,
  floorArea,
  lede,
  camera,
  interiors: interiors(house, images.interior.glazingFace).map((i) => i.node),
});

/** How much room a partition leaves in front of it, for the furniture, and behind it, metres. */
const PARTITION_FRONT = 3.5;
const PARTITION_BEHIND = 1.0;

/**
 * Everything `validateHouse` checks, plus the parts of the record that point
 * into the House: the interior image looks out of the hero Interior, and
 * each Interior's options fit its room, measured in from its window (the
 * Glazing Face its template turns to).
 */
export function validateProject(project: Project): HouseIssue[] {
  const { house } = project;
  const issues = validateHouse(house, { floorArea: project.floorArea });
  const face = project.images.interior.glazingFace;
  const opening = house.openings.find((o) => o.name === face);
  if (!opening || opening.fill !== "glazing") {
    issues.push({
      part: "images.interior",
      message: `looks out through ${face}, which is not a Glazing Face of the House`,
    });
    return issues;
  }
  // the image shows the hero Interior, so it looks out of a room that has one
  const rooms = interiorVolumes(house);
  if (rooms.length && !rooms.some((v) => v.name === opening.volume)) {
    const names = rooms.map((v) => v.name);
    issues.push({
      part: "images.interior",
      message:
        names.length === 1
          ? `looks out through ${face}, which is in ${opening.volume}, not ${names[0]}, which has the Interior`
          : `looks out through ${face}, which is in ${opening.volume}, not ${names.join(" or ")}, which have the Interiors`,
    });
  }
  for (const { volume: room, window } of interiors(house, face)) {
    const interior = room.interior!;
    // a partition (bedroom, lounge) runs across the room, measured in from its window
    const partition = "partition" in interior ? interior.partition : undefined;
    const inward = inFrom(interiorShell(house, room).rect, window.face);
    if (partition !== undefined && (partition < PARTITION_FRONT || partition > inward.depth - PARTITION_BEHIND)) {
      issues.push({
        part: `volumes.${room.name}.interior`,
        message: `its partition is ${partition} m in from ${window.name}, in a room ${inward.depth.toFixed(2)} m deep: it must leave ${PARTITION_FRONT} m for the ${interior.kind} and ${PARTITION_BEHIND} m behind`,
      });
    }
    // a Curtain hangs where no furnished room is seen: into no Interior, or into the empty room behind the partition
    for (const o of house.openings) {
      if (!o.curtain || o.volume !== room.name) continue;
      const glass = openingRecess(house, o).back;
      const behind = partition !== undefined && Math.min(...glass.map(inward.at)) >= partition - 1e-6;
      if (!behind) {
        issues.push({
          part: `opening ${o.name}`,
          message: `hangs a Curtain, but looks into the Interior in ${room.name}${partition === undefined ? "" : " in front of its partition"}`,
        });
      }
    }
    if (interior.kind === "bedroom") {
      issues.push(...bedsideIssues(house, room, window, partition));
      continue;
    }
    if (interior.kind === "library") {
      issues.push(...libraryIssues(house, room, window));
      continue;
    }
    if (interior.kind === "dining") {
      issues.push(...diningIssues(house, room, window));
      continue;
    }
    if (interior.kind !== "lounge") continue;
    const { floor } = interiorShell(house, room);
    const limit = partition ?? inward.depth;
    // a lounge's door opens into the room beside it: another volume on its floor, high enough for a door,
    // against a wall of the room in front of any partition (the builder's `beside` and `side_door`)
    const fits = (c: Contact) =>
      c.wall === "side" ? Math.min(c.span[1], limit) - c.span[0] >= DOOR_SPAN : partition === undefined && c.span[1] - c.span[0] >= DOOR_SPAN;
    const beside = house.volumes.filter((v) => {
      const { bottom, top } = verticalExtent(house, v);
      return v !== room && bottom <= floor + 1e-6 && top >= floor + DOOR_HEIGHT;
    });
    if (interior.door && !beside.some((v) => contacts(house, room, window.face, v.rect).some(fits))) {
      issues.push({
        part: `volumes.${room.name}.interior`,
        message: `has a door, but no other volume on its floor stands against its walls in front of the partition for ${DOOR_SPAN} m`,
      });
    }
    // the fireplace goes on the wall the stone stands behind (the builder's `hearth`): never the back wall
    // behind a partition, where it would land on the partition instead
    const stone = house.stone;
    const hearth = verticalExtent(house, stone).top >= floor + 2 ? contacts(house, room, window.face, stone.rect)[0] : undefined;
    if (interior.fireplace && partition !== undefined && hearth?.wall === "back") {
      issues.push({
        part: `volumes.${room.name}.interior`,
        message: `has a fireplace and a partition, but the stone stands behind the back wall, behind the partition`,
      });
    }
    // the TV takes the fire's place: the seating turns to one or the other
    if (interior.fireplace && interior.tv) {
      issues.push({
        part: `volumes.${room.name}.interior`,
        message: "has a fireplace and a TV, but a lounge turns to one or the other",
      });
    }
  }
  return issues;
}

/**
 * A bed against a side wall: how much of that wall the bed and its
 * nightstands take, in front of the back wall or the partition, and how
 * wide the room must be across, for the bed and a TV unit facing it, metres.
 */
const BEDSIDE_RUN = 3.3;
const BEDSIDE_ACROSS = 3.5;

/** The House face each side wall of a room is on, by the face its window is on: the left and right seen from outside. */
const SIDE_FACES: Record<Face, Record<"left" | "right", Face>> = {
  front: { left: "left", right: "right" },
  back: { left: "right", right: "left" },
  left: { left: "back", right: "front" },
  right: { left: "front", right: "back" },
};

/**
 * A bedroom's `bedside` and `tv`, as the builder's `bedroom` places them: the
 * bed's head against the side wall `bedside` names, at the back of the room
 * in front of any partition, and the TV across from it on the other side
 * wall. Both walls need the room for them, and no glass or door there.
 */
function bedsideIssues(house: House, room: House["volumes"][number], window: House["openings"][number], partition?: number): HouseIssue[] {
  const interior = room.interior;
  if (interior?.kind !== "bedroom") return [];
  const part = `volumes.${room.name}.interior`;
  const { bedside, tv } = interior;
  if (!bedside) {
    return tv ? [{ part, message: "has a TV, but no bedside: the TV faces the bed from a side wall, so the bed's head needs the other" }] : [];
  }
  const shell = interiorShell(house, room).rect;
  const inward = inFrom(shell, window.face);
  const limit = partition ?? inward.depth;
  const behind = partition === undefined ? "the back wall" : "the partition";
  const across = window.face === "front" || window.face === "back" ? shell.x1 - shell.x0 : shell.y1 - shell.y0;
  const issues: HouseIssue[] = [];
  if (across < BEDSIDE_ACROSS) {
    issues.push({ part, message: `is ${across.toFixed(2)} m across: a bed against a side wall needs ${BEDSIDE_ACROSS} m` });
  }
  if (limit < BEDSIDE_RUN) {
    issues.push({ part, message: `is ${limit.toFixed(2)} m deep in front of ${behind}: a bed against a side wall takes ${BEDSIDE_RUN} m of it` });
  }
  const walls: ["bed" | "TV", "left" | "right"][] = [["bed", bedside]];
  if (tv) walls.push(["TV", bedside === "left" ? "right" : "left"]);
  for (const [what, side] of walls) {
    const face = SIDE_FACES[window.face][side];
    for (const o of house.openings) {
      if (o.volume !== room.name || o.face !== face) continue;
      const [a, b] = openingRecess(house, o).back.map(inward.at);
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      if (hi > limit - BEDSIDE_RUN + 1e-6 && lo < limit - 1e-6) {
        issues.push({
          part,
          message: `its ${what} stands against the ${side} wall, but ${o.name} is there, ${lo.toFixed(2)} to ${hi.toFixed(2)} m in from ${window.name}: the ${what} takes the ${BEDSIDE_RUN} m in front of ${behind}`,
        });
      }
    }
  }
  return issues;
}

/** How much of its side wall a library's desk takes, centred along it, metres: the builder's `C.DESK_LENGTH` and a margin. */
const DESK_RUN = 2.6;
/**
 * A library's door, on its side wall: how far its far jamb stands in front
 * of the back wall, clear of the back wall's shelves, and how wide it is,
 * metres: the builder's `library` and `C.DOOR_WIDTH`.
 */
const LIBRARY_DOOR_BACK = 0.66;
const LIBRARY_DOOR_WIDTH = 0.9;

/**
 * A library's `desk` and `door`, as the builder's `library` places them:
 * the desk centred along the side wall it names, and the door toward the
 * back of its side wall. Each needs its span of the wall free of glass and
 * doors, and of each other.
 */
function libraryIssues(house: House, room: House["volumes"][number], window: House["openings"][number]): HouseIssue[] {
  const interior = room.interior;
  if (interior?.kind !== "library") return [];
  const part = `volumes.${room.name}.interior`;
  const inward = inFrom(interiorShell(house, room).rect, window.face);
  const d = inward.depth;
  const pieces: { what: "desk" | "door"; side: "left" | "right"; span: [number, number] }[] = [];
  if (interior.desk) pieces.push({ what: "desk", side: interior.desk, span: [(d - DESK_RUN) / 2, (d + DESK_RUN) / 2] });
  if (interior.door) {
    pieces.push({ what: "door", side: interior.door, span: [d - LIBRARY_DOOR_BACK - LIBRARY_DOOR_WIDTH, d - LIBRARY_DOOR_BACK] });
  }
  const issues: HouseIssue[] = [];
  const at = ([lo, hi]: [number, number]) => `${lo.toFixed(2)} to ${hi.toFixed(2)} m in from ${window.name}`;
  for (const { what, side, span } of pieces) {
    if (span[0] < 0) {
      issues.push({ part, message: `is ${d.toFixed(2)} m deep, too shallow for its ${what} on the ${side} wall` });
      continue;
    }
    const face = SIDE_FACES[window.face][side];
    for (const o of house.openings) {
      if (o.volume !== room.name || o.face !== face) continue;
      const [a, b] = openingRecess(house, o).back.map(inward.at);
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      if (hi > span[0] + 1e-6 && lo < span[1] - 1e-6) {
        issues.push({ part, message: `its ${what} is on the ${side} wall, but ${o.name} is there, ${at([lo, hi])}: the ${what} takes ${at(span)}` });
      }
    }
  }
  const [desk, door] = [pieces.find((p) => p.what === "desk"), pieces.find((p) => p.what === "door")];
  if (desk && door && desk.side === door.side && door.span[0] < desk.span[1] - 1e-6) {
    issues.push({ part, message: `its door and its desk are both on the ${desk.side} wall, and the door, ${at(door.span)}, runs into the desk` });
  }
  return issues;
}

/** How wide a dining room with `seating` must be, for the seating in a third of it and the table in the rest, metres. */
const SEATING_ROOM_WIDTH = 7.0;

/** A dining room's `seating`, as the builder's `dining` places it: in the third of the room at the end it names. */
function diningIssues(house: House, room: House["volumes"][number], window: House["openings"][number]): HouseIssue[] {
  const interior = room.interior;
  if (interior?.kind !== "dining" || !interior.seating) return [];
  const rect = interiorShell(house, room).rect;
  const width = window.face === "front" || window.face === "back" ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
  if (width >= SEATING_ROOM_WIDTH) return [];
  return [
    {
      part: `volumes.${room.name}.interior`,
      message: `is ${width.toFixed(2)} m wide: a dining room with seating needs ${SEATING_ROOM_WIDTH} m, a third for the seating and the rest for the table`,
    },
  ];
}

/** How much wall a door into the room beside the Interior needs in common with that room, and how high that room must be, metres. */
const DOOR_SPAN = 2.1;
const DOOR_HEIGHT = 2.4;

/** A wall of the room a solid stands against: a side wall, with its span measured in from the window wall, or the back wall. */
type Contact = { wall: "side" | "back"; span: [number, number] };

/**
 * The walls of an Interior's room that a solid stands against outside, as
 * the builder's `against` finds them: its span along the room shell, at
 * least 1.2 m, and never the window's own wall. In the order x0, x1, y0, y1.
 */
function contacts(house: House, room: House["volumes"][number], face: Face, solid: Rect): Contact[] {
  const v = room.rect;
  const r = interiorShell(house, room).rect;
  const inward = inFrom(r, face);
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const opposite = { front: "back", back: "front", left: "right", right: "left" }[face];
  const planes: [Face, boolean, "x" | "y", number][] = [
    ["left", eq(solid.x1, v.x0), "x", r.x0],
    ["right", eq(solid.x0, v.x1), "x", r.x1],
    ["front", eq(solid.y1, v.y0), "y", r.y0],
    ["back", eq(solid.y0, v.y1), "y", r.y1],
  ];
  const found: Contact[] = [];
  for (const [side, touching, axis, at] of planes) {
    const [lo, hi] =
      axis === "x" ? [Math.max(solid.y0, r.y0), Math.min(solid.y1, r.y1)] : [Math.max(solid.x0, r.x0), Math.min(solid.x1, r.x1)];
    if (!touching || hi - lo < 1.2 || side === face) continue;
    if (side === opposite) {
      found.push({ wall: "back", span: [lo, hi] });
      continue;
    }
    const [a, b] = [lo, hi].map((t) => inward.at(axis === "x" ? [at, t] : [t, at]));
    found.push({ wall: "side", span: [Math.min(a, b), Math.max(a, b)] });
  }
  return found;
}

/**
 * How far a plan point is in from one wall of a room, the wall on `face`,
 * and how deep the room is from that wall.
 */
function inFrom(rect: Rect, face: Face): { at: (p: readonly [number, number]) => number; depth: number } {
  switch (face) {
    case "front":
      return { at: ([, y]) => y - rect.y0, depth: rect.y1 - rect.y0 };
    case "back":
      return { at: ([, y]) => rect.y1 - y, depth: rect.y1 - rect.y0 };
    case "left":
      return { at: ([x]) => x - rect.x0, depth: rect.x1 - rect.x0 };
    case "right":
      return { at: ([x]) => rect.x1 - x, depth: rect.x1 - rect.x0 };
  }
}
