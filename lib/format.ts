const MINUS = "−";

/** Elevation above sea level, signed like a level mark: `+40 m`. */
export function formatElevation(metres: number): string {
  const sign = metres < 0 ? MINUS : "+";
  return `${sign}${Math.abs(metres)} m`;
}

/** Gross floor area: `290 m²`. */
export function formatArea(squareMetres: number): string {
  return `${squareMetres} m²`;
}
