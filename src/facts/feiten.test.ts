import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FormConfig, Question } from '../models/Assessment'
import { KENMERK_IDS, type Kenmerken } from '../utils/toepassingsscan'
import { FEITEN } from './vocabulaire'
import { feitTekst, isVoorstel, resolveFeiten, voorstelVoor } from './resolveFeiten'

function read<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(__dirname, '../../public/forms', path), 'utf-8')) as T
}

const registry = read<{ forms: { id: string; placeholder?: string }[] }>('index.json').forms
const questions = new Map<string, Map<string, Question>>(
  registry
    .filter((f) => !f.placeholder)
    .map((f) => {
      const form = read<FormConfig>(`${f.id}.json`)
      return [f.id, new Map(form.sections.flatMap((s) => s.subsections.flatMap((ss) => ss.questions)).map((q) => [q.id, q]))]
    }),
)

function kenmerken(overrides: Partial<Kenmerken>): Kenmerken {
  return { ...(Object.fromEntries(KENMERK_IDS.map((k) => [k, 'onbekend'])) as Kenmerken), ...overrides }
}

// The vocabulary names questions by plain id, and nothing at runtime checks
// them: a renamed question would quietly stop getting its proposal.
describe('vocabulaire', () => {
  it('only names questions that exist', () => {
    const missing: string[] = []
    for (const feit of FEITEN) {
      const refs = feit.soort === 'scan' ? feit.vragen : [...feit.bronnen, ...feit.vragen]
      for (const r of refs) if (!questions.get(r.formId)?.has(r.questionId)) missing.push(`${feit.id}: ${r.formId}/${r.questionId}`)
    }
    expect(missing).toEqual([])
  })

  it('offers a scan fact only as an option the question really has', () => {
    for (const feit of FEITEN) {
      if (feit.soort !== 'scan') continue
      for (const v of feit.vragen) {
        const question = questions.get(v.formId)!.get(v.questionId)!
        expect(question.type, `${v.formId}/${v.questionId}`).toBe('radio')
        expect(question.options, `${v.formId}/${v.questionId}`).toEqual(expect.arrayContaining([v.ja, v.nee]))
      }
    }
  })

  it('lists every voorblad source among the questions it is proposed in', () => {
    for (const feit of FEITEN) {
      if (feit.soort !== 'voorblad') continue
      for (const b of feit.bronnen) {
        expect(feit.vragen, feit.id).toContainEqual(b)
      }
    }
  })
})

describe('resolveFeiten', () => {
  it('knows nothing before the scan and before anyone typed a voorblad field', () => {
    const feiten = resolveFeiten({ forms: {}, kenmerken: null })
    for (const feit of Object.values(feiten)) expect(feit.waarde).toBeNull()
    expect(voorstelVoor(feiten, 'aiia', '5.2.2')).toBeNull()
  })

  it('turns the scan into the yes or no option, and leaves an unknown open', () => {
    const ja = resolveFeiten({ forms: {}, kenmerken: kenmerken({ persoonsgegevens: true }) })
    expect(voorstelVoor(ja, 'aiia', '5.2.2')).toMatchObject({ waarde: 'Ja', herkomst: { soort: 'scan' } })
    const nee = resolveFeiten({ forms: {}, kenmerken: kenmerken({ persoonsgegevens: false }) })
    expect(voorstelVoor(nee, 'quickscan', 'qs_d.persoonsgegevens')?.waarde).toBe('Nee')
    const onbekend = resolveFeiten({ forms: {}, kenmerken: kenmerken({}) })
    expect(voorstelVoor(onbekend, 'aiia', '5.2.2')).toBeNull()
  })

  it('reads a voorblad fact from the first form in its chain that has it', () => {
    const feiten = resolveFeiten({
      forms: {
        aanbiedingsformulier: { answers: { 'aa_a.naam_opdrachtgever': 'Later ingevuld' } },
        intake: { answers: { 'intake_a.naam_opdrachtgever': '<p>Mr. A. Opdrachtgever</p>' } },
      },
      kenmerken: null,
    })
    expect(feiten.opdrachtgever.herkomst).toEqual({ soort: 'formulier', formId: 'intake', questionId: 'intake_a.naam_opdrachtgever' })
    expect(feitTekst(feiten.opdrachtgever)).toBe('Mr. A. Opdrachtgever')
    expect(voorstelVoor(feiten, 'ihhtoets', 'ihh_a.opdrachtgever')?.waarde).toBe('<p>Mr. A. Opdrachtgever</p>')
  })

  it('proposes nothing for the question the fact comes from', () => {
    const feiten = resolveFeiten({ forms: { intake: { answers: { 'intake_a.contactpersoon': 'Jan' } } }, kenmerken: null })
    expect(voorstelVoor(feiten, 'intake', 'intake_a.contactpersoon')).toBeNull()
    expect(voorstelVoor(feiten, 'aanbiedingsformulier', 'aa_a.contactpersoon')?.waarde).toBe('Jan')
  })

  it('treats an empty source as absent and moves down the chain', () => {
    const feiten = resolveFeiten({
      forms: { intake: { answers: { 'intake_a.directie_afdeling': '' } }, modelcard: { answers: { 'mc_a.afdeling': 'DGFZ' } } },
      kenmerken: null,
    })
    expect(feiten.directie_afdeling.herkomst).toMatchObject({ formId: 'modelcard' })
  })
})

describe('isVoorstel', () => {
  it('recognises a proposal that is still in place, until someone changes it', () => {
    const feiten = resolveFeiten({ forms: { intake: { answers: { 'intake_a.contactpersoon': 'Jan' } } }, kenmerken: kenmerken({ persoonsgegevens: true }) })
    const contact = voorstelVoor(feiten, 'aanbiedingsformulier', 'aa_a.contactpersoon')!
    expect(isVoorstel(contact, '<p>Jan</p>')).toBe(true)
    expect(isVoorstel(contact, 'Piet')).toBe(false)
    const pg = voorstelVoor(feiten, 'aiia', '5.2.2')!
    // A follow-up typed under the chosen option keeps it the scan's answer.
    expect(isVoorstel(pg, 'Ja\n---\nNamen en adressen')).toBe(true)
    expect(isVoorstel(pg, 'Nee')).toBe(false)
  })
})
