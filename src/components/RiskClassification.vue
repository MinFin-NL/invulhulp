<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm risk-classification">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <div>
        <p class="rvo-text rvo-text--sm risk-classification__kicker">Bijlage 1</p>
        <h1 class="rvo-heading rvo-heading--xl risk-classification__title">Risicoclassificatie AI-verordening</h1>
        <p class="rvo-text risk-classification__lead">
          Beantwoord de onderstaande vragen om het risiconiveau van uw AI-systeem te bepalen volgens de EU AI-verordening (2024/1689).
        </p>
      </div>

      <!-- Completed: show result -->
      <div v-if="result" class="rvo-layout-column rvo-layout-gap--lg">
        <div
          class="rvo-alert rvo-alert--padding-md"
          :class="`rvo-alert--${alertModifier}`"
        >
          <div class="rvo-alert__container">
            <strong>{{ resultInfo?.label }}</strong><br />
            {{ resultInfo?.description }}
          </div>
        </div>

        <div class="rvo-layout-row rvo-layout-gap--md risk-classification__result-actions">
          <button @click="restart" class="rvo-button rvo-button--secondary">
            Opnieuw classificeren
          </button>
          <button @click="onConfirm" class="rvo-button rvo-button--primary">
            Bevestigen en doorgaan →
          </button>
        </div>
      </div>

      <!-- Question flow -->
      <div v-else class="rvo-layout-column rvo-layout-gap--xl">
        <div class="rvo-layout-column rvo-layout-gap--xs">
          <div class="rvo-text rvo-text--sm risk-classification__progress-label">
            Vraag {{ currentIndex + 1 }} van {{ riskQuestions.length }}
          </div>
          <progress
            class="invulhulp-progress"
            :value="currentIndex"
            :max="riskQuestions.length"
            :aria-label="`Vraag ${currentIndex + 1} van ${riskQuestions.length}`"
          />
        </div>

        <article class="risk-classification__card">
          <p class="rvo-text rvo-text--md risk-classification__question">
            {{ currentQuestion?.text }}
          </p>
          <p v-if="currentQuestion?.guidance" class="rvo-text rvo-text--sm risk-classification__guidance">
            {{ currentQuestion?.guidance }}
          </p>
        </article>

        <div class="rvo-layout-row rvo-layout-gap--md risk-classification__choices">
          <button @click="answer('yes')" class="rvo-button rvo-button--primary risk-classification__choice">
            Ja
          </button>
          <button @click="answer('no')" class="rvo-button rvo-button--secondary risk-classification__choice">
            Nee
          </button>
        </div>

        <button
          v-if="currentIndex > 0"
          @click="back"
          class="rvo-button rvo-button--tertiary risk-classification__back"
        >
          ← Vorige vraag
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FormConfig, RiskLevelValue } from '../models/Assessment'
import { useAssessmentStore } from '../stores/assessmentStore'

const props = defineProps<{ formConfig: FormConfig }>()
const emit = defineEmits<{ confirmed: [] }>()

const store = useAssessmentStore()
const currentIndex = ref(0)
const history = ref<number[]>([])
const result = ref<RiskLevelValue>(null)

const riskQuestions = computed(() => props.formConfig.riskQuestions ?? [])
const riskLevelInfo = computed(() => props.formConfig.riskLevelInfo ?? {})

const currentQuestion = computed(() => riskQuestions.value[currentIndex.value])
const resultInfo = computed(() => result.value ? riskLevelInfo.value[result.value] : null)

const alertModifier = computed(() => {
  const c = resultInfo.value?.color
  if (c === 'error' || c === 'warning' || c === 'success') return c
  return 'info'
})

function answer(choice: 'yes' | 'no') {
  const q = currentQuestion.value
  if (!q) return
  const next = choice === 'yes' ? q.yesLeadsTo : q.noLeadsTo

  history.value.push(currentIndex.value)

  const isLevel = ['onaanvaardbaar', 'hoog', 'beperkt', 'minimaal'].includes(next)
  if (isLevel) {
    result.value = next as RiskLevelValue
    store.setRiskLevel(next as RiskLevelValue)
  } else {
    const idx = riskQuestions.value.findIndex((rq) => rq.id === next)
    if (idx !== -1) currentIndex.value = idx
  }
}

function back() {
  const prev = history.value.pop()
  if (prev !== undefined) currentIndex.value = prev
  result.value = null
}

function restart() {
  currentIndex.value = 0
  history.value = []
  result.value = null
}

function onConfirm() {
  store.markSectionCompleted('risk')
  emit('confirmed')
}
</script>

<style scoped>
.risk-classification {
  padding-block: var(--rvo-space-2xl) var(--rvo-space-3xl);
}

.risk-classification__kicker {
  color: var(--invulhulp-color-text-subtle);
  margin: 0 0 var(--rvo-space-3xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.risk-classification__title {
  color: var(--rvo-color-lintblauw);
  margin: 0;
}

.risk-classification__lead {
  margin-block-start: var(--rvo-space-sm);
}

.risk-classification__progress-label {
  color: var(--invulhulp-color-text-subtle);
}

.risk-classification__card {
  padding: var(--rvo-space-md);
  background: var(--rvo-color-wit);
  border: 1px solid var(--invulhulp-color-border);
  border-inline-start: 4px solid var(--invulhulp-color-mandatory);
  border-radius: var(--rvo-border-radius-md);
}

.risk-classification__question {
  font-weight: var(--rvo-font-weight-semibold);
  margin: 0 0 var(--rvo-space-xs);
}

.risk-classification__guidance {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}

.risk-classification__choices {
  align-items: stretch;
}

.risk-classification__choice {
  flex: 1;
}

.risk-classification__back {
  align-self: flex-start;
}

.risk-classification__result-actions {
  justify-content: space-between;
}
</style>
