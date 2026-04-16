<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm" style="padding-top: 32px; padding-bottom: 48px;">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <div>
        <p class="rvo-text rvo-text--sm" style="color: #666; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">Bijlage 1</p>
        <h1 class="rvo-heading rvo-heading--xl" style="color: #154273; margin: 0;">Risicoclassificatie AI-verordening</h1>
        <p class="rvo-text" style="margin-top: 12px;">
          Beantwoord de onderstaande vragen om het risiconiveau van uw AI-systeem te bepalen volgens de EU AI-verordening (2024/1689).
        </p>
      </div>

      <!-- Completed: show result -->
      <div v-if="result" class="rvo-layout-column rvo-layout-gap--lg">
        <div
          :class="`rvo-alert rvo-alert--${resultInfo?.color === 'error' ? 'error' : resultInfo?.color === 'warning' ? 'warning' : resultInfo?.color === 'success' ? 'success' : 'info'}`"
          style="border-radius: 4px;"
        >
          <div class="rvo-alert__content">
            <strong>{{ resultInfo?.label }}</strong><br />
            {{ resultInfo?.description }}
          </div>
        </div>

        <div class="rvo-layout-row rvo-layout-gap--md" style="justify-content: space-between;">
          <button @click="restart" class="rvo-button rvo-button--secondary-action">
            Opnieuw classificeren
          </button>
          <button @click="onConfirm" class="rvo-button rvo-button--primary">
            Bevestigen en doorgaan &rarr;
          </button>
        </div>
      </div>

      <!-- Question flow -->
      <div v-else class="rvo-layout-column rvo-layout-gap--xl">
        <div class="rvo-layout-column rvo-layout-gap--md">
          <!-- Progress indicator -->
          <div class="rvo-text rvo-text--sm" style="color: #666;">
            Vraag {{ currentIndex + 1 }} van {{ riskQuestions.length }}
          </div>
          <div style="background: #e0e0e0; border-radius: 3px; height: 6px;">
            <div
              class="progress-bar-fill"
              :style="{ width: `${((currentIndex) / riskQuestions.length) * 100}%` }"
            ></div>
          </div>
        </div>

        <div class="question-mandatory" style="padding: 16px; background: white; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <p class="rvo-text rvo-text--md" style="font-weight: 500; margin-bottom: 8px;">
            {{ currentQuestion?.text }}
          </p>
          <p v-if="currentQuestion?.guidance" class="rvo-text rvo-text--sm" style="color: #666; margin-bottom: 0;">
            {{ currentQuestion?.guidance }}
          </p>
        </div>

        <div class="rvo-layout-row rvo-layout-gap--md">
          <button @click="answer('yes')" class="rvo-button rvo-button--primary" style="flex: 1;">
            Ja
          </button>
          <button @click="answer('no')" class="rvo-button rvo-button--secondary-action" style="flex: 1;">
            Nee
          </button>
        </div>

        <button v-if="currentIndex > 0" @click="back" class="rvo-button rvo-button--tertiary-action" style="align-self: flex-start;">
          &larr; Vorige vraag
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { riskQuestions, riskLevelInfo } from '../data/assessment'
import type { RiskLevelValue } from '../models/Assessment'
import { useAssessmentStore } from '../stores/assessmentStore'

const emit = defineEmits<{ confirmed: [] }>()

const store = useAssessmentStore()
const currentIndex = ref(0)
const history = ref<number[]>([])
const result = ref<RiskLevelValue>(null)

const currentQuestion = computed(() => riskQuestions[currentIndex.value])
const resultInfo = computed(() => result.value ? riskLevelInfo[result.value] : null)

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
    const idx = riskQuestions.findIndex((rq) => rq.id === next)
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
