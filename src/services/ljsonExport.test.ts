import { describe, it, expect } from 'vitest'
import type { AnswerRevision, Section } from '../models/Assessment'
import { answerExportText, attributeAnswer, buildLjsonDocument } from './ljsonExport'

const ai = (text: string, at = 1): AnswerRevision => ({
  text, at, by: 'ai', trigger: 'ai-modus', model: 'azure/gpt-5.3-chat', name: 'Anouk', email: 'anouk@example.nl',
})
const human = (text: string, name: string, at = 2): AnswerRevision => ({
  text, at, by: 'human', name, email: `${name.toLowerCase()}@example.nl`,
})

const owners = (runs: ReturnType<typeof attributeAnswer>) =>
  runs.map((r) => [r.text, r.revision ? `${r.revision.by}:${r.revision.name}` : null])

describe('answerExportText', () => {
  it('maakt van Tiptap-HTML platte tekst', () => {
    expect(answerExportText('<p>Eerste alinea.</p><p>Tweede &amp; laatste.</p>')).toBe(
      'Eerste alinea.\nTweede & laatste.',
    )
  })

  it('zet een radio-antwoord met toelichting op twee regels', () => {
    expect(answerExportText('Ja\n---\n<p>Omdat het moet.</p>')).toBe('Ja\nOmdat het moet.')
  })

  it('zet checkboxen elk op een eigen regel', () => {
    expect(answerExportText(['A', 'B'])).toBe('A\nB')
  })

  it('maakt van een tabel regels met cellen', () => {
    expect(answerExportText(JSON.stringify({ rows: [['Rol', 'Naam']], notes: '' }))).toBe('Rol; Naam')
  })
})

describe('attributeAnswer', () => {
  it('geeft tekst zonder geschiedenis geen herkomst', () => {
    expect(owners(attributeAnswer([], 'Al ingevuld.'))).toEqual([['Al ingevuld.', null]])
  })

  it('laat een AI-tekst die niemand wijzigde helemaal bij de AI', () => {
    expect(owners(attributeAnswer([ai('Het systeem beantwoordt vragen.')], 'Het systeem beantwoordt vragen.')))
      .toEqual([['Het systeem beantwoordt vragen.', 'ai:Anouk']])
  })

  it('geeft wat een mens in een AI-tekst toevoegt aan die mens', () => {
    const runs = attributeAnswer(
      [ai('Het systeem beantwoordt vragen.'), human('Het systeem beantwoordt eenvoudige vragen.', 'Ruben')],
      'Het systeem beantwoordt eenvoudige vragen.',
    )
    expect(owners(runs)).toEqual([
      ['Het systeem beantwoordt ', 'ai:Anouk'],
      ['eenvoudige ', 'human:Ruben'],
      ['vragen.', 'ai:Anouk'],
    ])
  })

  it('volgt meerdere mensen na elkaar', () => {
    const runs = attributeAnswer(
      [human('Eerste zin.', 'Anouk', 1), human('Eerste zin. Tweede zin.', 'Ruben', 2)],
      'Eerste zin. Tweede zin.',
    )
    expect(owners(runs)).toEqual([
      ['Eerste zin. ', 'human:Anouk'],
      ['Tweede zin.', 'human:Ruben'],
    ])
  })

  it('rekent losse woorden die een herschrijving toevallig deelt niet aan de oude tekst toe', () => {
    const runs = attributeAnswer(
      [ai('Het wordt getest door de antwoorden te vergelijken.'), human('Daarom wordt elke maand een steekproef beoordeeld door twee medewerkers.', 'Ruben')],
      'Daarom wordt elke maand een steekproef beoordeeld door twee medewerkers.',
    )
    expect(owners(runs)).toEqual([
      ['Daarom wordt elke maand een steekproef beoordeeld door twee medewerkers.', 'human:Ruben'],
    ])
  })

  it('geeft tekst die na de laatste revisie verscheen geen herkomst', () => {
    const runs = attributeAnswer([human('Eerste zin.', 'Anouk')], 'Eerste zin. Onbekend.')
    expect(owners(runs)).toEqual([
      ['Eerste zin. ', 'human:Anouk'],
      ['Onbekend.', null],
    ])
  })
})

describe('buildLjsonDocument', () => {
  const sections: Section[] = [
    {
      id: 's1',
      title: 'Deel A',
      part: 'A',
      subsections: [
        {
          id: 'sub',
          title: 'Doel',
          questions: [
            { id: 'q1', text: 'Wat is het doel?', type: 'text', importance: 'mandatory' },
            { id: 'q2', text: 'Leeg?', type: 'text', importance: 'optional' },
          ],
        },
      ],
    },
  ]

  it('telt indexen in code points, zoals Python', async () => {
    const doc = await buildLjsonDocument({
      documentId: 'd:f',
      title: 'Titel 🚀',
      sections,
      answers: { q1: '<p>Doel 🎯 bereikt.</p>' },
      history: { q1: [human('Doel 🎯 bereikt.', 'Anouk')] },
    })
    const [span] = doc.provenance_spans
    expect([...doc.text].slice(span.start_idx, span.end_idx).join('')).toBe('Doel 🎯 bereikt.')
    expect(span.source_type).toBe('human')
  })

  it('laat lege vragen weg en hasht de tekst met SHA-256', async () => {
    const doc = await buildLjsonDocument({
      documentId: 'd:f', title: 'T', sections, answers: { q1: 'Ja.', q2: '' }, history: {},
    })
    expect(doc.text).toBe('T\n\nDeel A\n\nWat is het doel?\nJa.\n')
    expect(doc.provenance_spans).toEqual([])
    expect(doc.document_hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
