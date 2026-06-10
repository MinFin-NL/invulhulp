<template>
  <div class="invulhulp-question" :class="`invulhulp-question--${question.importance}`">
    <!-- Text question: regular label/control pair via rvo-form-field -->
    <template v-if="question.type === 'text'">
      <div class="rvo-form-field">
        <label :for="question.id" class="rvo-form-field__label">
          <span class="invulhulp-question__label-text">{{ question.text }}</span>
          <span v-if="question.importance === 'mandatory'" class="invulhulp-question__required" aria-hidden="true">*</span>
          <span v-else class="invulhulp-question__optional">(aanvullend)</span>
        </label>
        <p v-if="question.guidance" class="rvo-text rvo-text--sm invulhulp-question__guidance">
          {{ question.guidance }}
        </p>
        <TiptapEditor
          :id="question.id"
          v-model="textModel"
          :question-context="question.text"
          :aria-required="question.importance === 'mandatory' ? 'true' : undefined"
        />
      </div>
    </template>

    <!-- Radio question: fieldset/legend semantics + native inputs -->
    <fieldset v-else-if="question.type === 'radio'" class="rvo-form-fieldset invulhulp-question__fieldset">
      <legend class="rvo-form-fieldset__legend">
        <span class="invulhulp-question__label-text">{{ question.text }}</span>
        <span v-if="question.importance === 'mandatory'" class="invulhulp-question__required" aria-hidden="true">*</span>
        <span v-else class="invulhulp-question__optional">(aanvullend)</span>
      </legend>
      <p v-if="question.guidance" class="rvo-text rvo-text--sm invulhulp-question__guidance">
        {{ question.guidance }}
      </p>
      <div class="rvo-radio-button__group">
        <label
          v-for="option in question.options"
          :key="option"
          class="rvo-radio-button"
        >
          <input
            type="radio"
            class="rvo-radio-button__input"
            :name="question.id"
            :value="option"
            :checked="radioValue === option"
            :aria-required="question.importance === 'mandatory' ? 'true' : undefined"
            @change="onRadioSelect(option)"
          />
          <span class="rvo-radio-button__label">{{ option }}</span>
        </label>
      </div>

      <!-- Follow-up text for radio answers also gets Tiptap + LLM -->
      <TiptapEditor
        v-if="question.followUp && radioValue"
        class="invulhulp-question__followup"
        v-model="followUpModel"
        :placeholder="question.followUp"
        :question-context="question.followUp"
      />
    </fieldset>

    <!-- Checkbox question: fieldset/legend semantics + native inputs -->
    <fieldset v-else-if="question.type === 'checkbox'" class="rvo-form-fieldset invulhulp-question__fieldset">
      <legend class="rvo-form-fieldset__legend">
        <span class="invulhulp-question__label-text">{{ question.text }}</span>
        <span v-if="question.importance === 'mandatory'" class="invulhulp-question__required" aria-hidden="true">*</span>
        <span v-else class="invulhulp-question__optional">(aanvullend)</span>
      </legend>
      <p v-if="question.guidance" class="rvo-text rvo-text--sm invulhulp-question__guidance">
        {{ question.guidance }}
      </p>
      <div class="rvo-checkbox__group">
        <label
          v-for="option in question.options"
          :key="option"
          class="rvo-checkbox"
        >
          <input
            type="checkbox"
            class="rvo-checkbox__input"
            :name="question.id"
            :value="option"
            :checked="checkboxValues.includes(option)"
            @change="onCheckboxToggle(option)"
          />
          <span class="rvo-checkbox__label">{{ option }}</span>
        </label>
      </div>
    </fieldset>

    <!-- Persisted citations for AI-extracted answers (AI Mode / accepted suggestions) -->
    <SourcePanel
      v-if="sourceMeta"
      :sources="sourceMeta.sources"
      :answer-text="persistedAnswerText"
      :grounded="sourceMeta.grounded"
      @show-document="showSourceDocument"
      @dismiss-warning="store.dismissSourceWarning(question.id)"
    />
    <DocumentViewerModal v-if="sourceMeta" ref="docViewer" />

    <!-- One suggestion panel per source form that has a mapping for this question -->
    <CrossFormSuggestion
      v-for="mapping in matchingMappings"
      :key="`${mapping.sourceFormId}-${mapping.targetQuestionId}`"
      :mapping="mapping"
      :target-question-text="question.text"
      :question-type="question.type"
      :current-value="textModel"
      @apply-suggestion="onApplySuggestion"
    />

    <!-- Document extraction panel (only when user has uploaded documents) -->
    <DocumentSuggestion
      v-if="store.documents.length > 0"
      :target-question-text="question.text"
      :question-type="question.type"
      :question-options="question.options"
      :current-value="currentValueAsString"
      @apply-suggestion="onApplySuggestion"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AnswerSource, AnswerSourceMeta, Question } from '../models/Assessment'
import TiptapEditor from './TiptapEditor.vue'
import CrossFormSuggestion from './CrossFormSuggestion.vue'
import DocumentSuggestion from './DocumentSuggestion.vue'
import SourcePanel from './SourcePanel.vue'
import DocumentViewerModal from './DocumentViewerModal.vue'
import { useCrossFormMappings } from '../composables/useCrossFormMappings'
import { useAssessmentStore } from '../stores/assessmentStore'
import { answerPlainText } from '../utils/sourceMatching'

const props = defineProps<{
  question: Question
  modelValue: string | string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | string[]]
}>()

const store = useAssessmentStore()
const mappings = useCrossFormMappings()

const matchingMappings = computed(() =>
  mappings.value.filter(
    (m) => m.targetFormId === store.activeFormId && m.targetQuestionId === props.question.id,
  ),
)

const sourceMeta = computed(() => store.answerSourcesFor(props.question.id))
const persistedAnswerText = computed(() => answerPlainText(props.modelValue))
const docViewer = ref<InstanceType<typeof DocumentViewerModal> | null>(null)

function showSourceDocument(source: AnswerSource) {
  docViewer.value?.open(source, persistedAnswerText.value)
}

const textModel = computed({
  get() {
    return typeof props.modelValue === 'string' ? props.modelValue : ''
  },
  set(val: string) {
    emit('update:modelValue', val)
    store.dismissSourceWarning(props.question.id)
  },
})

const currentValueAsString = computed(() => {
  if (Array.isArray(props.modelValue)) return props.modelValue.join(', ')
  return props.modelValue ?? ''
})

const radioValue = computed(() => {
  if (typeof props.modelValue === 'string') {
    return props.modelValue.split('\n---\n')[0] ?? ''
  }
  return ''
})

const followUpModel = computed({
  get() {
    if (typeof props.modelValue === 'string') {
      return props.modelValue.split('\n---\n')[1] ?? ''
    }
    return ''
  },
  set(val: string) {
    emit('update:modelValue', `${radioValue.value}\n---\n${val}`)
  },
})

function onRadioSelect(option: string) {
  const current = typeof props.modelValue === 'string' ? props.modelValue : ''
  const followUp = current.split('\n---\n')[1] ?? ''
  emit('update:modelValue', followUp ? `${option}\n---\n${followUp}` : option)
  store.dismissSourceWarning(props.question.id)
}

function onApplySuggestion(value: string, meta?: AnswerSourceMeta) {
  emit('update:modelValue', value)
  if (meta) store.setAnswerSources(props.question.id, meta)
}

const checkboxValues = computed(() =>
  Array.isArray(props.modelValue) ? props.modelValue : [],
)

function onCheckboxToggle(option: string) {
  const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
  const idx = current.indexOf(option)
  if (idx === -1) current.push(option)
  else current.splice(idx, 1)
  emit('update:modelValue', current)
  store.dismissSourceWarning(props.question.id)
}
</script>

<style scoped>
.invulhulp-question {
  margin-block-end: var(--rvo-space-lg);
  padding: var(--rvo-space-md) var(--rvo-space-lg);
  background: var(--rvo-color-wit);
  border: 1px solid var(--invulhulp-color-border);
  border-inline-start: 4px solid transparent;
  border-radius: var(--rvo-border-radius-md);
  box-shadow: 0 1px 2px rgb(21 66 115 / 0.04);
}
.invulhulp-question--mandatory {
  border-inline-start-color: var(--invulhulp-color-mandatory);
}
.invulhulp-question--optional {
  border-inline-start-color: var(--invulhulp-color-optional);
}

/* Strip the fieldset's default grey background + padding so radio/checkbox
   groups blend seamlessly into the white question card, matching open
   questions. */
.invulhulp-question__fieldset {
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  min-inline-size: 0;
}

.invulhulp-question__fieldset :deep(.rvo-form-fieldset__legend) {
  padding: 0;
  margin: 0 0 var(--rvo-space-2xs);
}

/* Open-question label inherits the rvo-form-field__label box; force the
   same typographic weight + size as the fieldset legend so both question
   types render with identical headings. */
.invulhulp-question .rvo-form-field__label,
.invulhulp-question :deep(.rvo-form-fieldset__legend) {
  font-size: var(--rvo-font-size-lg);
  font-weight: var(--rvo-font-weight-bold);
  line-height: var(--rvo-line-height-md);
}

.invulhulp-question__label-text {
  /* The wrapper inherits the size/weight from its parent (label or legend),
     so the text + asterisk render identically in both question types. */
  font-weight: inherit;
}

.invulhulp-question__required {
  color: var(--rvo-color-rood);
  margin-inline-start: 2px;
  font-weight: inherit;
}

.invulhulp-question__optional {
  font-size: var(--rvo-font-size-xs);
  color: var(--invulhulp-color-optional);
  margin-inline-start: var(--rvo-space-2xs);
  font-weight: var(--rvo-font-weight-normal);
}

.invulhulp-question__guidance {
  color: var(--invulhulp-color-text-subtle);
  margin: 0 0 var(--rvo-space-xs);
}

.invulhulp-question__followup {
  margin-block-start: var(--rvo-space-xs);
}
</style>
