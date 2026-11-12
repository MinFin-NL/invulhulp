<template>
  <!-- Overzicht: wat geldt voor dit project, en wat is de volgende stap? -->
  <div class="dossier-view">
      <!-- Eerste bezoek aan een leeg dossier: twee stappen op één scherm. Eerst
           het project beschrijven, want daaruit volgt welke formulieren gelden;
           dan de brondocumenten uploaden. Beide staan er meteen, zodat wie een
           dossier aanmaakt direct ziet dat er documenten bij horen — zonder dit
           scherm wees alleen het tabblad Bronnen ernaar. -->
      <section v-if="isFirstRun" class="first-run" aria-labelledby="first-run-title">
        <nldd-text size="xs" color="inherit" class="first-run__eyebrow">Aan de slag</nldd-text>
        <nldd-title size="2"><h2 class="first-run__title" id="first-run-title">
          Zet je dossier in twee stappen klaar
        </h2></nldd-title>

        <nldd-step-bar class="first-run__steps" accessible-label="Voortgang eerste stappen">
          <nldd-step-bar-item text="Project beschrijven" />
          <nldd-step-bar-item text="Documenten uploaden" :status="scanDone ? 'current' : undefined" />
        </nldd-step-bar>

        <div class="first-run__step">
          <nldd-title size="4"><h3 class="first-run__step-title">1. Beschrijf je project</h3></nldd-title>
          <template v-if="!scanDone">
            <nldd-text color="inherit" class="first-run__lead">
              Beantwoord de toepassingsscan: een paar vragen over wat het project oplevert en
              verwerkt. Daaruit volgt welke formulieren voor dit dossier gelden, en waarom.
            </nldd-text>
            <nldd-button appearance="primary" text="Start de toepassingsscan" @click="$emit('scan')" />
          </template>
          <div v-else class="first-run__done">
            <nldd-icon icon="check-mark-circle" size="20" color="success" class="first-run__done-icon" />
            <nldd-text color="inherit">De toepassingsscan is ingevuld.</nldd-text>
          </div>
        </div>

        <div class="first-run__step">
          <nldd-title size="4"><h3 class="first-run__step-title">2. Upload je brondocumenten</h3></nldd-title>
          <nldd-text color="inherit" class="first-run__lead">
            Upload wat er al ligt: notulen, een projectplan, een brainstorm of een architectuurschets.
            FinDocs leest ze en vult daarna de formulieren van dit dossier voor je in, elk antwoord met
            een verwijzing naar de passage waar het vandaan komt. Jij controleert, past aan en stelt vast.
          </nldd-text>

          <label
            class="first-run__dropzone"
            :class="{
              'first-run__dropzone--over': isDragOver,
              'first-run__dropzone--busy': isUploading,
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
            <nldd-icon class="first-run__dropzone-icon" icon="arrow-up-out-bucket" size="40" color="accent" />
            <span class="invulhulp-heading--md first-run__dropzone-title">
              {{ isUploading ? 'Bezig met inlezen…' : 'Sleep je documenten hierheen' }}
            </span>
            <span class="invulhulp-text--sm first-run__dropzone-hint">
              of klik om ze te kiezen — .docx, .pdf, .xlsx, .pptx, .txt of .md
            </span>
          </label>

          <div class="first-run__alerts" role="status" aria-live="polite">
            <nldd-banner variant="accent" size="sm" v-if="isUploading" :text="uploadingLabel" />
            <nldd-banner variant="critical" size="sm" v-if="uploadError" :text="uploadError" />
          </div>
        </div>

        <button
          type="button"
          class="invulhulp-linkbutton first-run__skip"
          :disabled="isUploading"
          @click="skipFirstRun"
        >
          {{ store.documents.length > 0
            ? 'Verder naar het overzicht'
            : 'Ik heb geen documenten — toon het overzicht' }}
        </button>
      </section>

      <template v-else>
      <!-- Eén volgende stap, bovenaan. Wie terugkomt wil doorwerken en moet
           daarvoor niet eerst vijf fasen afspeuren naar de kaart met "Bezig". -->
      <section v-if="nextStep" class="next-step" aria-labelledby="next-step-title">
        <div class="next-step__body">
          <nldd-text size="xs" color="inherit" class="next-step__eyebrow">{{ nextStep.eyebrow }}</nldd-text>
          <nldd-title size="4"><h2 class="next-step__title" id="next-step-title">
            {{ nextStep.form.title }}
          </h2></nldd-title>
          <nldd-text color="inherit" size="sm" class="next-step__reason">{{ nextStep.reason }}</nldd-text>
        </div>
        <nldd-button
          class="next-step__btn"
          :text="nextStep.cta"
          :appearance="primaryAction === 'resume' ? 'primary' : 'secondary'"
          @click="$emit('open', nextStep.form.id)"
        />
      </section>

      <!-- Alles wat van toepassing is, is af. Dat is een mijlpaal: benoem hem,
           in plaats van de band stilletjes te laten verdwijnen. -->
      <nldd-banner
        variant="success"
        size="sm"
        class="next-step__done"
        v-else-if="allFormsDone"
        text="Alle formulieren die voor dit dossier gelden zijn afgerond."
      />

      <DossierAiFill />

      <!-- Open vragen, en wat geldt: waarom, voor wie en hoe ver. De scan staat
           er als kop boven; een eigen scantegel herhaalde dezelfde informatie
           met andere woorden en getallen. -->
      <DossierApplicability
        @open="$emit('open', $event)"
        @scan="$emit('scan', $event)"
        @beslishulp="$emit('beslishulp')"
      />

      </template>
  </div>
</template>

<script lang="ts">
import { ref } from 'vue'

// Sessiegebonden en per dossier: wie het scherm overslaat, krijgt hem niet
// terug zodra hij even naar een andere weergave kijkt. Zodra er een document
// of antwoord is, komen de schermen sowieso niet meer.
const skippedFirstRun = ref<Set<string>>(new Set())
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useDossierForms } from '../composables/useDossierForms'
import { useDocumentUpload, UPLOAD_ACCEPT } from '../composables/useDocumentUpload'
import DossierAiFill from './DossierAiFill.vue'
import DossierApplicability from './DossierApplicability.vue'

defineEmits<{ open: [id: string]; scan: [questionId?: string]; beslishulp: [] }>()

const store = useAssessmentStore()
const { nextStep, allFormsDone, primaryAction } = useDossierForms()

// ---- Eerste keer ------------------------------------------------------------
// Alleen een dossier waar nog niets in zit krijgt het onboardingscherm. Wie al
// met de hand antwoorden heeft ingevuld werkt bewust zonder scan — die mag zijn
// overzicht niet kwijtraken. Lezers evenmin: zij kunnen de scan niet doen.
const dossierIsEmpty = computed(() =>
  Object.values(store.activeDossier?.forms ?? {}).every((f) =>
    Object.values(f.answers ?? {}).every((v) =>
      Array.isArray(v) ? v.length === 0 : typeof v !== 'string' || v.trim() === '',
    ),
  ),
)

// ---- Brondocumenten (stap 2) -----------------------------------------------
const {
  uploadError,
  isDragOver,
  isUploading,
  uploadingLabel,
  onFilesSelected,
  onDragOver,
  onDragLeave,
  onDrop,
} = useDocumentUpload()

const scanDone = computed(() => !!store.toepassingsscanRun)

// Zolang er nog geen document en geen antwoord is. Het scherm blijft staan
// tijdens het inlezen (het eerste document komt binnen voordat de rest klaar
// is) en zolang er een foutmelding is, zodat die niet met het scherm verdwijnt.
const isFirstRun = computed(
  () =>
    store.canEdit &&
    !!store.activeDossierId &&
    !skippedFirstRun.value.has(store.activeDossierId) &&
    dossierIsEmpty.value &&
    (store.documents.length === 0 || isUploading.value || !!uploadError.value),
)

function skipFirstRun() {
  if (!store.activeDossierId) return
  skippedFirstRun.value = new Set([...skippedFirstRun.value, store.activeDossierId])
}
</script>

<style scoped>
.first-run {
  margin-block-end: var(--primitives-space-40);
  padding: var(--primitives-space-40) var(--primitives-space-32);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
}

.first-run__eyebrow {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.first-run__title {
  color: var(--semantics-content-accent-color);
  margin: var(--primitives-space-4) 0 var(--primitives-space-12);
}

.first-run__lead {
  color: var(--invulhulp-color-text-subtle);
  margin: 0 0 var(--primitives-space-16);
  max-inline-size: 46rem;
}

.first-run__steps {
  display: block;
  max-inline-size: 30rem;
  margin-block-end: var(--primitives-space-8);
}

.first-run__step {
  padding-block: var(--primitives-space-24);
  border-block-end: 1px solid var(--semantics-dividers-color);
}

.first-run__step-title {
  margin: 0 0 var(--primitives-space-8);
}

.first-run__done {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-8);
  margin: 0;
}

.first-run__done-icon {
  flex-shrink: 0;
}

.first-run__skip {
  display: block;
  margin-block-start: var(--primitives-space-24);
  background: none;
  border: none;
  font: inherit;
  cursor: pointer;
}

.first-run__dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--primitives-space-4);
  max-inline-size: 46rem;
  padding: var(--primitives-space-40) var(--primitives-space-24);
  border: 2px dashed var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  background: var(--semantics-surfaces-tinted-background-color);
  cursor: pointer;
  text-align: center;
  transition: border-color var(--invulhulp-duration-fast), background var(--invulhulp-duration-fast);
}

.first-run__dropzone:hover,
.first-run__dropzone--over {
  border-color: var(--semantics-content-accent-color);
  background: var(--semantics-surfaces-base-background-color);
}

/* De input zit visueel verstopt in de label, dus de focusring hoort hier. */
.first-run__dropzone:focus-within {
  outline: 2px solid var(--semantics-content-accent-color);
  outline-offset: 2px;
}

.first-run__dropzone--busy {
  cursor: progress;
  opacity: 0.7;
}

.first-run__dropzone-icon {
  margin-block-end: var(--primitives-space-4);
}

.first-run__dropzone-title {
  color: var(--semantics-content-accent-color);
}

.first-run__dropzone-hint {
  color: var(--invulhulp-color-text-subtle);
}

.first-run__alerts {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-8);
  max-inline-size: 46rem;
  margin-block-start: var(--primitives-space-16);
}

.first-run__alerts:empty {
  display: none;
}

/* De ene volgende stap. Neutraal wit met een lintblauwe rand aan de leeskant:
   het moet opvallen zonder te concurreren met de AI-band eronder, die zijn
   eigen (paarse) huisstijl heeft. */
.next-step {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-24);
  flex-wrap: wrap;
  margin-block-end: var(--primitives-space-32);
  padding: var(--primitives-space-16) var(--primitives-space-32);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-inline-start: 4px solid var(--semantics-content-accent-color);
  border-radius: var(--primitives-corner-radius-md);
}

.next-step__body {
  flex: 1;
  min-inline-size: 14rem;
}

.next-step__eyebrow {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.next-step__title {
  color: var(--semantics-content-accent-color);
  margin: var(--primitives-space-2) 0 var(--primitives-space-2);
}

.next-step__reason {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  max-inline-size: 44rem;
}

.next-step__btn {
  flex-shrink: 0;
}

.next-step__done {
  margin-block-end: var(--primitives-space-32);
}
</style>
