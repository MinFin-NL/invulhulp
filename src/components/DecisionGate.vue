<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm decision-gate">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <div>
        <p class="rvo-text rvo-text--sm decision-gate__kicker">Sectie 3 – Afweging</p>
        <h1 class="rvo-heading rvo-heading--xl decision-gate__title">Beslissing: inzet AI-systeem</h1>
      </div>

      <!-- Risk level reminder -->
      <div v-if="store.riskLevel" class="rvo-alert rvo-alert--padding-md" :class="`rvo-alert--${alertType}`">
        <div class="rvo-alert__container">
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
      <div class="rvo-layout-row rvo-layout-gap--md decision-gate__nav">
        <button @click="$emit('prev')" class="rvo-button rvo-button--secondary">
          ← Vorige
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
import type { FormConfig } from '../models/Assessment'
import { useAssessmentStore } from '../stores/assessmentStore'
import QuestionItem from './QuestionItem.vue'

const props = defineProps<{ formConfig: FormConfig }>()
const emit = defineEmits<{ next: [goDecision: boolean]; prev: [] }>()

const store = useAssessmentStore()

const riskLevelInfo = computed(() => props.formConfig.riskLevelInfo ?? {})

const decisionSection = computed(() =>
  props.formConfig.sections
    .flatMap((s) => s.subsections)
    .find((s) => s.id === '3'),
)
const decisionQuestions = computed(() => decisionSection.value?.questions ?? [])

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

const riskInfo = computed(() => store.riskLevel ? riskLevelInfo.value[store.riskLevel] : null)

function onNext() {
  store.markSectionCompleted('3')
  const go = goAnswer.value === 'Ja, het systeem wordt ingezet'
  store.setGoDecision(go)
  emit('next', go)
}
</script>

<style scoped>
.decision-gate {
  padding-block: var(--rvo-space-2xl) var(--rvo-space-3xl);
}

.decision-gate__kicker {
  color: var(--invulhulp-color-text-subtle);
  margin: 0 0 var(--rvo-space-3xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.decision-gate__title {
  color: var(--rvo-color-lintblauw);
  margin: 0;
}

.decision-gate__nav {
  justify-content: space-between;
  border-block-start: 1px solid var(--invulhulp-color-border);
  padding-block-start: var(--rvo-space-xl);
}
</style>
