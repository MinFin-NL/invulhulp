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

export async function loadAvailableForms(): Promise<string[]> {
  const res = await fetch('/forms/index.json')
  if (!res.ok) throw new Error('Could not load form index')
  const raw = await res.json() as { forms: { id: string }[] }
  return raw.forms.map((f) => f.id)
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
