import { describe, it, expect } from 'vitest'
import { withChecked } from './checkedList'

describe('withChecked', () => {
  it('survives the double change event of a single click', () => {
    const once = withChecked(['a'], 'b', true)
    expect(once).toEqual(['a', 'b'])
    // The second event reports the same state: nothing changes, same array back.
    expect(withChecked(once, 'b', true)).toBe(once)
    const off = withChecked(once, 'b', false)
    expect(off).toEqual(['a'])
    expect(withChecked(off, 'b', false)).toBe(off)
  })
})
