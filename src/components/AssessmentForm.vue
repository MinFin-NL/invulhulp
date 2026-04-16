<template>
  <div style="min-height: 100vh; display: flex; flex-direction: column;">
    <AppHeader />

    <div style="display: flex; flex: 1;">
      <!-- Sidebar (hidden on home) -->
      <SectionNav v-if="store.currentView !== 'home'" />

      <!-- Main content -->
      <main style="flex: 1; overflow-y: auto;">

        <!-- Home -->
        <HomePage v-if="store.currentView === 'home'" @start="startAssessment" />

        <!-- Forbidden: onaanvaardbaar risk stop screen -->
        <div
          v-else-if="store.riskLevel === 'onaanvaardbaar' && store.currentView !== 'risk'"
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

        <!-- Risk classification -->
        <RiskClassification v-else-if="store.currentView === 'risk'" @confirmed="onRiskConfirmed" />

        <!-- Decision gate (Section 3) -->
        <DecisionGate
          v-else-if="store.currentView === 'decision'"
          @next="onDecisionNext"
          @prev="store.setCurrentView(prevViewOf('decision'))"
        />

        <!-- Summary -->
        <SummaryView v-else-if="store.currentView === 'summary'" />

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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { assessmentData } from '../data/assessment'
import { useAssessmentStore } from '../stores/assessmentStore'
import type { Section } from '../models/Assessment'
import AppHeader from './AppHeader.vue'
import HomePage from './HomePage.vue'
import SectionNav from './SectionNav.vue'
import SectionView from './SectionView.vue'
import RiskClassification from './RiskClassification.vue'
import DecisionGate from './DecisionGate.vue'
import SummaryView from './SummaryView.vue'

const store = useAssessmentStore()

// Build ordered navigation list
const navOrder = computed((): string[] => {
  const partA = assessmentData.sections.find((s) => s.id === 'deel_a')
  const partB = assessmentData.sections.find((s) => s.id === 'deel_b')

  const order: string[] = []
  if (partA) {
    for (const sub of partA.subsections) {
      if (sub.id !== '3') order.push(sub.id)
    }
  }
  order.push('risk')
  order.push('decision')

  if (store.goDecision !== false && partB) {
    for (const sub of partB.subsections) {
      order.push(sub.id)
    }
  }
  order.push('summary')
  return order
})

// Flat map of all sections by id
const sectionMap = computed((): Record<string, Section> => {
  const map: Record<string, Section> = {}
  for (const section of assessmentData.sections) {
    // Create single-subsection wrappers per subsection id
    for (const sub of section.subsections) {
      if (sub.id === '3') continue // handled by DecisionGate
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
  if (['home', 'risk', 'decision', 'summary'].includes(view)) return null
  return sectionMap.value[view] ?? null
})

const currentIndex = computed(() => navOrder.value.indexOf(store.currentView))
const hasPrev = computed(() => currentIndex.value > 0)

const nextLabel = computed(() => {
  const idx = currentIndex.value
  const next = navOrder.value[idx + 1]
  if (next === 'risk') return 'Naar risicoclassificatie'
  if (next === 'decision') return 'Naar afweging &amp; beslissing'
  if (next === 'summary') return 'Naar samenvatting'
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
  if (go) {
    const partB = assessmentData.sections.find((s) => s.id === 'deel_b')
    if (partB && partB.subsections.length > 0) {
      store.setCurrentView(partB.subsections[0].id)
      return
    }
  }
  store.setCurrentView('summary')
}
</script>
