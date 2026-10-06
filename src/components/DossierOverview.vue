<template>
  <!-- Overzicht: wat geldt voor dit project, en wat is de volgende stap? -->
  <div class="dossier-view">
      <!-- Eerste bezoek aan een leeg dossier: één scherm, één handeling. Wie hier
           voor het eerst komt heeft nog niets om te overzien; de eerste stap is
           het project beschrijven, want daaruit volgt welke formulieren gelden. -->
      <section v-if="isFirstRun" class="first-run" aria-labelledby="first-run-title">
        <nldd-text size="xs" color="inherit" class="first-run__eyebrow">Eerste stap</nldd-text>
        <nldd-title size="2"><h2 class="first-run__title" id="first-run-title">
          Begin bij je project
        </h2></nldd-title>
        <nldd-text color="inherit" class="first-run__lead">
          Beantwoord eerst de toepassingsscan: een paar vragen over wat het project oplevert en
          verwerkt. Daaruit volgt welke formulieren voor dit dossier gelden, en waarom.
        </nldd-text>
        <nldd-button variant="primary" text="Naar Project" @click="store.setDossierView('project')" />
        <button
          type="button"
          class="invulhulp-linkbutton first-run__skip"
          @click="skipFirstRun"
        >
          Sla over en toon het overzicht
        </button>
      </section>

      <template v-else>
      <!-- Eén volgende stap, bovenaan. Wie terugkomt wil doorwerken en moet
           daarvoor niet eerst vijf fasen afspeuren naar de kaart met "Bezig". -->
      <section v-if="nextStep" class="next-step" aria-labelledby="next-step-title">
        <div class="next-step__body">
          <nldd-text size="xs" color="inherit" class="next-step__eyebrow">{{ nextStep.eyebrow }}</nldd-text>
          <nldd-title size="2"><h2 class="next-step__title" id="next-step-title">
            {{ nextStep.form.title }}
          </h2></nldd-title>
          <nldd-text color="inherit" size="sm" class="next-step__reason">{{ nextStep.reason }}</nldd-text>
        </div>
        <nldd-button
          class="next-step__btn"
          :text="nextStep.cta"
          :variant="primaryAction === 'resume' ? 'primary' : 'secondary'"
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

// Sessiegebonden en per dossier: wie de eerste stap overslaat, krijgt hem niet
// terug zodra hij even naar een andere weergave kijkt. Zodra er een scan,
// document of antwoord is, komt het scherm sowieso niet meer.
const skippedFirstRun = ref<Set<string>>(new Set())
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useDossierForms } from '../composables/useDossierForms'
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

const isFirstRun = computed(
  () =>
    store.canEdit &&
    !!store.activeDossierId &&
    !skippedFirstRun.value.has(store.activeDossierId) &&
    !store.toepassingsscanRun &&
    store.documents.length === 0 &&
    dossierIsEmpty.value,
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
  margin: 0 0 var(--primitives-space-24);
  max-inline-size: 46rem;
}

.first-run__skip {
  display: block;
  margin-block-start: var(--primitives-space-24);
  background: none;
  border: none;
  font: inherit;
  cursor: pointer;
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
