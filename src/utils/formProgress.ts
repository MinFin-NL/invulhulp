import type { FormConfig, NavStepSubsections, NavStepSpecialView } from '../models/Assessment'
import type { FormState } from '../stores/assessmentStore'

/**
 * Ordered list of view ids a user steps through in a form, derived from the
 * form config's navigation array. Conditional steps (e.g. AIIA's deel B,
 * gated on goDecision) are resolved against the given form state. This is the
 * single source of truth for both the form shell's next/prev order and the
 * progress computation below.
 */
export function computeNavOrder(config: FormConfig, form?: FormState): string[] {
  const order: string[] = []
  for (const step of config.navigation) {
    if (step.type === 'subsections') {
      const s = step as NavStepSubsections
      if (s.condition && form?.[s.condition.storeKey] !== s.condition.value) continue
      const section = config.sections.find((sec) => sec.id === s.sectionId)
      if (section) {
        for (const sub of section.subsections) {
          if (s.exclude?.includes(sub.id)) continue
          order.push(sub.id)
        }
      }
    } else {
      order.push((step as NavStepSpecialView).viewId)
    }
  }
  return order
}

/**
 * The ids that can appear in FormState.completedSections, in step order.
 * Special views count under their completionSectionId when they have one
 * (e.g. AIIA's decision gate marks '3'); 'summary' is never marked complete
 * and is excluded from the denominator.
 */
export function countableStepIds(config: FormConfig, form?: FormState): string[] {
  const completionIdByView = new Map<string, string>()
  for (const step of config.navigation) {
    if (step.type === 'specialView') {
      const s = step as NavStepSpecialView
      completionIdByView.set(s.viewId, s.completionSectionId ?? s.viewId)
    }
  }
  return computeNavOrder(config, form)
    .filter((id) => id !== 'summary')
    .map((id) => completionIdByView.get(id) ?? id)
}

export type FormProgressStatus = 'niet-gestart' | 'bezig' | 'afgerond'

export interface FormProgress {
  status: FormProgressStatus
  completed: number
  total: number
}

export function formProgress(config: FormConfig, form?: FormState): FormProgress {
  const stepIds = countableStepIds(config, form)
  const done = new Set(form?.completedSections ?? [])
  const completed = stepIds.filter((id) => done.has(id)).length
  const total = stepIds.length

  if (total > 0 && completed === total) {
    return { status: 'afgerond', completed, total }
  }
  // AI Modus can leave empty answers behind — only non-empty ones count as
  // "the user (or AI) actually put something in this form".
  const hasAnswer = Object.values(form?.answers ?? {}).some((v) =>
    Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== '',
  )
  if (completed > 0 || hasAnswer) {
    return { status: 'bezig', completed, total }
  }
  return { status: 'niet-gestart', completed, total }
}
