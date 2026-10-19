<template>
  <!-- Verdiepingsgesprek prototype (interviewmodus §5.1). Points the way for a
       question the documents could not answer; never holds an answer. The
       field above stays empty until the user writes in it. -->
  <section class="gap-help" :aria-labelledby="titleId">
    <p :id="titleId" class="gap-help__title">Wat kan helpen</p>

    <template v-if="panel.aandachtspunten.length">
      <p class="gap-help__label invulhulp-text--sm">Een goed antwoord gaat over</p>
      <ul class="gap-help__tags" role="list">
        <li v-for="punt in panel.aandachtspunten" :key="punt">
          <nldd-tag size="sm" :text="punt" />
        </li>
      </ul>
    </template>

    <template v-if="panel.bijna.length">
      <p class="gap-help__label invulhulp-text--sm">Bijna raak in de documenten</p>
      <ul class="gap-help__quotes">
        <li v-for="item in panel.bijna" :key="item.citaat" class="invulhulp-text--sm">
          <q>{{ item.citaat }}</q>
          <span v-if="item.reden" class="invulhulp-text--subtle"> — {{ item.reden }}</span>
        </li>
      </ul>
    </template>

    <p
      v-if="!panel.aandachtspunten.length && !panel.bijna.length"
      class="invulhulp-text--sm invulhulp-text--subtle gap-help__empty"
    >
      De documenten gaven hier geen aanknopingspunten.
    </p>

    <!-- One follow-up question, only on request and only for open questions:
         for a radio, checkbox or table the control itself is the help. -->
    <div v-if="canFollowUp" class="gap-help__followup">
      <nldd-button
        variant="secondary"
        size="sm"
        text="Laat AI meekijken"
        :loading="busy"
        :disabled="!answerText.trim()"
        @click="askFollowUp"
      />
      <p v-if="!answerText.trim()" class="invulhulp-text--sm invulhulp-text--subtle gap-help__hint">
        Schrijf eerst zelf een antwoord. Daarna kan de AI één vraag terugstellen.
      </p>
      <!-- Always in the DOM so a screen reader hears the result arrive. -->
      <p class="invulhulp-text--sm gap-help__result" role="status" aria-live="polite">
        <template v-if="result === ''">De AI ziet niets wezenlijks ontbreken.</template>
        <template v-else-if="result">
          <span class="gap-help__result-label">De AI vraagt:</span> {{ result }}
        </template>
        <template v-else-if="error">Meekijken lukte niet: {{ error }}</template>
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import type { Question } from '../models/Assessment'
import { gapFollowup, type GapPanel } from '../services/llmService'
import { useAssessmentStore } from '../stores/assessmentStore'

const props = defineProps<{
  question: Question
  panel: GapPanel
  /** The user's answer as plain text. */
  answerText: string
}>()

const store = useAssessmentStore()
const titleId = `gap-help-${useId()}`

const canFollowUp = computed(() => props.question.type === 'text' && store.canEdit)

const busy = ref(false)
// null = not asked yet; '' = nothing missing; otherwise the question.
const result = ref<string | null>(null)
const error = ref('')

// The question answered an earlier text; once the user writes on, it is stale.
watch(
  () => props.answerText,
  () => {
    result.value = null
    error.value = ''
  },
)

async function askFollowUp() {
  if (busy.value || !props.answerText.trim()) return
  busy.value = true
  error.value = ''
  try {
    result.value = await gapFollowup({
      sessionId: store.sessionId,
      question: props.question.text,
      aandachtspunten: props.panel.aandachtspunten,
      answer: props.answerText,
    })
  } catch (e) {
    result.value = null
    error.value = e instanceof Error ? e.message : 'onbekende fout'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
/* Informational, like the provenance note in QuestionItem: tinted surface,
   accent rule on the start edge. */
.gap-help {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-8);
  margin-block-start: var(--primitives-space-8);
  padding: var(--primitives-space-12) var(--primitives-space-16);
  background: var(--semantics-surfaces-tinted-background-color);
  border-inline-start: 3px solid var(--semantics-content-accent-color);
  border-radius: var(--primitives-corner-radius-sm);
  color: var(--semantics-content-color);
}

.gap-help__title {
  margin: 0;
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-bold);
}

.gap-help__label {
  margin: 0;
  color: var(--semantics-content-secondary-color);
}

.gap-help__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--primitives-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.gap-help__quotes {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
  margin: 0;
  padding-inline-start: var(--primitives-space-16);
}

.gap-help__empty,
.gap-help__hint {
  margin: 0;
}

.gap-help__followup {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--primitives-space-4);
}

.gap-help__result {
  margin: 0;
}

.gap-help__result:empty {
  display: none;
}

.gap-help__result-label {
  font-weight: var(--primitives-font-weight-body-bold);
}
</style>
