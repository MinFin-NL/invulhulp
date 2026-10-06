/**
 * The dossier's facts, derived from its answers and its toepassingsscan.
 *
 * Pure and synchronous, and never stored (docs/systeemprofiel-feitenbasis.md
 * §9): a fact is a reading of answers that already exist, so it cannot go
 * stale, needs nothing from the CRDT codec, and disappears without a migration
 * if the design does not hold up.
 */
import type { Answer } from '../utils/crossFormCopy'
import { radioScalar } from '../utils/answerRefs'
import type { Kenmerken } from '../utils/toepassingsscan'
import { FEITEN, type FeitDefinitie, type FeitId, type VraagRef } from './vocabulaire'

/** Where a fact's value comes from. A scan answer is self-declared; a voorblad
 *  fact is whatever a person typed in the form named here. */
export type Herkomst = { soort: 'scan' } | ({ soort: 'formulier' } & VraagRef)

export interface Feit {
  definitie: FeitDefinitie
  /** Scan facts: the kenmerk. Voorblad facts: the answer as stored. Null when
   *  nothing establishes it yet. */
  waarde: boolean | Answer | null
  herkomst: Herkomst | null
}

export type Feiten = Record<FeitId, Feit>

export interface FeitenInput {
  /** answers per form id, as in a dossier's `forms` */
  forms: Record<string, { answers?: Record<string, Answer> } | undefined>
  /** null until the toepassingsscan has been run */
  kenmerken: Kenmerken | null
}

export function resolveFeiten({ forms, kenmerken }: FeitenInput): Feiten {
  const out = {} as Feiten
  for (const definitie of FEITEN) {
    if (definitie.soort === 'scan') {
      const value = kenmerken?.[definitie.kenmerk]
      out[definitie.id] =
        value === true || value === false
          ? { definitie, waarde: value, herkomst: { soort: 'scan' } }
          : { definitie, waarde: null, herkomst: null }
      continue
    }
    // Emptiness by text, not by DOM: this stays pure and runs anywhere.
    const bron = definitie.bronnen.find((b) => plain(forms[b.formId]?.answers?.[b.questionId]) !== '')
    out[definitie.id] = bron
      ? { definitie, waarde: forms[bron.formId]!.answers![bron.questionId], herkomst: { soort: 'formulier', ...bron } }
      : { definitie, waarde: null, herkomst: null }
  }
  return out
}

export interface Voorstel {
  feit: Feit
  /** The answer to write into the question. */
  waarde: Answer
  herkomst: Herkomst
}

/**
 * The proposal for one question, or null: the question asks no fact, the fact
 * is not established yet, or the question is itself where the fact comes from.
 */
export function voorstelVoor(feiten: Feiten, formId: string, questionId: string): Voorstel | null {
  for (const feit of Object.values(feiten)) {
    const def = feit.definitie
    if (feit.waarde === null || !feit.herkomst) continue
    if (def.soort === 'scan') {
      const vraag = def.vragen.find((v) => v.formId === formId && v.questionId === questionId)
      if (!vraag) continue
      return { feit, waarde: feit.waarde === true ? vraag.ja : vraag.nee, herkomst: feit.herkomst }
    }
    if (!def.vragen.some((v) => v.formId === formId && v.questionId === questionId)) continue
    const h = feit.herkomst
    if (h.soort === 'formulier' && h.formId === formId && h.questionId === questionId) return null
    return { feit, waarde: feit.waarde as Answer, herkomst: h }
  }
  return null
}

function plain(value: Answer | undefined): string {
  if (value === undefined) return ''
  if (Array.isArray(value)) return value.join('; ')
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Whether the answer in a question is still the proposal — so its origin can
 * be shown. Once someone changes it, it is their own answer. A radio answer
 * counts by its option, whatever follow-up text was added to it.
 */
export function isVoorstel(voorstel: Voorstel, answer: Answer | undefined): boolean {
  if (voorstel.feit.definitie.soort === 'scan') return radioScalar(answer) === voorstel.waarde
  return plain(answer) !== '' && plain(answer) === plain(voorstel.waarde)
}

/** The fact as text, for the dossier page. */
export function feitTekst(feit: Feit): string {
  if (feit.waarde === null) return ''
  if (typeof feit.waarde === 'boolean') return feit.waarde ? 'Ja' : 'Nee'
  return plain(feit.waarde)
}
