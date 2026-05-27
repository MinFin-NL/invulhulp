<template>
  <div class="tiptap-wrapper">
    <EditorContent :editor="editor" class="tiptap-editor" />

    <!-- Suggestion panel: visible while streaming or when a suggestion is ready -->
    <div v-if="streamingText || suggestion !== null" class="suggestion-panel">
      <div class="suggestion-header">
        <span class="suggestion-label">AI-suggestie</span>
        <span v-if="rationale" class="suggestion-rationale">{{ rationale }}</span>
      </div>

      <!-- Live streaming view -->
      <div v-if="isLoading" class="diff-view streaming-view">
        <span v-if="streamingText">{{ streamingText }}<span class="streaming-cursor">▋</span></span>
        <span v-else class="diff-no-changes">Verbinding maken…</span>
      </div>

      <!-- Final diff view -->
      <template v-else-if="suggestion !== null">
        <div v-if="noChanges" class="diff-view diff-no-changes">
          Geen wijzigingen voorgesteld – de tekst is al duidelijk genoeg.
        </div>
        <div v-else class="diff-view" aria-label="Voorgestelde wijzigingen">
          <span
            v-for="(part, i) in diffParts"
            :key="i"
            :class="part.added ? 'diff-add' : part.removed ? 'diff-del' : 'diff-eq'"
          >{{ part.value }}</span>
        </div>

        <div class="suggestion-actions">
          <button
            type="button"
            class="rvo-button rvo-button--primary"
            @click="acceptSuggestion"
          >
            Overnemen
          </button>
          <button
            type="button"
            class="btn-reject"
            @click="rejectSuggestion"
          >
            Afwijzen
          </button>
        </div>
      </template>
    </div>

    <!-- Toolbar row: improve button + error -->
    <div class="tiptap-toolbar">
      <button
        v-if="suggestion === null && !streamingText"
        type="button"
        :disabled="isLoading || !hasContent"
        class="improve-btn"
        :class="{ 'improve-btn--loading': isLoading }"
        @click="requestImprovement"
      >
        <span v-if="isLoading">Bezig…</span>
        <span v-else>✦ Verbeter tekst</span>
      </button>
      <span v-if="error" class="improve-error">{{ error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { diffWords } from 'diff'
import type { Change } from 'diff'
import { improveTextStream } from '../services/llmService'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  questionContext?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// ── Editor setup ─────────────────────────────────────────────────────────────

const editor = useEditor({
  extensions: [
    StarterKit,
    Placeholder.configure({
      placeholder: props.placeholder ?? 'Vul uw antwoord in…',
    }),
  ],
  content: props.modelValue,
  onUpdate({ editor: e }) {
    emit('update:modelValue', e.getText())
  },
})

// Keep editor in sync when modelValue changes from outside (e.g. store hydration)
watch(
  () => props.modelValue,
  (newVal) => {
    if (!editor.value) return
    const current = editor.value.getText()
    if (current !== newVal) {
      editor.value.commands.setContent(newVal)
    }
  },
)

onBeforeUnmount(() => editor.value?.destroy())

// ── LLM improvement state ─────────────────────────────────────────────────────

const suggestion = ref<string | null>(null)
const rationale = ref('')
const isLoading = ref(false)
const error = ref('')
const streamingRaw = ref('')

const hasContent = computed(() => {
  return (editor.value?.getText().trim().length ?? 0) > 0
})

// Extract the content inside <verbeterd>…</verbeterd> for live display
const streamingText = computed((): string => {
  if (!streamingRaw.value) return ''
  const afterOpen = streamingRaw.value.match(/<verbeterd>([\s\S]*)/i)
  if (!afterOpen) return ''
  const content = afterOpen[1]
  const beforeClose = content.match(/([\s\S]*?)<\/verbeterd>/i)
  return (beforeClose ? beforeClose[1] : content).trim()
})

const diffParts = computed((): Change[] => {
  if (suggestion.value === null) return []
  const original = editor.value?.getText() ?? ''
  return diffWords(original, suggestion.value)
})

const noChanges = computed(() =>
  suggestion.value !== null && suggestion.value === (editor.value?.getText() ?? ''),
)

async function requestImprovement() {
  if (!editor.value) return
  const text = editor.value.getText().trim()
  if (!text) return

  error.value = ''
  isLoading.value = true
  suggestion.value = null
  streamingRaw.value = ''
  rationale.value = ''

  await improveTextStream(
    text,
    props.questionContext ?? '',
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
  if (!editor.value || suggestion.value === null) return
  editor.value.commands.setContent(suggestion.value)
  emit('update:modelValue', suggestion.value)
  suggestion.value = null
  rationale.value = ''
}

function rejectSuggestion() {
  suggestion.value = null
  rationale.value = ''
  error.value = ''
}
</script>
