import Image from "next/image";

/**
 * The Scene at grade (±0.00), for now a placeholder still of the four
 * Houses. The live Scene replaces it.
 */
export function HeroStill() {
  return (
    <section
      aria-label="Scene"
      data-depth={0}
      className="relative h-[calc(100svh-var(--header-height))] min-h-96 overflow-hidden bg-[oklch(0.26_0.06_262)]">
      <Image
        src="/scene/still.avif"
        alt="Four concrete houses on a snowy slope above a fjord at blue hour, their windows lit."
        fill
        preload
        sizes="100vw"
        className="object-cover object-bottom"
      />
    </section>
  );
}
