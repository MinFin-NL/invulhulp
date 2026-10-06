<template>
  <!-- Bronnen: waar baseren we het op? Brondocumenten met entiteitengrafiek en
       ontologie, en de AI-vulling van het hele dossier. -->
  <div class="dossier-view">
      <!-- Brondocumenten upload -->
      <section class="portal-card" aria-labelledby="docs-title">
        <div class="portal-card__header">
          <div class="docs-title-row">
            <nldd-title size="2"><h2 class="portal-card__title" id="docs-title">Brondocumenten</h2></nldd-title>
            <nldd-tag v-if="store.documents.length > 0" size="sm" color="accent" aria-live="polite">
              {{ store.documents.length }} {{ store.documents.length === 1 ? 'document' : 'documenten' }} beschikbaar
            </nldd-tag>
            <nldd-button
              variant="secondary"
              size="sm"
              class="docs-graph-btn"
              :text="showGraph ? 'Verberg entiteitengrafiek' : 'Toon entiteitengrafiek'"
              v-if="hasAnyOntology"
              :aria-pressed="showGraph"
              aria-controls="entity-graph-region"
              @click="showGraph = !showGraph"
            />
          </div>
          <nldd-text size="sm" color="inherit" class="portal-card__desc">
            Upload achtergronddocumenten (notulen, brainstorms, agenda's) in .txt, .md, .docx, .xlsx, .pptx of .pdf formaat.
            Bij het invullen van een formulier kun je per vraag automatisch een antwoord laten extraheren uit deze documenten.
          </nldd-text>
        </div>

        <div v-if="store.canEdit" class="docs-controls">
          <!-- A <label> around the file input can't be an nldd-button: the
               real <button> lives in the component's shadow root, so the label
               would never reach it. The button drives the hidden input instead. -->
          <input
            ref="fileInputEl"
            type="file"
            :accept="UPLOAD_ACCEPT"
            multiple
            :disabled="isUploading"
            class="invulhulp-visually-hidden"
            @change="onFilesSelected"
          />
          <nldd-button
            class="docs-upload-btn"
            :variant="primaryAction === 'upload' ? 'primary' : 'secondary'"
            start-icon="arrow-up-out-bucket"
            :text="isUploading ? 'Bezig met inlezen…' : 'Document(en) uploaden'"
            :loading="isUploading"
            @click="fileInputEl?.click()"
          />

          <details class="invulhulp-disclosure docs-info-details">
            <summary class="invulhulp-text--sm">
              <nldd-icon class="docs-info-icon" icon="info-circle" size="16" />
              Ondersteunde bestandstypen
            </summary>
            <div class="invulhulp-disclosure__details">
              <ul class="invulhulp-text--sm docs-info-list">
                <li><strong>.txt / .md</strong> — platte tekst, volledig gebruikt</li>
                <li><strong>.docx</strong> — Word-document, tekst en opmaak worden gelezen</li>
                <li><strong>.xlsx</strong> — Excel-spreadsheet, celinhoud per blad</li>
                <li><strong>.pptx</strong> — PowerPoint-presentatie, alleen de tekst uit de dia's wordt gelezen (geen afbeeldingen of grafieken)</li>
                <li><strong>.pdf</strong> — alleen tekst-PDF's (bijv. geëxporteerd uit Word); gescande PDF's met alleen afbeeldingen worden geweigerd</li>
              </ul>
            </div>
          </details>
        </div>

        <!-- Live status alerts -->
        <div class="docs-alerts" role="status" aria-live="polite">
          <nldd-banner
            variant="accent"
            size="sm"
            v-if="isUploading"
            :text="uploadingLabel"
          />
                    <nldd-banner
                      variant="success"
                      size="sm"
                      v-if="successMessage"
                    >
              <div><strong>Toegevoegd:</strong> {{ successMessage }}</div>
          </nldd-banner>
          <nldd-banner
            variant="critical"
            size="sm"
            v-if="uploadError"
            :text="uploadError"
          />
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
                <nldd-icon class="docs-item__check" icon="check-mark-circle" size="16" color="success" />
                <div class="docs-item__text">
                  <span class="docs-item__name">{{ doc.name }}</span>
                  <span class="docs-item__meta invulhulp-text--sm">
                    {{ formatSize(doc.content.length) }}
                    <template v-if="doc.indexing"> · indexeren…</template>
                    <template v-else-if="doc.indexError"> · indexering mislukt</template>
                    <template v-else-if="doc.chunkCount"> · {{ doc.chunkCount }} fragmenten</template>
                  </span>
                </div>
              </div>
              <button
                v-if="store.canEdit"
                type="button"
                class="invulhulp-linkbutton docs-item__remove"
                @click="store.removeDocument(doc.id)"
              >
                Verwijderen
              </button>
            </div>
            <DocumentOntology v-if="!doc.indexing && doc.ontology" :ontology="doc.ontology" />
            <nldd-text color="inherit" size="sm" class="docs-item__error" v-else-if="doc.indexError">{{ doc.indexError }}</nldd-text>
          </li>
        </ul>
        <label
          v-else-if="store.canEdit"
          class="docs-dropzone"
          :class="{
            'docs-dropzone--over': isDragOver,
            'docs-dropzone--busy': isUploading,
          }"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
        >
          <input
            type="file"
            :accept="UPLOAD_ACCEPT"
            multiple
            :disabled="isUploading"
            class="invulhulp-visually-hidden"
            @change="onFilesSelected"
          />
          <nldd-icon class="docs-dropzone-icon" icon="arrow-up-out-bucket" size="40" color="accent" />
          <span class="invulhulp-heading--md docs-dropzone-title">
            {{ isUploading ? 'Bezig met inlezen…' : 'Sleep je documenten hierheen' }}
          </span>
          <span class="invulhulp-text--sm docs-dropzone-hint">
            of klik om ze te kiezen — .docx, .pdf, .xlsx, .pptx, .txt of .md
          </span>
        </label>
        <nldd-text color="inherit" size="sm" class="docs-empty" v-else-if="!isUploading">Nog geen documenten geüpload.</nldd-text>
      </section>

      <DossierAiFill upload-here />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useDossierForms } from '../composables/useDossierForms'
import { useDocumentUpload, UPLOAD_ACCEPT } from '../composables/useDocumentUpload'
import DocumentOntology from './DocumentOntology.vue'
import EntityGraph from './EntityGraph.vue'
import DossierAiFill from './DossierAiFill.vue'

const store = useAssessmentStore()
const { primaryAction } = useDossierForms()
const {
  uploadError,
  isDragOver,
  successMessage,
  isUploading,
  uploadingLabel,
  recentlyAddedIds,
  onFilesSelected,
  onDragOver,
  onDragLeave,
  onDrop,
  formatSize,
} = useDocumentUpload()

// Drives the visually hidden file input behind the upload button.
const fileInputEl = ref<HTMLInputElement | null>(null)
const showGraph = ref(false)
const hasAnyOntology = computed(() => store.documents.some(d => !!d.ontology))
</script>

<style scoped>
.portal-card {
  position: relative;
  margin-block-end: var(--primitives-space-40);
  padding: var(--primitives-space-24) var(--primitives-space-32);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  box-shadow: var(--primitives-box-shadows-level-1);
}

.portal-card::before {
  content: "";
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  block-size: 4px;
  background: var(--semantics-content-accent-color);
  border-start-start-radius: var(--primitives-corner-radius-md);
  border-start-end-radius: var(--primitives-corner-radius-md);
}

.portal-card__header {
  margin-block-end: var(--primitives-space-16);
}

.portal-card__title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-4);
}

.portal-card__desc {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}

.docs-title-row {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-12);
  flex-wrap: wrap;
  margin-block-end: var(--primitives-space-4);
}

.docs-graph-btn {
  margin-inline-start: auto;
}

.docs-controls {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-12);
  margin-block-end: var(--primitives-space-12);
}

/* nldd-button carries its own busy affordance via the `loading` attribute. */

.docs-info-details {
  align-self: center;
  position: relative;
}

/* This disclosure opens as a popover over the row rather than pushing it
   down, so its panel is positioned instead of flowing. */
.docs-info-details > .invulhulp-disclosure__details {
  position: absolute;
  inset-block-start: calc(100% + var(--primitives-space-4));
  inset-inline-start: 0;
  z-index: 100;
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--primitives-corner-radius-sm);
  box-shadow: var(--primitives-box-shadows-level-2);
  padding: var(--primitives-space-8) var(--primitives-space-12);
  min-inline-size: 280px;
  max-inline-size: 380px;
}

.docs-info-icon {
  inline-size: 16px;
  block-size: 16px;
  flex-shrink: 0;
  opacity: 0.7;
}

.docs-info-list {
  margin-block-start: var(--primitives-space-4);
  margin-block-end: 0;
}

.docs-alerts {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-8);
  margin-block-end: var(--primitives-space-12);
}

.docs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
}

.docs-item {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
  padding: var(--primitives-space-8) var(--primitives-space-12);
  background: var(--semantics-surfaces-tinted-background-color);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--primitives-corner-radius-sm);
  transition: background var(--invulhulp-duration-deliberate) var(--invulhulp-ease), border-color var(--invulhulp-duration-deliberate) var(--invulhulp-ease);
}

.docs-item__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--primitives-space-8);
}

.docs-item__error {
  margin: var(--primitives-space-4) 0 0;
  color: var(--semantics-content-critical-color);
}

.docs-item--new {
  background: var(--semantics-categories-success-tinted-background-color);
  border-color: var(--semantics-content-success-color);
  animation: doc-pulse var(--invulhulp-duration-highlight) var(--invulhulp-ease-out);
}

@keyframes doc-pulse {
  0% { background: var(--semantics-categories-success-tinted-highlight-border-color); }
  100% { background: var(--semantics-categories-success-tinted-background-color); }
}


.docs-item__info {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-8);
}

.docs-item__check {
  inline-size: 20px;
  block-size: 20px;
  flex-shrink: 0;
  /* Tint the SVG to the success colour via a CSS filter */
  filter: invert(40%) sepia(80%) saturate(500%) hue-rotate(65deg) brightness(90%);
}

.docs-item__text {
  display: flex;
  flex-direction: column;
}

.docs-item__name {
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: var(--semantics-content-color);
  font-size: var(--primitives-font-size-90);
}

.docs-item__meta {
  color: var(--invulhulp-color-text-subtle);
}

.docs-item__remove {
  background: none;
  border: 0;
  color: var(--semantics-content-critical-color);
  cursor: pointer;
  font-size: var(--primitives-font-size-90);
  text-decoration: underline;
  padding: var(--primitives-space-4) var(--primitives-space-8);
}

.docs-empty {
  color: var(--semantics-content-secondary-color);
  font-style: italic;
  margin: 0;
}

.docs-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--primitives-space-4);
  padding: var(--primitives-space-40) var(--primitives-space-24);
  border: 2px dashed var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  background: var(--semantics-surfaces-tinted-background-color);
  cursor: pointer;
  transition: border-color var(--invulhulp-duration-fast), background var(--invulhulp-duration-fast);
}

.docs-dropzone:hover,
.docs-dropzone--over {
  border-color: var(--semantics-content-accent-color);
  background: var(--semantics-surfaces-base-background-color);
}

/* De input zit visueel verstopt in de label, dus de focusring hoort hier. */
.docs-dropzone:focus-within {
  outline: 2px solid var(--semantics-content-accent-color);
  outline-offset: 2px;
}

.docs-dropzone--busy {
  cursor: progress;
  opacity: 0.7;
}

.docs-dropzone-icon {
  margin-block-end: var(--primitives-space-4);
}

.docs-dropzone-title {
  color: var(--semantics-content-accent-color);
  margin: 0;
}

.docs-dropzone-hint {
  color: var(--invulhulp-color-text-subtle);
}
</style>
