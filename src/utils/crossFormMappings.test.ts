import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CrossFormMapping, FormConfig, Question } from '../models/Assessment'

// Mappings reference forms and question ids by plain string, and nothing at
// runtime validates them: a typo silently makes the suggestion never appear.
// These tests are that validation.

function read<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(__dirname, '../../public/forms', path), 'utf-8')) as T
}

const mappings = read<CrossFormMapping[]>('crossFormMappings.json')
const registry = read<{ forms: { id: string; placeholder?: string }[] }>('index.json').forms
const realForms = registry.filter((f) => !f.placeholder).map((f) => f.id)

const questions = new Map<string, Map<string, Question>>(
  realForms.map((id) => {
    const form = read<FormConfig>(`${id}.json`)
    const qs = form.sections.flatMap((s) => s.subsections.flatMap((ss) => ss.questions))
    return [id, new Map(qs.map((q) => [q.id, q]))]
  }),
)

function label(m: CrossFormMapping): string {
  return `${m.sourceFormId}[${m.sourceQuestionIds.join(',')}] → ${m.targetFormId}[${m.targetQuestionId}]`
}

describe('crossFormMappings.json', () => {
  it('only references forms that exist and are not placeholders', () => {
    const unknown = mappings
      .filter((m) => !realForms.includes(m.targetFormId) || !realForms.includes(m.sourceFormId))
      .map(label)
    expect(unknown).toEqual([])
  })

  it('only references question ids that exist', () => {
    const unknown: string[] = []
    for (const m of mappings) {
      if (!questions.get(m.targetFormId)?.has(m.targetQuestionId)) unknown.push(`target ${label(m)}`)
      for (const q of m.sourceQuestionIds) {
        if (!questions.get(m.sourceFormId)?.has(q)) unknown.push(`bron ${m.sourceFormId}/${q}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('never points a form at itself', () => {
    expect(mappings.filter((m) => m.sourceFormId === m.targetFormId).map(label)).toEqual([])
  })

  it('only uses synthesize on text targets — elsewhere it offers the user no button at all', () => {
    const bad = mappings
      .filter((m) => m.mode !== 'copy')
      .filter((m) => questions.get(m.targetFormId)?.get(m.targetQuestionId)?.type !== 'text')
      .map(label)
    expect(bad).toEqual([])
  })

  it('only maps options that exist on both sides, and only in copy mode', () => {
    const bad: string[] = []
    for (const m of mappings) {
      if (!m.optionMap) continue
      if (m.mode !== 'copy') bad.push(`${label(m)}: optionMap without copy mode`)
      const source = questions.get(m.sourceFormId)?.get(m.sourceQuestionIds[0])
      const target = questions.get(m.targetFormId)?.get(m.targetQuestionId)
      for (const [from, to] of Object.entries(m.optionMap)) {
        if (!source?.options?.includes(from)) bad.push(`${label(m)}: bron kent "${from}" niet`)
        if (!target?.options?.includes(to)) bad.push(`${label(m)}: doel kent "${to}" niet`)
      }
    }
    expect(bad).toEqual([])
  })

  it('has no duplicate mapping (same source questions onto the same target)', () => {
    const seen = new Set<string>()
    const dupes: string[] = []
    for (const m of mappings) {
      const key = `${m.targetFormId}|${m.targetQuestionId}|${m.sourceFormId}|${[...m.sourceQuestionIds].sort().join(',')}`
      if (seen.has(key)) dupes.push(label(m))
      seen.add(key)
    }
    expect(dupes).toEqual([])
  })

  it('gives every mapping a synthesis hint and at least one source question', () => {
    const incomplete = mappings
      .filter((m) => m.sourceQuestionIds.length === 0 || !m.synthesisHint.trim())
      .map(label)
    expect(incomplete).toEqual([])
  })

  it('connects every real form to at least one other form', () => {
    // Zero mappings is the measurable symptom that a form does not fit the
    // dossier model — see docs/sporen-en-roadmap.md §3.
    const connected = new Set(mappings.flatMap((m) => [m.sourceFormId, m.targetFormId]))
    expect(realForms.filter((id) => !connected.has(id))).toEqual([])
  })
})
