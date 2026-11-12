import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import {
  buildFormUrn,
  isFormUrn,
  parseFormUrn,
  FORM_URN_ORGANISATION,
  PLACEHOLDER_URN_VERSION,
} from './formUrn'
import type { FormIndexEntry } from '../services/formLoader'
import type { FormConfig } from '../models/Assessment'

const fromRoot = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url))
const read = <T>(name: string): T => JSON.parse(readFileSync(fromRoot(`public/forms/${name}`), 'utf8'))

// The real index and form files: a form whose URN drifts from the registry
// release it was built from has to fail here rather than ship.
const index = read<{ forms: (FormIndexEntry & { file?: string })[] }>('index.json').forms
const registryMap = JSON.parse(readFileSync(fromRoot('scripts/registry-map.json'), 'utf8')) as {
  forms: Record<string, string>
}
const registryUrn = (id: string): string =>
  parseYaml(readFileSync(fromRoot(`vendor/instrument-registry/assessments/${registryMap.forms[id]}`), 'utf8')).urn

// The task-registry shape (a different registry) that `registryUrn` points into.
const TASK_REGISTRY_PATTERN = /^urn:nl:aivt:tr:[a-z]+:[0-9]+\.[0-9]+/

describe('buildFormUrn', () => {
  it('builds an instrument-registry URN', () => {
    expect(buildFormUrn('minbzk', 'dpia', '3.0')).toBe('urn:nl:minbzk:ir:dpia:3.0')
    expect(buildFormUrn('minfin', 'begrippenkader-dpia', '1')).toBe('urn:nl:minfin:ir:begrippenkader-dpia:1')
  })

  it('rejects segments that break the convention', () => {
    expect(() => buildFormUrn('minfin', 'Model', '1.0')).toThrow()
    expect(() => buildFormUrn('minfin', 'modelcard', 'v1')).toThrow()
    expect(() => buildFormUrn('min-fin', 'modelcard', '1.0')).toThrow()
  })

  it('parses back into its segments', () => {
    expect(parseFormUrn('urn:nl:minbzk:ir:prescan:2.0')).toEqual({
      organisation: 'minbzk', instrument: 'prescan', version: '2.0',
    })
    expect(parseFormUrn('urn:nl:minbzk:ir:dpia')).toBeNull()
    expect(parseFormUrn('urn:nl:minfin:tr:dpia:3.0')).toBeNull()
  })
})

describe('the form index', () => {
  it('gives every form a well-formed URN', () => {
    for (const entry of index) {
      expect(entry.urn, `${entry.id} mist een urn in index.json`).toBeDefined()
      expect(isFormUrn(entry.urn!), `${entry.id}: ${entry.urn}`).toBe(true)
    }
  })

  it('keeps every URN unique', () => {
    const urns = index.map((f) => f.urn)
    expect(new Set(urns).size).toBe(urns.length)
  })

  it('builds every real form from the instrument registry', () => {
    for (const entry of index.filter((f) => f.file)) {
      expect(registryMap.forms[entry.id], `${entry.id} staat niet in scripts/registry-map.json`).toBeDefined()
    }
  })

  it('uses the registry URN in index.json and in the form file', () => {
    for (const entry of index.filter((f) => f.file)) {
      const form = read<FormConfig>(entry.file!)
      const urn = registryUrn(entry.id)
      expect(entry.urn, `${entry.id}: index.json`).toBe(urn)
      expect(form.urn, `${entry.id}: ${entry.file}`).toBe(urn)
      expect(parseFormUrn(urn)!.version, `${entry.id}: versie`).toBe(form.version)
      expect(form.registryUrn, `${entry.id}: registryUrn wijkt af`).toBe(entry.registryUrn)
    }
  })

  it('names a placeholder in our own organisation at 0.1', () => {
    for (const entry of index.filter((f) => !f.file)) {
      expect(entry.urn, entry.id).toBe(buildFormUrn(FORM_URN_ORGANISATION, entry.id, PLACEHOLDER_URN_VERSION))
    }
  })

  it('points registryUrn at a real task-registry instrument', () => {
    const withTaskRegistry = index.filter((f) => f.registryUrn)
    // AIIA, IAMA and the EU-conformiteitsverklaring exist in the AI task-registry;
    // the rest of our forms have no counterpart there and must not claim one.
    expect(withTaskRegistry.map((f) => f.id).sort()).toEqual(['aiia', 'euaiact', 'iama'])
    for (const entry of withTaskRegistry) {
      expect(entry.registryUrn, entry.id).toMatch(TASK_REGISTRY_PATTERN)
    }
  })
})
