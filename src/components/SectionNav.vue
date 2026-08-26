<template>
  <nav class="invulhulp-nav" :aria-label="`Navigatie ${formConfig.title}`">

    <!-- Progress -->
    <div class="invulhulp-nav__progress">
      <div class="rvo-text rvo-text--sm invulhulp-nav__progress-label">
        Voortgang: {{ completedCount }}/{{ totalCount }}
      </div>
      <progress
        class="invulhulp-progress"
        :value="completedCount"
        :max="totalCount"
        :aria-label="`${completedCount} van ${totalCount} stappen voltooid`"
      />
    </div>

    <ol class="rvo-progress-tracker invulhulp-nav__list">
      <!-- Home -->
      <li class="rvo-progress-tracker__step rvo-progress-tracker__step--start invulhulp-nav__step">
        <button
          type="button"
          class="rvo-progress-tracker__step-link invulhulp-nav__link"
          :class="{ 'invulhulp-nav__link--active': store.currentView === 'home' }"
          :aria-current="store.currentView === 'home' ? 'page' : undefined"
          @click="navigate('home')"
        >
          Introductie
        </button>
      </li>

      <!-- Data-driven nav from form config -->
      <template v-for="step in props.formConfig.navigation" :key="stepKey(step)">

        <!-- Subsections step: render section header + subsection items -->
        <template v-if="step.type === 'subsections'">
          <template v-if="!step.condition || store[step.condition.storeKey] !== false">
            <li class="rvo-progress-tracker__step rvo-progress-tracker__step--start invulhulp-nav__step invulhulp-nav__step--header">
              <span class="invulhulp-nav__group-label">{{ getSectionTitle(step.sectionId) }}</span>
            </li>
            <li
              v-for="sub in getSubsections(step)"
              :key="sub.id"
              class="rvo-progress-tracker__step rvo-progress-tracker__step--substep-start invulhulp-nav__step"
              :class="{ 'invulhulp-nav__step--completed': isSubsectionDone(sub.id) }"
            >
              <button
                type="button"
                class="rvo-progress-tracker__step-link invulhulp-nav__link"
                :class="{ 'invulhulp-nav__link--active': store.currentView === sub.id }"
                :aria-current="store.currentView === sub.id ? 'page' : undefined"
                @click="navigate(sub.id)"
              >
                <svg v-if="isSubsectionDone(sub.id)" class="invulhulp-nav__check" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path fill="currentColor" d="m41.262 6.164c-1.133-.836-2.707-.676-3.641.367l-15.879 17.77-9.547-8.27a2.7 2.7 0 0 0 -3.516-.027 2.71 2.71 0 0 0 -.586 3.469l11.563 19.301a2.72 2.72 0 0 0 2.316 1.316c.957 0 1.836-.492 2.328-1.301l17.66-29.043c.727-1.195.426-2.75-.699-3.582zm0 0"/></svg>
                <!-- Doorgeklikt, maar er staan nog verplichte vragen open: geen
                     vinkje, wel een teller. Anders leest de zijbalk het
                     formulier af als klaar terwijl het leeg is. -->
                <span v-else-if="openMandatory.get(sub.id) && store.isSectionCompleted(sub.id)" class="invulhulp-nav__open" aria-hidden="true" />
                {{ sub.title }}
                <span v-if="openMandatory.get(sub.id)" class="invulhulp-visually-hidden">
                  — nog {{ openMandatory.get(sub.id) }} verplichte
                  {{ openMandatory.get(sub.id) === 1 ? 'vraag' : 'vragen' }}
                </span>
              </button>
            </li>
          </template>
        </template>

        <!-- Special view: skip summary (rendered at bottom) -->
        <template v-else-if="step.viewId !== 'summary'">
          <li v-if="step.navGroupHeader" class="rvo-progress-tracker__step rvo-progress-tracker__step--start invulhulp-nav__step invulhulp-nav__step--header">
            <span class="invulhulp-nav__group-label">{{ step.navGroupHeader }}</span>
          </li>
          <li
            class="rvo-progress-tracker__step rvo-progress-tracker__step--substep-start invulhulp-nav__step"
            :class="{ 'invulhulp-nav__step--completed': store.isSectionCompleted(completionId(step)) }"
          >
            <button
              type="button"
              class="rvo-progress-tracker__step-link invulhulp-nav__link"
              :class="{ 'invulhulp-nav__link--active': store.currentView === step.viewId }"
              :aria-current="store.currentView === step.viewId ? 'page' : undefined"
              @click="navigate(step.viewId)"
            >
              <svg v-if="store.isSectionCompleted(completionId(step))" class="invulhulp-nav__check" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path fill="currentColor" d="m41.262 6.164c-1.133-.836-2.707-.676-3.641.367l-15.879 17.77-9.547-8.27a2.7 2.7 0 0 0 -3.516-.027 2.71 2.71 0 0 0 -.586 3.469l11.563 19.301a2.72 2.72 0 0 0 2.316 1.316c.957 0 1.836-.492 2.328-1.301l17.66-29.043c.727-1.195.426-2.75-.699-3.582zm0 0"/></svg>
              {{ step.navLabel ?? step.viewId }}
              <span
                v-if="step.viewId === 'risk' && store.riskLevel"
                class="rvo-tag invulhulp-nav__tag"
                :class="riskTagClass(store.riskLevel)"
              >
                {{ riskLabels[store.riskLevel!] }}
              </span>
            </button>
          </li>
        </template>

      </template>

      <!-- Summary -->
      <li class="rvo-progress-tracker__step rvo-progress-tracker__step--end invulhulp-nav__step invulhulp-nav__step--summary">
        <button
          type="button"
          class="rvo-progress-tracker__step-link invulhulp-nav__link invulhulp-nav__link--summary"
          :class="{ 'invulhulp-nav__link--active': store.currentView === 'summary' }"
          :aria-current="store.currentView === 'summary' ? 'page' : undefined"
          @click="navigate('summary')"
        >
          Samenvatting &amp; export
        </button>
      </li>
    </ol>

    <!-- AI Mode: always reachable while working in the form -->
    <div class="invulhulp-nav__ai-mode">
      <hr class="invulhulp-divider" />
      <p class="rvo-text rvo-text--sm invulhulp-nav__ai-label">AI Modus</p>
      <AiModeToggle
        :form-id="formConfig.id"
        :has-documents="readyDocIds.length > 0"
        :is-active="aiModeActive.has(formConfig.id)"
        :is-done="formConfig.id in aiModeDone"
        :done-filled-count="aiModeDone[formConfig.id] ?? 0"
        :done-total-count="aiModeTotal[formConfig.id] ?? 0"
        :progress="aiModeProgress[formConfig.id] ?? null"
        :phase="aiModePhase[formConfig.id] ?? null"
        :can-undo-smoothing="hasSmoothingUndo(formConfig.id)"
        @activate="startAiMode"
        @cancel="cancelAiMode"
        @dismiss="dismissAiModeDone"
        @undo-smoothing="undoSmoothing"
      />
      <p class="rvo-text rvo-text--sm invulhulp-nav__ai-hint">
        <template v-if="readyDocIds.length > 0">
          Overschrijft alle antwoorden met AI op basis van {{ readyDocIds.length }} brondocument{{ readyDocIds.length === 1 ? '' : 'en' }}.
        </template>
        <template v-else>
          Upload brondocumenten op de startpagina om AI Modus te gebruiken.
        </template>
      </p>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAiMode } from '../composables/useAiMode'
import type { FormConfig, NavStepSubsections, NavStepSpecialView, NavStep, Subsection } from '../models/Assessment'
import { missingMandatoryBySubsection } from '../utils/formProgress'
import AiModeToggle from './AiModeToggle.vue'

const props = defineProps<{
  formConfig: FormConfig
  navOrder: string[]
}>()

const store = useAssessmentStore()
const { aiModeActive, aiModeProgress, aiModeDone, aiModeTotal, aiModePhase, readyDocIds, startAiMode, cancelAiMode, dismissAiModeDone, hasSmoothingUndo, undoSmoothing } = useAiMode()

const riskLabels: Record<string, string> = {
  onaanvaardbaar: 'Verboden',
  hoog: 'Hoog',
  beperkt: 'Beperkt',
  minimaal: 'Minimaal',
}

function riskTagClass(level: string): string {
  switch (level) {
    case 'onaanvaardbaar': return 'rvo-tag--error'
    case 'hoog': return 'rvo-tag--warning'
    case 'beperkt': return 'rvo-tag--info'
    default: return 'rvo-tag--success'
  }
}

function stepKey(step: NavStep): string {
  return step.type === 'subsections' ? step.sectionId : step.viewId
}

function getSectionTitle(sectionId: string): string {
  return props.formConfig.sections.find((s) => s.id === sectionId)?.title ?? sectionId
}

function getSubsections(step: NavStepSubsections): Subsection[] {
  const section = props.formConfig.sections.find((s) => s.id === step.sectionId)
  if (!section) return []
  return section.subsections.filter((sub) => !step.exclude?.includes(sub.id))
}

function completionId(step: NavStepSpecialView): string {
  return step.completionSectionId ?? step.viewId
}

// Open verplichte vragen per subsectie. Een subsectie telt pas als afgerond
// wanneer hij is doorlopen én er geen verplichte vraag meer leeg staat — het
// vinkje in de zijbalk en de voortgangsteller gaan over hetzelfde.
const openMandatory = computed(() => missingMandatoryBySubsection(props.formConfig, store.activeForm))

function isSubsectionDone(subId: string): boolean {
  return store.isSectionCompleted(subId) && !openMandatory.value.has(subId)
}

const completedCount = computed(
  () => store.completedSections.filter((id) => !openMandatory.value.has(id)).length,
)
const totalCount = computed(() => props.navOrder.filter((v) => v !== 'home' && v !== 'summary').length)

function navigate(id: string) {
  store.setCurrentView(id)
}
</script>

<style scoped>
.invulhulp-nav {
  inline-size: 240px;
  flex-shrink: 0;
  background: var(--semantics-surfaces-base-background-color);
  border-inline-end: 1px solid var(--invulhulp-color-border);
  padding: 0 var(--primitives-space-16) var(--primitives-space-32);
  overflow-y: auto;
  /* Fill exactly the space under whatever is pinned above (the header, plus the
     AI Modus banner while it runs) and stick flush to its underside. Both
     heights are measured at runtime — a hardcoded value here left a dead gap
     once the fase-rail breadcrumb made the header taller than the 100px this
     used to assume.

     max() is the floor that keeps this bug from coming back: a bogus or
     oversized offset (a stale banner height, a header taller than the
     viewport) would otherwise make the calc zero or negative and the whole
     sidebar would silently vanish. Below 320px it stops shrinking and
     overflows instead — visible beats correct here. The var() fallbacks do
     the same for the case where the custom property never lands at all. */
  block-size: max(320px, calc(100vh - var(--invulhulp-sticky-offset, 173px)));
  position: sticky;
  top: var(--invulhulp-sticky-offset, 173px);
  /* The banner animates with a transform, so its layout height lands in one
     step; match its 0.3s so the sidebar slides with it instead of snapping. */
  transition: top var(--invulhulp-duration-slow) var(--invulhulp-ease), block-size var(--invulhulp-duration-slow) var(--invulhulp-ease);
}

/* The sidebar scrolls on its own (its content is taller than the viewport once
   the AI Modus block is in play). Pin the voortgang readout to the top of that
   scrollport, otherwise it scrolls out of the sidebar and reads as missing. */
.invulhulp-nav__progress {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--semantics-surfaces-base-background-color);
  padding-block: var(--primitives-space-16);
  margin-block-end: var(--primitives-space-8);
  border-block-end: 1px solid var(--invulhulp-color-border);
}
.invulhulp-nav__progress-label {
  color: var(--invulhulp-color-text-subtle);
  margin-block-end: var(--primitives-space-4);
}

.invulhulp-nav__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.invulhulp-nav__step {
  margin-block-end: var(--primitives-space-2);
}
.invulhulp-nav__step--header {
  margin-block-start: var(--primitives-space-12);
}
.invulhulp-nav__step--summary {
  margin-block-start: var(--primitives-space-16);
  border-block-start: 1px solid var(--invulhulp-color-border);
  padding-block-start: var(--primitives-space-12);
}

.invulhulp-nav__group-label {
  font-size: var(--primitives-font-size-70);
  color: var(--semantics-content-secondary-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: var(--primitives-space-8) var(--primitives-space-8) var(--primitives-space-4);
  display: inline-block;
}

.invulhulp-nav__link {
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-4);
  inline-size: 100%;
  text-align: start;
  background: none;
  border: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  font-size: var(--primitives-font-size-90);
  padding: var(--primitives-space-4) var(--primitives-space-8);
  border-radius: var(--primitives-corner-radius-sm);
  transition: background var(--invulhulp-duration-fast);
}
.invulhulp-nav__link:hover {
  background: var(--semantics-surfaces-tinted-background-color);
}
.invulhulp-nav__link--active {
  background: rgb(21 66 115 / 0.12);
  font-weight: var(--primitives-font-weight-body-semi-bold);
}
.invulhulp-nav__link--summary {
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: var(--semantics-content-accent-color);
}

.invulhulp-nav__step--completed .invulhulp-nav__link {
  color: var(--invulhulp-color-optional);
}
.invulhulp-nav__check {
  inline-size: 1em;
  block-size: 1em;
  flex-shrink: 0;
  color: var(--invulhulp-color-optional);
}

/* Doorlopen, maar nog niet ingevuld: een open ring op de plek van het vinkje,
   zodat de rij niet verspringt. De telling zelf staat als verborgen tekst in
   de knop — kleur draagt hier geen informatie alleen. */
.invulhulp-nav__open {
  inline-size: 1em;
  block-size: 1em;
  flex-shrink: 0;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px var(--semantics-content-warning-color);
}

.invulhulp-nav__tag {
  font-size: var(--primitives-font-size-70);
  padding-inline: var(--primitives-space-4);
  margin-inline-start: var(--primitives-space-4);
}

.invulhulp-nav__ai-mode {
  margin-block-start: var(--primitives-space-16);
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-8);
}

.invulhulp-nav__ai-label {
  margin: 0;
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: var(--semantics-content-secondary-color);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: var(--primitives-font-size-70);
}

.invulhulp-nav__ai-hint {
  margin: 0;
  color: var(--invulhulp-color-text-subtle);
  font-size: var(--primitives-font-size-70);
  line-height: var(--primitives-line-height-snug);
}
</style>
