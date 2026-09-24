import { kvaloya } from "@/content/projects/kvaloya";
import { lyngen } from "@/content/projects/lyngen";
import { reine } from "@/content/projects/reine";
import { senja } from "@/content/projects/senja";
import type { Project } from "@/content/schema";

/** The Project order: the Project Index and the next-Project wrap both follow it. */
export const projectOrder: Project[] = [lyngen, senja, kvaloya, reine];
