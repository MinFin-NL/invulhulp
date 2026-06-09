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
              :class="{ 'invulhulp-nav__step--completed': store.isSectionCompleted(sub.id) }"
            >
              <button
                type="button"
                class="rvo-progress-tracker__step-link invulhulp-nav__link"
                :class="{ 'invulhulp-nav__link--active': store.currentView === sub.id }"
                :aria-current="store.currentView === sub.id ? 'page' : undefined"
                @click="navigate(sub.id)"
              >
                <span v-if="store.isSectionCompleted(sub.id)" class="invulhulp-nav__check" aria-hidden="true">✓</span>
                {{ sub.title }}
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
              <span v-if="store.isSectionCompleted(completionId(step))" class="invulhulp-nav__check" aria-hidden="true">✓</span>
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
      <p class="rvo-text rvo-text--sm invulhulp-nav__ai-label">AI Mode</p>
      <AiModeToggle
        :form-id="formConfig.id"
        :has-documents="readyDocIds.length > 0"
        :is-active="aiModeActive.has(formConfig.id)"
        :is-done="formConfig.id in aiModeDone"
        :done-filled-count="aiModeDone[formConfig.id] ?? 0"
        :progress="aiModeProgress[formConfig.id] ?? null"
        @activate="startAiMode"
        @cancel="cancelAiMode"
        @dismiss="dismissAiModeDone"
      />
      <p class="rvo-text rvo-text--sm invulhulp-nav__ai-hint">
        <template v-if="readyDocIds.length > 0">
          Overschrijft alle antwoorden met AI op basis van {{ readyDocIds.length }} brondocument{{ readyDocIds.length === 1 ? '' : 'en' }}.
        </template>
        <template v-else>
          Upload brondocumenten op de startpagina om AI Mode te gebruiken.
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
import AiModeToggle from './AiModeToggle.vue'

const props = defineProps<{
  formConfig: FormConfig
  navOrder: string[]
}>()

const store = useAssessmentStore()
const { aiModeActive, aiModeProgress, aiModeDone, readyDocIds, startAiMode, cancelAiMode, dismissAiModeDone } = useAiMode()

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

const completedCount = computed(() => store.completedSections.length)
const totalCount = computed(() => props.navOrder.filter((v) => v !== 'home' && v !== 'summary').length)

function navigate(id: string) {
  store.setCurrentView(id)
}
</script>

<style scoped>
.invulhulp-nav {
  inline-size: 240px;
  flex-shrink: 0;
  background: var(--rvo-color-wit);
  border-inline-end: 1px solid var(--invulhulp-color-border);
  padding: var(--rvo-space-xl) var(--rvo-space-md);
  overflow-y: auto;
  block-size: calc(100vh - 100px);
  position: sticky;
  top: 100px;
}

.invulhulp-nav__progress {
  margin-block-end: var(--rvo-space-md);
}
.invulhulp-nav__progress-label {
  color: var(--invulhulp-color-text-subtle);
  margin-block-end: var(--rvo-space-2xs);
}

.invulhulp-nav__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.invulhulp-nav__step {
  margin-block-end: var(--rvo-space-3xs);
}
.invulhulp-nav__step--header {
  margin-block-start: var(--rvo-space-sm);
}
.invulhulp-nav__step--summary {
  margin-block-start: var(--rvo-space-md);
  border-block-start: 1px solid var(--invulhulp-color-border);
  padding-block-start: var(--rvo-space-sm);
}

.invulhulp-nav__group-label {
  font-size: var(--rvo-font-size-2xs);
  color: var(--rvo-color-grijs-500);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: var(--rvo-space-xs) var(--rvo-space-xs) var(--rvo-space-2xs);
  display: inline-block;
}

.invulhulp-nav__link {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-2xs);
  inline-size: 100%;
  text-align: start;
  background: none;
  border: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  font-size: var(--rvo-font-size-sm);
  padding: var(--rvo-space-2xs) var(--rvo-space-xs);
  border-radius: var(--rvo-border-radius-sm);
  transition: background 0.15s;
}
.invulhulp-nav__link:hover {
  background: var(--rvo-color-grijs-100);
}
.invulhulp-nav__link--active {
  background: rgb(21 66 115 / 0.12);
  font-weight: var(--rvo-font-weight-semibold);
}
.invulhulp-nav__link--summary {
  font-weight: var(--rvo-font-weight-semibold);
  color: var(--rvo-color-lintblauw);
}

.invulhulp-nav__step--completed .invulhulp-nav__link {
  color: var(--invulhulp-color-optional);
}
.invulhulp-nav__check {
  color: var(--invulhulp-color-optional);
}

.invulhulp-nav__tag {
  font-size: var(--rvo-font-size-2xs);
  padding-inline: var(--rvo-space-2xs);
  margin-inline-start: var(--rvo-space-2xs);
}

.invulhulp-nav__ai-mode {
  margin-block-start: var(--rvo-space-md);
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-xs);
}

.invulhulp-nav__ai-label {
  margin: 0;
  font-weight: var(--rvo-font-weight-semibold);
  color: var(--rvo-color-grijs-700);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: var(--rvo-font-size-2xs);
}

.invulhulp-nav__ai-hint {
  margin: 0;
  color: var(--invulhulp-color-text-subtle);
  font-size: var(--rvo-font-size-2xs);
  line-height: var(--rvo-line-height-md);
}
</style>
