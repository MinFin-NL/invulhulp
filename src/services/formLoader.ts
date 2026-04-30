import type { FormConfig, CrossFormMapping } from '../models/Assessment'

const cache = new Map<string, FormConfig>()
let mappingsCache: CrossFormMapping[] | null = null

export async function loadForm(id: string): Promise<FormConfig> {
  if (cache.has(id)) return cache.get(id)!
  const res = await fetch(`/forms/${id}.json`)
  if (!res.ok) throw new Error(`Form not found: ${id}`)
  const config = await res.json() as FormConfig
  cache.set(id, config)
  return config
}

export interface FormIndexEntry {
  id: string
  title: string
  track?: string
  order?: number
  shortDescription?: string
}

export async function loadAvailableForms(): Promise<FormIndexEntry[]> {
  const res = await fetch('/forms/index.json')
  if (!res.ok) throw new Error('Could not load form index')
  const raw = await res.json() as { forms: FormIndexEntry[] }
  return raw.forms.map((f) => ({ id: f.id, title: f.title ?? f.id, track: f.track, order: f.order, shortDescription: f.shortDescription }))
}

export async function loadCrossFormMappings(): Promise<CrossFormMapping[]> {
  if (mappingsCache) return mappingsCache
  const res = await fetch('/forms/crossFormMappings.json')
  mappingsCache = res.ok ? (await res.json() as CrossFormMapping[]) : []
  return mappingsCache
}

export function getCachedForm(id: string): FormConfig | undefined {
  return cache.get(id)
}
