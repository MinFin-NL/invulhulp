import { describe, it, expect } from 'vitest'
import { assignUserColors, colorForUser } from './dossierTransport'

describe('collaborator colours', () => {
  it('keeps a person on their own colour when nobody else has it', () => {
    expect(assignUserColors(['alice']).get('alice')).toBe(colorForUser('alice'))
  })

  it('gives everyone present a different Rijkshuisstijl colour, up to twelve people', () => {
    const subs = Array.from({ length: 12 }, (_, i) => `user-${i}`)
    const colors = assignUserColors(subs)
    expect(new Set(colors.values()).size).toBe(12)
    for (const c of colors.values()) expect(c).toMatch(/^var\(--semantics-categories-[a-z]+-filled-background-color\)$/)
  })

  it('assigns the same colours whatever order the roster arrives in', () => {
    const subs = ['c', 'a', 'b', 'd', 'e']
    expect([...assignUserColors(subs)].sort()).toEqual([...assignUserColors([...subs].reverse())].sort())
  })

  it('counts a person with two tabs open once', () => {
    expect(assignUserColors(['a', 'a', 'b']).size).toBe(2)
  })
})
