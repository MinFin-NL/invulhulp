// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import { copyValueFor, isEmptyAnswer, sourceAnswerText } from './crossFormCopy'
import { serializeTableAnswer } from './tableAnswer'
import type { CrossFormMapping, FormConfig, Question } from '../models/Assessment'

// A miniature "intake" form: one of every question type, so a copy mapping can
// be pointed at each of them.
const sourceForm = {
  id: 'intake',
  sections: [
    {
      id: 's', title: 's', part: 'A',
      subsections: [
        {
          id: 'ss', title: 'ss',
          questions: [
            { id: 'i.tekst', text: 'Aanleiding', type: 'text', importance: 'optional' },
            { id: 'i.radio', text: 'Opvolging', type: 'radio', importance: 'optional', options: ['Ja', 'Nee'] },
            { id: 'i.check', text: 'Budget', type: 'checkbox', importance: 'optional', options: ['Investering', 'Exploitatie'] },
            {
              id: 'i.tabel', text: "Risico's", type: 'table', importance: 'optional',
              columns: [{ id: 'r', label: 'Risico' }, { id: 'm', label: 'Maatregel' }],
            },
          ],
        },
      ],
    },
  ],
} as unknown as FormConfig

function q(overrides: Partial<Question>): Question {
  return { id: 't', text: 'Doel', type: 'text', importance: 'optional', ...overrides } as Question
}

function mapping(sourceQuestionIds: string[]): CrossFormMapping {
  return {
    targetFormId: 'aanbiedingsformulier',
    targetQuestionId: 't',
    sourceFormId: 'intake',
    sourceQuestionIds,
    synthesisHint: '',
    mode: 'copy',
  }
}

function answers(map: Record<string, string | string[]>) {
  return (formId: string, questionId: string) => (formId === 'intake' ? map[questionId] : undefined)
}

describe('isEmptyAnswer', () => {
  it('treats an untouched answer and empty HTML as empty', () => {
    expect(isEmptyAnswer(undefined)).toBe(true)
    expect(isEmptyAnswer('')).toBe(true)
    expect(isEmptyAnswer('<p></p>')).toBe(true)
    expect(isEmptyAnswer([])).toBe(true)
    expect(isEmptyAnswer('<p>Iets</p>')).toBe(false)
    expect(isEmptyAnswer(['Investering'])).toBe(false)
  })
})

describe('copyValueFor', () => {
  it('copies rich text verbatim, HTML and all', () => {
    const value = copyValueFor(
      mapping(['i.tekst']), q({}), answers({ 'i.tekst': '<p>Wettelijke <strong>plicht</strong></p>' }), sourceForm,
    )
    expect(value).toBe('<p>Wettelijke <strong>plicht</strong></p>')
  })

  it('returns null when the source question has no answer yet', () => {
    expect(copyValueFor(mapping(['i.tekst']), q({}), answers({}), sourceForm)).toBeNull()
  })

  it('stacks several sources under their question texts', () => {
    const value = copyValueFor(
      mapping(['i.tekst', 'i.radio']),
      q({}),
      answers({ 'i.tekst': '<p>Aanleiding</p>', 'i.radio': 'Ja' }),
      sourceForm,
    )
    expect(value).toBe('<p>Aanleiding:</p><p>Aanleiding</p><p>Opvolging:</p><p>Ja</p>')
  })

  it('renders a source table as readable lines when the target is free text', () => {
    const table = serializeTableAnswer({ rows: [['Uitloop', 'Extra capaciteit'], ['', '']], notes: 'Nog te toetsen' })
    const value = copyValueFor(mapping(['i.tabel']), q({}), answers({ 'i.tabel': table }), sourceForm)
    expect(value).toBe('<p>Risico: Uitloop — Maatregel: Extra capaciteit</p><p>Nog te toetsen</p>')
  })

  it('copies a radio answer only when the target offers that option', () => {
    const target = q({ type: 'radio', options: ['Ja', 'Nee'] })
    expect(copyValueFor(mapping(['i.radio']), target, answers({ 'i.radio': 'Ja' }), sourceForm)).toBe('Ja')

    const narrower = q({ type: 'radio', options: ['Akkoord', 'Niet akkoord'] })
    expect(copyValueFor(mapping(['i.radio']), narrower, answers({ 'i.radio': 'Ja' }), sourceForm)).toBeNull()
  })

  it('translates an option through optionMap when the target words it differently', () => {
    const target = q({ type: 'radio', options: ['Akkoord', 'Niet akkoord'] })
    const translated = { ...mapping(['i.radio']), optionMap: { Ja: 'Akkoord', Nee: 'Niet akkoord' } }
    expect(copyValueFor(translated, target, answers({ 'i.radio': 'Nee' }), sourceForm)).toBe('Niet akkoord')
    // An option the map does not cover still has to exist in the target as is.
    expect(copyValueFor({ ...translated, optionMap: { Ja: 'Akkoord' } }, target, answers({ 'i.radio': 'Nee' }), sourceForm)).toBeNull()
  })

  it('drops a radio follow-up the target does not ask for', () => {
    const target = q({ type: 'radio', options: ['Ja', 'Nee'] })
    const value = copyValueFor(mapping(['i.radio']), target, answers({ 'i.radio': 'Ja\n---\nomdat het moet' }), sourceForm)
    expect(value).toBe('Ja')

    const withFollowUp = q({ type: 'radio', options: ['Ja', 'Nee'], followUp: 'Licht toe' })
    expect(
      copyValueFor(mapping(['i.radio']), withFollowUp, answers({ 'i.radio': 'Ja\n---\nomdat het moet' }), sourceForm),
    ).toBe('Ja\n---\nomdat het moet')
  })

  it('keeps only the checkbox options the target actually offers', () => {
    const target = q({ type: 'checkbox', options: ['Investering'] })
    const value = copyValueFor(
      mapping(['i.check']), target, answers({ 'i.check': ['Investering', 'Exploitatie'] }), sourceForm,
    )
    expect(value).toEqual(['Investering'])

    const unrelated = q({ type: 'checkbox', options: ['Iets anders'] })
    expect(copyValueFor(mapping(['i.check']), unrelated, answers({ 'i.check': ['Investering'] }), sourceForm)).toBeNull()
  })

  it('honours options resolved at render time (optionsFrom)', () => {
    const target = q({ type: 'radio', options: [] })
    expect(copyValueFor(mapping(['i.radio']), target, answers({ 'i.radio': 'Ja' }), sourceForm, ['Ja'])).toBe('Ja')
  })

  it('copies a table only into a target with the same columns', () => {
    const table = serializeTableAnswer({ rows: [['Uitloop', 'Extra capaciteit']], notes: '' })
    const same = q({ type: 'table', columns: [{ id: 'r', label: 'Risico' }, { id: 'm', label: 'Maatregel' }] })
    expect(copyValueFor(mapping(['i.tabel']), same, answers({ 'i.tabel': table }), sourceForm)).toBe(table)

    const different = q({ type: 'table', columns: [{ id: 'x', label: 'Anders' }] })
    expect(copyValueFor(mapping(['i.tabel']), different, answers({ 'i.tabel': table }), sourceForm)).toBeNull()
  })

  it('never merges two sources into a choice question', () => {
    const target = q({ type: 'checkbox', options: ['Investering'] })
    expect(
      copyValueFor(mapping(['i.check', 'i.radio']), target, answers({ 'i.check': ['Investering'], 'i.radio': 'Ja' }), sourceForm),
    ).toBeNull()
  })

  it('escapes HTML that comes out of a non-text source', () => {
    const value = copyValueFor(mapping(['i.check']), q({}), answers({ 'i.check': ['<script>x</script>'] }), sourceForm)
    expect(value).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>')
  })
})

describe('sourceAnswerText', () => {
  it('shows a table as lines rather than raw JSON', () => {
    const table = serializeTableAnswer({ rows: [['Uitloop', 'Extra capaciteit']], notes: '' })
    const question = sourceForm.sections[0].subsections[0].questions[3]
    expect(sourceAnswerText(table, question)).toBe('Risico: Uitloop — Maatregel: Extra capaciteit')
  })

  it('joins a radio answer with its follow-up', () => {
    const question = sourceForm.sections[0].subsections[0].questions[1]
    expect(sourceAnswerText('Ja\n---\nomdat het moet', question)).toBe('Ja: omdat het moet')
  })
})
