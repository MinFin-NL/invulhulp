import type { FormConfig, NavStepSubsections, NavStepSpecialView, Subsection } from '../models/Assessment'
import type { FormState } from '../stores/assessmentStore'
import { isQuestionVisible } from './answerRefs'

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
function countableStepIds(config: FormConfig, form?: FormState): string[] {
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

/**
 * Whether an answer holds anything. Tags are stripped before the emptiness test:
 * by contract an empty rich-text answer is '' (see utils/answerHtml), but a
 * legacy or round-tripped answer can still arrive as '<p></p>', and counting
 * that as filled is exactly the false "afgerond" this module has to avoid.
 * DOM-free — this file runs in plain-node tests.
 */
function isAnswered(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value !== 'string') return false
  return value.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() !== ''
}

/**
 * Per subsection, how many of its visible mandatory questions are still empty.
 * Only subsections that are actually part of the user's path are walked:
 * computeNavOrder already drops excluded subsections and unmet conditional
 * steps (AIIA's deel B), so a part the user never has to fill in cannot hold a
 * form back. Subsections with nothing open are absent from the map.
 */
export function missingMandatoryBySubsection(
  config: FormConfig,
  form?: FormState,
): Map<string, number> {
  const answers = form?.answers ?? {}
  const getAnswer = (questionId: string) => answers[questionId] ?? ''

  const subsectionById = new Map<string, Subsection>()
  for (const section of config.sections) {
    for (const sub of section.subsections) subsectionById.set(sub.id, sub)
  }

  const missing = new Map<string, number>()
  for (const stepId of computeNavOrder(config, form)) {
    // Special views ('risk', 'decision', 'summary') have no questions of their
    // own — their completion is tracked through completedSections alone.
    const sub = subsectionById.get(stepId)
    if (!sub) continue
    let open = 0
    for (const q of sub.questions) {
      if (q.importance !== 'mandatory') continue
      if (!isQuestionVisible(q, getAnswer)) continue
      if (!isAnswered(answers[q.id])) open++
    }
    if (open > 0) missing.set(sub.id, open)
  }
  return missing
}

/** Total number of visible mandatory questions still without an answer. */
export function missingMandatoryCount(config: FormConfig, form?: FormState): number {
  let total = 0
  for (const open of missingMandatoryBySubsection(config, form).values()) total += open
  return total
}

export type FormProgressStatus = 'niet-gestart' | 'bezig' | 'onvolledig' | 'afgerond'

export interface FormProgress {
  status: FormProgressStatus
  completed: number
  total: number
  /** Visible mandatory questions still without an answer. */
  missingMandatory: number
}

export function formProgress(config: FormConfig, form?: FormState): FormProgress {
  const stepIds = countableStepIds(config, form)
  const done = new Set(form?.completedSections ?? [])
  const completed = stepIds.filter((id) => done.has(id)).length
  const total = stepIds.length
  const missingMandatory = missingMandatoryCount(config, form)

  if (total > 0 && completed === total) {
    // Pressing "Volgende" marks a section done — it does not fill it in. So a
    // form that has been clicked through end to end is only 'afgerond' once
    // every visible mandatory question actually holds an answer; otherwise it
    // is 'onvolledig' and the card says how many are still open. Without this
    // split, "3/12 formulieren afgerond" counts click-throughs.
    return {
      status: missingMandatory === 0 ? 'afgerond' : 'onvolledig',
      completed,
      total,
      missingMandatory,
    }
  }
  // AI Modus can leave empty answers behind — only non-empty ones count as
  // "the user (or AI) actually put something in this form".
  const hasAnswer = Object.values(form?.answers ?? {}).some((v) => isAnswered(v))
  if (completed > 0 || hasAnswer) {
    return { status: 'bezig', completed, total, missingMandatory }
  }
  return { status: 'niet-gestart', completed, total, missingMandatory }
}

/** The status of a form in words, as the form cards and the forms list in the
 *  dossier sidebar both show it. */
export function formStatusLabel(p: FormProgress): string {
  if (p.status === 'afgerond') return 'Afgerond'
  // Doorgeklikt maar niet ingevuld: zeg hoeveel verplichte vragen nog open
  // staan, zodat "afgerond" alleen op de kaart staat als het waar is.
  if (p.status === 'onvolledig') {
    return p.missingMandatory === 1 ? 'Nog 1 verplichte vraag' : `Nog ${p.missingMandatory} verplichte vragen`
  }
  if (p.status === 'bezig') return `Bezig (${p.completed}/${p.total})`
  return 'Niet gestart'
}
