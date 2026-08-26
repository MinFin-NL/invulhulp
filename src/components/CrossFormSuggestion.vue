<template>
  <div v-if="sourceContext.length > 0" class="cross-suggestion">
    <div class="cross-suggestion__header">
      <span class="cross-suggestion__label">
        {{ alreadyCopied ? `Overgenomen uit ${sourceLabel}` : `Beschikbaar uit ${sourceLabel}` }}
      </span>
      <span v-if="isCopy && canCopy" class="cross-suggestion__note">
        Dezelfde vraag als in {{ sourceLabel }} — het antwoord wordt letterlijk overgenomen.
      </span>
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
        <nldd-banner
          variant="success"
          size="sm"
          class="cross-suggestion__panel"
          v-if="streamingText || suggestion !== null"
          :aria-busy="isLoading"
        >
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
            <nldd-button
              variant="primary"
              size="sm"
              text="Overnemen"
              @click="acceptSuggestion"
            />
            <nldd-button
              variant="secondary"
              size="sm"
              text="Afwijzen"
              @click="rejectSuggestion"
            />
          </div>
        </template>
    </nldd-banner>

    <!-- Action buttons (hidden while streaming). "Gebruik direct" works for
         every question type that has a copyable value; AI synthesis is only
         offered for free-text questions that need rewriting. -->
    <div
      v-if="(canCopy || canSynthesize) && suggestion === null && !streamingText"
      class="cross-suggestion__actions rvo-layout-row rvo-layout-gap--xs"
    >
      <nldd-button
        variant="secondary"
        size="sm"
        :text="alreadyCopied ? 'Opnieuw overnemen' : 'Gebruik direct'"
        v-if="canCopy"
        @click="useDirectly"
      />
      <nldd-button
        variant="primary"
        size="sm"
        v-if="canSynthesize"
        :disabled="isLoading"
        @click="requestSynthesis"
      >
        <span slot="text">
<span v-if="isLoading">Bezig…</span>
        <span v-else>✦ AI-suggestie</span>
        </span>
      </nldd-button>
    </div>

    <span v-if="error" class="cross-suggestion__error rvo-text rvo-text--sm" role="alert">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { diffWords } from 'diff'
import type { Change } from 'diff'
import type { CrossFormMapping, FormConfig, Question } from '../models/Assessment'
import { useAssessmentStore } from '../stores/assessmentStore'
import { getCachedForm, flattenFormQuestions } from '../services/formLoader'
import { synthesizeStream } from '../services/llmService'
import { answerPlainText } from '../utils/sourceMatching'
import { copyValueFor, sourceAnswerText } from '../utils/crossFormCopy'

const props = defineProps<{
  mapping: CrossFormMapping
  question: Question
  targetQuestionText: string
  /** Options as rendered, so an `optionsFrom` list is honoured on copy too. */
  resolvedOptions: string[]
  currentValue: string | string[]
}>()

const emit = defineEmits<{
  'apply-suggestion': [value: string | string[]]
}>()

const store = useAssessmentStore()

function findSourceQuestion(form: FormConfig | undefined, questionId: string): Question | undefined {
  return form ? flattenFormQuestions(form).find((q) => q.id === questionId) : undefined
}

function findSourceQuestionText(sourceFormId: string, questionId: string): string {
  return findSourceQuestion(getCachedForm(sourceFormId), questionId)?.text ?? questionId
}

const sourceContext = computed(() => {
  const { sourceFormId, sourceQuestionIds } = props.mapping
  const sourceForm = getCachedForm(sourceFormId)
  return sourceQuestionIds
    .map((id) => {
      const raw = store.forms[sourceFormId]?.answers[id]
      // Source answers may be Tiptap HTML or a table's JSON; flatten to plain
      // text before they land in the synthesize prompt or the panel.
      const answer = raw === undefined ? '' : sourceAnswerText(raw, findSourceQuestion(sourceForm, id))
      return { id, questionText: findSourceQuestionText(sourceFormId, id), answer }
    })
    .filter((item) => item.answer.trim().length > 0)
})

const sourceLabel = computed(() => props.mapping.sourceFormId.toUpperCase())
const isTextType = computed(() => props.question.type === 'text')
const isCopy = computed(() => props.mapping.mode === 'copy')

/** The exact value this mapping would write into the target question. Null when
 *  the source answer doesn't fit the target's shape (unknown option, other
 *  table columns) — then no copy is offered at all. */
const copyValue = computed(() =>
  copyValueFor(
    props.mapping,
    props.question,
    (formId, questionId) => store.forms[formId]?.answers[questionId],
    getCachedForm(props.mapping.sourceFormId),
    props.resolvedOptions,
  ),
)

const canCopy = computed(() => copyValue.value !== null)
// An identical question needs no rewriting, so copy mappings skip the LLM.
const canSynthesize = computed(() => isTextType.value && !isCopy.value)

/** True once the target already holds exactly what the copy would write. */
const alreadyCopied = computed(() => {
  const value = copyValue.value
  if (value === null) return false
  if (Array.isArray(value) || Array.isArray(props.currentValue)) {
    return JSON.stringify(value) === JSON.stringify(props.currentValue)
  }
  return answerPlainText(value) === answerPlainText(props.currentValue)
})

function useDirectly() {
  if (copyValue.value !== null) emit('apply-suggestion', copyValue.value)
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
  margin-block-start: var(--primitives-space-12);
  border: 1px solid var(--semantics-categories-accent-tinted-highlight-border-color);
  border-radius: var(--primitives-corner-radius-md);
  background: var(--semantics-categories-accent-tinted-background-color);
  padding: var(--primitives-space-12) var(--primitives-space-16);
  font-size: var(--primitives-font-size-90);
}

.cross-suggestion__header {
  display: flex;
  align-items: baseline;
  gap: var(--primitives-space-8);
  margin-block-end: var(--primitives-space-8);
  flex-wrap: wrap;
}

.cross-suggestion__note {
  font-size: var(--primitives-font-size-80);
  color: var(--invulhulp-color-text-muted);
}

.cross-suggestion__label {
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: var(--semantics-content-accent-color);
  font-size: var(--primitives-font-size-80);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cross-suggestion__block {
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-categories-accent-tinted-highlight-border-color);
  border-radius: var(--primitives-corner-radius-sm);
  padding: var(--primitives-space-8) var(--primitives-space-12);
  margin-block-end: var(--primitives-space-8);
}

.cross-suggestion__question {
  font-size: var(--primitives-font-size-80);
  color: var(--invulhulp-color-text-muted);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  margin-block-end: var(--primitives-space-2);
}

.cross-suggestion__answer {
  color: var(--semantics-content-color);
  white-space: pre-wrap;
  word-break: break-word;
  max-block-size: 100px;
  overflow-y: auto;
}

.cross-suggestion__actions {
  margin-block-start: var(--primitives-space-8);
  align-items: center;
  flex-wrap: wrap;
}

.cross-suggestion__panel {
  margin-block: var(--primitives-space-8) var(--primitives-space-8);
}

.cross-suggestion__panel-header {
  display: flex;
  align-items: baseline;
  gap: var(--primitives-space-8);
  margin-block-end: var(--primitives-space-8);
  flex-wrap: wrap;
}

.cross-suggestion__panel-label {
  font-weight: var(--primitives-font-weight-body-bold);
  font-size: var(--primitives-font-size-80);
  color: var(--semantics-categories-success-tinted-content-color);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cross-suggestion__rationale {
  font-size: var(--primitives-font-size-80);
  color: var(--semantics-categories-success-tinted-content-color);
  font-style: italic;
}

.cross-suggestion__error {
  color: var(--semantics-content-critical-color);
  margin-block-start: var(--primitives-space-4);
  display: block;
}

.cross-diff {
  font-size: var(--primitives-font-size-90);
  line-height: var(--primitives-line-height-snug);
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--semantics-surfaces-base-background-color);
  border-radius: var(--primitives-corner-radius-sm);
  padding: var(--primitives-space-4) var(--primitives-space-8);
  margin-block-end: var(--primitives-space-8);
}

.cross-diff__empty {
  color: var(--invulhulp-color-text-subtle);
  font-style: italic;
}

.cross-diff__cursor {
  display: inline-block;
  margin-inline-start: 2px;
  color: var(--semantics-content-secondary-color);
  animation: invulhulp-blink var(--invulhulp-loop-blink) steps(2, start) infinite;
}

.cross-diff__add {
  background: var(--semantics-categories-success-tinted-background-color);
  color: var(--semantics-categories-success-tinted-content-color);
}

.cross-diff__del {
  background: var(--semantics-categories-critical-tinted-background-color);
  color: var(--semantics-categories-critical-tinted-content-color);
  text-decoration: line-through;
}
</style>
