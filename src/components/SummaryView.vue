<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm" style="padding-top: 32px; padding-bottom: 48px;">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <div>
        <h1 class="rvo-heading rvo-heading--xl" style="color: #154273; margin: 0 0 8px 0;">Samenvatting</h1>
        <p class="rvo-text" style="color: #555; margin: 0;">Overzicht van alle ingevulde antwoorden.</p>
      </div>

      <!-- Risk level -->
      <div v-if="store.riskLevel" :class="`rvo-alert rvo-alert--${alertType}`" style="border-radius: 4px;">
        <div class="rvo-alert__content">
          <strong>Risicoclassificatie: {{ riskInfo?.label }}</strong><br />
          {{ riskInfo?.description }}
        </div>
      </div>

      <!-- Unanswered mandatory -->
      <div v-if="unansweredMandatory.length > 0" class="rvo-alert rvo-alert--warning" style="border-radius: 4px;">
        <div class="rvo-alert__content">
          <strong>Verplichte vragen niet ingevuld ({{ unansweredMandatory.length }})</strong><br />
          De volgende verplichte vragen zijn nog niet beantwoord:
          <ul style="margin: 8px 0 0; padding-left: 20px;">
            <li v-for="q in unansweredMandatory" :key="q.id" class="rvo-text rvo-text--sm">
              {{ q.id }}: {{ q.text.slice(0, 80) }}...
            </li>
          </ul>
        </div>
      </div>

      <!-- System name input -->
      <div>
        <label class="rvo-text rvo-text--md" style="font-weight: 500; display: block; margin-bottom: 6px;">
          Naam van het AI-systeem (voor export)
        </label>
        <input
          v-model="systemName"
          type="text"
          class="aiia-textarea"
          style="min-height: unset; padding: 10px 12px; resize: none; height: auto;"
          placeholder="Bijv. Verkeersprognosemodel v2"
        />
      </div>

      <!-- Export button -->
      <div class="rvo-layout-row rvo-layout-gap--md">
        <button @click="exportPdf" class="rvo-button rvo-button--primary">
          Download PDF rapport
        </button>
      </div>

      <!-- Answers by section -->
      <div v-for="section in visibleSections" :key="section.id" class="rvo-layout-column rvo-layout-gap--lg">
        <h2 class="rvo-heading rvo-heading--lg" style="color: #154273; border-bottom: 2px solid #154273; padding-bottom: 8px;">
          {{ section.title }}
        </h2>

        <div v-for="subsection in section.subsections" :key="subsection.id" class="rvo-layout-column rvo-layout-gap--md">
          <h3 class="rvo-heading rvo-heading--md" style="color: #333;">{{ subsection.title }}</h3>

          <div v-for="question in subsection.questions" :key="question.id" style="padding: 12px; background: white; border-radius: 4px; border: 1px solid #e8e8e8;">
            <div class="rvo-layout-row" style="gap: 8px; align-items: flex-start;">
              <div
                style="width: 4px; height: 100%; min-height: 40px; border-radius: 2px; flex-shrink: 0; align-self: stretch;"
                :style="{ background: question.importance === 'mandatory' ? '#0070bb' : '#39870c' }"
              ></div>
              <div class="rvo-layout-column" style="gap: 4px; flex: 1;">
                <p class="rvo-text rvo-text--sm" style="font-weight: 500; margin: 0; color: #333;">
                  {{ question.id }}: {{ question.text }}
                </p>
                <p class="rvo-text rvo-text--sm" :style="{ color: hasAnswer(question.id) ? '#000' : '#999', fontStyle: hasAnswer(question.id) ? 'normal' : 'italic', margin: 0 }">
                  {{ formattedAnswer(question.id) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { assessmentData, riskLevelInfo } from '../data/assessment'
import { useAssessmentStore } from '../stores/assessmentStore'
import { exportToPdf } from '../services/pdfExport'
import type { Question } from '../models/Assessment'

const store = useAssessmentStore()
const systemName = ref('')

const visibleSections = computed(() =>
  assessmentData.sections.filter((s) => {
    if (s.part === 'B' && !store.showPartB) return false
    return true
  }),
)

const allQuestions = computed((): Question[] => {
  const qs: Question[] = []
  for (const section of visibleSections.value) {
    for (const sub of section.subsections) {
      qs.push(...sub.questions)
    }
  }
  return qs
})

const unansweredMandatory = computed(() =>
  allQuestions.value.filter((q) => {
    if (q.importance !== 'mandatory') return false
    const a = store.getAnswer(q.id)
    if (Array.isArray(a)) return a.length === 0
    return !a || a.trim() === ''
  }),
)

const riskInfo = computed(() => store.riskLevel ? riskLevelInfo[store.riskLevel] : null)

const alertType = computed(() => {
  switch (store.riskLevel) {
    case 'onaanvaardbaar': return 'error'
    case 'hoog': return 'warning'
    case 'beperkt': return 'info'
    default: return 'success'
  }
})

function hasAnswer(id: string): boolean {
  const a = store.getAnswer(id)
  if (Array.isArray(a)) return a.length > 0
  return typeof a === 'string' && a.trim() !== ''
}

function formattedAnswer(id: string): string {
  const a = store.getAnswer(id)
  if (!a) return '(niet ingevuld)'
  if (Array.isArray(a)) return a.length > 0 ? a.join(', ') : '(niet ingevuld)'
  const clean = a.replace('\n---\n', ' — ')
  return clean.trim() || '(niet ingevuld)'
}

function exportPdf() {
  exportToPdf(store.answers, store.riskLevel, store.goDecision, systemName.value || undefined)
}
</script>
