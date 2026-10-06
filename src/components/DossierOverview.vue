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

      <!-- Toepassingsscan: which forms actually apply here. -->
      <ToepassingsscanTile
        :run="store.toepassingsscanRun"
        :kenmerken="store.kenmerken"
        :counts="scanCounts"
        @open="$emit('scan')"
      />

      <!-- Wat geldt, waarom, voor wie — en bij wat nog onbekend is, welke vraag
           het beslist. -->
      <DossierApplicability
        @open="$emit('open', $event)"
        @scan="$emit('scan', $event)"
        @beslishulp="$emit('beslishulp')"
      />

      <!-- Phase rail: the whole lifecycle in one row. Each circle fills from the
           bottom with the share of that phase's forms that are afgerond; a step
           opens that phase in the Formulieren view. -->
      <nav class="phase-rail" aria-label="Fasen in dit dossier">
        <ol class="phase-rail__list">
          <li
            v-for="group in railGroups"
            :key="group.track"
            class="phase-rail__item"
          >
            <button
              type="button"
              class="phase-rail__step"
              :aria-label="phaseRailLabel(group)"
              @click="goToPhase(group)"
            >
              <span
                class="phase-rail__circle"
                :class="[
                  `phase-rail__circle--${markerState(group)}`,
                  { 'phase-rail__circle--minor': !group.isPhase },
                ]"
                :style="{ '--phase-fill': phaseFill(group) }"
              >
                <nldd-icon class="phase-rail__icon" :icon="trackIcon(group.track)" size="20" />
              </span>
              <span class="phase-rail__label">{{ group.label }}</span>
              <span class="phase-rail__count">
                {{ trackCount(group).total > 0
                  ? `${trackCount(group).done}/${trackCount(group).total}`
                  : '—' }}
              </span>
            </button>
          </li>
        </ol>
      </nav>
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
import { computed, nextTick } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useDossierForms } from '../composables/useDossierForms'
import { trackIcon, type TrackGroup } from '../utils/tracks'
import ToepassingsscanTile from './ToepassingsscanTile.vue'
import DossierApplicability from './DossierApplicability.vue'

defineEmits<{ open: [id: string]; scan: [questionId?: string]; beslishulp: [] }>()

const store = useAssessmentStore()
const { scanCounts, nextStep, allFormsDone, primaryAction, railGroups, trackCount, markerState } = useDossierForms()

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

// ---- Phase rail -------------------------------------------------------------
/** How full the rail circle is: the share of this phase's forms that are done.
 *  Any progress at all gets a visible sliver, so "started" never reads as
 *  "untouched" — one form out of nine is 11% and would otherwise vanish. */
function phaseFill(group: TrackGroup): string {
  const { done, total } = trackCount(group)
  if (total === 0 || done === 0) return '0%'
  if (done === total) return '100%'
  return `${Math.max(12, Math.round((done / total) * 100))}%`
}

function phaseRailLabel(group: TrackGroup): string {
  const { done, total } = trackCount(group)
  const progress = total === 0 ? 'nog geen formulieren beschikbaar' : `${done} van ${total} afgerond`
  const prefix = group.phaseNumber > 0 ? `Fase ${group.phaseNumber} van ${group.phaseCount}: ` : ''
  return `${prefix}${group.label} — ${progress}`
}

/** De fasen staan in de weergave Formulieren: schakel daarheen en scrol naar de
 *  fase. Intake en aanbieding hebben geen eigen sectie: beide railstappen
 *  landen op de gedeelde "Vooraf"-band. */
async function goToPhase(group: TrackGroup) {
  const id = group.isPhase ? `fase-${group.track}` : 'fase-vooraf'
  store.setDossierView('formulieren')
  await nextTick()
  // Na de scroll-naar-boven die bij elke weergavewissel hoort (AssessmentForm).
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
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

/* ---- Phase rail ------------------------------------------------------- */

.phase-rail {
  margin-block-end: var(--primitives-space-40);
  padding: var(--primitives-space-24) var(--primitives-space-16);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  box-shadow: var(--primitives-box-shadows-level-1);
  /* Six phases don't fit a phone; scroll the rail rather than the page. */
  overflow-x: auto;
}

.phase-rail__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: flex-start;
  min-inline-size: 34rem;
  --rail-circle-size: 2.75rem;
}

.phase-rail__item {
  flex: 1;
  position: relative;
}

/* Intake en aanbieding zijn aanloop, geen fase: alleen een kleiner rondje.
   Alle cellen houden dezelfde breedte — de verbindingslijn hieronder is
   `inline-size: 100%` van de eigen cel en loopt tot het midden van de volgende,
   wat alleen klopt zolang buren even breed zijn. */

/* Verkleinen met `transform`, niet met --rail-circle-size: de verbindingslijn
   loopt op de hoogte van het grote midden, dus het rondje moet zijn hoogte
   houden om erop uitgelijnd te blijven. */
.phase-rail__circle--minor {
  transform: scale(0.72);
}

/* The connector runs behind the circles, from this step's centre to the next. */
.phase-rail__item:not(:last-child)::after {
  content: "";
  position: absolute;
  inset-block-start: calc(var(--rail-circle-size) / 2 - 1px);
  inset-inline-start: 50%;
  inline-size: 100%;
  block-size: 2px;
  background: var(--track-line);
}

.phase-rail__step {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--primitives-space-4);
  inline-size: 100%;
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
  padding: var(--primitives-space-4) var(--primitives-space-2);
}

/* Hover lands on the circle and the label, never on the cell: a filled block
   would paint over the connector line running behind it. */
.phase-rail__step:hover .phase-rail__circle {
  border-color: var(--semantics-content-accent-color);
  box-shadow: 0 0 0 4px var(--semantics-dividers-color);
}

.phase-rail__step:hover .phase-rail__label {
  text-decoration: underline;
}

.phase-rail__step:focus-visible {
  outline: none;
}

.phase-rail__step:focus-visible .phase-rail__circle {
  outline: 2px solid var(--semantics-content-accent-color);
  outline-offset: 3px;
}

.phase-rail__step:focus-visible .phase-rail__label {
  text-decoration: underline;
}

/* The circle fills from the bottom up to --phase-fill. The wash is a light
   tint rather than full lintblauw so the icon stays legible at any level;
   only a completed phase goes solid (see --done below). */
.phase-rail__circle {
  inline-size: var(--rail-circle-size);
  block-size: var(--rail-circle-size);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 2px solid var(--track-line);
  color: var(--semantics-content-accent-color);
  transition: border-color var(--invulhulp-duration-fast), box-shadow var(--invulhulp-duration-fast);
  background:
    linear-gradient(
      to top,
      var(--semantics-categories-accent-tinted-content-color) 0 var(--phase-fill, 0%),
      var(--semantics-surfaces-base-background-color) var(--phase-fill, 0%) 100%
    );
}

.phase-rail__circle--busy {
  border-color: var(--semantics-content-accent-color);
}

.phase-rail__circle--done {
  border-color: var(--semantics-content-accent-color);
  background: var(--semantics-content-accent-color);
  color: var(--semantics-surfaces-base-background-color);
}

/* A phase with no forms yet (beheer) — deliberately visible, visibly unfillable. */
.phase-rail__circle--empty {
  border-style: dashed;
  border-color: var(--semantics-content-secondary-color);
  color: var(--semantics-content-secondary-color);
  background: var(--semantics-surfaces-base-background-color);
}

/* nldd-icon tekent zijn eigen SVG in een shadow root en erft `color` van de
   cirkel eromheen; `size="20"` bepaalt de maat. Een achtergrondkleur op de host
   (de oude NLDS-maskeertruc) zou daar een dicht vlak overheen leggen. */
.phase-rail__icon {
  display: block;
  flex-shrink: 0;
}

.phase-rail__label {
  font-size: var(--primitives-font-size-70);
  line-height: 1.3;
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: var(--semantics-content-accent-color);
  text-align: center;
  text-wrap: balance;
}

.phase-rail__count {
  font-size: var(--primitives-font-size-70);
  color: var(--invulhulp-color-text-subtle);
}
</style>
