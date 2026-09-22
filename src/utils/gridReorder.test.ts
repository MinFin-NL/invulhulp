import { describe, expect, it } from 'vitest'
import { clampIndex, gridReorderTarget, isGridReorderKey } from './gridReorder'

// Een raster van 7 kaarten, 3 kolommen:
//   0 1 2
//   3 4 5
//   6
const COLUMNS = 3
const TOTAL = 7

describe('gridReorderTarget', () => {
  it('verplaatst links en rechts met één plaats', () => {
    expect(gridReorderTarget('ArrowRight', 0, COLUMNS, TOTAL)).toBe(1)
    expect(gridReorderTarget('ArrowLeft', 4, COLUMNS, TOTAL)).toBe(3)
  })

  it('verplaatst omhoog en omlaag met een hele rij', () => {
    expect(gridReorderTarget('ArrowDown', 1, COLUMNS, TOTAL)).toBe(4)
    expect(gridReorderTarget('ArrowUp', 5, COLUMNS, TOTAL)).toBe(2)
  })

  it('knipt af op de randen in plaats van de zet te weigeren', () => {
    // Vanaf de laatste rij omlaag: helemaal naar achteren.
    expect(gridReorderTarget('ArrowDown', 5, COLUMNS, TOTAL)).toBe(6)
    // Vanaf de eerste rij omhoog: helemaal naar voren.
    expect(gridReorderTarget('ArrowUp', 1, COLUMNS, TOTAL)).toBe(0)
  })

  it('geeft dezelfde index terug als er niets te verplaatsen valt', () => {
    expect(gridReorderTarget('ArrowLeft', 0, COLUMNS, TOTAL)).toBe(0)
    expect(gridReorderTarget('ArrowUp', 0, COLUMNS, TOTAL)).toBe(0)
    expect(gridReorderTarget('ArrowRight', TOTAL - 1, COLUMNS, TOTAL)).toBe(TOTAL - 1)
    expect(gridReorderTarget('ArrowDown', TOTAL - 1, COLUMNS, TOTAL)).toBe(TOTAL - 1)
  })

  it('valt terug op één kolom als de layout niets bruikbaars zegt', () => {
    // getComputedStyle kan 0 of 'none' opleveren voor een raster dat nog niet
    // gemeten is; omhoog en omlaag mogen dan niet in een sprong van 0 eindigen.
    expect(gridReorderTarget('ArrowDown', 2, 0, TOTAL)).toBe(3)
    expect(gridReorderTarget('ArrowUp', 2, 0, TOTAL)).toBe(1)
  })

  it('negeert toetsen die niet verplaatsen', () => {
    expect(gridReorderTarget('Enter', 2, COLUMNS, TOTAL)).toBeNull()
    expect(gridReorderTarget('a', 2, COLUMNS, TOTAL)).toBeNull()
    expect(isGridReorderKey('Escape')).toBe(false)
    expect(isGridReorderKey('ArrowUp')).toBe(true)
  })

  it('doet niets bij een lege lijst', () => {
    expect(gridReorderTarget('ArrowRight', 0, COLUMNS, 0)).toBeNull()
  })
})

describe('clampIndex', () => {
  it('houdt een index binnen de lijst', () => {
    expect(clampIndex(-3, 5)).toBe(0)
    expect(clampIndex(9, 5)).toBe(4)
    expect(clampIndex(2, 5)).toBe(2)
  })
})
