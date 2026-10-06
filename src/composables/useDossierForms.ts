import { computed, ref } from 'vue'
import { loadFormRegistry, type FormIndexEntry } from '../services/formLoader'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAiMode } from './useAiMode'
import { useFormProgress } from './useFormProgress'
import type { FormProgress } from '../utils/formProgress'
import { groupFormsByTrack, type TrackGroup } from '../utils/tracks'
import { evaluateApplicability, type ApplicabilityVerdict } from '../utils/toepassingsscan'

// Module-level: the four dossier views read the same registry, so one load
// serves them all. DossierDetail refreshes it each time a dossier opens, as the
// single dossier page used to.
const forms = ref<FormIndexEntry[]>([])

/** Registry incl. placeholders: the dossier pages also show what isn't built yet. */
export async function refreshDossierForms(): Promise<void> {
  forms.value = await loadFormRegistry()
}

const ALWAYS: ApplicabilityVerdict = { status: 'altijd', reason: '', kenmerken: [] }

export interface NextStep {
  form: FormIndexEntry
  /** 'start' betekent: er loopt nog niets, de gebruiker begint pas. */
  kind: 'resume' | 'finish' | 'start'
  eyebrow: string
  reason: string
  cta: string
}

/**
 * Which forms apply to the active dossier and how far along they are — the
 * logic the dossier views share. Moved out of DossierDetail unchanged when the
 * page was split into views.
 */
export function useDossierForms() {
  const store = useAssessmentStore()
  const { readyDocIds } = useAiMode()
  const { progressFor, trackSummary } = useFormProgress()

  // ---- Toepassingsscan ------------------------------------------------------
  // One verdict per form, recomputed whenever the scan (or the beslishulp, which
  // feeds one of the kenmerken) changes. `store.kenmerken` is null until a scan
  // has been run — every verdict is then 'onbepaald' and the page looks exactly
  // as it did before the scan existed.
  const verdicts = computed(
    () => new Map(forms.value.map((f) => [f.id, evaluateApplicability(f.applicability, store.kenmerken)])),
  )

  function verdictFor(formId: string): ApplicabilityVerdict {
    return verdicts.value.get(formId) ?? ALWAYS
  }

  function applicableForms(group: TrackGroup): FormIndexEntry[] {
    return group.forms.filter((f) => verdictFor(f.id).status !== 'nvt')
  }

  function nvtForms(group: TrackGroup): FormIndexEntry[] {
    return group.forms.filter((f) => verdictFor(f.id).status === 'nvt')
  }

  const nvtFormIds = computed(
    () => new Set(forms.value.filter((f) => verdictFor(f.id).status === 'nvt').map((f) => f.id)),
  )

  const scanCounts = computed(() => {
    const counts = { verplicht: 0, mogelijk: 0, nvt: 0 }
    for (const form of forms.value) {
      const status = verdictFor(form.id).status
      if (status === 'verplicht' || status === 'mogelijk' || status === 'nvt') counts[status]++
    }
    return counts
  })

  function statusFor(formId: string): FormProgress | null {
    if (!store.activeDossierId) return null
    const dossier = store.dossiers[store.activeDossierId]
    return dossier ? progressFor(dossier, formId) : null
  }

  // ---- Fasen ----------------------------------------------------------------
  const trackGroups = computed(() => groupFormsByTrack(forms.value))

  // Intake en aanbieding: geen fase, dus geen sectie op de spine. Ze komen samen
  // in de "Vooraf"-band, in dezelfde volgorde als hun sporen (TRACK_META.order,
  // en `order` daarbinnen).
  const preludeGroups = computed(() =>
    trackGroups.value.filter((g) => !g.isPhase && g.track !== 'onbekend'),
  )
  const preludeForms = computed(() => preludeGroups.value.flatMap((g) => applicableForms(g)))

  // De tijdlijn houdt de echte fasen — plus de `onbekend`-bak, want die is het
  // zichtbare vangnet voor een typo in index.json.
  const timelineGroups = computed(() =>
    trackGroups.value.filter((g) => g.isPhase || g.track === 'onbekend'),
  )

  // Per-phase completion, recomputed whenever answers change so the timeline
  // marker fills in as the user finishes forms in that phase.
  // Forms the scan ruled out are left out of the count: otherwise a phase could
  // never reach "afgerond" because of a form nobody is supposed to fill in.
  const trackCounts = computed(() => {
    const dossier = store.activeDossierId ? store.dossiers[store.activeDossierId] : null
    return dossier ? trackSummary(dossier, nvtFormIds.value) : null
  })

  function trackCount(group: TrackGroup): { done: number; total: number } {
    if (group.track === 'onbekend') return { done: 0, total: 0 }
    // Placeholders zijn geen formulier: ze mogen de noemer niet optillen, anders
    // kan een fase nooit "afgerond" worden.
    const real = group.forms.filter((f) => !f.placeholder).length
    return trackCounts.value?.[group.track] ?? { done: 0, total: real }
  }

  const preludeCount = computed(() =>
    preludeGroups.value.reduce(
      (acc, g) => {
        const { done, total } = trackCount(g)
        return { done: acc.done + done, total: acc.total + total }
      },
      { done: 0, total: 0 },
    ),
  )

  /** Marker state on the spine: filled+check when the phase is finished, a solid
   *  dot while it is under way, an outline when nothing has been started, and a
   *  dashed outline for a phase that has no forms yet (`beheer`). */
  function markerState(group: TrackGroup): 'done' | 'busy' | 'todo' | 'empty' {
    const { done, total } = trackCount(group)
    if (total === 0) return 'empty'
    if (done === total) return 'done'
    return done > 0 || applicableForms(group).some((f) => statusFor(f.id)?.status === 'bezig') ? 'busy' : 'todo'
  }

  // ---- Eén volgende stap ------------------------------------------------------
  // De formulieren die hier meetellen: gebouwd, en niet weggestreept door de
  // toepassingsscan. In registratievolgorde, wat de fasevolgorde van de tijdlijn
  // is — de "volgende" stap is dus ook echt de eerstvolgende in het proces.
  const liveForms = computed(() =>
    forms.value.filter((f) => !f.placeholder && verdictFor(f.id).status !== 'nvt'),
  )

  const allFormsDone = computed(
    () => liveForms.value.length > 0 && liveForms.value.every((f) => statusFor(f.id)?.status === 'afgerond'),
  )

  /** Het ene formulier waar de gebruiker verder moet: eerst waar hij middenin
   *  zit, dan wat is doorgeklikt maar niet ingevuld, dan het eerste verplichte
   *  dat nog niet af is. Null zodra alles af is (of er niets te doen valt). */
  const nextStep = computed<NextStep | null>(() => {
    const withStatus = liveForms.value.map((form) => ({ form, progress: statusFor(form.id) }))

    const busy = withStatus.find((f) => f.progress?.status === 'bezig')
    if (busy) {
      return {
        form: busy.form,
        kind: 'resume',
        eyebrow: 'Verder waar je gebleven bent',
        reason: `${busy.progress!.completed} van ${busy.progress!.total} onderdelen doorlopen.`,
        cta: 'Verder',
      }
    }

    const incomplete = withStatus.find((f) => f.progress?.status === 'onvolledig')
    if (incomplete) {
      const open = incomplete.progress!.missingMandatory
      return {
        form: incomplete.form,
        kind: 'finish',
        eyebrow: 'Bijna klaar',
        reason: `Helemaal doorlopen, maar er ${open === 1 ? 'staat nog 1 verplichte vraag' : `staan nog ${open} verplichte vragen`} open.`,
        cta: 'Afmaken',
      }
    }

    const notStarted = withStatus.filter((f) => f.progress?.status !== 'afgerond')
    if (notStarted.length === 0) return null
    // De intake is het formele startpunt van elk IV-verzoek en gaat voor. Daarna
    // wat de toepassingsscan verplicht stelt, en anders de eerste in de
    // fasevolgorde.
    const intake = notStarted.find((f) => f.form.track === 'intake')
    const required = notStarted.find((f) => verdictFor(f.form.id).status === 'verplicht')
    const target = intake ?? required ?? notStarted[0]
    const verdict = verdictFor(target.form.id)
    return {
      form: target.form,
      kind: 'start',
      eyebrow: 'Begin hier',
      // "Geldt voor elk IV-verzoek" zegt niet wat je gaat doen; de omschrijving wel.
      reason:
        (verdict.status === 'altijd' ? target.form.shortDescription || verdict.reason : verdict.reason || target.form.shortDescription) ||
        'Nog niet gestart.',
      cta: 'Openen',
    }
  })

  // ---- Dossier-brede AI-vulling ---------------------------------------------
  // De rij: echte formulieren (geen placeholders), niet weggestreept door de
  // toepassingsscan, en nog helemaal leeg. Dat laatste is de veiligheidsgrens —
  // AI Modus overschrijft antwoorden, en een knop die twaalf formulieren tegelijk
  // raakt mag nooit werk overschrijven dat iemand al gedaan heeft.
  const bulkFillForms = computed(() =>
    forms.value.filter(
      (f) =>
        !f.placeholder &&
        verdictFor(f.id).status !== 'nvt' &&
        statusFor(f.id)?.status === 'niet-gestart',
    ),
  )

  /** Welke van de drie acties op de dossierpagina's de primaire knop krijgt.
   *  Precies één, altijd: zonder documenten is uploaden de enige zinvolle stap,
   *  met lege formulieren is dat de AI-vulling, en zodra er werk loopt is dat
   *  doorwerken. */
  const primaryAction = computed<'upload' | 'bulk-ai' | 'resume'>(() => {
    if (readyDocIds.value.length === 0) return 'upload'
    const step = nextStep.value
    if (step && step.kind !== 'start') return 'resume'
    if (bulkFillForms.value.length > 0) return 'bulk-ai'
    return 'resume'
  })

  return {
    forms,
    verdictFor,
    applicableForms,
    nvtForms,
    scanCounts,
    statusFor,
    preludeForms,
    preludeCount,
    timelineGroups,
    trackCount,
    markerState,
    allFormsDone,
    nextStep,
    bulkFillForms,
    primaryAction,
  }
}
