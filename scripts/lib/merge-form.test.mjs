import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMergedForm, mergeForm } from './merge-form.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/registry-map.json'), 'utf8'))
const merged = Object.entries(map.forms).filter(([id]) => !map.generated.includes(id))

describe('public/forms is built from the vendored registry', () => {
  // A hand edit to public/forms/<id>.json, or a registry sync without
  // `npm run forms:build`, shows up here.
  it.each(merged)('%s is up to date with its YAML + overlay', (id, file) => {
    const onDisk = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/forms', `${id}.json`), 'utf8'))
    expect(buildMergedForm(ROOT, id, file)).toEqual(onDisk)
  })
})

// A minimal registry document + overlay to exercise the drift checks.
const doc = () => ({
  name: 'Test',
  urn: 'urn:nl:minfin:ir:test:1.0',
  version: '1.0',
  tasks: [
    {
      task: 'Deel A', id: '1', type: ['task_group'],
      tasks: [
        {
          task: 'Algemeen', id: '1.1', type: ['task_group'],
          tasks: [
            { task: 'Naam?', id: '1.1.1', type: ['text_input'], required_status: true, references: { invulhulp: 't_a.naam' } },
            {
              task: 'Soort?', id: '1.1.2', type: ['radio_option'], options: [{ value: 'Ja' }, { value: 'Nee' }],
              references: { invulhulp: 't_a.soort' },
            },
            {
              task: 'Waarom?', id: '1.1.3', type: ['open_text'], references: { invulhulp: 't_a.waarom' },
              dependencies: [{ type: 'conditional', action: 'show', condition: { id: '1.1.2', operator: 'equals', value: 'Ja' } }],
            },
          ],
        },
      ],
    },
  ],
})
const skeleton = () => ({
  id: 'test',
  title: 'Test',
  sections: [
    {
      id: 't_a', part: 'A',
      subsections: [{ id: 'ta1', questions: [{ id: 't_a.naam', format: 'email' }, { id: 't_a.soort' }, { id: 't_a.waarom', aiFill: false }] }],
    },
  ],
})
const info = { yamlPath: 'x.yaml', overlayPath: 'x.overlay.json' }

describe('mergeForm', () => {
  it('takes content from the registry and structure from the overlay', () => {
    const form = mergeForm(doc(), skeleton(), info)
    expect(form.urn).toBe('urn:nl:minfin:ir:test:1.0')
    expect(form.version).toBe('1.0')
    const [sec] = form.sections
    expect(sec).toMatchObject({ id: 't_a', title: 'Deel A', part: 'A' })
    expect(sec.subsections[0].title).toBe('Algemeen')
    expect(sec.subsections[0].questions).toEqual([
      { id: 't_a.naam', text: 'Naam?', type: 'text', importance: 'mandatory', format: 'email' },
      { id: 't_a.soort', text: 'Soort?', type: 'radio', importance: 'optional', options: ['Ja', 'Nee'] },
      {
        id: 't_a.waarom', text: 'Waarom?', type: 'text', importance: 'optional',
        visibleIf: { questionId: 't_a.soort', equals: 'Ja' }, aiFill: false,
      },
    ])
  })

  it('fails when the overlay places a question the registry dropped', () => {
    const d = doc()
    d.tasks[0].tasks[0].tasks.splice(0, 1)
    expect(() => mergeForm(d, skeleton(), info)).toThrow(/t_a\.naam.*missing from the registry/)
  })

  it('fails when the registry has a question the overlay does not place', () => {
    const d = doc()
    d.tasks[0].tasks[0].tasks.push({ task: 'Nieuw', id: '1.1.4', type: ['open_text'], references: { invulhulp: 't_a.nieuw' } })
    expect(() => mergeForm(d, skeleton(), info)).toThrow(/t_a\.nieuw/)
  })

  it('fails on a registry feature it does not understand', () => {
    const d = doc()
    d.tasks[0].tasks[0].tasks[0].calculation = { expression: '1+1' }
    expect(() => mergeForm(d, skeleton(), info)).toThrow(/calculation/)
  })
})
