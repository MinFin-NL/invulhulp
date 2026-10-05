<template>
  <!-- Formulieren: wat moet ik invullen? De fasen met hun kaarten, AI Modus per
       formulier op de kaart zelf. -->
  <div class="dossier-view">
      <!-- Intake en aanbieding gaan aan de fasering vooraf. Ze horen erbij, maar
           als eigen tijdlijnsectie kostten ze een half scherm voor één kaart —
           dus staan ze samen in één platte band boven de spine. -->
      <section
        v-if="preludeForms.length > 0"
        id="fase-vooraf"
        class="prelude"
        aria-labelledby="prelude-title"
      >
        <div class="prelude__header">
          <nldd-title size="2"><h2 class="prelude__title" id="prelude-title">Vooraf</h2></nldd-title>
          <nldd-text color="inherit" size="sm" class="prelude__meta">
            Nog geen projectfase<template v-if="preludeCount.total > 0">
              · {{ preludeCount.done }}/{{ preludeCount.total }} afgerond</template>
          </nldd-text>
        </div>
        <div class="card-row">
          <template v-for="(form, idx) in preludeForms" :key="form.id">
            <div class="card-chain-item">
              <div v-if="idx > 0" class="card-connector" aria-hidden="true">→</div>
              <FormCard v-bind="cardProps(form)" @open="$emit('open', $event)" v-on="cardHandlers" />
            </div>
          </template>
        </div>
      </section>

      <!-- Lifecycle timeline: one phase per step, always expanded. The spine is
           the point of the page — it is what makes the forms read as phases of
           a process rather than as three unrelated lists. -->
      <ol class="track-timeline">
      <li
        v-for="(group, phaseIdx) in timelineGroups"
        :key="group.track"
        :id="`fase-${group.track}`"
        class="track-phase"
        :aria-labelledby="`track-${group.track}-title`"
      >
        <!-- De spine is de verticale tegenhanger van nldd-step-indicator: per
             fase een step-cell op de kop, en daaronder een lijn-only cell die
             de baan doortrekt langs de kaarten tot aan de volgende fase.
             Decoratief — "Fase 1 van 3" en de teller staan in de kop. -->
        <div class="track-phase__lane" aria-hidden="true">
          <nldd-timeline-track-cell
            class="track-phase__step"
            size="md"
            :status="stepStatus(group)"
            :position="stepPosition(phaseIdx)"
            :icon="markerState(group) === 'done' ? 'check-mark-small' : ''"
            :text="stepNumber(group)"
          />
          <!-- A line-only row takes the status of the step above it, so the
               track below a finished phase is drawn as covered. -->
          <nldd-timeline-track-cell
            v-if="phaseIdx < timelineGroups.length - 1"
            class="track-phase__rail"
            size="md"
            variant="none"
            :status="stepStatus(group)"
          />
        </div>

        <div class="track-phase__body">
          <div class="track-header">
            <p v-if="group.phaseNumber > 0" class="track-eyebrow">
              Fase {{ group.phaseNumber }} van {{ group.phaseCount }}
            </p>
            <div class="track-title-row">
              <nldd-title size="2"><h2 class="track-title" :id="`track-${group.track}-title`">{{ group.label }}</h2></nldd-title>
              <span v-if="trackCount(group).total > 0" class="invulhulp-text--sm track-count">
                {{ trackCount(group).done }}/{{ trackCount(group).total }} afgerond
              </span>
            </div>
            <nldd-text size="sm" color="inherit" class="track-desc">{{ group.description }}</nldd-text>
          </div>

          <nldd-text color="inherit" size="sm" class="track-empty" v-if="group.forms.length === 0">
            {{ group.emptyHint }}
          </nldd-text>

          <div v-else-if="applicableForms(group).length > 0" class="card-row">
            <!-- Connector + card travel as one unit, so a wrapping row never
                 strands a lone glyph at the end of the line above. -->
            <template v-for="(form, idx) in applicableForms(group)" :key="form.id">
            <div class="card-chain-item">
            <div v-if="idx > 0" class="card-connector" aria-hidden="true">
              {{ connectorGlyph({ track: group.track, forms: applicableForms(group) }, idx) }}
            </div>
            <!-- The beslishulp host form is rendered as a pair: its card keeps
                 every affordance the others have, with the beslishulp tile fused
                 to its leading edge. -->
            <FormCard v-bind="cardProps(form)" @open="$emit('open', $event)" v-on="cardHandlers">
              <template v-if="form.id === BESLISHULP_HOST_FORM_ID" #lead>
                <BeslishulpTile :run="store.beslishulpRun" @open="$emit('beslishulp')" />
              </template>
            </FormCard>
            </div>
            </template>
          </div>

          <!-- Not applicable, collapsed but never hidden: a decision nobody can
               find is worse than a form nobody fills in (docs §5.6). Opening a
               form from here still works — the scan advises, the user decides. -->
          <details v-if="nvtForms(group).length > 0" class="invulhulp-disclosure nvt-group">
            <summary class="invulhulp-text--sm">
              Niet van toepassing in dit dossier ({{ nvtForms(group).length }})
            </summary>
            <div class="invulhulp-disclosure__details">
              <ul class="invulhulp-item-list nvt-list">
                <li v-for="form in nvtForms(group)" :key="form.id" class="invulhulp-item-list__item nvt-item">
                  <div class="nvt-item__text">
                    <span class="nvt-item__title">{{ form.title }}</span>
                    <span class="invulhulp-text--sm invulhulp-text--subtle">{{ verdictFor(form.id).reason }}</span>
                  </div>
                  <nldd-button
                    variant="neutral-transparent"
                    size="sm"
                    text="Toch openen"
                    @click="$emit('open', form.id)"
                  />
                </li>
              </ul>
              <nldd-text size="sm" color="secondary" class="nvt-note">
                Advies van de toepassingsscan, geen juridisch oordeel. Al ingevulde antwoorden
                blijven bewaard.
              </nldd-text>
            </div>
          </details>
        </div>
      </li>
      </ol>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAiMode } from '../composables/useAiMode'
import { useDossierForms } from '../composables/useDossierForms'
import type { FormIndexEntry } from '../services/formLoader'
import { connectorGlyph, type TrackGroup } from '../utils/tracks'
import { BESLISHULP_HOST_FORM_ID, isOutOfScope, riskLevelFor, verdictLevelLabel } from '../utils/beslishulp'
import FormCard from './FormCard.vue'
import BeslishulpTile from './BeslishulpTile.vue'

defineEmits<{ open: [id: string]; beslishulp: [] }>()

const store = useAssessmentStore()
const { aiModeActive, aiModeProgress, aiModeDone, aiModeTotal, aiModePhase, readyDocIds, startAiMode, cancelAiMode, dismissAiModeDone, hasSmoothingUndo, undoSmoothing } = useAiMode()
const {
  verdictFor,
  applicableForms,
  nvtForms,
  statusFor,
  preludeForms,
  preludeCount,
  timelineGroups,
  trackCount,
  markerState,
} = useDossierForms()

// Verdict echoed as a tag on the EU AI Act card. Level only — the tile beside
// it already spells out the roles, and the tag has one line to work with.
const verdictLabel = computed(() =>
  store.beslishulpRun
    ? verdictLevelLabel(new Set(store.beslishulpRun.labels), store.beslishulpRun.conclusionId)
    : '',
)
const verdictTone = computed(() => {
  const run = store.beslishulpRun
  if (!run) return 'neutral'
  if (isOutOfScope(new Set(run.labels), run.conclusionId)) return 'info'
  switch (riskLevelFor(new Set(run.labels))) {
    case 'onaanvaardbaar': return 'error'
    case 'hoog': return 'warning'
    case 'beperkt': return 'info'
    default: return 'success'
  }
})

/** Alles wat een kaart nodig heeft, op één plek berekend — de kaart in de band
 *  en de kaart in de tijdlijn krijgen zo gegarandeerd dezelfde affordances. */
function cardProps(form: FormIndexEntry) {
  return {
    form,
    status: statusFor(form.id),
    verdict: verdictFor(form.id),
    paired: form.id === BESLISHULP_HOST_FORM_ID,
    beslishulpVerdict:
      form.id === BESLISHULP_HOST_FORM_ID && store.beslishulpRun
        ? { label: verdictLabel.value, tone: verdictTone.value }
        : null,
    canEdit: store.canEdit,
    hasDocuments: readyDocIds.value.length > 0,
    aiActive: aiModeActive.value.has(form.id),
    aiDone: form.id in aiModeDone.value,
    aiDoneFilled: aiModeDone.value[form.id] ?? 0,
    aiDoneTotal: aiModeTotal.value[form.id] ?? 0,
    aiProgress: aiModeProgress.value[form.id] ?? null,
    aiPhase: aiModePhase.value[form.id] ?? null,
    canUndoSmoothing: hasSmoothingUndo(form.id),
  }
}

const cardHandlers = {
  activate: startAiMode,
  cancel: cancelAiMode,
  dismiss: dismissAiModeDone,
  undoSmoothing: undoSmoothing,
}

/** NLDD's step vocabulary for the vertical spine. `empty` has no counterpart —
 *  a phase without forms reads as `future`, and the empty hint in its body says
 *  why, which keeps that fact out of colour alone. */
function stepStatus(group: TrackGroup): 'past' | 'current' | 'future' {
  const state = markerState(group)
  if (state === 'done') return 'past'
  if (state === 'busy') return 'current'
  return 'future'
}

/** Where this phase sits on the track: the first has no line above it, the last
 *  none below, so the spine starts and stops at a marker. */
function stepPosition(index: number): 'first' | 'between' | 'last' | 'only' {
  const last = timelineGroups.value.length - 1
  if (last === 0) return 'only'
  if (index === 0) return 'first'
  return index === last ? 'last' : 'between'
}

/** The number in the disc. A finished phase shows a check instead, and the
 *  `onbekend` bucket is not a phase and has no number at all. */
function stepNumber(group: TrackGroup): string {
  if (markerState(group) === 'done' || group.phaseNumber === 0) return ''
  return String(group.phaseNumber)
}
</script>

<style scoped>
/* ---- Vooraf-band ------------------------------------------------------ */

/* Platter dan .portal-card en zonder de blauwe kaartrand bovenaan: de band mag
   niet concurreren met de fasen eronder — hij gaat eraan vooraf. */
.prelude {
  margin-block-end: var(--primitives-space-40);
  /* Same inline padding as .portal-card, .bulk-ai en de toepassingsscan-tegel:
     alle koppen op deze pagina beginnen op dezelfde verticale lijn. */
  padding: var(--primitives-space-24) var(--primitives-space-32);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  /* Clear the column's sticky title bar when the fase rail scrolls here;
     nldd-page publishes its height as --context-inset-top. */
  scroll-margin-block-start: calc(var(--context-inset-top, 0px) + var(--primitives-space-24));
}

.prelude__header {
  display: flex;
  align-items: baseline;
  gap: var(--primitives-space-12);
  flex-wrap: wrap;
  margin-block-end: var(--primitives-space-12);
}

.prelude__title {
  color: var(--semantics-content-accent-color);
  margin: 0;
}

.prelude__meta {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}

/* ---- Timeline --------------------------------------------------------- */

/* Vertical lifecycle timeline. The spine is drawn per phase (not once on the
   list) so it can stop cleanly at the last marker instead of trailing into the
   whitespace below the final card row. */
.track-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  /* The lane is the step marker's own width (nldd-timeline-track-cell,
     size="md"); only the gap to the content is ours. */
  --track-gutter: var(--primitives-space-16);
}

.track-phase {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: var(--track-gutter);
  /* Clear the column's sticky title bar, or the fase rail scrolls a phase to
     right under it. */
  scroll-margin-block-start: calc(var(--context-inset-top, 0px) + var(--primitives-space-24));
}

/* The whitespace between two phases sits inside the body column, so the lane
   next to it stretches over it and the track runs on without a break. */
.track-phase__body {
  padding-block-end: var(--primitives-space-48);
}

.track-phase:last-child .track-phase__body {
  padding-block-end: 0;
}

.track-phase__lane {
  display: flex;
  flex-direction: column;
  /* No masking ring: by default the cell cuts a band of page colour around
     each disc, which reads as a gap between the track and the marker. */
  --semantics-surfaces-ring-thickness: 0px;
}

/* The disc centres itself in the cell, so this height decides how far down the
   phase heading the marker lands — roughly on the title, under the eyebrow. */
.track-phase__step {
  flex: 0 0 auto;
  block-size: 3rem;
}

/* Line only (status="none"): carries the track past the cards of this phase
   down to the next marker. */
.track-phase__rail {
  flex: 1 1 auto;
}

.track-eyebrow {
  margin: 0 0 var(--primitives-space-2);
  font-size: var(--primitives-font-size-70);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--invulhulp-color-text-subtle);
}

.track-title-row {
  display: flex;
  align-items: baseline;
  gap: var(--primitives-space-12);
  flex-wrap: wrap;
}

.track-count {
  color: var(--invulhulp-color-text-subtle);
  white-space: nowrap;
}

.track-header {
  margin-block-end: var(--primitives-space-16);
}

@media (max-width: 640px) {
  .track-timeline {
    --track-gutter: var(--primitives-space-12);
  }
}

.track-title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-4);
}

.track-desc {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}

.track-empty {
  color: var(--invulhulp-color-text-subtle);
  max-inline-size: 60ch;
  margin: 0;
  padding: var(--primitives-space-16);
  border: 1px dashed var(--semantics-content-secondary-color);
  border-radius: var(--primitives-corner-radius-md);
}

.card-row {
  display: flex;
  align-items: stretch;
  column-gap: 0;
  row-gap: var(--primitives-space-16);
  flex-wrap: wrap;
}

/* Connector + card as one unwrappable unit; each line stretches its own cards
   to equal height. */
.card-chain-item {
  display: flex;
  align-items: stretch;
}

.card-connector {
  display: flex;
  align-items: center;
  padding: 0 var(--primitives-space-8);
  color: var(--semantics-content-secondary-color);
  font-size: var(--primitives-font-size-100);
  flex-shrink: 0;
  align-self: center;
}

/* --- Niet van toepassing, per phase. Stock item-list rows; only the
   layout inside a row and the struck-through title are ours. --- */
.nvt-group {
  margin-block-start: var(--primitives-space-16);
  max-inline-size: 52rem;
}

.nvt-list {
  margin: 0;
}

.nvt-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--primitives-space-16);
}

.nvt-item__text {
  display: flex;
  flex-direction: column;
}

.nvt-item__title {
  font-weight: var(--primitives-font-weight-body-semi-bold);
  text-decoration: line-through;
  text-decoration-color: var(--semantics-content-secondary-color);
  color: var(--semantics-content-secondary-color);
}

.nvt-note {
  margin-block: var(--primitives-space-12) 0;
  max-inline-size: 68ch;
}
</style>
