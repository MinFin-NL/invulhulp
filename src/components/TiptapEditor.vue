<template>
  <div class="tiptap-wrapper">
    <EditorContent :editor="editor" class="tiptap-editor" />

    <!-- Suggestion panel: visible while streaming or when a suggestion is ready -->
    <div
      v-if="streamingText || suggestion !== null"
      class="rvo-alert rvo-alert--info rvo-alert--padding-sm tiptap-suggestion"
      :aria-busy="isLoading"
    >
      <div class="rvo-alert__container">
        <div class="tiptap-suggestion__header">
          <span class="tiptap-suggestion__label">AI-suggestie</span>
          <span v-if="rationale" class="tiptap-suggestion__rationale">{{ rationale }}</span>
        </div>

        <!-- Live streaming view -->
        <div v-if="isLoading" class="tiptap-diff tiptap-diff--streaming" aria-live="polite">
          <span v-if="streamingText">{{ streamingText }}<span class="tiptap-diff__cursor" aria-hidden="true">▋</span></span>
          <span v-else class="tiptap-diff__empty">Verbinding maken…</span>
        </div>

        <!-- Final diff view -->
        <template v-else-if="suggestion !== null">
          <div v-if="noChanges" class="tiptap-diff tiptap-diff__empty">
            Geen wijzigingen voorgesteld – de tekst is al duidelijk genoeg.
          </div>
          <div v-else class="tiptap-diff" aria-label="Voorgestelde wijzigingen">
            <span
              v-for="(part, i) in diffParts"
              :key="i"
              :class="part.added ? 'tiptap-diff__add' : part.removed ? 'tiptap-diff__del' : ''"
            >{{ part.value }}</span>
          </div>

          <div class="tiptap-suggestion__actions rvo-layout-row rvo-layout-gap--xs">
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

    <!-- Toolbar row: improve button + error -->
    <div class="tiptap-toolbar">
      <button
        v-if="suggestion === null && !streamingText"
        type="button"
        :disabled="isLoading || !hasContent"
        class="rvo-button rvo-button--tertiary rvo-button--size-sm"
        @click="requestImprovement"
      >
        <span v-if="isLoading">Bezig…</span>
        <span v-else>✦ Verbeter tekst</span>
      </button>
      <span v-if="error" class="tiptap-toolbar__error rvo-text rvo-text--sm" role="alert">{{ error }}</span>
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

const suggestion = ref<string | null>(null)
const rationale = ref('')
const isLoading = ref(false)
const error = ref('')
const streamingRaw = ref('')

const hasContent = computed(() => (editor.value?.getText().trim().length ?? 0) > 0)

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

<style scoped>
.tiptap-suggestion {
  border-radius: 0;
  border-block-start: 0;
}

.tiptap-suggestion__header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--rvo-space-2xs);
}

.tiptap-suggestion__label {
  font-size: var(--rvo-font-size-xs);
  font-weight: var(--rvo-font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--rvo-color-lintblauw);
}

.tiptap-suggestion__rationale {
  font-size: var(--rvo-font-size-sm);
  color: var(--invulhulp-color-text-muted);
  font-style: italic;
}

.tiptap-suggestion__actions {
  margin-block-start: var(--rvo-space-xs);
}

.tiptap-diff {
  font-size: var(--rvo-font-size-sm);
  line-height: var(--rvo-line-height-md);
  padding: var(--rvo-space-xs) var(--rvo-space-sm);
  background: var(--rvo-color-wit);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--rvo-border-radius-sm);
  white-space: pre-wrap;
  word-break: break-word;
  margin-block: var(--rvo-space-xs);
}

.tiptap-diff__empty {
  color: var(--invulhulp-color-text-muted);
  font-style: italic;
}

.tiptap-diff__cursor {
  animation: invulhulp-blink 0.9s step-end infinite;
  margin-inline-start: 1px;
  color: var(--rvo-color-lintblauw);
}

.tiptap-diff__add {
  background: var(--rvo-color-groen-150);
  color: var(--rvo-color-groen-750);
  border-radius: 2px;
  padding-inline: 1px;
}

.tiptap-diff__del {
  background: var(--rvo-color-rood-150);
  color: var(--rvo-color-rood-750);
  text-decoration: line-through;
  border-radius: 2px;
  padding-inline: 1px;
}

.tiptap-toolbar {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-xs);
  padding: var(--rvo-space-2xs) var(--rvo-space-xs);
  border: 1px solid var(--invulhulp-color-border-strong);
  border-block-start: 0;
  border-radius: 0 0 var(--rvo-border-radius-sm) var(--rvo-border-radius-sm);
  background: var(--rvo-color-grijs-050, #fafafa);
}

.tiptap-toolbar__error {
  color: var(--rvo-color-rood);
}
</style>
