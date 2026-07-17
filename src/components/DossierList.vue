<template>
  <div class="dossier-list-page">
    <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm">

      <!-- Hero -->
      <section class="rvo-hero rvo-hero--lichtblauw dossier-list-hero">
        <div class="rvo-hero__content">
          <h1 class="rvo-heading rvo-heading--2xl rvo-hero__title">FinDocs</h1>
          <p class="rvo-text rvo-text--lg rvo-hero__subtitle">
            Digitale instrumenten voor IV-projecten, privacy en AI-impact assessments — Ministerie van Financiën
          </p>
        </div>
      </section>

      <!-- Dossier overview -->
      <section aria-labelledby="dossiers-title">
        <div class="dossier-list__header">
          <div>
            <h2 id="dossiers-title" class="rvo-heading rvo-heading--xl dossier-list__title">Mijn dossiers</h2>
            <p class="rvo-text dossier-list__desc">
              Een dossier groepeert brondocumenten en formulierantwoorden rond één project of systeem.
            </p>
          </div>
          <button
            type="button"
            class="rvo-button rvo-button--primary"
            @click="openCreateDialog"
          >
            + Nieuw dossier
          </button>
        </div>

        <ul class="dossier-grid">
          <li v-for="d in store.dossierList" :key="d.id" class="dossier-grid__item">
            <button
              type="button"
              class="rvo-card rvo-card--outline rvo-card--padding--md dossier-card"
              @click="store.openDossier(d.id)"
            >
              <span class="dossier-card__icon" aria-hidden="true" />
              <span class="dossier-card__body">
                <span class="rvo-heading rvo-heading--md dossier-card__name">{{ d.name }}</span>
                <span v-if="d.sharedWithMe" class="rvo-tag rvo-tag--info rvo-tag--pill dossier-card__shared">
                  Gedeeld door {{ d.ownerName ?? 'een collega' }}
                  <template v-if="d.myRole"> · {{ roleLabels[d.myRole] }}</template>
                </span>
                <span class="rvo-text rvo-text--sm dossier-card__meta">
                  {{ d.documents.length }} {{ d.documents.length === 1 ? 'document' : 'documenten' }}
                  · {{ summaryFor(d).done }}/{{ summaryFor(d).total }} formulieren afgerond
                </span>
                <span class="rvo-text rvo-text--sm dossier-card__date">
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
import { ref, onMounted } from 'vue'
import { useAssessmentStore, type Dossier } from '../stores/assessmentStore'
import { useFormProgress } from '../composables/useFormProgress'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useAssessmentStore()
const { dossierSummary } = useFormProgress()
const createDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)

const roleLabels = { viewer: 'Lezen', editor: 'Bewerken', owner: 'Eigenaar' } as const

onMounted(() => {
  store.ensureDossier()
})

function summaryFor(d: Dossier) {
  return dossierSummary(d)
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
  padding: var(--rvo-space-3xl) 0 var(--rvo-space-4xl);
  background: var(--rvo-color-lichtblauw-150);
  min-height: 100%;
}

.dossier-list-hero {
  margin-block-end: var(--rvo-space-3xl);
}

.dossier-list__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rvo-space-md);
  flex-wrap: wrap;
  margin-block-end: var(--rvo-space-lg);
}

.dossier-list__title {
  color: var(--rvo-color-lintblauw);
  margin: 0 0 var(--rvo-space-2xs);
}

.dossier-list__desc {
  color: var(--invulhulp-color-text-subtle);
  font-size: var(--rvo-font-size-sm);
  margin: 0;
}

.dossier-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--rvo-space-md);
}

.dossier-grid__item {
  display: flex;
}

.dossier-card {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-md);
  inline-size: 100%;
  background: var(--rvo-color-wit);
  border: 1px solid var(--rvo-color-lichtblauw-300);
  cursor: pointer;
  font: inherit;
  text-align: start;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.dossier-card:hover {
  border-color: var(--rvo-color-lintblauw);
  box-shadow: 0 2px 8px rgb(21 66 115 / 0.12);
}

.dossier-card:focus-visible {
  outline: 2px solid var(--rvo-color-lintblauw);
  outline-offset: 2px;
}

/* Static mask URL so Vite resolves the NLDS icon in the production build —
   a runtime url(...) binding renders as a white square. */
.dossier-card__icon {
  display: inline-block;
  inline-size: 2rem;
  block-size: 2rem;
  flex-shrink: 0;
  background-color: var(--rvo-color-lintblauw);
  -webkit-mask: url('@nl-rvo/assets/icons/op-kantoor/map-vol-documenten.svg') center / contain no-repeat;
  mask: url('@nl-rvo/assets/icons/op-kantoor/map-vol-documenten.svg') center / contain no-repeat;
}

.dossier-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-3xs);
  min-inline-size: 0;
  flex: 1;
}

.dossier-card__name {
  color: var(--rvo-color-lintblauw);
  margin: 0;
  overflow-wrap: anywhere;
}

.dossier-card__meta {
  color: var(--rvo-color-grijs-800);
}

.dossier-card__shared {
  align-self: flex-start;
  font-size: var(--rvo-font-size-xs);
}

.dossier-card__date {
  color: var(--invulhulp-color-text-subtle);
}

.dossier-card__chevron {
  color: var(--rvo-color-grijs-400);
  font-size: var(--rvo-font-size-xl);
  flex-shrink: 0;
}
</style>
