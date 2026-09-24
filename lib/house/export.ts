import { createHash } from "node:crypto";

import type { Project, SceneLayout } from "@/content/schema";
import { validateProject } from "@/content/schema";
import { viewpoints } from "@/lib/house/cameras";
import { glazingFaces, grossFloorArea, levelElevations } from "@/lib/house/derive";
import { SCHEMA_VERSION } from "@/lib/house/schema";
import { formatIssues, type HouseIssue } from "@/lib/house/validate";

export class HouseExportError extends Error {
  constructor(
    readonly project: string,
    readonly issues: HouseIssue[],
  ) {
    super(`${project} was not exported:\n${formatIssues(issues)}`);
  }
}

/**
 * The builder JSON for one Project: the House, its placement and camera
 * block, and the derived facts the builder uses: the Glazing Faces it writes
 * into the GLB extras, and the viewpoints (the overview and arc cameras in
 * the House frame) it marks faces seen from.
 * Serialized with sorted keys so the same input always gives the same bytes.
 * Refuses a Project that fails validation, naming the offending parts.
 */
export function exportHouse(project: Project, layout: SceneLayout): string {
  const issues = validateProject(project);
  const placement = layout.houses[project.slug];
  if (!placement) issues.push({ part: "placement", message: `the Scene layout has no placement for ${project.slug}` });
  if (issues.length) throw new HouseExportError(project.name, issues);

  const { house } = project;
  const orientation = { rotation: placement.rotation, north: layout.north };
  return stableStringify({
    schemaVersion: SCHEMA_VERSION,
    slug: project.slug,
    placement: { ...placement, north: layout.north },
    camera: project.camera,
    house,
    derived: {
      levels: levelElevations(house),
      grossFloorArea: Math.round(grossFloorArea(house) * 100) / 100,
      glazingFaces: glazingFaces(house, orientation),
      viewpoints: viewpoints(project.camera, placement, layout),
    },
  });
}

/**
 * The bake hash written to a House's GLB extras: the builder JSON (House,
 * placement, camera block and overview camera) plus the builder version, so
 * a change to any of them calls for a new bake.
 */
export function bakeHash(exportJson: string, builderVersion: string): string {
  return createHash("sha256").update(exportJson).update(`\nbuilder ${builderVersion}\n`).digest("hex");
}

/** JSON with object keys sorted at every depth, two-space indented, ending in a newline. */
export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
