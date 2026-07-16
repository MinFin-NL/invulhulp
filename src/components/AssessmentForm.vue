<template>
  <div class="assessment-shell" :class="{ 'assessment-shell--ai-active': isAiActive }">
    <AppHeader />

    <!-- AI Mode banner: prominent, sticky indicator while AI fills this form -->
    <Transition name="ai-banner">
      <div v-if="isAiActive" class="ai-banner" role="status" aria-live="polite">
        <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm ai-banner__inner">
          <span class="ai-banner__spinner" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 2 22.5 22" width="22" height="22" aria-hidden="true">
              <path d="m 10.55,20.49 0.6,1.81 0.6,-1.81 c 1.04,-3.11 3.48,-5.55 6.59,-6.59 l 1.81,-0.6 -1.81,-0.6 C 15.23,11.66 12.79,9.22 11.75,6.11 L 11.15,4.3 10.55,6.11 C 9.51,9.22 7.07,11.66 3.96,12.7 l -1.81,0.6 1.81,0.6 c 3.11,1.04 5.55,3.48 6.59,6.59" fill="#fff"/>
            </svg>
          </span>
          <div class="ai-banner__body">
            <template v-if="aiPhase">
              <span class="ai-banner__title">Antwoorden gladstrijken…</span>
              <span class="ai-banner__count">sectie {{ Math.min(aiPhase.current + 1, aiPhase.total) }} van {{ aiPhase.total }}</span>
            </template>
            <template v-else>
              <span class="ai-banner__title">AI Modus vult dit formulier in…</span>
              <span v-if="aiProgress" class="ai-banner__count">{{ aiProgress.filled }}/{{ aiProgress.total }} velden</span>
            </template>
          </div>
          <div v-if="aiProgress || aiPhase" class="ai-banner__bar" aria-hidden="true">
            <div class="ai-banner__bar-fill" :style="{ width: aiProgressPct + '%' }" />
          </div>
          <button
            type="button"
            class="ai-banner__stop"
            @click="store.activeFormId && cancelAiMode(store.activeFormId)"
          >
            Stop
          </button>
        </div>
      </div>
    </Transition>

    <!-- Gebruikersbeheer (alleen beheerders, via de header-knop) -->
    <main v-if="auth.userManagementOpen" class="assessment-shell__portal">
      <UserManagement />
    </main>

    <!-- Dossier overview (home) -->
    <main v-else-if="store.screen === 'dossierList'" class="assessment-shell__portal">
      <DossierList />
    </main>

    <!-- Dossier detail page (no form selected) -->
    <main v-else-if="store.activeFormId === null" class="assessment-shell__portal">
      <DossierDetail @open="store.setActiveForm" />
    </main>

    <div v-else-if="isLoading" class="assessment-shell__loading">
      <p class="rvo-text assessment-shell__loading-text">Formulier laden...</p>
    </div>

    <div v-else-if="formConfig" class="assessment-shell__layout">
      <!-- Sidebar (hidden on home) -->
      <SectionNav
        v-if="store.currentView !== 'home'"
        :form-config="formConfig"
        :nav-order="navOrder"
      />

      <!-- Main content -->
      <main class="assessment-shell__main">

        <!-- Home -->
        <FormIntro
          v-if="store.currentView === 'home'"
          :form-config="formConfig"
          @start="startAssessment"
        />

        <!-- AIIA-only: Forbidden onaanvaardbaar risk stop screen -->
        <div
          v-else-if="formConfig.features.riskClassification && store.riskLevel === 'onaanvaardbaar' && store.currentView !== 'risk'"
          class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm assessment-shell__forbidden"
        >
          <div class="rvo-layout-column rvo-layout-gap--xl">
            <div class="rvo-alert rvo-alert--error rvo-alert--padding-md">
              <div class="rvo-alert__container">
                <strong>Dit AI-systeem is verboden</strong><br />
                Op basis van de risicoclassificatie valt dit systeem in de categorie
                <em>onaanvaardbaar risico</em> onder de EU AI-verordening (Art. 5).
                Het systeem mag niet worden ingezet.
              </div>
            </div>
            <div class="rvo-layout-row rvo-layout-gap--md">
              <button @click="store.setCurrentView('risk')" class="rvo-button rvo-button--secondary">
                Risicoclassificatie herzien
              </button>
              <button @click="store.setCurrentView('summary')" class="rvo-button rvo-button--primary">
                Samenvatting bekijken
              </button>
            </div>
          </div>
        </div>

        <!-- Risk classification (forms with riskClassification feature) -->
        <RiskClassification
          v-else-if="formConfig.features.riskClassification && store.currentView === 'risk'"
          :form-config="formConfig"
          @confirmed="onRiskConfirmed"
        />

        <!-- Decision gate (forms with decisionGate feature) -->
        <DecisionGate
          v-else-if="formConfig.features.decisionGate && store.currentView === 'decision'"
          :form-config="formConfig"
          @next="onDecisionNext"
          @prev="store.setCurrentView(prevViewOf('decision'))"
        />

        <!-- Summary -->
        <SummaryView
          v-else-if="store.currentView === 'summary'"
          :form-config="formConfig"
        />

        <!-- Section views -->
        <SectionView
          v-else-if="currentSection"
          :section="currentSection"
          :has-prev="hasPrev"
          :next-label="nextLabel"
          @next="goNext"
          @prev="goPrev"
        />

      </main>
    </div>

    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { loadForm } from '../services/formLoader'
import { computeNavOrder } from '../utils/formProgress'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAuthStore } from '../stores/authStore'
import { useAiMode } from '../composables/useAiMode'
import type { FormConfig, NavStepSubsections, NavStepSpecialView, Section } from '../models/Assessment'
import AppHeader from './AppHeader.vue'
import AppFooter from './AppFooter.vue'
import DossierList from './DossierList.vue'
import DossierDetail from './DossierDetail.vue'
import FormIntro from './FormIntro.vue'
import SectionNav from './SectionNav.vue'
import SectionView from './SectionView.vue'
import RiskClassification from './RiskClassification.vue'
import DecisionGate from './DecisionGate.vue'
import SummaryView from './SummaryView.vue'
import UserManagement from './UserManagement.vue'

const store = useAssessmentStore()
const auth = useAuthStore()
const { aiModeActive, aiModeProgress, aiModePhase, cancelAiMode } = useAiMode()
const formConfig = ref<FormConfig | null>(null)
const isLoading = ref(true)

const isAiActive = computed(
  () => store.activeFormId !== null && aiModeActive.value.has(store.activeFormId),
)
const aiProgress = computed(() =>
  store.activeFormId ? aiModeProgress.value[store.activeFormId] ?? null : null,
)
const aiPhase = computed(() =>
  store.activeFormId ? aiModePhase.value[store.activeFormId] ?? null : null,
)
const aiProgressPct = computed(() => {
  const phase = aiPhase.value
  if (phase) {
    return phase.total === 0 ? 0 : Math.round((phase.current / phase.total) * 100)
  }
  const p = aiProgress.value
  if (!p || p.total === 0) return 0
  return Math.round((p.filled / p.total) * 100)
})

async function loadActiveForm() {
  if (!store.activeFormId) {
    isLoading.value = false
    formConfig.value = null
    return
  }
  isLoading.value = true
  formConfig.value = await loadForm(store.activeFormId)
  isLoading.value = false
}

onMounted(loadActiveForm)
watch(() => store.activeFormId, loadActiveForm)

// Build ordered navigation list from form config
const navOrder = computed((): string[] => {
  if (!formConfig.value) return []
  return computeNavOrder(formConfig.value, store.activeForm)
})

// Set of subsection IDs excluded from direct section rendering
const excludedSubsectionIds = computed((): Set<string> => {
  if (!formConfig.value) return new Set()
  const excluded = new Set<string>()
  for (const step of formConfig.value.navigation) {
    if (step.type === 'subsections') {
      for (const id of (step as NavStepSubsections).exclude ?? []) {
        excluded.add(id)
      }
    }
  }
  return excluded
})

// Flat map of all subsections by id (for SectionView rendering)
const sectionMap = computed((): Record<string, Section> => {
  const map: Record<string, Section> = {}
  if (!formConfig.value) return map
  for (const section of formConfig.value.sections) {
    for (const sub of section.subsections) {
      if (excludedSubsectionIds.value.has(sub.id)) continue
      map[sub.id] = {
        id: sub.id,
        title: section.title,
        part: section.part,
        subsections: [sub],
      }
    }
  }
  return map
})

const currentSection = computed((): Section | null => {
  const view = store.currentView
  const specialViews = ['home', 'risk', 'decision', 'summary']
  if (specialViews.includes(view)) return null
  return sectionMap.value[view] ?? null
})

const currentIndex = computed(() => navOrder.value.indexOf(store.currentView))
const hasPrev = computed(() => currentIndex.value > 0)

const nextLabel = computed(() => {
  if (!formConfig.value) return 'Volgende'
  const nextViewId = navOrder.value[currentIndex.value + 1]
  if (!nextViewId) return 'Volgende'
  for (const step of formConfig.value.navigation) {
    if (step.type === 'specialView' && (step as NavStepSpecialView).viewId === nextViewId) {
      return (step as NavStepSpecialView).label ?? 'Volgende'
    }
  }
  return 'Volgende'
})

function startAssessment() {
  store.setCurrentView(navOrder.value[0])
}

function goNext() {
  const idx = currentIndex.value
  if (idx < navOrder.value.length - 1) {
    store.setCurrentView(navOrder.value[idx + 1])
  }
}

function goPrev() {
  const idx = currentIndex.value
  if (idx > 0) {
    store.setCurrentView(navOrder.value[idx - 1])
  }
}

function prevViewOf(view: string): string {
  const idx = navOrder.value.indexOf(view)
  return idx > 0 ? navOrder.value[idx - 1] : 'home'
}

function onRiskConfirmed() {
  store.setCurrentView('decision')
}

function onDecisionNext(go: boolean) {
  if (!formConfig.value) return
  const decisionStep = formConfig.value.navigation.find(
    (s) => s.type === 'specialView' && (s as NavStepSpecialView).viewId === 'decision',
  ) as NavStepSpecialView | undefined

  if (decisionStep?.conditionalNext) {
    const targetId = go ? decisionStep.conditionalNext.ifTrue : decisionStep.conditionalNext.ifFalse
    const section = formConfig.value.sections.find((s) => s.id === targetId)
    if (section?.subsections.length) {
      store.setCurrentView(section.subsections[0].id)
    } else {
      store.setCurrentView(targetId)
    }
  } else {
    store.setCurrentView('summary')
  }
}
</script>

<style scoped>
.assessment-shell {
  min-block-size: 100vh;
  display: flex;
  flex-direction: column;
}

.assessment-shell__portal {
  flex: 1;
  overflow-y: auto;
}

.assessment-shell__loading {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
}

.assessment-shell__loading-text {
  color: var(--invulhulp-color-text-subtle);
}

.assessment-shell__layout {
  display: flex;
  flex: 1;
}

.assessment-shell__main {
  flex: 1;
  overflow-y: auto;
  padding-block-end: var(--rvo-space-3xl);
}

.assessment-shell__forbidden {
  padding-block: var(--rvo-space-3xl) var(--rvo-space-3xl);
}

/* ── AI Mode banner ──────────────────────────────────────────────────────── */

.ai-banner {
  position: sticky;
  top: 0;
  z-index: 20;
  background: linear-gradient(135deg, #0f2d5c, #5b21b6, #0ea5e9, #5b21b6, #0f2d5c);
  background-size: 200% 100%;
  color: #fff;
  box-shadow: 0 2px 16px rgba(91, 33, 182, 0.45);
  animation: ai-banner-shift 8s linear infinite, ai-banner-glow 2.4s ease-in-out infinite;
}

.ai-banner__inner {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-sm);
  padding-block: var(--rvo-space-sm);
}

.ai-banner__spinner {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  animation: ai-banner-spin 1.8s linear infinite;
}

.ai-banner__body {
  display: flex;
  align-items: baseline;
  gap: var(--rvo-space-sm);
  flex-wrap: wrap;
  min-inline-size: 0;
}

.ai-banner__title {
  font-weight: var(--rvo-font-weight-bold);
  font-size: var(--rvo-font-size-md);
  letter-spacing: 0.01em;
}

.ai-banner__count {
  font-size: var(--rvo-font-size-sm);
  font-weight: var(--rvo-font-weight-semibold);
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  white-space: nowrap;
}

.ai-banner__bar {
  flex: 1;
  min-inline-size: 80px;
  block-size: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.25);
  overflow: hidden;
}

.ai-banner__bar-fill {
  block-size: 100%;
  border-radius: 999px;
  background: #fff;
  transition: width 0.4s ease;
}

.ai-banner__stop {
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.95);
  color: var(--rvo-color-rood, #d52b1e);
  border: 0;
  border-radius: 999px;
  padding: var(--rvo-space-2xs) var(--rvo-space-md);
  font: inherit;
  font-size: var(--rvo-font-size-sm);
  font-weight: var(--rvo-font-weight-bold);
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.1s;
}
.ai-banner__stop:hover {
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.4);
}
.ai-banner__stop:active {
  transform: scale(0.97);
}
.ai-banner__stop:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

/* Subtle glow on the whole shell while AI is working */
.assessment-shell--ai-active .assessment-shell__main {
  position: relative;
}
.assessment-shell--ai-active .assessment-shell__main::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 0 2px rgba(91, 33, 182, 0.25);
  animation: ai-main-glow 2.4s ease-in-out infinite;
}

@keyframes ai-banner-shift {
  0%   { background-position: 0% 50%; }
  100% { background-position: -200% 50%; }
}
@keyframes ai-banner-glow {
  0%, 100% { box-shadow: 0 2px 12px rgba(91, 33, 182, 0.4); }
  50%      { box-shadow: 0 2px 22px rgba(14, 165, 233, 0.6); }
}
@keyframes ai-banner-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes ai-main-glow {
  0%, 100% { box-shadow: inset 0 0 0 2px rgba(91, 33, 182, 0.18); }
  50%      { box-shadow: inset 0 0 24px 2px rgba(14, 165, 233, 0.22); }
}

/* Banner enter/leave transition */
.ai-banner-enter-active,
.ai-banner-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.ai-banner-enter-from,
.ai-banner-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .ai-banner,
  .ai-banner__spinner,
  .assessment-shell--ai-active .assessment-shell__main::before {
    animation: none;
  }
}
</style>
