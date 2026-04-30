<template>
  <div style="min-height: 100vh; display: flex; flex-direction: column;">
    <AppHeader />

    <!-- Portal landing page (no form selected) -->
    <main v-if="store.activeFormId === null" style="flex: 1; overflow-y: auto;">
      <PortalPage @open="store.setActiveForm" />
    </main>

    <div v-else-if="isLoading" style="display: flex; flex: 1; align-items: center; justify-content: center;">
      <p class="rvo-text" style="color: #666;">Formulier laden...</p>
    </div>

    <div v-else-if="formConfig" style="display: flex; flex: 1;">
      <!-- Sidebar (hidden on home) -->
      <SectionNav
        v-if="store.currentView !== 'home'"
        :form-config="formConfig"
        :nav-order="navOrder"
      />

      <!-- Main content — padding-bottom leaves room for the fixed footer -->
      <main style="flex: 1; overflow-y: auto; padding-bottom: 48px;">

        <!-- Home -->
        <FormHomePage
          v-if="store.currentView === 'home'"
          :form-config="formConfig"
          @start="startAssessment"
        />

        <!-- AIIA-only: Forbidden onaanvaardbaar risk stop screen -->
        <div
          v-else-if="formConfig.features.riskClassification && store.riskLevel === 'onaanvaardbaar' && store.currentView !== 'risk'"
          class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm"
          style="padding-top: 48px; padding-bottom: 48px;"
        >
          <div class="rvo-layout-column rvo-layout-gap--xl">
            <div class="rvo-alert rvo-alert--error" style="border-radius: 4px;">
              <div class="rvo-alert__content">
                <strong>Dit AI-systeem is verboden</strong><br />
                Op basis van de risicoclassificatie valt dit systeem in de categorie
                <em>onaanvaardbaar risico</em> onder de EU AI-verordening (Art. 5).
                Het systeem mag niet worden ingezet.
              </div>
            </div>
            <div class="rvo-layout-row rvo-layout-gap--md">
              <button @click="store.setCurrentView('risk')" class="rvo-button rvo-button--secondary-action">
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
import { useAssessmentStore } from '../stores/assessmentStore'
import type { FormConfig, NavStepSubsections, NavStepSpecialView, Section } from '../models/Assessment'
import AppHeader from './AppHeader.vue'
import AppFooter from './AppFooter.vue'
import PortalPage from './PortalPage.vue'
import FormHomePage from './FormHomePage.vue'
import SectionNav from './SectionNav.vue'
import SectionView from './SectionView.vue'
import RiskClassification from './RiskClassification.vue'
import DecisionGate from './DecisionGate.vue'
import SummaryView from './SummaryView.vue'

const store = useAssessmentStore()
const formConfig = ref<FormConfig | null>(null)
const isLoading = ref(true)

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
  const order: string[] = []

  for (const step of formConfig.value.navigation) {
    if (step.type === 'subsections') {
      const s = step as NavStepSubsections
      if (s.condition) {
        const val = store[s.condition.storeKey as keyof typeof store]
        if (val !== s.condition.value) continue
      }
      const section = formConfig.value.sections.find((sec) => sec.id === s.sectionId)
      if (section) {
        for (const sub of section.subsections) {
          if (s.exclude?.includes(sub.id)) continue
          order.push(sub.id)
        }
      }
    } else {
      order.push((step as NavStepSpecialView).viewId)
    }
  }

  return order
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
