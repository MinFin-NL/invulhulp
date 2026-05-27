<template>
  <div class="portal-page">
    <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm">

      <!-- Hero -->
      <div class="portal-hero">
        <h1 class="rvo-heading rvo-heading--2xl portal-title">FinDocs</h1>
        <p class="rvo-text rvo-text--lg portal-subtitle">
          Digitale instrumenten voor IV-projecten, privacy en AI-impact assessments — Ministerie van Financiën
        </p>
      </div>

      <!-- Brondocumenten upload -->
      <div class="docs-section">
        <div class="docs-header">
          <div class="docs-title-row">
            <h2 class="rvo-heading rvo-heading--lg docs-title">Brondocumenten</h2>
            <span v-if="store.documents.length > 0" class="docs-count-badge" aria-live="polite">
              {{ store.documents.length }} {{ store.documents.length === 1 ? 'document' : 'documenten' }} beschikbaar
            </span>
          </div>
          <p class="rvo-text docs-desc">
            Upload achtergronddocumenten (notulen, brainstorms, agenda's) in .txt of .md formaat.
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
              accept=".txt,.md,text/plain,text/markdown"
              multiple
              :disabled="isUploading"
              style="display: none;"
              @change="onFilesSelected"
            />
            <svg v-if="!isUploading" class="docs-upload-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 16V4M12 4l-5 5M12 4l5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span v-if="isUploading">Bezig met inlezen…</span>
            <span v-else>Document(en) uploaden</span>
          </label>
          <span class="docs-upload-hint">Klik op de knop om een of meer .txt / .md bestanden te kiezen</span>
        </div>

        <!-- Live status alerts (NL Design System) -->
        <div class="docs-alerts" role="status" aria-live="polite">
          <div v-if="isUploading" class="rvo-alert rvo-alert--info docs-alert">
            <div class="rvo-alert__content">
              {{ uploadingLabel }}
            </div>
          </div>
          <div v-if="successMessage" class="rvo-alert rvo-alert--success docs-alert">
            <div class="rvo-alert__content">
              <strong>Toegevoegd:</strong> {{ successMessage }}
            </div>
          </div>
          <div v-if="uploadError" class="rvo-alert rvo-alert--error docs-alert">
            <div class="rvo-alert__content">
              {{ uploadError }}
            </div>
          </div>
        </div>

        <ul v-if="store.documents.length > 0" class="docs-list">
          <li
            v-for="doc in store.documents"
            :key="doc.id"
            class="docs-item"
            :class="{ 'docs-item--new': recentlyAddedIds.has(doc.id) }"
          >
            <div class="docs-item-info">
              <span class="docs-item-check" aria-hidden="true">✓</span>
              <div class="docs-item-text">
                <span class="docs-item-name">{{ doc.name }}</span>
                <span class="docs-item-meta">{{ formatSize(doc.content.length) }}</span>
              </div>
            </div>
            <button type="button" class="docs-item-remove" @click="store.removeDocument(doc.id)">
              Verwijderen
            </button>
          </li>
        </ul>
        <p v-else-if="!isUploading" class="docs-empty">Nog geen documenten geüpload.</p>
      </div>

      <!-- Track sections -->
      <div v-for="group in trackGroups" :key="group.track" class="track-section">
        <div class="track-header">
          <h2 class="rvo-heading rvo-heading--xl track-title">{{ group.label }}</h2>
          <p class="rvo-text track-desc">{{ group.description }}</p>
        </div>

        <div class="card-row">
          <template v-for="(form, idx) in group.forms" :key="form.id">
            <div v-if="idx > 0" class="card-connector">
              {{ group.track === 'assessment' ? '↔' : '→' }}
            </div>
            <div class="form-card">
              <div class="card-body">
                <h3 class="rvo-heading rvo-heading--lg card-title">{{ form.title }}</h3>
                <p class="rvo-text card-desc">{{ form.shortDescription }}</p>
              </div>
              <button
                class="rvo-button rvo-button--primary card-btn"
                @click="$emit('open', form.id)"
              >
                Openen
              </button>
            </div>
          </template>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { loadAvailableForms, type FormIndexEntry } from '../services/formLoader'
import { useAssessmentStore } from '../stores/assessmentStore'

defineEmits<{ open: [id: string] }>()

const store = useAssessmentStore()
const forms = ref<FormIndexEntry[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const uploadError = ref('')
const successMessage = ref('')
const isUploading = ref(false)
const uploadingLabel = ref('')
const recentlyAddedIds = ref<Set<string>>(new Set())

const MAX_DOC_BYTES = 200_000

onMounted(async () => {
  forms.value = await loadAvailableForms()
})

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

    if (file.size > MAX_DOC_BYTES) {
      errors.push(`${file.name} is te groot (max 200 KB).`)
      continue
    }
    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (!['txt', 'md'].includes(ext)) {
      errors.push(`${file.name}: alleen .txt en .md zijn toegestaan.`)
      continue
    }
    try {
      const text = await file.text()
      store.addDocument(file.name, text)
      addedNames.push(file.name)
    } catch {
      errors.push(`${file.name}: kon bestand niet inlezen.`)
    }
  }

  // Identify newly added documents for the "just added" highlight
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
  privacy: {
    label: 'Privacyspoor',
    description: 'Doorloop deze stappen om te bepalen of een volledige DPIA verplicht is voor de verwerking van persoonsgegevens.',
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
  padding: 48px 0 64px;
  background: #f8f9fb;
  min-height: 100%;
}

.portal-hero {
  margin-bottom: 48px;
}

.portal-title {
  color: #154273;
  margin-bottom: 12px;
}

.portal-subtitle {
  color: #555;
  max-width: 640px;
}

.track-section {
  margin-bottom: 48px;
}

.track-header {
  margin-bottom: 20px;
}

.track-title {
  color: #154273;
  margin-bottom: 4px;
}

.track-desc {
  color: #666;
  font-size: 0.9rem;
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
  padding: 0 8px;
  color: #9ab0cc;
  font-size: 1.1rem;
  flex-shrink: 0;
  align-self: center;
}

.form-card {
  background: white;
  border: 1px solid #d0dce8;
  border-radius: 6px;
  padding: 20px 20px 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 210px;
  flex-shrink: 0;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.form-card:hover {
  box-shadow: 0 2px 8px rgba(21, 66, 115, 0.12);
  border-color: #9ab0cc;
}

.card-body {
  margin-bottom: 16px;
}

.card-title {
  color: #154273;
  font-size: 0.95rem;
  margin-bottom: 8px;
}

.card-desc {
  color: #555;
  font-size: 0.8rem;
  line-height: 1.5;
}

.card-btn {
  font-size: 0.85rem;
  padding: 6px 14px;
  align-self: flex-start;
}

.docs-section {
  margin-bottom: 48px;
  padding: 24px;
  background: white;
  border: 1px solid #d0dce8;
  border-radius: 6px;
}

.docs-header {
  margin-bottom: 16px;
}

.docs-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.docs-title {
  color: #154273;
  margin: 0;
}

.docs-count-badge {
  background: #e8f0fb;
  color: #154273;
  border: 1px solid #b3c9e5;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.75rem;
  font-weight: 600;
}

.docs-desc {
  color: #666;
  font-size: 0.9rem;
  max-width: 720px;
}

.docs-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.docs-upload-btn {
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  box-shadow: 0 1px 3px rgba(21, 66, 115, 0.2);
  transition: transform 0.1s, box-shadow 0.15s, opacity 0.15s;
}

.docs-upload-btn:hover:not(.docs-upload-btn--busy) {
  box-shadow: 0 3px 8px rgba(21, 66, 115, 0.28);
  transform: translateY(-1px);
}

.docs-upload-btn:active:not(.docs-upload-btn--busy) {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(21, 66, 115, 0.2);
}

.docs-upload-btn--busy {
  cursor: progress;
  opacity: 0.7;
  pointer-events: none;
}

.docs-upload-icon {
  flex-shrink: 0;
}

.docs-upload-hint {
  color: #666;
  font-size: 0.8rem;
}

.docs-alerts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.docs-alert {
  font-size: 0.85rem;
}

.docs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.docs-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f8f9fb;
  border: 1px solid #e3e8ef;
  border-radius: 4px;
  transition: background 0.6s ease, border-color 0.6s ease;
}

.docs-item--new {
  background: #e6f4ea;
  border-color: #7ec8a0;
  animation: doc-pulse 1.2s ease-out;
}

@keyframes doc-pulse {
  0% { background: #c8e6c9; border-color: #4caf50; }
  100% { background: #e6f4ea; border-color: #7ec8a0; }
}

.docs-item-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.docs-item-check {
  color: #2e7d32;
  font-weight: 700;
  font-size: 0.95rem;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #d4edda;
  border-radius: 50%;
  flex-shrink: 0;
}

.docs-item-text {
  display: flex;
  flex-direction: column;
}

.docs-item-name {
  font-weight: 500;
  color: #1a2a3a;
  font-size: 0.9rem;
}

.docs-item-meta {
  font-size: 0.72rem;
  color: #888;
}

.docs-item-remove {
  background: none;
  border: none;
  color: #c0392b;
  cursor: pointer;
  font-size: 0.8rem;
  text-decoration: underline;
  padding: 4px 6px;
}

.docs-item-remove:hover {
  color: #8a2a1f;
}

.docs-empty {
  color: #999;
  font-size: 0.85rem;
  font-style: italic;
  margin: 0;
}
</style>
