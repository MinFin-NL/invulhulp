<template>
  <div class="invulhulp-question" :class="`invulhulp-question--${question.importance}`">
    <!-- Text question: label/control pair around the rich-text editor. Tiptap
         is not an NLDD input, so it is not slotted into nldd-form-field; the
         label keeps its own for/id wiring to the editor. -->
    <template v-if="question.type === 'text'">
      <div class="invulhulp-question__field">
        <label :for="question.id" class="invulhulp-question__legend">
          <span class="invulhulp-question__label-text">{{ question.text }}</span>
          <span v-if="question.importance === 'mandatory'" class="invulhulp-question__required">(verplicht)</span>
          <span v-else class="invulhulp-question__optional">(aanvullend)</span>
        </label>
        <p v-if="question.guidance" class="invulhulp-question__guidance">
          {{ question.guidance }}
        </p>
        <TiptapEditor
          :id="question.id"
          :key="`${question.id}:${collabProvider ? 'live' : 'local'}`"
          v-model="textModel"
          :fragment="collabFragment"
          :provider="collabProvider"
          :user="collabUser"
          :question-context="question.text"
          :ai-busy-label="aiBusyLabel"
          :aria-required="question.importance === 'mandatory' ? 'true' : undefined"
        />
      </div>
    </template>

    <!-- Radio question. nldd-radio-button-group owns the roving focus and the
         group semantics, so the legend is a plain element it points at with
         accessible-labeled-by rather than a <fieldset>/<legend> pair. -->
    <div v-else-if="question.type === 'radio'" class="invulhulp-question__fieldset">
      <p :id="`${question.id}-label`" class="invulhulp-question__legend">
        <span class="invulhulp-question__label-text">{{ question.text }}</span>
        <span v-if="question.importance === 'mandatory'" class="invulhulp-question__required">(verplicht)</span>
        <span v-else class="invulhulp-question__optional">(aanvullend)</span>
      </p>
      <p v-if="question.guidance" class="invulhulp-question__guidance">
        {{ question.guidance }}
      </p>
      <nldd-radio-button-group
        :name="question.id"
        :disabled="store.readOnly"
        :required="question.importance === 'mandatory'"
        :accessible-labeled-by="`${question.id}-label`"
        @change="onRadioSelect($event.detail.value)"
      >
        <nldd-radio-button-field
          v-for="option in resolvedOptions"
          :key="option"
          :label="option"
          :value="option"
          :checked="radioValue === option"
        />
      </nldd-radio-button-group>

      <!-- Follow-up text for radio answers also gets Tiptap + LLM -->
      <TiptapEditor
        v-if="question.followUp && radioValue"
        class="invulhulp-question__followup"
        v-model="followUpModel"
        :placeholder="question.followUp"
        :question-context="question.followUp"
      />
    </div>

    <!-- Checkbox question. The design system has no checkbox *group*, so the
         grouping stays a real fieldset/legend — the semantics have to come
         from somewhere. -->
    <fieldset v-else-if="question.type === 'checkbox'" class="invulhulp-question__fieldset">
      <legend class="invulhulp-question__legend">
        <span class="invulhulp-question__label-text">{{ question.text }}</span>
        <span v-if="question.importance === 'mandatory'" class="invulhulp-question__required">(verplicht)</span>
        <span v-else class="invulhulp-question__optional">(aanvullend)</span>
      </legend>
      <p v-if="question.guidance" class="invulhulp-question__guidance">
        {{ question.guidance }}
      </p>
      <div class="invulhulp-question__options">
        <nldd-checkbox-field
          v-for="option in resolvedOptions"
          :key="option"
          :label="option"
          :name="question.id"
          :value="option"
          :checked="checkboxValues.includes(option)"
          :disabled="store.readOnly"
          @change="onCheckboxToggle(option)"
        />
      </div>
    </fieldset>

    <!-- Table question: fixed columns from the form JSON, user edits rows -->
    <fieldset v-else-if="question.type === 'table'" class="invulhulp-question__fieldset">
      <legend class="invulhulp-question__legend">
        <span class="invulhulp-question__label-text">{{ question.text }}</span>
        <span v-if="question.importance === 'mandatory'" class="invulhulp-question__required">(verplicht)</span>
        <span v-else class="invulhulp-question__optional">(aanvullend)</span>
      </legend>
      <p v-if="question.guidance" class="invulhulp-question__guidance">
        {{ question.guidance }}
      </p>
      <TableQuestion :question="question" v-model="tableModel" />
    </fieldset>

    <!-- Image attachments (opt-in per question via the form JSON); embedded
         in PDF/Word exports -->
    <QuestionAttachments v-if="question.allowAttachments" :question-id="question.id" />

    <!-- AI Mode looked at this question but couldn't find an answer -->
    <p v-if="showAiUnanswered" class="invulhulp-question__ai-empty" role="note">
      <span class="invulhulp-question__ai-empty-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15">
          <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5a1.25 1.25 0 1 1 0 2.5A1.25 1.25 0 0 1 12 7Zm1.25 10h-2.5v-6h2.5Z"/>
        </svg>
      </span>
      AI vond hier geen antwoord — vul deze vraag zelf in.
    </p>

    <!-- Smoothing rewrote this answer to remove repetition; offer the original back -->
    <p v-if="showAiSmoothed" class="invulhulp-question__ai-smoothed" role="note">
      <span class="invulhulp-question__ai-smoothed-text">
        Gladgestreken door AI Modus — herhaling uit andere antwoorden is geschrapt.
      </span>
      <nldd-button
        variant="neutral-transparent"
        size="sm"
        text="Herstel origineel"
        v-if="store.canEdit"
        @click="restoreBeforeSmoothing"
      />
    </p>

    <!-- Persisted citations for AI-extracted answers (AI Mode / accepted suggestions) -->
    <SourcePanel
      v-if="sourceMeta"
      :sources="sourceMeta.sources"
      :answer-text="persistedAnswerText"
      :grounded="sourceMeta.grounded"
      :smoothed="sourceMeta.smoothedAt !== undefined"
      @show-document="showSourceDocument"
      @dismiss-warning="store.dismissSourceWarning(question.id)"
    />
    <DocumentViewerModal v-if="sourceMeta" ref="docViewer" />

    <!-- One suggestion panel per mapping for this question. A target question
         can have several mappings from the SAME source form (different angles
         on it), so the source questions belong in the key — without them the
         panels collide and Vue reuses one for the other. -->
    <CrossFormSuggestion
      v-for="mapping in store.readOnly ? [] : matchingMappings"
      :key="`${mapping.sourceFormId}-${mapping.targetQuestionId}-${mapping.sourceQuestionIds.join(',')}`"
      :mapping="mapping"
      :question="question"
      :target-question-text="question.text"
      :resolved-options="resolvedOptions"
      :current-value="modelValue"
      @apply-suggestion="onApplySuggestion"
    />

    <!-- Document extraction panel (only when user has uploaded documents) -->
    <DocumentSuggestion
      v-if="store.canEdit && store.documents.length > 0"
      :target-question-text="question.text"
      :question-type="question.type"
      :question-options="question.options"
      :question-columns="question.columns"
      :current-value="currentValueAsString"
      @apply-suggestion="onApplySuggestion"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AnswerSource, AnswerSourceMeta, Question } from '../models/Assessment'
import TiptapEditor from './TiptapEditor.vue'
import TableQuestion from './TableQuestion.vue'
import QuestionAttachments from './QuestionAttachments.vue'
import CrossFormSuggestion from './CrossFormSuggestion.vue'
import DocumentSuggestion from './DocumentSuggestion.vue'
import SourcePanel from './SourcePanel.vue'
import DocumentViewerModal from './DocumentViewerModal.vue'
import { useCrossFormMappings } from '../composables/useCrossFormMappings'
import { useAiMode } from '../composables/useAiMode'
import { useAssessmentStore } from '../stores/assessmentStore'
import { answerPlainText } from '../utils/sourceMatching'
import { mergedOptions, radioScalar } from '../utils/answerRefs'
import { getCachedForm } from '../services/formLoader'
import { useCollab } from '../collab/useCollab'
import { useAiBusy } from '../collab/useAiBusy'

const props = defineProps<{
  question: Question
  modelValue: string | string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | string[]]
}>()

const store = useAssessmentStore()
const mappings = useCrossFormMappings()

// Collaborative binding for the main rich-text answer (text questions only).
const collabQuestionId = computed(() => (props.question.type === 'text' ? props.question.id : ''))
const { fragment: collabFragment, provider: collabProvider, user: collabUser } = useCollab(collabQuestionId)
// "AI is aan het nadenken…" for this field — shared over awareness, so a
// collaborator's run shows here too.
const { label: aiBusyLabel } = useAiBusy(computed(() => props.question.id))
const { isAiUnanswered, clearAiUnanswered, isAiSmoothed, clearAiSmoothed, undoSmoothingFor } = useAiMode()

// True while AI Mode flagged this question as unanswerable and the user hasn't
// filled it in yet.
const showAiUnanswered = computed(() => {
  const formId = store.activeFormId
  if (!formId || !isAiUnanswered(formId, props.question.id)) return false
  return answerPlainText(props.modelValue).trim() === ''
})

function clearUnanswered() {
  const formId = store.activeFormId
  if (formId) clearAiUnanswered(formId, props.question.id)
}

// True while the smoothing pass's rewrite of this answer still stands.
const showAiSmoothed = computed(() => {
  const formId = store.activeFormId
  return !!formId && isAiSmoothed(formId, props.question.id)
})

function restoreBeforeSmoothing() {
  const formId = store.activeFormId
  if (formId) undoSmoothingFor(formId, props.question.id)
}

/** The user edited a smoothed answer: the snapshot no longer describes it.
 *  A no-op while the value still equals what smoothing wrote — the editor
 *  echoes that back through v-model when the store write lands. */
function clearSmoothed(value: string) {
  const formId = store.activeFormId
  if (formId) clearAiSmoothed(formId, props.question.id, value)
}

// Table questions can't be filled by the synthesize flow (it produces free
// text, not grid rows), so only copy mappings — which move the grid over
// as-is, columns permitting — are offered for them.
const matchingMappings = computed(() =>
  mappings.value.filter(
    (m) =>
      m.targetFormId === store.activeFormId &&
      m.targetQuestionId === props.question.id &&
      (props.question.type !== 'table' || m.mode === 'copy'),
  ),
)

// Radio/checkbox options, including any live values pulled via `optionsFrom`.
const resolvedOptions = computed(() =>
  mergedOptions(
    props.question.options,
    props.question.optionsFrom,
    store.getAnswer,
    store.activeFormId ? getCachedForm(store.activeFormId) : undefined,
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
    clearUnanswered()
    clearSmoothed(val)
  },
})

// Same contract as textModel: table answers are one serialized JSON string.
const tableModel = computed({
  get() {
    return typeof props.modelValue === 'string' ? props.modelValue : ''
  },
  set(val: string) {
    emit('update:modelValue', val)
    store.dismissSourceWarning(props.question.id)
    clearUnanswered()
  },
})

const currentValueAsString = computed(() => {
  if (Array.isArray(props.modelValue)) return props.modelValue.join(', ')
  return props.modelValue ?? ''
})

// Shared with isQuestionVisible, so the checked option and the questions a
// visibleIf reveals can never disagree — including for answers stored before
// radio values were kept out of the rich-text bucket.
const radioValue = computed(() => radioScalar(props.modelValue))

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
  clearUnanswered()
}

function onApplySuggestion(value: string | string[], meta?: AnswerSourceMeta) {
  emit('update:modelValue', value)
  if (meta) store.setAnswerSources(props.question.id, meta)
  clearUnanswered()
  if (typeof value === 'string') clearSmoothed(value)
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
  clearUnanswered()
}
</script>

<style scoped>
.invulhulp-question {
  margin-block-end: var(--primitives-space-24);
  padding: var(--primitives-space-16) var(--primitives-space-24);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--invulhulp-color-border);
  border-inline-start: 4px solid transparent;
  border-radius: var(--primitives-corner-radius-md);
  box-shadow: 0 1px 2px rgb(21 66 115 / 0.04);
}
.invulhulp-question--mandatory {
  border-inline-start-color: var(--invulhulp-color-mandatory);
}
.invulhulp-question--optional {
  border-inline-start-color: var(--invulhulp-color-optional);
}

/* The radio and checkbox controls are nldd-* custom elements: they draw
   themselves inside a shadow root, so all the old control-level overrides
   (the hand-drawn radio dot, the vinkje mask for the checkmark) are gone.
   What is left here is only the layout around them. */
.invulhulp-question__fieldset {
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  min-inline-size: 0;
}

.invulhulp-question__options {
  display: flex;
  flex-direction: column;
  gap: var(--semantics-forms-gap-tight, var(--primitives-space-8));
}

/* One heading style for all four question types — the <label> of an open
   question, the <legend> of a checkbox/table fieldset, and the labelling
   paragraph a radio group points at with accessible-labeled-by. */
.invulhulp-question__legend {
  display: block;
  padding: 0;
  margin: 0 0 var(--primitives-space-4);
  font-size: var(--primitives-font-size-200);
  font-weight: var(--primitives-font-weight-body-bold);
  line-height: var(--primitives-line-height-snug);
  color: var(--invulhulp-color-text);
}

.invulhulp-question__label-text {
  /* The wrapper inherits the size/weight from its parent (label or legend),
     so the text + marker render identically in both question types. */
  font-weight: inherit;
}

/* "(verplicht)" voluit, in dezelfde vorm als "(aanvullend)". Het was een rode
   asterisk met aria-hidden, waarvan de uitleg in de legenda op de
   introductiepagina stond — schermen terug, en voor een schermlezer nergens.
   De kleurcodering op de vraag blijft, maar draagt de betekenis nu niet meer
   alleen. */
.invulhulp-question__required {
  font-size: var(--primitives-font-size-80);
  color: var(--invulhulp-color-mandatory);
  margin-inline-start: var(--primitives-space-4);
  font-weight: var(--primitives-font-weight-body-regular);
}

.invulhulp-question__optional {
  font-size: var(--primitives-font-size-80);
  color: var(--invulhulp-color-optional);
  margin-inline-start: var(--primitives-space-4);
  font-weight: var(--primitives-font-weight-body-regular);
}

.invulhulp-question__guidance {
  color: var(--invulhulp-color-text-subtle);
  margin: 0 0 var(--primitives-space-8);
  /* Preserve paragraph breaks / bullet lines coming from the form JSON. */
  white-space: pre-line;
}

.invulhulp-question__followup {
  margin-block-start: var(--primitives-space-8);
}

.invulhulp-question__ai-empty {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-4);
  margin: var(--primitives-space-8) 0 0;
  padding: var(--primitives-space-4) var(--primitives-space-8);
  background: #fdf6ec;
  border-inline-start: 3px solid #e0b561;
  border-radius: var(--primitives-corner-radius-sm, 4px);
  font-size: var(--primitives-font-size-90);
  color: #8a6d3b;
}

.invulhulp-question__ai-empty-icon {
  display: inline-flex;
  align-items: center;
  color: #b8860b;
  flex-shrink: 0;
}

/* Informational, not a warning: quieter than the ai-empty notice above. */
.invulhulp-question__ai-smoothed {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-8);
  flex-wrap: wrap;
  margin: var(--primitives-space-8) 0 0;
  padding: var(--primitives-space-4) var(--primitives-space-8);
  background: var(--semantics-surfaces-tinted-background-color, #f3f5f6);
  border-inline-start: 3px solid var(--semantics-content-secondary-color, #a1a7ad);
  border-radius: var(--primitives-corner-radius-sm, 4px);
  font-size: var(--primitives-font-size-90);
  color: var(--semantics-content-secondary-color, #4f5457);
}

.invulhulp-question__ai-smoothed-text {
  flex: 1 1 auto;
}
</style>
