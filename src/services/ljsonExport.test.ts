import { describe, it, expect } from 'vitest'
import type { AnswerRevision, AnswerSource, Section } from '../models/Assessment'
import { answerExportText, attributeAnswer, buildLjsonDocument, findCopies } from './ljsonExport'

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

  it('markeert de formuliertekst als gekopieerd uit de formulierdefinitie, door de tool', async () => {
    const raw = JSON.stringify({ title: 'T', sections: [{ title: 'Deel A', q: 'Wat is het doel?' }] }, null, 2)
    const doc = await buildLjsonDocument({
      documentId: 'd:f', title: 'T', subtitle: 'Mijn systeem', sections,
      answers: { q1: 'Ja.' }, history: {},
      formDefinition: { name: 'Formulier (urn:x, f.json)', raw, tool: { name: 'Invulhulp', version: '1.2.3' } },
      exportedAt: Date.parse('2026-10-23T12:00:00Z'),
    })
    const copied = doc.provenance_spans.filter((s) => s.source_type === 'copied')
    expect(copied.map((s) => doc.text.slice(s.start_idx, s.end_idx))).toEqual(['T', 'Deel A', 'Wat is het doel?'])
    for (const span of copied) {
      if (span.source_type !== 'copied') continue
      expect(span.metadata.copied_by_name).toBe('Invulhulp 1.2.3')
      expect(span.metadata.copied_by_email).toBe('invulhulp@1.2.3')
      expect(span.metadata.timestamp).toBe('2026-10-23T12:00:00.000Z')
    }
    const question = copied[2]
    if (question.source_type !== 'copied') throw new Error('expected copied')
    expect(raw.slice(question.metadata.original_start_idx)).toMatch(/^Wat is het doel\?/)
  })

  it('geeft elk stuk tekst zijn rol in het formulier', async () => {
    const doc = await buildLjsonDocument({
      documentId: 'd:f', title: 'T', subtitle: 'Mijn systeem', sections, answers: { q1: '<p>Ja.</p>' }, history: {},
    })
    expect(doc.structure.map((b) => [b.role, doc.text.slice(b.start_idx, b.end_idx)])).toEqual([
      ['title', 'T'],
      ['subtitle', 'Mijn systeem'],
      ['section', 'Deel A'],
      ['question', 'Wat is het doel?'],
      ['answer', 'Ja.'],
    ])
  })
})

const passage = (text: string, chunkIndex = 0): AnswerSource => ({
  docId: 'doc1', docName: 'Projectplan.pdf', chunkIndex, text, score: 0.9,
})

describe('findCopies', () => {
  const chunk = passage('Inleiding.  De wachttijd liep in maart op tot gemiddeld 24 minuten per beller, vooral rond de aangifte.')

  it('vindt een letterlijk overgenomen stuk, ook met andere hoofdletters en leestekens', () => {
    const run = 'Volgens het plan: de Wachttijd liep in maart op tot gemiddeld 24 minuten per beller. Dat is te lang.'
    const [copy, ...rest] = findCopies(run, [chunk])
    expect(rest).toEqual([])
    expect(run.slice(copy.start, copy.end)).toBe('de Wachttijd liep in maart op tot gemiddeld 24 minuten per beller.')
  })

  it('negeert gedeelde stukken korter dan acht woorden', () => {
    expect(findCopies('De wachttijd liep in maart op, zegt het plan, en dat is lang genoeg.', [chunk])).toEqual([])
  })

  it('wijst elk woord aan één kopie toe, de langste eerst', () => {
    const other = passage('Bellers wachten soms lang. De kennisbank wordt elke week bijgewerkt door de redactie van de BelastingTelefoon.', 1)
    const run = 'De wachttijd liep in maart op tot gemiddeld 24 minuten. De kennisbank wordt elke week bijgewerkt door de redactie.'
    expect(findCopies(run, [chunk, other]).map((c) => c.source.chunkIndex)).toEqual([0, 1])
  })
})

describe('buildLjsonDocument met brondocumenten', () => {
  const sections: Section[] = [{
    id: 's1', title: 'Deel A', part: 'A',
    subsections: [{ id: 'sub', title: 'Doel', questions: [{ id: 'q1', text: 'Waarom?', type: 'text', importance: 'mandatory' }] }],
  }]
  const answer = 'Aanleiding is dat de wachttijd in maart opliep tot gemiddeld 24 minuten per beller, vooral rond de aangifte.'
  const content = 'Projectplan\n\nInleiding.\nDe wachttijd liep in maart op tot gemiddeld 24 minuten per beller, vooral rond de aangifte.'

  it('zet een letterlijke kopie als genest fragment binnen het AI-fragment, met de plek in het document', async () => {
    const doc = await buildLjsonDocument({
      documentId: 'd:f', title: 'T', sections,
      answers: { q1: answer },
      history: { q1: [ai(answer)] },
      sources: { q1: { sources: [passage('De wachttijd liep in maart op tot gemiddeld 24 minuten per beller, vooral rond de aangifte.')], grounded: true, createdAt: 1 } },
      documents: [{ id: 'doc1', name: 'Projectplan.pdf', content }],
    })
    const [aiSpan, copied] = doc.provenance_spans
    expect(aiSpan.source_type).toBe('ai')
    expect(copied.source_type).toBe('copied')
    expect(copied.start_idx).toBeGreaterThanOrEqual(aiSpan.start_idx)
    expect(copied.end_idx).toBeLessThanOrEqual(aiSpan.end_idx)
    expect(doc.text.slice(copied.start_idx, copied.end_idx)).toBe('tot gemiddeld 24 minuten per beller, vooral rond de aangifte.')
    if (copied.source_type !== 'copied') throw new Error('expected copied')
    expect(content.slice(copied.metadata.original_start_idx)).toMatch(/^tot gemiddeld 24 minuten/)
    expect(copied.metadata.copied_by_email).toBe('anouk@example.nl')
  })

  it('zoekt alleen in AI-tekst, niet in wat een mens typte', async () => {
    const doc = await buildLjsonDocument({
      documentId: 'd:f', title: 'T', sections,
      answers: { q1: answer },
      history: { q1: [human(answer, 'Ruben')] },
      sources: { q1: { sources: [passage(content)], grounded: true, createdAt: 1 } },
    })
    expect(doc.provenance_spans.map((s) => s.source_type)).toEqual(['human'])
  })
})
