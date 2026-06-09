<template>
  <div class="portal-page">
    <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm">

      <!-- Hero -->
      <section class="rvo-hero rvo-hero--lichtblauw portal-hero">
        <div class="rvo-hero__content">
          <h1 class="rvo-heading rvo-heading--2xl rvo-hero__title">FinDocs</h1>
          <p class="rvo-text rvo-text--lg rvo-hero__subtitle">
            Digitale instrumenten voor IV-projecten, privacy en AI-impact assessments — Ministerie van Financiën
          </p>
        </div>
      </section>

      <!-- Dossier selector -->
      <section class="portal-card" aria-labelledby="dossier-title">
        <div class="portal-card__header">
          <h2 id="dossier-title" class="rvo-heading rvo-heading--lg portal-card__title">Dossier</h2>
          <p class="rvo-text portal-card__desc">
            Een dossier groepeert brondocumenten en formulierantwoorden. Wissel tussen dossiers om met een andere verzameling te werken.
          </p>
        </div>
        <div class="portal-card__controls">
          <div class="dossier-tabs" role="tablist" aria-label="Dossiers">
            <button
              v-for="d in store.dossierList"
              :key="d.id"
              type="button"
              role="tab"
              :aria-selected="d.id === store.activeDossierId"
              class="dossier-tab"
              :class="{ 'dossier-tab--active': d.id === store.activeDossierId }"
              @click="store.switchDossier(d.id)"
            >
              <span class="dossier-tab__name">{{ d.name }}</span>
              <span class="dossier-tab__meta">{{ d.documents.length }} doc</span>
            </button>
          </div>
          <div class="dossier-actions">
            <button
              type="button"
              class="rvo-button rvo-button--tertiary rvo-button--size-sm"
              @click="openCreateDialog"
            >
              + Nieuw dossier
            </button>
            <button
              v-if="store.activeDossierId"
              type="button"
              class="rvo-button rvo-button--tertiary rvo-button--size-sm"
              @click="openRenameDialog"
            >
              Hernoemen
            </button>
            <button
              v-if="store.dossierList.length > 1"
              type="button"
              class="rvo-button rvo-button--warning-subtle rvo-button--size-sm"
              @click="openDeleteDialog"
            >
              Verwijderen
            </button>
          </div>
        </div>
      </section>

      <!-- Brondocumenten upload -->
      <section class="portal-card" aria-labelledby="docs-title">
        <div class="portal-card__header">
          <div class="docs-title-row">
            <h2 id="docs-title" class="rvo-heading rvo-heading--lg portal-card__title">Brondocumenten</h2>
            <span v-if="store.documents.length > 0" class="rvo-tag rvo-tag--info rvo-tag--pill" aria-live="polite">
              {{ store.documents.length }} {{ store.documents.length === 1 ? 'document' : 'documenten' }} beschikbaar
            </span>
            <button
              v-if="hasAnyOntology"
              type="button"
              class="rvo-button rvo-button--secondary rvo-button--size-sm docs-graph-btn"
              :aria-pressed="showGraph"
              aria-controls="entity-graph-region"
              @click="showGraph = !showGraph"
            >
              {{ showGraph ? 'Verberg entiteitengrafiek' : 'Toon entiteitengrafiek' }}
            </button>
          </div>
          <p class="rvo-text portal-card__desc">
            Upload achtergronddocumenten (notulen, brainstorms, agenda's) in .txt, .md, .docx of .xlsx formaat.
            Bij het invullen van een formulier kun je per vraag automatisch een antwoord laten extraheren uit deze documenten.
          </p>
        </div>

        <div class="docs-controls">
          <label
            class="rvo-button rvo-button--primary docs-upload-btn"
            :class="{ 'docs-upload-btn--busy': isUploading }"
            :aria-disabled="isUploading"
          >
            <input
              ref="fileInput"
              type="file"
              accept=".txt,.md,.docx,.xlsx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              :disabled="isUploading"
              class="invulhulp-visually-hidden"
              @change="onFilesSelected"
            />
            <span v-if="!isUploading" aria-hidden="true">↑</span>
            <span v-if="isUploading">Bezig met inlezen…</span>
            <span v-else>Document(en) uploaden</span>
          </label>
          <span class="docs-upload-hint rvo-text rvo-text--sm">
            Klik op de knop om een of meer .txt / .md / .docx / .xlsx bestanden te kiezen
          </span>
        </div>

        <!-- Live status alerts -->
        <div class="docs-alerts" role="status" aria-live="polite">
          <div v-if="isUploading" class="rvo-alert rvo-alert--info rvo-alert--padding-sm">
            <div class="rvo-alert__container">{{ uploadingLabel }}</div>
          </div>
          <div v-if="successMessage" class="rvo-alert rvo-alert--success rvo-alert--padding-sm">
            <div class="rvo-alert__container">
              <strong>Toegevoegd:</strong> {{ successMessage }}
            </div>
          </div>
          <div v-if="uploadError" class="rvo-alert rvo-alert--error rvo-alert--padding-sm">
            <div class="rvo-alert__container">{{ uploadError }}</div>
          </div>
        </div>

        <EntityGraph
          v-if="showGraph"
          id="entity-graph-region"
          :documents="store.documents"
          @close="showGraph = false"
        />

        <ul v-if="store.documents.length > 0" class="docs-list">
          <li
            v-for="doc in store.documents"
            :key="doc.id"
            class="docs-item"
            :class="{ 'docs-item--new': recentlyAddedIds.has(doc.id) }"
          >
            <div class="docs-item__row">
              <div class="docs-item__info">
                <img :src="bevestigingIcon" class="docs-item__check" aria-hidden="true" alt="" />
                <div class="docs-item__text">
                  <span class="docs-item__name">{{ doc.name }}</span>
                  <span class="docs-item__meta rvo-text rvo-text--sm">
                    {{ formatSize(doc.content.length) }}
                    <template v-if="doc.indexing"> · indexeren…</template>
                    <template v-else-if="doc.indexError"> · indexering mislukt</template>
                    <template v-else-if="doc.chunkCount"> · {{ doc.chunkCount }} fragmenten</template>
                  </span>
                </div>
              </div>
              <button
                type="button"
                class="rvo-link docs-item__remove"
                @click="store.removeDocument(doc.id)"
              >
                Verwijderen
              </button>
            </div>
            <DocumentOntology v-if="!doc.indexing && doc.ontology" :ontology="doc.ontology" />
            <p v-else-if="doc.indexError" class="docs-item__error rvo-text rvo-text--sm">{{ doc.indexError }}</p>
          </li>
        </ul>
        <p v-else-if="!isUploading" class="docs-empty rvo-text rvo-text--sm">Nog geen documenten geüpload.</p>
      </section>

      <!-- Track sections -->
      <section v-for="group in trackGroups" :key="group.track" class="track-section" :aria-labelledby="`track-${group.track}-title`">
        <div class="track-header">
          <h2 :id="`track-${group.track}-title`" class="rvo-heading rvo-heading--xl track-title">{{ group.label }}</h2>
          <p class="rvo-text track-desc">{{ group.description }}</p>
        </div>

        <div class="card-row">
          <template v-for="(form, idx) in group.forms" :key="form.id">
            <div v-if="idx > 0" class="card-connector" aria-hidden="true">
              {{ group.track === 'assessment' ? '↔' : '→' }}
            </div>
            <article
              class="rvo-card rvo-card--outline rvo-card--padding--md form-card"
              :class="{ 'form-card--ai-mode': aiModeActive.has(form.id) }"
            >
              <div class="form-card__body">
                <h3 class="rvo-heading rvo-heading--md form-card__title">{{ form.title }}</h3>
                <p class="rvo-text rvo-text--sm form-card__desc">{{ form.shortDescription }}</p>
              </div>
              <div class="form-card__actions">
                <button
                  class="rvo-button rvo-button--primary rvo-button--size-sm form-card__btn"
                  @click="$emit('open', form.id)"
                >
                  Openen
                </button>
                <AiModeToggle
                  :form-id="form.id"
                  :has-documents="readyDocIds.length > 0"
                  :is-active="aiModeActive.has(form.id)"
                  :is-done="form.id in aiModeDone"
                  :done-filled-count="aiModeDone[form.id] ?? 0"
                  :progress="aiModeProgress[form.id] ?? null"
                  @activate="startAiMode"
                  @cancel="cancelAiMode"
                  @dismiss="dismissAiModeDone"
                />
              </div>
            </article>
          </template>
        </div>
      </section>

    </div>

    <ConfirmDialog
      ref="aiModeErrorDialog"
      title="Documenten niet bereikbaar"
      message="De brondocumenten zijn niet meer beschikbaar in de index. Verwijder de documenten en upload ze opnieuw om AI Mode te gebruiken."
      confirm-label="Sluiten"
      cancel-label=""
      @confirm="onAiModeErrorDismissed"
      @cancel="onAiModeErrorDismissed"
    />
    <ConfirmDialog
      ref="createDialog"
      title="Nieuw dossier"
      message="Geef het dossier een naam."
      kind="prompt"
      input-label="Naam"
      confirm-label="Aanmaken"
      @confirm="onCreateConfirmed"
    />
    <ConfirmDialog
      ref="renameDialog"
      title="Dossier hernoemen"
      kind="prompt"
      input-label="Nieuwe naam"
      confirm-label="Opslaan"
      @confirm="onRenameConfirmed"
    />
    <ConfirmDialog
      ref="deleteDialog"
      title="Dossier verwijderen"
      :message="deleteMessage"
      confirm-label="Verwijderen"
      cancel-label="Annuleren"
      variant="warning"
      @confirm="onDeleteConfirmed"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import bevestigingIcon from '@nl-rvo/assets/icons/status/bevestiging.svg'
import { loadAvailableForms, type FormIndexEntry } from '../services/formLoader'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAiMode } from '../composables/useAiMode'
import DocumentOntology from './DocumentOntology.vue'
import EntityGraph from './EntityGraph.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import AiModeToggle from './AiModeToggle.vue'

defineEmits<{ open: [id: string] }>()

const store = useAssessmentStore()
const forms = ref<FormIndexEntry[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const uploadError = ref('')
const successMessage = ref('')
const isUploading = ref(false)
const uploadingLabel = ref('')
const recentlyAddedIds = ref<Set<string>>(new Set())
const showGraph = ref(false)
const hasAnyOntology = computed(() => store.documents.some(d => !!d.ontology))

const { aiModeActive, aiModeProgress, aiModeDone, aiModeError, readyDocIds, startAiMode, cancelAiMode, dismissAiModeDone, dismissAiModeError } = useAiMode()

const createDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const renameDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const deleteDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const aiModeErrorDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const aiModeErrorFormId = ref<string | null>(null)

watch(aiModeError, (errors) => {
  const formId = Object.keys(errors)[0]
  if (formId && !aiModeErrorFormId.value) {
    aiModeErrorFormId.value = formId
    aiModeErrorDialog.value?.open()
  }
}, { deep: true })

const deleteMessage = computed(() => {
  const current = store.activeDossierId ? store.dossiers[store.activeDossierId] : null
  if (!current) return ''
  return `Dossier "${current.name}" verwijderen? Alle formulierantwoorden en brondocumenten in dit dossier gaan verloren.`
})


onMounted(async () => {
  store.ensureDossier()
  forms.value = await loadAvailableForms()
})

function onAiModeErrorDismissed() {
  if (aiModeErrorFormId.value) {
    dismissAiModeError(aiModeErrorFormId.value)
    aiModeErrorFormId.value = null
  }
}

function openCreateDialog() {
  createDialog.value?.open()
}

function openRenameDialog() {
  if (!store.activeDossierId) return
  const current = store.dossiers[store.activeDossierId]
  if (!current) return
  renameDialog.value?.open(current.name)
}

function openDeleteDialog() {
  if (!store.activeDossierId) return
  deleteDialog.value?.open()
}

function onCreateConfirmed(name: string) {
  const trimmed = name.trim() || `Dossier ${store.dossierList.length + 1}`
  store.createDossier(trimmed)
}

function onRenameConfirmed(name: string) {
  if (!store.activeDossierId) return
  const trimmed = name.trim()
  if (!trimmed) return
  store.renameDossier(store.activeDossierId, trimmed)
}

function onDeleteConfirmed() {
  if (!store.activeDossierId) return
  store.deleteDossier(store.activeDossierId)
}

async function onFilesSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  if (files.length === 0) return

  uploadError.value = ''
  successMessage.value = ''
  isUploading.value = true

  const addedNames: string[] = []
  const errors: string[] = []
  const previousIds = new Set(store.documents.map((d) => d.id))

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    uploadingLabel.value =
      files.length > 1
        ? `Inlezen van ${file.name} (${i + 1} van ${files.length})…`
        : `Inlezen van ${file.name}…`

    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (!['txt', 'md', 'docx', 'xlsx'].includes(ext)) {
      errors.push(`${file.name}: alleen .txt, .md, .docx en .xlsx zijn toegestaan.`)
      continue
    }
    const isOffice = ext === 'docx' || ext === 'xlsx'
    try {
      let text: string
      if (ext === 'docx') {
        const mammoth = await import('mammoth/mammoth.browser')
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        text = result.value
      } else if (ext === 'xlsx') {
        const XLSX = await import('xlsx')
        const arrayBuffer = await file.arrayBuffer()
        const wb = XLSX.read(arrayBuffer, { type: 'array' })
        const parts: string[] = []
        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName]
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
          if (csv.trim()) parts.push(`# ${sheetName}\n${csv}`)
        }
        text = parts.join('\n\n')
      } else {
        text = await file.text()
      }
      if (!text.trim()) {
        errors.push(`${file.name}: geen tekst gevonden.`)
        continue
      }
      const baseName = file.name.replace(/\.(docx|xlsx)$/i, '.txt')
      await store.addDocument(baseName, text)
      addedNames.push(file.name)
    } catch {
      errors.push(`${file.name}: kon bestand niet inlezen.`)
    }
  }

  const newIds = store.documents.map((d) => d.id).filter((id) => !previousIds.has(id))
  recentlyAddedIds.value = new Set(newIds)
  setTimeout(() => {
    for (const id of newIds) recentlyAddedIds.value.delete(id)
    recentlyAddedIds.value = new Set(recentlyAddedIds.value)
  }, 3000)

  isUploading.value = false
  uploadingLabel.value = ''
  if (addedNames.length > 0) {
    successMessage.value = addedNames.join(', ')
    setTimeout(() => {
      successMessage.value = ''
    }, 4000)
  }
  if (errors.length > 0) {
    uploadError.value = errors.join(' ')
  }

  if (fileInput.value) fileInput.value.value = ''
}


function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

const TRACK_META: Record<string, { label: string; description: string; order: number }> = {
  project: {
    label: 'Projectspoor',
    description: 'Gebruik deze formulieren in volgorde om een IV-project voor te bereiden, in te dienen bij het portfolioboard en architectureel te onderbouwen.',
    order: 1,
  },
  compliance: {
    label: 'Compliancespoor',
    description: 'Bepaal snel het BIO-beveiligingsniveau en eventuele aanvullende compliance-maatregelen.',
    order: 2,
  },
  assessment: {
    label: 'Assessments',
    description: 'Volledige impact assessments voor privacy en AI — worden gevoed door informatie uit het project- en privacyspoor.',
    order: 3,
  },
}

const trackGroups = computed(() => {
  const byTrack: Record<string, FormIndexEntry[]> = {}
  for (const form of forms.value) {
    const t = form.track ?? 'assessment'
    if (!byTrack[t]) byTrack[t] = []
    byTrack[t].push(form)
  }
  return Object.entries(byTrack)
    .sort(([a], [b]) => (TRACK_META[a]?.order ?? 99) - (TRACK_META[b]?.order ?? 99))
    .map(([track, trackForms]) => ({
      track,
      label: TRACK_META[track]?.label ?? track,
      description: TRACK_META[track]?.description ?? '',
      forms: [...trackForms].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    }))
})
</script>

<style scoped>
.portal-page {
  padding: var(--rvo-space-3xl) 0 var(--rvo-space-4xl);
  background: var(--rvo-color-lichtblauw-150);
  min-height: 100%;
}

.portal-hero {
  margin-block-end: var(--rvo-space-3xl);
}

.portal-card {
  position: relative;
  margin-block-end: var(--rvo-space-2xl);
  padding: var(--rvo-space-lg) var(--rvo-space-xl);
  background: var(--rvo-color-wit);
  border: 1px solid var(--rvo-color-lichtblauw-300);
  border-radius: var(--rvo-border-radius-md);
  box-shadow: 0 1px 3px rgb(21 66 115 / 0.06), 0 4px 12px rgb(21 66 115 / 0.04);
}

.portal-card::before {
  content: "";
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  block-size: 4px;
  background: var(--rvo-color-lintblauw);
  border-start-start-radius: var(--rvo-border-radius-md);
  border-start-end-radius: var(--rvo-border-radius-md);
}

.portal-card__header {
  margin-block-end: var(--rvo-space-md);
}

.portal-card__title {
  color: var(--rvo-color-lintblauw);
  margin: 0 0 var(--rvo-space-2xs);
}

.portal-card__desc {
  color: var(--invulhulp-color-text-subtle);
  font-size: var(--rvo-font-size-sm);
  margin: 0;
}

.portal-card__controls {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rvo-space-md);
  flex-wrap: wrap;
}

.dossier-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--rvo-space-3xs);
  padding: var(--rvo-space-3xs);
  background: var(--rvo-color-grijs-100);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: 999px;
}

.dossier-tab {
  display: inline-flex;
  align-items: baseline;
  gap: var(--rvo-space-xs);
  background: transparent;
  border: 0;
  border-radius: 999px;
  padding: var(--rvo-space-2xs) var(--rvo-space-md);
  cursor: pointer;
  color: var(--rvo-color-grijs-800);
  font: inherit;
  font-size: var(--rvo-font-size-sm);
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
  white-space: nowrap;
}

.dossier-tab:hover:not(.dossier-tab--active) {
  background: var(--rvo-color-wit);
  color: var(--rvo-color-lintblauw);
}

.dossier-tab:focus-visible {
  outline: 2px solid var(--rvo-color-lintblauw);
  outline-offset: 1px;
}

.dossier-tab--active {
  background: var(--rvo-color-lintblauw);
  color: var(--rvo-color-wit);
  box-shadow: 0 1px 2px rgb(21 66 115 / 0.25);
}

.dossier-tab__name {
  font-weight: var(--rvo-font-weight-semibold);
}

.dossier-tab__meta {
  font-size: var(--rvo-font-size-2xs);
  opacity: 0.75;
}

.dossier-tab--active .dossier-tab__meta {
  opacity: 0.85;
}

.dossier-actions {
  display: flex;
  gap: var(--rvo-space-xs);
  align-items: center;
}

.docs-title-row {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-sm);
  flex-wrap: wrap;
  margin-block-end: var(--rvo-space-2xs);
}

.docs-graph-btn {
  margin-inline-start: auto;
}

.docs-controls {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-sm);
  margin-block-end: var(--rvo-space-sm);
}

.docs-upload-btn {
  cursor: pointer;
}
.docs-upload-btn--busy {
  cursor: progress;
  opacity: 0.7;
  pointer-events: none;
}

.docs-upload-hint {
  color: var(--invulhulp-color-text-subtle);
}

.docs-alerts {
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-xs);
  margin-block-end: var(--rvo-space-sm);
}

.docs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-2xs);
}

.docs-item {
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-2xs);
  padding: var(--rvo-space-xs) var(--rvo-space-sm);
  background: var(--rvo-color-grijs-100);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--rvo-border-radius-sm);
  transition: background 0.6s ease, border-color 0.6s ease;
}

.docs-item__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rvo-space-xs);
}

.docs-item__error {
  margin: var(--rvo-space-2xs) 0 0;
  color: var(--rvo-color-rood);
}

.docs-item--new {
  background: var(--rvo-color-groen-150);
  border-color: var(--rvo-color-groen);
  animation: doc-pulse 1.2s ease-out;
}

@keyframes doc-pulse {
  0% { background: var(--rvo-color-groen-300); }
  100% { background: var(--rvo-color-groen-150); }
}


.docs-item__info {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-xs);
}

.docs-item__check {
  inline-size: 20px;
  block-size: 20px;
  flex-shrink: 0;
  /* Tint the SVG to the RVO groen colour via a CSS filter */
  filter: invert(40%) sepia(80%) saturate(500%) hue-rotate(65deg) brightness(90%);
}

.docs-item__text {
  display: flex;
  flex-direction: column;
}

.docs-item__name {
  font-weight: var(--rvo-font-weight-semibold);
  color: var(--rvo-color-grijs-800);
  font-size: var(--rvo-font-size-sm);
}

.docs-item__meta {
  color: var(--invulhulp-color-text-subtle);
}

.docs-item__remove {
  background: none;
  border: 0;
  color: var(--rvo-color-rood);
  cursor: pointer;
  font-size: var(--rvo-font-size-sm);
  text-decoration: underline;
  padding: var(--rvo-space-2xs) var(--rvo-space-xs);
}

.docs-empty {
  color: var(--rvo-color-grijs-500);
  font-style: italic;
  margin: 0;
}

.track-section {
  margin-block-end: var(--rvo-space-3xl);
}

.track-header {
  margin-block-end: var(--rvo-space-md);
}

.track-title {
  color: var(--rvo-color-lintblauw);
  margin: 0 0 var(--rvo-space-2xs);
}

.track-desc {
  color: var(--invulhulp-color-text-subtle);
  font-size: var(--rvo-font-size-sm);
  margin: 0;
}

.card-row {
  display: flex;
  align-items: stretch;
  gap: 0;
  flex-wrap: wrap;
}

.card-connector {
  display: flex;
  align-items: center;
  padding: 0 var(--rvo-space-xs);
  color: var(--rvo-color-grijs-400);
  font-size: var(--rvo-font-size-md);
  flex-shrink: 0;
  align-self: center;
}

.form-card {
  inline-size: 210px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: box-shadow 0.15s, border-color 0.3s;
}

.form-card:hover {
  box-shadow: 0 2px 8px rgb(21 66 115 / 0.12);
}

/* AI Mode active: animated gradient border + pulsing glow */
.form-card--ai-mode {
  border: 2px solid transparent;
  background-image:
    linear-gradient(var(--rvo-color-wit), var(--rvo-color-wit)),
    linear-gradient(135deg, #0f2d5c, #5b21b6, #0ea5e9, #5b21b6, #0f2d5c);
  background-origin: border-box;
  background-clip: padding-box, border-box;
  background-size: 100%, 300% 100%;
  animation: ai-border-shift 4s linear infinite, ai-card-glow 3s ease-in-out infinite;
}

@keyframes ai-border-shift {
  0%   { background-position: 0 0, 0% 50%; }
  100% { background-position: 0 0, 200% 50%; }
}

@keyframes ai-card-glow {
  0%, 100% { box-shadow: 0 0 8px 3px rgba(91, 33, 182, 0.2); }
  50%       { box-shadow: 0 0 22px 7px rgba(14, 165, 233, 0.35); }
}

.form-card__body {
  margin-block-end: var(--rvo-space-md);
}

.form-card__title {
  color: var(--rvo-color-lintblauw);
  margin: 0 0 var(--rvo-space-xs);
}

.form-card__desc {
  color: var(--invulhulp-color-text-subtle);
  line-height: var(--rvo-line-height-md);
}

.form-card__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--rvo-space-xs);
}

.form-card__btn {
  align-self: flex-start;
}
</style>
