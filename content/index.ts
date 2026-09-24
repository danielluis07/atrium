import { projectOrder } from "@/content/projects";
import { sceneLayout } from "@/content/scene";
import {
  Project,
  SceneLayout,
  validateProject,
  type Placement,
} from "@/content/schema";
import * as site from "@/content/site";
import { formatIssues, parseHouse } from "@/lib/house/validate";

/**
 * The Content read interface. Everything outside `content/` reads Projects,
 * the Scene layout and the site copy through these functions.
 */
export type Content = {
  /** All Projects, in Project Index order. */
  projects(): Project[];
  /** One Project by slug, or undefined. */
  project(slug: string): Project | undefined;
  /** The Project after this one, wrapping from the last to the first. */
  nextProject(slug: string): Project;
  /** Where a Project's House stands in the Scene. */
  placement(slug: string): Placement;
  sceneLayout(): SceneLayout;
  site(): typeof site;
};

/**
 * Builds the read interface over records, checking every one first.
 * Throws naming the Project and its offending parts.
 */
export function createContent(records: unknown[], layoutInput: unknown): Content {
  const problems: string[] = [];
  const projects: Project[] = [];
  for (const [i, record] of records.entries()) {
    const label = projectLabel(record, i);
    const parsed = Project.safeParse(record);
    if (!parsed.success) {
      const house = parseHouse((record as { house?: unknown } | null)?.house);
      const houseIssues = house.ok ? [] : house.issues.map((x) => ({ ...x, part: `house.${x.part}` }));
      const other = parsed.error.issues
        .filter((x) => x.path[0] !== "house")
        .map((x) => ({ part: x.path.join(".") || "record", message: x.message }));
      problems.push(`${label}:\n${formatIssues([...other, ...houseIssues])}`);
      continue;
    }
    const issues = validateProject(parsed.data);
    if (issues.length) problems.push(`${label}:\n${formatIssues(issues)}`);
    projects.push(parsed.data);
  }

  const layout = SceneLayout.safeParse(layoutInput);
  if (!layout.success) {
    problems.push(`Scene layout:\n${layout.error.issues.map((x) => `  ${x.path.join(".")}: ${x.message}`).join("\n")}`);
  }

  const slugs = new Set<string>();
  for (const p of projects) {
    if (slugs.has(p.slug)) problems.push(`${p.name}: the slug ${p.slug} is used twice`);
    slugs.add(p.slug);
    if (layout.success && !layout.data.houses[p.slug]) {
      problems.push(`${p.name}: the Scene layout has no placement for ${p.slug}`);
    }
  }
  if (layout.success) {
    for (const slug of Object.keys(layout.data.houses)) {
      if (!slugs.has(slug)) problems.push(`Scene layout: places ${slug}, which is not a Project`);
    }
  }
  if (problems.length || !layout.success) throw new Error(`Invalid content\n${problems.join("\n")}`);

  const houses = layout.data.houses;
  const bySlug = new Map(projects.map((p) => [p.slug, p]));
  const indexOf = (slug: string) => {
    const i = projects.findIndex((p) => p.slug === slug);
    if (i < 0) throw new Error(`Unknown Project ${slug}`);
    return i;
  };

  return {
    projects: () => [...projects],
    project: (slug) => bySlug.get(slug),
    nextProject: (slug) => projects[(indexOf(slug) + 1) % projects.length],
    placement: (slug) => houses[projects[indexOf(slug)].slug],
    sceneLayout: () => layout.data,
    site: () => site,
  };
}

function projectLabel(record: unknown, i: number): string {
  const name = (record as { name?: unknown } | null)?.name;
  return typeof name === "string" ? name : `Project #${i + 1}`;
}

const content = createContent(projectOrder, sceneLayout);

export const getProjects = content.projects;
export const getProject = content.project;
export const getNextProject = content.nextProject;
export const getPlacement = content.placement;
export const getSceneLayout = content.sceneLayout;
export const getSiteCopy = content.site;
