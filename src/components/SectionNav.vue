<template>
  <nav style="width: 240px; flex-shrink: 0; background: white; border-right: 1px solid #e0e0e0; padding: 24px 16px; overflow-y: auto; height: calc(100vh - 100px); position: sticky; top: 100px;">
    <div class="rvo-layout-column" style="gap: 4px;">

      <!-- Progress -->
      <div style="margin-bottom: 16px;">
        <div class="rvo-text rvo-text--sm" style="color: #666; margin-bottom: 4px;">
          Voortgang: {{ completedCount }}/{{ totalCount }}
        </div>
        <div style="background: #e0e0e0; border-radius: 3px; height: 6px;">
          <div class="progress-bar-fill" :style="{ width: `${progressPct}%` }"></div>
        </div>
      </div>

      <!-- Home -->
      <div
        :class="['nav-section', store.currentView === 'home' ? 'active' : '']"
        @click="store.setCurrentView('home')"
        style="font-size: 0.875rem; margin-bottom: 8px;"
      >
        Introductie
      </div>

      <!-- Data-driven nav from form config -->
      <template v-for="step in props.formConfig.navigation" :key="step.type === 'subsections' ? step.sectionId : step.viewId">

        <!-- Subsections step: render section header + subsection items -->
        <template v-if="step.type === 'subsections'">
          <template v-if="!step.condition || store[step.condition.storeKey] !== false">
            <div style="font-size: 0.7rem; color: #999; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 8px 4px; margin-top: 8px;">
              {{ getSectionTitle(step.sectionId) }}
            </div>
            <template v-for="sub in getSubsections(step)" :key="sub.id">
              <div
                :class="['nav-section', store.currentView === sub.id ? 'active' : '', store.isSectionCompleted(sub.id) ? 'completed' : '']"
                @click="navigate(sub.id)"
                style="font-size: 0.825rem; padding-left: 12px;"
              >
                <span v-if="store.isSectionCompleted(sub.id)" style="color: #27ae60; margin-right: 4px;">✓</span>
                {{ sub.title }}
              </div>
            </template>
          </template>
        </template>

        <!-- Special view: skip summary (rendered at bottom) -->
        <template v-else-if="step.viewId !== 'summary'">
          <!-- Optional group header above the nav item -->
          <div
            v-if="step.navGroupHeader"
            style="font-size: 0.7rem; color: #999; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 8px 4px; margin-top: 8px;"
          >
            {{ step.navGroupHeader }}
          </div>
          <div
            :class="['nav-section', store.currentView === step.viewId ? 'active' : '', store.isSectionCompleted(completionId(step)) ? 'completed' : '']"
            @click="navigate(step.viewId)"
            style="font-size: 0.825rem; padding-left: 12px;"
          >
            <span v-if="store.isSectionCompleted(completionId(step))" style="color: #27ae60; margin-right: 4px;">✓</span>
            {{ step.navLabel ?? step.viewId }}
            <!-- Risk badge for risk classification step -->
            <span
              v-if="step.viewId === 'risk' && store.riskLevel"
              :class="`risk-badge risk-${store.riskLevel}`"
              style="font-size: 0.7rem; padding: 2px 6px; margin-left: 4px;"
            >
              {{ riskLabels[store.riskLevel!] }}
            </span>
          </div>
        </template>

      </template>

      <!-- Summary -->
      <div style="margin-top: 16px; border-top: 1px solid #e0e0e0; padding-top: 12px;">
        <div
          :class="['nav-section', store.currentView === 'summary' ? 'active' : '']"
          @click="navigate('summary')"
          style="font-size: 0.875rem; font-weight: 600; color: #154273;"
        >
          Samenvatting &amp; export
        </div>
      </div>

    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import type { FormConfig, NavStepSubsections, NavStepSpecialView, Subsection } from '../models/Assessment'

const props = defineProps<{
  formConfig: FormConfig
  navOrder: string[]
}>()

const store = useAssessmentStore()

const riskLabels: Record<string, string> = {
  onaanvaardbaar: 'Verboden',
  hoog: 'Hoog',
  beperkt: 'Beperkt',
  minimaal: 'Minimaal',
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
const progressPct = computed(() =>
  totalCount.value > 0 ? Math.round((completedCount.value / totalCount.value) * 100) : 0,
)

function navigate(id: string) {
  store.setCurrentView(id)
}
</script>
