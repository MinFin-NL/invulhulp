<template>
  <div
    :class="question.importance === 'mandatory' ? 'question-mandatory' : 'question-optional'"
    style="margin-bottom: 24px;"
  >
    <div style="margin-bottom: 8px;">
      <label :for="question.id" class="rvo-text rvo-text--md" style="font-weight: 500; display: block; margin-bottom: 4px;">
        {{ question.text }}
        <span v-if="question.importance === 'mandatory'" style="color: #c0392b; margin-left: 2px;" title="Verplicht">*</span>
        <span
          v-if="question.importance === 'optional'"
          style="font-size: 0.75rem; color: #39870c; margin-left: 6px; font-weight: normal;"
        >(aanvullend)</span>
      </label>
      <p v-if="question.guidance" class="rvo-text rvo-text--sm" style="color: #666; margin: 0 0 8px 0;">
        {{ question.guidance }}
      </p>
    </div>

    <!-- Rich text field with LLM improvement -->
    <TiptapEditor
      v-if="question.type === 'text'"
      :id="question.id"
      v-model="textModel"
      :question-context="question.text"
    />

    <!-- Radio buttons -->
    <div v-else-if="question.type === 'radio'" class="rvo-layout-column rvo-layout-gap--sm">
      <div
        v-for="option in question.options"
        :key="option"
        class="rvo-layout-row rvo-layout-gap--sm"
        style="align-items: center; cursor: pointer;"
        @click="onRadioSelect(option)"
      >
        <div
          style="width: 18px; height: 18px; border-radius: 50%; border: 2px solid #154273; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"
          :style="{ background: radioValue === option ? '#154273' : 'white' }"
        >
          <div v-if="radioValue === option" style="width: 8px; height: 8px; border-radius: 50%; background: white;"></div>
        </div>
        <span class="rvo-text">{{ option }}</span>
      </div>

      <!-- Follow-up text for radio answers also gets Tiptap + LLM -->
      <TiptapEditor
        v-if="question.followUp && radioValue"
        style="margin-top: 8px;"
        v-model="followUpModel"
        :placeholder="question.followUp"
        :question-context="question.followUp"
      />
    </div>

    <!-- Checkboxes -->
    <div v-else-if="question.type === 'checkbox'" class="rvo-layout-column rvo-layout-gap--sm">
      <div
        v-for="option in question.options"
        :key="option"
        class="rvo-layout-row rvo-layout-gap--sm"
        style="align-items: center; cursor: pointer;"
        @click="onCheckboxToggle(option)"
      >
        <div
          style="width: 18px; height: 18px; border-radius: 2px; border: 2px solid #154273; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"
          :style="{ background: checkboxValues.includes(option) ? '#154273' : 'white' }"
        >
          <svg v-if="checkboxValues.includes(option)" width="12" height="10" viewBox="0 0 12 10" fill="none">
            <path d="M1 5L4.5 8.5L11 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="rvo-text">{{ option }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Question } from '../models/Assessment'
import TiptapEditor from './TiptapEditor.vue'

const props = defineProps<{
  question: Question
  modelValue: string | string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | string[]]
}>()

// ── Plain text value (for text-type questions) ────────────────────────────────

const textModel = computed({
  get() {
    return typeof props.modelValue === 'string' ? props.modelValue : ''
  },
  set(val: string) {
    emit('update:modelValue', val)
  },
})

// ── Radio helpers ─────────────────────────────────────────────────────────────

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
}

// ── Checkbox helpers ──────────────────────────────────────────────────────────

const checkboxValues = computed(() => {
  return Array.isArray(props.modelValue) ? props.modelValue : []
})

function onCheckboxToggle(option: string) {
  const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
  const idx = current.indexOf(option)
  if (idx === -1) current.push(option)
  else current.splice(idx, 1)
  emit('update:modelValue', current)
}
</script>
