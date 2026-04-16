<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm" style="padding-top: 32px; padding-bottom: 48px;">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <div>
        <p class="rvo-text rvo-text--sm" style="color: #666; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">Sectie 3 – Afweging</p>
        <h1 class="rvo-heading rvo-heading--xl" style="color: #154273; margin: 0;">Beslissing: inzet AI-systeem</h1>
      </div>

      <!-- Risk level reminder -->
      <div v-if="store.riskLevel" :class="`rvo-alert rvo-alert--${alertType}`" style="border-radius: 4px;">
        <div class="rvo-alert__content">
          <strong>Risicoclassificatie: {{ riskInfo?.label }}</strong><br />
          {{ riskInfo?.description }}
        </div>
      </div>

      <!-- Questions -->
      <div class="rvo-layout-column rvo-layout-gap--lg">
        <QuestionItem
          v-for="question in decisionQuestions"
          :key="question.id"
          :question="question"
          :modelValue="store.getAnswer(question.id)"
          @update:modelValue="store.setAnswer(question.id, $event)"
        />
      </div>

      <!-- Navigation -->
      <div class="rvo-layout-row rvo-layout-gap--md" style="justify-content: space-between; border-top: 1px solid #e0e0e0; padding-top: 24px;">
        <button @click="$emit('prev')" class="rvo-button rvo-button--secondary-action">
          &larr; Vorige
        </button>
        <button @click="onNext" class="rvo-button rvo-button--primary">
          {{ goAnswer === 'Ja, het systeem wordt ingezet' ? 'Naar Deel B – Implementatie →' : goAnswer === 'Nee, het systeem wordt niet ingezet' ? 'Naar samenvatting →' : 'Volgende →' }}
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { assessmentData, riskLevelInfo } from '../data/assessment'
import { useAssessmentStore } from '../stores/assessmentStore'
import QuestionItem from './QuestionItem.vue'

const emit = defineEmits<{ next: [goDecision: boolean]; prev: [] }>()

const store = useAssessmentStore()

const decisionSection = assessmentData.sections[0].subsections.find((s) => s.id === '3')
const decisionQuestions = decisionSection?.questions ?? []

const goAnswer = computed(() => {
  const raw = store.getAnswer('3.3')
  return typeof raw === 'string' ? raw.split('\n---\n')[0] : ''
})

const alertType = computed(() => {
  switch (store.riskLevel) {
    case 'onaanvaardbaar': return 'error'
    case 'hoog': return 'warning'
    case 'beperkt': return 'info'
    default: return 'success'
  }
})

const riskInfo = computed(() => store.riskLevel ? riskLevelInfo[store.riskLevel] : null)

function onNext() {
  store.markSectionCompleted('3')
  const go = goAnswer.value === 'Ja, het systeem wordt ingezet'
  store.setGoDecision(go)
  emit('next', go)
}
</script>
