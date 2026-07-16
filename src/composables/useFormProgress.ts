import { ref } from 'vue'
import { loadAvailableForms, loadForm, type FormIndexEntry } from '../services/formLoader'
import { formProgress, type FormProgress } from '../utils/formProgress'
import type { FormConfig } from '../models/Assessment'
import type { Dossier } from '../stores/assessmentStore'

// Module-level singleton — the registry and form configs are static per
// deployment, so one load serves every component instance.
const formIndex = ref<FormIndexEntry[]>([])
const configs = ref<Map<string, FormConfig>>(new Map())
let loadPromise: Promise<void> | null = null

async function loadAll(): Promise<void> {
  const index = await loadAvailableForms()
  const loaded = await Promise.all(
    index.map(async (entry) => {
      try {
        return [entry.id, await loadForm(entry.id)] as const
      } catch {
        return null
      }
    }),
  )
  formIndex.value = index
  configs.value = new Map(loaded.filter((e): e is [string, FormConfig] => e !== null))
}

/**
 * Per-form and per-dossier completion status for the dossier overview and
 * detail pages. Loads all form configs once (loadForm caches the fetches).
 */
export function useFormProgress() {
  if (!loadPromise) loadPromise = loadAll()

  function progressFor(dossier: Dossier, formId: string): FormProgress | null {
    const config = configs.value.get(formId)
    if (!config) return null
    return formProgress(config, dossier.forms[formId])
  }

  function dossierSummary(dossier: Dossier): { done: number; total: number } {
    let done = 0
    for (const entry of formIndex.value) {
      if (progressFor(dossier, entry.id)?.status === 'afgerond') done++
    }
    return { done, total: formIndex.value.length }
  }

  return { formIndex, progressFor, dossierSummary, ready: () => loadPromise! }
}
