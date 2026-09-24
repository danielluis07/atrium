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

/** A Level mark on a section drawing, in metres from the datum: `±0.00`, `+3.50`, `−3.20`. */
export function formatLevel(metres: number): string {
  const rounded = Math.round(metres * 100) / 100;
  if (rounded === 0) return "±0.00";
  return `${rounded < 0 ? MINUS : "+"}${Math.abs(rounded).toFixed(2)}`;
}

/** An item's number on the sheet, in two digits: `01`. */
export function formatIndex(n: number): string {
  return String(n).padStart(2, "0");
}
