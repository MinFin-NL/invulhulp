import type { FormIndexEntry } from '../services/formLoader'

/**
 * Sporen are one axis only: the lifecycle phase of the project. The subject
 * domain (privacy / beveiliging / ai / data) is a facet on the card, not a
 * heading — see FormIndexEntry.domains.
 *
 * In the UI these are called "fasen"; "spoor" / `track` stays the term in the
 * code, the form registry and docs/sporen-en-roadmap.md.
 */
export type TrackId =
  | 'intake'
  | 'aanbieding'
  | 'initiatie'
  | 'uitvoering'
  | 'afronding'
  | 'onbekend'

export interface TrackMeta {
  label: string
  description: string
  order: number
  /** Intake en aanbieding gaan aan het project vooraf: ze staan wél in de
   *  tijdlijn, maar krijgen geen fasenummer ("Fase 1 van 3"). */
  isPhase: boolean
  emptyHint?: string
  /** Naam van het NLDD-icoon voor deze fase in de fasetijdlijn
   *  (<nldd-icon name="…">). */
  icon: string
}

// `emptyHint` is shown instead of cards for a track we deliberately want
// visible while it has no forms yet: the gap is information, not an omission.
export const TRACK_META: Record<TrackId, TrackMeta> = {
  intake: {
    label: 'Intake',
    description: 'Het startpunt: registreer het IV-verzoek. Nog geen projectfase.',
    order: 1,
    isPhase: false,
    icon: 'file-text',
  },
  aanbieding: {
    label: 'Aanbieding',
    description: 'Bied het project aan voor de portfolioafweging. Ook nog geen projectfase.',
    order: 2,
    isPhase: false,
    icon: 'certificate',
  },
  initiatie: {
    label: 'Initiatiefase',
    description: 'Werk het project uit en toets het: plan, architectuur en de verplichte scans en assessments.',
    order: 3,
    isPhase: true,
    icon: 'map',
  },
  uitvoering: {
    label: 'Uitvoeringsfase',
    description: 'Stuur bij tijdens de bouw en leg vast wat er daadwerkelijk live gaat.',
    order: 4,
    isPhase: true,
    icon: 'gear',
  },
  afronding: {
    label: 'Afrondingsfase',
    description: 'Sluit het project af: evalueer de opbrengst en draag de resterende risico’s over.',
    order: 5,
    isPhase: true,
    icon: 'check-list',
  },
  onbekend: {
    label: 'Niet ingedeeld',
    description: 'Deze formulieren hebben een onbekend spoor in index.json en zijn daardoor niet ingedeeld.',
    order: 98,
    isPhase: false,
    icon: 'question-mark-circle',
  },
}

/** Every real track, in order. `onbekend` is a fallback bucket, not a track, so
 *  it is deliberately excluded. */
export const TRACK_IDS: TrackId[] = (Object.keys(TRACK_META) as TrackId[])
  .filter((t) => t !== 'onbekend')
  .sort((a, b) => TRACK_META[a].order - TRACK_META[b].order)

/** Only the tracks that are genuinely a projectfase — these carry the
 *  numbering ("Fase 2 van 3"); intake en aanbieding doen daar niet aan mee. */
export const PHASE_IDS: TrackId[] = TRACK_IDS.filter((t) => TRACK_META[t].isPhase)

/**
 * An unknown track used to fall through to the assessments group, which hid
 * typos in index.json. Surface them instead.
 */
export function trackIdFor(track: string | undefined, formId?: string): TrackId {
  const t = (track ?? 'onbekend') as TrackId
  if (!TRACK_META[t]) {
    console.warn(`[forms] Onbekend spoor "${track}" voor formulier "${formId ?? '?'}" — controleer public/forms/index.json`)
    return 'onbekend'
  }
  return t
}

export function trackLabel(track: string | undefined): string {
  const t = (track ?? 'onbekend') as TrackId
  return TRACK_META[t]?.label ?? TRACK_META.onbekend.label
}

export interface TrackGroup {
  track: TrackId
  label: string
  description: string
  emptyHint?: string
  forms: FormIndexEntry[]
  /** Of dit spoor een echte projectfase is. De niet-fasen (intake, aanbieding)
   *  staan in de UI samen in één compacte band bóven de fasetijdlijn. */
  isPhase: boolean
  /** 1-based position among de echte fasen; 0 voor intake, aanbieding en de
   *  `onbekend`-bak — die zijn geen fase en krijgen dus geen nummer. */
  phaseNumber: number
  /** How many real phases there are, so a heading can say "fase 2 van 3". */
  phaseCount: number
}

export function groupFormsByTrack(forms: FormIndexEntry[]): TrackGroup[] {
  const byTrack: Partial<Record<TrackId, FormIndexEntry[]>> = {}
  for (const form of forms) {
    const t = trackIdFor(form.track, form.id)
    ;(byTrack[t] ??= []).push(form)
  }
  // Iterate over TRACK_META (not over the forms present) so a track with an
  // emptyHint still renders when it has no forms yet.
  return (Object.keys(TRACK_META) as TrackId[])
    .filter((track) => byTrack[track]?.length || TRACK_META[track].emptyHint)
    .sort((a, b) => TRACK_META[a].order - TRACK_META[b].order)
    .map((track) => ({
      track,
      label: TRACK_META[track].label,
      description: TRACK_META[track].description,
      emptyHint: TRACK_META[track].emptyHint,
      forms: [...(byTrack[track] ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      isPhase: TRACK_META[track].isPhase,
      phaseNumber: PHASE_IDS.indexOf(track) + 1,
      phaseCount: PHASE_IDS.length,
    }))
}

/**
 * De impact assessments voeden elkaar over en weer; ze staan sinds de nieuwe
 * indeling door elkaar in de initiatiefase, dus hangt de pijl aan de formulieren
 * zelf in plaats van aan het spoor.
 */
const BIDIRECTIONAL_IDS = new Set(['quickscan', 'prescandpia', 'dpia', 'aiia', 'iama', 'euaiact', 'dataethiek'])

/**
 * Bidirectional glyph where answers genuinely flow both ways: between two
 * assessments, and for the PPM ↔ PSA pair.
 */
export function connectorGlyph(group: { track: string; forms: FormIndexEntry[] }, idx: number): string {
  const prev = group.forms[idx - 1]?.id ?? ''
  const curr = group.forms[idx]?.id ?? ''
  if (BIDIRECTIONAL_IDS.has(prev) && BIDIRECTIONAL_IDS.has(curr)) return '↔'
  const pair = new Set([prev, curr])
  if (pair.has('ppm') && pair.has('psa')) return '↔'
  return '→'
}

/** Het NLDD-icoon dat bij een fase hoort. Valt terug op het icoon van
 *  `onbekend` zodat een typefout in index.json geen leeg vlak oplevert. */
export function trackIcon(track: string | undefined): string {
  const t = (track ?? 'onbekend') as TrackId
  return TRACK_META[t]?.icon ?? TRACK_META.onbekend.icon
}
