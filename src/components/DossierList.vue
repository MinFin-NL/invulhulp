<template>
  <div class="dossier-list-page">
    <div class="invulhulp-measure invulhulp-measure--lg invulhulp-measure--pad">

      <!-- Hero -->
      <section class="rvo-hero rvo-hero--lichtblauw dossier-list-hero">
        <div class="rvo-hero__content">
          <nldd-title size="1"><h1 class="rvo-hero__title">FinDocs</h1></nldd-title>
          <nldd-text size="lg" class="rvo-hero__subtitle">
            Digitale instrumenten voor IV-projecten, privacy en AI-impact assessments — Ministerie van Financiën
          </nldd-text>
        </div>
      </section>

      <!-- Dossier overview -->
      <section aria-labelledby="dossiers-title">
        <div class="dossier-list__header">
          <div>
            <nldd-title size="2"><h2 class="dossier-list__title" id="dossiers-title">Mijn dossiers</h2></nldd-title>
            <!-- ensureDossier() maakt altijd een dossier aan, dus de lege staat
                 van deze lijst bestaat niet en er was nergens een eerste
                 instructie. Bij één ongebruikt dossier staat die hier. -->
            <nldd-text size="sm" color="inherit" class="dossier-list__desc" v-if="isFirstVisit">
              Open je dossier en upload je eerste document — daarna vult FinDocs de formulieren
              voor je in, met een bronverwijzing per antwoord.
            </nldd-text>
            <nldd-text size="sm" color="inherit" class="dossier-list__desc" v-else>
              Een dossier groepeert brondocumenten en formulierantwoorden rond één project of systeem.
            </nldd-text>
          </div>
          <nldd-button
            variant="primary"
            text="+ Nieuw dossier"
            @click="openCreateDialog"
          />
        </div>

        <ul class="dossier-grid">
          <li v-for="d in store.dossierList" :key="d.id" class="dossier-grid__item">
            <button
              type="button"
              class="invulhulp-card dossier-card"
              @click="store.openDossier(d.id)"
            >
              <nldd-icon class="dossier-card__icon" name="folder" size="32" color="accent" />
              <span class="dossier-card__body">
                <span class="invulhulp-heading--md dossier-card__name">{{ d.name }}</span>
                <nldd-tag v-if="d.sharedWithMe" size="sm" color="accent" class="dossier-card__shared">
                  Gedeeld door {{ d.ownerName ?? 'een collega' }}
                  <template v-if="d.myRole"> · {{ roleLabels[d.myRole] }}</template>
                </nldd-tag>
                <span class="invulhulp-text--sm dossier-card__meta">
                  {{ d.documents.length }} {{ d.documents.length === 1 ? 'document' : 'documenten' }}
                  · {{ summaryFor(d).done }}/{{ summaryFor(d).total }} formulieren afgerond
                </span>
                <!-- One segment per lifecycle phase, in order, filled to the
                     share of that phase's forms that are done. Hidden from AT:
                     the whole card is one button, so a label here would append
                     five more clauses to its accessible name — and the line
                     above already announces the total. The per-phase numbers
                     are on the dossier page, under proper phase headings. -->
                <span class="dossier-card__phases" aria-hidden="true">
                  <span
                    v-for="p in phasesFor(d)"
                    :key="p.track"
                    class="dossier-card__phase"
                    :class="{ 'dossier-card__phase--empty': p.total === 0 }"
                    :title="p.title"
                  >
                    <span
                      class="dossier-card__phase-fill"
                      :style="{ inlineSize: p.total ? `${(p.done / p.total) * 100}%` : '0' }"
                    />
                  </span>
                </span>
                <span class="invulhulp-text--sm dossier-card__date">
                  Laatst bewerkt: {{ formatDate(d.updatedAt ?? d.createdAt) }}
                </span>
              </span>
              <span class="dossier-card__chevron" aria-hidden="true">›</span>
            </button>
          </li>
        </ul>
      </section>

    </div>

    <ConfirmDialog
      ref="createDialog"
      title="Nieuw dossier"
      message="Geef het dossier een naam."
      kind="prompt"
      input-label="Naam"
      confirm-label="Aanmaken"
      @confirm="onCreateConfirmed"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAssessmentStore, type Dossier } from '../stores/assessmentStore'
import { useFormProgress } from '../composables/useFormProgress'
import { TRACK_IDS, TRACK_META } from '../utils/tracks'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useAssessmentStore()
const { dossierSummary, trackSummary } = useFormProgress()
const createDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)

const roleLabels = { viewer: 'Lezen', editor: 'Bewerken', owner: 'Eigenaar' } as const

onMounted(() => {
  store.ensureDossier()
})

// Precies één dossier, zonder documenten en zonder afgeronde formulieren: dit
// is iemands eerste keer.
const isFirstVisit = computed(() => {
  const list = store.dossierList
  return list.length === 1 && list[0].documents.length === 0 && dossierSummary(list[0]).done === 0
})

function summaryFor(d: Dossier) {
  return dossierSummary(d)
}

function phasesFor(d: Dossier) {
  const counts = trackSummary(d)
  return TRACK_IDS.map((track) => ({
    track,
    ...counts[track],
    title: counts[track].total === 0
      ? `${TRACK_META[track].label}: nog geen formulieren`
      : `${TRACK_META[track].label}: ${counts[track].done} van ${counts[track].total} afgerond`,
  }))
}

const dateFormat = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium' })

function formatDate(ts: number): string {
  return dateFormat.format(new Date(ts))
}

function openCreateDialog() {
  createDialog.value?.open()
}

function onCreateConfirmed(name: string) {
  const trimmed = name.trim() || `Dossier ${store.dossierList.length + 1}`
  // createDossier activates the new dossier and lands on its detail page
  store.createDossier(trimmed)
}
</script>

<style scoped>
.dossier-list-page {
  padding: var(--primitives-space-48) 0 var(--primitives-space-64);
  background: var(--semantics-surfaces-tinted-background-color);
  min-height: 100%;
}

.dossier-list-hero {
  margin-block-end: var(--primitives-space-48);
}

.dossier-list__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--primitives-space-16);
  flex-wrap: wrap;
  margin-block-end: var(--primitives-space-24);
}

.dossier-list__title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-4);
}

.dossier-list__desc {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}

.dossier-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--primitives-space-16);
}

.dossier-grid__item {
  display: flex;
}

.dossier-card {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-16);
  inline-size: 100%;
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  cursor: pointer;
  font: inherit;
  text-align: start;
  transition: box-shadow var(--invulhulp-duration-fast), border-color var(--invulhulp-duration-fast);
}

.dossier-card:hover {
  border-color: var(--semantics-content-accent-color);
  box-shadow: 0 2px 8px rgb(21 66 115 / 0.12);
}

.dossier-card:focus-visible {
  outline: 2px solid var(--semantics-content-accent-color);
  outline-offset: 2px;
}

.dossier-card__icon {
  flex-shrink: 0;
}

.dossier-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-2);
  min-inline-size: 0;
  flex: 1;
}

.dossier-card__name {
  color: var(--semantics-content-accent-color);
  margin: 0;
  overflow-wrap: anywhere;
}

.dossier-card__meta {
  color: var(--semantics-content-color);
}

.dossier-card__shared {
  align-self: flex-start;
  font-size: var(--primitives-font-size-80);
}

/* Phase bar: the same five lifecycle steps as the dossier timeline, so the
   overview already shows how far a dossier is along the process. */
.dossier-card__phases {
  display: flex;
  gap: 3px;
  inline-size: 100%;
  margin-block: var(--primitives-space-2);
}

.dossier-card__phase {
  display: block;
  flex: 1;
  block-size: 5px;
  border-radius: 999px;
  background: var(--semantics-dividers-color);
  overflow: hidden;
}

/* A phase without forms yet (afronding) — visibly present, visibly unfillable. */
.dossier-card__phase--empty {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--semantics-content-secondary-color);
}

.dossier-card__phase-fill {
  display: block;
  block-size: 100%;
  background: var(--semantics-content-accent-color);
}

.dossier-card__date {
  color: var(--invulhulp-color-text-subtle);
}

.dossier-card__chevron {
  color: var(--semantics-content-secondary-color);
  font-size: var(--primitives-font-size-300);
  flex-shrink: 0;
}
</style>
