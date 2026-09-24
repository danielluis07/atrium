import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { getProject, getProjects } from "@/content";

const size = { width: 1200, height: 630 };

export function generateStaticParams() {
  return getProjects().map((p) => ({ slug: p.slug }));
}

// Unlike the image function, this receives its params already resolved.
export function generateImageMetadata({ params }: { params: { slug: string } }) {
  const project = getProject(params.slug);
  if (!project) return [];
  return [{ id: "hero", alt: project.images.hero.alt, size, contentType: "image/jpeg" }];
}

/**
 * The OG image is the Project's hero image, cropped to 1200×630 and
 * re-encoded as JPEG, since link previews don't all read AVIF.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const project = getProject((await params).slug);
  if (!project) return new Response(null, { status: 404 });
  const hero = await readFile(path.join(process.cwd(), "public", project.images.hero.src));
  const jpeg = await sharp(hero).resize(size.width, size.height, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg" } });
}
