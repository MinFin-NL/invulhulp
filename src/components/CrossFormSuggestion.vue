<template>
  <div v-if="sourceContext.length > 0" class="cross-suggestion">
    <div class="cross-suggestion__header">
      <span class="cross-suggestion__label">Beschikbaar uit {{ sourceLabel }}</span>
    </div>

    <!-- Source form answer blocks -->
    <div
      v-for="item in sourceContext"
      :key="item.id"
      class="cross-suggestion__block"
    >
      <div class="cross-suggestion__question">{{ item.questionText }}</div>
      <div class="cross-suggestion__answer">{{ item.answer }}</div>
    </div>

    <!-- AI synthesis suggestion panel -->
    <div
      v-if="streamingText || suggestion !== null"
      class="rvo-alert rvo-alert--success rvo-alert--padding-sm cross-suggestion__panel"
      :aria-busy="isLoading"
    >
      <div class="rvo-alert__container">
        <div class="cross-suggestion__panel-header">
          <span class="cross-suggestion__panel-label">✦ Synthese vanuit {{ sourceLabel }}</span>
          <span v-if="rationale" class="cross-suggestion__rationale">{{ rationale }}</span>
        </div>

        <!-- Live streaming view -->
        <div v-if="isLoading" class="cross-diff cross-diff--streaming" aria-live="polite">
          <span v-if="streamingText">{{ streamingText }}<span class="cross-diff__cursor" aria-hidden="true">▋</span></span>
          <span v-else class="cross-diff__empty">Verbinding maken…</span>
        </div>

        <!-- Final diff view -->
        <template v-else-if="suggestion !== null">
          <div v-if="noChanges" class="cross-diff cross-diff__empty">
            Geen wijzigingen — het huidige antwoord dekt de informatie al.
          </div>
          <div v-else class="cross-diff" aria-label="Voorgestelde invulling">
            <span
              v-for="(part, i) in diffParts"
              :key="i"
              :class="part.added ? 'cross-diff__add' : part.removed ? 'cross-diff__del' : ''"
            >{{ part.value }}</span>
          </div>

          <div class="cross-suggestion__actions rvo-layout-row rvo-layout-gap--xs">
            <button
              type="button"
              class="rvo-button rvo-button--primary rvo-button--size-sm"
              @click="acceptSuggestion"
            >
              Overnemen
            </button>
            <button
              type="button"
              class="rvo-button rvo-button--secondary rvo-button--size-sm"
              @click="rejectSuggestion"
            >
              Afwijzen
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Action buttons (only for text-type questions, hidden while streaming) -->
    <div v-if="isTextType && suggestion === null && !streamingText" class="cross-suggestion__actions rvo-layout-row rvo-layout-gap--xs">
      <button
        type="button"
        class="rvo-button rvo-button--secondary rvo-button--size-sm"
        @click="useDirectly"
      >
        Gebruik direct
      </button>
      <button
        type="button"
        class="rvo-button rvo-button--primary rvo-button--size-sm"
        :disabled="isLoading"
        @click="requestSynthesis"
      >
        <span v-if="isLoading">Bezig…</span>
        <span v-else>✦ AI-suggestie</span>
      </button>
    </div>

    <span v-if="error" class="cross-suggestion__error rvo-text rvo-text--sm" role="alert">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { diffWords } from 'diff'
import type { Change } from 'diff'
import type { CrossFormMapping } from '../models/Assessment'
import { useAssessmentStore } from '../stores/assessmentStore'
import { getCachedForm } from '../services/formLoader'
import { synthesizeStream } from '../services/llmService'
import { answerPlainText } from '../utils/sourceMatching'

const props = defineProps<{
  mapping: CrossFormMapping
  targetQuestionText: string
  questionType: string
  currentValue: string
}>()

const emit = defineEmits<{
  'apply-suggestion': [value: string]
}>()

const store = useAssessmentStore()

function findSourceQuestionText(sourceFormId: string, questionId: string): string {
  const form = getCachedForm(sourceFormId)
  if (!form) return questionId
  for (const section of form.sections) {
    for (const sub of section.subsections) {
      for (const q of sub.questions) {
        if (q.id === questionId) return q.text
      }
    }
  }
  return questionId
}

const sourceContext = computed(() => {
  const { sourceFormId, sourceQuestionIds } = props.mapping
  return sourceQuestionIds
    .map((id) => {
      const raw = store.forms[sourceFormId]?.answers[id]
      // Source answers may be Tiptap HTML; flatten to plain text before they
      // land in the synthesize prompt or the "gebruik direct" value.
      const answer =
        typeof raw === 'string'
          ? answerPlainText(raw.replace('\n---\n', ': '))
          : Array.isArray(raw)
            ? raw.join(', ')
            : ''
      return { id, questionText: findSourceQuestionText(sourceFormId, id), answer }
    })
    .filter((item) => item.answer.trim().length > 0)
})

const sourceLabel = computed(() => props.mapping.sourceFormId.toUpperCase())
const isTextType = computed(() => props.questionType === 'text')

function useDirectly() {
  const combined = sourceContext.value
    .map((item) => (sourceContext.value.length > 1 ? `${item.questionText}:\n${item.answer}` : item.answer))
    .join('\n\n')
  emit('apply-suggestion', combined)
}

const suggestion = ref<string | null>(null)
const rationale = ref('')
const isLoading = ref(false)
const error = ref('')
const streamingRaw = ref('')

const streamingText = computed((): string => {
  if (!streamingRaw.value) return ''
  const afterOpen = streamingRaw.value.match(/<suggestie>([\s\S]*)/i)
  if (!afterOpen) return ''
  const content = afterOpen[1]
  const beforeClose = content.match(/([\s\S]*?)<\/suggestie>/i)
  return (beforeClose ? beforeClose[1] : content).trim()
})

const diffParts = computed((): Change[] => {
  if (suggestion.value === null) return []
  return diffWords(answerPlainText(props.currentValue), suggestion.value)
})

const noChanges = computed(
  () => suggestion.value !== null && suggestion.value === answerPlainText(props.currentValue),
)

async function requestSynthesis() {
  const mapping = props.mapping
  if (sourceContext.value.length === 0) return

  error.value = ''
  isLoading.value = true
  suggestion.value = null
  streamingRaw.value = ''
  rationale.value = ''

  const sourceAnswers: Record<string, string> = {}
  const sourceQuestions: Record<string, string> = {}

  for (const item of sourceContext.value) {
    sourceAnswers[item.id] = item.answer
    sourceQuestions[item.id] = item.questionText
  }

  await synthesizeStream(
    {
      sourceAnswers,
      sourceQuestions,
      targetQuestion: props.targetQuestionText,
      synthesisHint: mapping.synthesisHint,
    },
    (chunk) => {
      streamingRaw.value += chunk
    },
    (result) => {
      suggestion.value = result.suggestion
      rationale.value = result.rationale
      streamingRaw.value = ''
      isLoading.value = false
    },
    (errMsg) => {
      error.value = errMsg
      streamingRaw.value = ''
      isLoading.value = false
    },
  )
}

function acceptSuggestion() {
  if (suggestion.value === null) return
  emit('apply-suggestion', suggestion.value)
  suggestion.value = null
  rationale.value = ''
}

function rejectSuggestion() {
  suggestion.value = null
  rationale.value = ''
  error.value = ''
}
</script>

<style scoped>
.cross-suggestion {
  margin-block-start: var(--rvo-space-sm);
  border: 1px solid var(--rvo-color-hemelblauw-300);
  border-radius: var(--rvo-border-radius-md);
  background: var(--rvo-color-hemelblauw-150);
  padding: var(--rvo-space-sm) var(--rvo-space-md);
  font-size: var(--rvo-font-size-sm);
}

.cross-suggestion__header {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-xs);
  margin-block-end: var(--rvo-space-xs);
}

.cross-suggestion__label {
  font-weight: var(--rvo-font-weight-semibold);
  color: var(--rvo-color-lintblauw);
  font-size: var(--rvo-font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cross-suggestion__block {
  background: var(--rvo-color-wit);
  border: 1px solid var(--rvo-color-hemelblauw-300);
  border-radius: var(--rvo-border-radius-sm);
  padding: var(--rvo-space-xs) var(--rvo-space-sm);
  margin-block-end: var(--rvo-space-xs);
}

.cross-suggestion__question {
  font-size: var(--rvo-font-size-xs);
  color: var(--invulhulp-color-text-muted);
  font-weight: var(--rvo-font-weight-semibold);
  margin-block-end: var(--rvo-space-3xs);
}

.cross-suggestion__answer {
  color: var(--rvo-color-grijs-800);
  white-space: pre-wrap;
  word-break: break-word;
  max-block-size: 100px;
  overflow-y: auto;
}

.cross-suggestion__actions {
  margin-block-start: var(--rvo-space-xs);
  align-items: center;
  flex-wrap: wrap;
}

.cross-suggestion__panel {
  margin-block: var(--rvo-space-xs) var(--rvo-space-xs);
}

.cross-suggestion__panel-header {
  display: flex;
  align-items: baseline;
  gap: var(--rvo-space-xs);
  margin-block-end: var(--rvo-space-xs);
  flex-wrap: wrap;
}

.cross-suggestion__panel-label {
  font-weight: var(--rvo-font-weight-bold);
  font-size: var(--rvo-font-size-xs);
  color: var(--rvo-color-groen-750);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cross-suggestion__rationale {
  font-size: var(--rvo-font-size-xs);
  color: var(--rvo-color-groen-600);
  font-style: italic;
}

.cross-suggestion__error {
  color: var(--rvo-color-rood);
  margin-block-start: var(--rvo-space-2xs);
  display: block;
}

.cross-diff {
  font-size: var(--rvo-font-size-sm);
  line-height: var(--rvo-line-height-md);
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--rvo-color-wit);
  border-radius: var(--rvo-border-radius-sm);
  padding: var(--rvo-space-2xs) var(--rvo-space-xs);
  margin-block-end: var(--rvo-space-xs);
}

.cross-diff__empty {
  color: var(--invulhulp-color-text-subtle);
  font-style: italic;
}

.cross-diff__cursor {
  display: inline-block;
  margin-inline-start: 2px;
  color: var(--rvo-color-grijs-500);
  animation: invulhulp-blink 1s steps(2, start) infinite;
}

.cross-diff__add {
  background: var(--rvo-color-groen-150);
  color: var(--rvo-color-groen-750);
}

.cross-diff__del {
  background: var(--rvo-color-rood-150);
  color: var(--rvo-color-rood-750);
  text-decoration: line-through;
}
</style>
