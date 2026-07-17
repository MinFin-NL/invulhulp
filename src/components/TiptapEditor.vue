<template>
  <div class="tiptap-wrapper">
    <EditorContent :editor="editor" class="tiptap-editor" />

    <!-- Suggestion panel: visible while streaming, when a suggestion is ready
         or when the AI asks a clarification question -->
    <div
      v-if="streamingText || suggestion !== null || pendingClarification !== null"
      class="rvo-alert rvo-alert--info rvo-alert--padding-sm tiptap-suggestion"
      :aria-busy="isLoading"
    >
      <div class="rvo-alert__container">
        <div class="tiptap-suggestion__header">
          <span class="tiptap-suggestion__label">{{ pendingClarification !== null ? 'AI-vraag' : 'AI-suggestie' }}</span>
          <span v-if="rationale" class="tiptap-suggestion__rationale">{{ rationale }}</span>
        </div>

        <!-- Clarification: the AI needs extra input before it can improve -->
        <template v-if="pendingClarification !== null">
          <p class="tiptap-clarification__question">{{ pendingClarification }}</p>
          <input
            v-model="clarificationInput"
            type="text"
            class="utrecht-textbox utrecht-textbox--md"
            placeholder="Uw antwoord…"
            aria-label="Antwoord op de vraag van de AI"
            @keydown.enter.prevent="submitClarification"
          />
          <div class="tiptap-suggestion__actions rvo-layout-row rvo-layout-gap--xs">
            <button
              type="button"
              class="rvo-button rvo-button--primary rvo-button--size-sm"
              :disabled="!clarificationInput.trim()"
              @click="submitClarification"
            >
              Verstuur
            </button>
            <button
              type="button"
              class="rvo-button rvo-button--secondary rvo-button--size-sm"
              @click="cancelClarification"
            >
              Annuleer
            </button>
          </div>
        </template>

        <!-- Live streaming view -->
        <div v-else-if="isLoading" class="tiptap-diff tiptap-diff--streaming" aria-live="polite">
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

          <!-- Optional mermaid diagram accompanying the suggestion -->
          <div
            v-if="diagramSvg"
            class="tiptap-diagram"
            role="img"
            aria-label="Diagram bij de suggestie"
            v-html="diagramSvg"
          ></div>

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
        v-if="!store.readOnly && suggestion === null && !streamingText && pendingClarification === null"
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
import { useAssessmentStore } from '../stores/assessmentStore'

// Mermaid is heavy (~1.5 MB of chunks); load it lazily, only when the model
// actually returns a diagram.
let mermaidReady: Promise<typeof import('mermaid')['default']> | null = null
function loadMermaid() {
  mermaidReady ??= import('mermaid').then(({ default: m }) => {
    m.initialize({ startOnLoad: false, theme: 'neutral' })
    return m
  })
  return mermaidReady
}

const props = defineProps<{
  modelValue: string
  placeholder?: string
  questionContext?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const store = useAssessmentStore()

const editor = useEditor({
  extensions: [
    StarterKit,
    Placeholder.configure({
      placeholder: props.placeholder ?? 'Vul uw antwoord in…',
    }),
  ],
  content: props.modelValue,
  // Viewers of a shared dossier can read but not type.
  editable: !store.readOnly,
  onUpdate({ editor: e }) {
    emit('update:modelValue', e.getText())
  },
})

watch(
  () => store.readOnly,
  (ro) => editor.value?.setEditable(!ro),
)

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
const pendingClarification = ref<string | null>(null)
const clarificationInput = ref('')
const diagramSvg = ref('')

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

async function runImprove(clarification?: { question: string; answer: string }) {
  if (!editor.value) return
  const text = editor.value.getText().trim()
  if (!text) return

  error.value = ''
  isLoading.value = true
  suggestion.value = null
  streamingRaw.value = ''
  rationale.value = ''
  diagramSvg.value = ''

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
    {
      clarification,
      onClarification: (question) => {
        pendingClarification.value = question
        clarificationInput.value = ''
        streamingRaw.value = ''
        isLoading.value = false
      },
      onDiagram: renderDiagram,
    },
  )
}

function requestImprovement() {
  return runImprove()
}

function submitClarification() {
  const answer = clarificationInput.value.trim()
  if (!answer || pendingClarification.value === null) return
  const question = pendingClarification.value
  pendingClarification.value = null
  clarificationInput.value = ''
  void runImprove({ question, answer })
}

function cancelClarification() {
  pendingClarification.value = null
  clarificationInput.value = ''
}

async function renderDiagram(code: string) {
  try {
    const mermaid = await loadMermaid()
    const { svg } = await mermaid.render(`tiptap-mmd-${Date.now()}`, code)
    diagramSvg.value = svg
  } catch (e) {
    // Invalid mermaid from the model — show the suggestion without a diagram.
    console.warn('[tiptap] mermaid render mislukt:', e)
    diagramSvg.value = ''
  }
}

function acceptSuggestion() {
  if (!editor.value || suggestion.value === null) return
  editor.value.commands.setContent(suggestion.value)
  emit('update:modelValue', suggestion.value)
  suggestion.value = null
  rationale.value = ''
  diagramSvg.value = ''
}

function rejectSuggestion() {
  suggestion.value = null
  rationale.value = ''
  error.value = ''
  diagramSvg.value = ''
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

.tiptap-clarification__question {
  font-size: var(--rvo-font-size-sm);
  margin-block: var(--rvo-space-2xs) var(--rvo-space-xs);
}

.tiptap-diagram {
  background: var(--rvo-color-wit);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--rvo-border-radius-sm);
  padding: var(--rvo-space-xs);
  margin-block-end: var(--rvo-space-xs);
  overflow-x: auto;
}

.tiptap-diagram :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>
