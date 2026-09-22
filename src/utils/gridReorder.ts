/**
 * Verplaatsen met de pijltjestoetsen in een raster.
 *
 * In een lijst is dit triviaal (±1), in een raster niet: omhoog en omlaag zijn
 * ±het aantal kolommen, en dat aantal staat nergens vast — het raster is
 * `auto-fill`, dus alleen de layout weet hoeveel kolommen er nu naast elkaar
 * passen. De aanroeper leest dat af en geeft het hier door.
 *
 * Buiten de rand knippen we af in plaats van de zet te weigeren: van de laatste
 * kaart een rij omlaag betekent "helemaal naar achteren", wat is wat je
 * bedoelt. Alleen wanneer er daarna niets verandert is er echt geen zet, en
 * dat zegt de aanroeper hardop.
 */
export type GridReorderKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

const DELTAS: Record<GridReorderKey, (columns: number) => number> = {
  ArrowLeft: () => -1,
  ArrowRight: () => 1,
  ArrowUp: (columns) => -columns,
  ArrowDown: (columns) => columns,
}

export function isGridReorderKey(key: string): key is GridReorderKey {
  return key in DELTAS
}

/**
 * De doelindex voor een toets, afgeknipt op de lijst. `null` als de toets geen
 * verplaatstoets is; gelijk aan `index` als er in die richting niets meer te
 * winnen valt.
 */
export function gridReorderTarget(
  key: string,
  index: number,
  columns: number,
  total: number,
): number | null {
  if (!isGridReorderKey(key)) return null
  if (total <= 0) return null
  const safeColumns = Math.max(1, Math.floor(columns))
  const clamped = Math.max(0, Math.min(total - 1, index))
  return clampIndex(clamped + DELTAS[key](safeColumns), total)
}

/** Een index binnen de lijst houden. */
export function clampIndex(index: number, total: number): number {
  return Math.max(0, Math.min(total - 1, index))
}
