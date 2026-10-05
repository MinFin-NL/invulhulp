import { describe, it, expect } from 'vitest'
import { streamingTagContent } from './streamingTag'

describe('streamingTagContent', () => {
  it('is empty until the opening tag arrives', () => {
    expect(streamingTagContent('', 'suggestie')).toBe('')
    expect(streamingTagContent('Ik denk na <sugg', 'suggestie')).toBe('')
  })

  it('shows the partial content while the stream is open', () => {
    expect(streamingTagContent('<suggestie> Eerste woorden', 'suggestie')).toBe('Eerste woorden')
  })

  it('cuts at the closing tag and ignores what follows', () => {
    const raw = '<verbeterd>\nNieuwe tekst\n</verbeterd>\n<toelichting>Waarom</toelichting>'
    expect(streamingTagContent(raw, 'verbeterd')).toBe('Nieuwe tekst')
  })

  it('matches the tag case-insensitively', () => {
    expect(streamingTagContent('<SUGGESTIE>Ja</Suggestie>', 'suggestie')).toBe('Ja')
  })
})
