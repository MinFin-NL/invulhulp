<template>
  <div class="tiptap-wrapper">
    <!-- AI Modus is writing this very field (own run or a collaborator's) -->
    <p v-if="aiBusyLabel" class="tiptap-ai-busy" role="status">
      <span class="tiptap-ai-busy__icon" aria-hidden="true">✦</span>
      <span class="tiptap-ai-busy__label">{{ aiBusyLabel }}</span>
    </p>

    <EditorContent :editor="editor" class="tiptap-editor" />

    <!-- Suggestion panel: visible while streaming, when a suggestion is ready
         or when the AI asks a clarification question -->
        <nldd-banner
          variant="accent"
          size="sm"
          class="tiptap-suggestion"
          v-if="streamingText || suggestion !== null || pendingClarification !== null"
          :aria-busy="isLoading"
        >
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
            <nldd-button
              variant="primary"
              size="sm"
              text="Verstuur"
              :disabled="!clarificationInput.trim()"
              @click="submitClarification"
            />
            <nldd-button
              variant="secondary"
              size="sm"
              text="Annuleer"
              @click="cancelClarification"
            />
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

    <!-- Toolbar row: improve button + error -->
    <div class="tiptap-toolbar">
      <template v-if="!store.readOnly">
        <nldd-button
          variant="neutral-transparent"
          size="sm"
          class="tiptap-mark-btn"
          :class="{ 'tiptap-mark-btn--active': editor?.isActive('bold') }"
          :aria-pressed="editor?.isActive('bold') ?? false"
          aria-label="Vetgedrukt (Ctrl+B)"
          title="Vetgedrukt (Ctrl+B)"
          @mousedown.prevent
          @click="editor?.chain().focus().toggleBold().run()"
        >
          <span slot="text">
<strong>B</strong>
          </span>
        </nldd-button>
        <nldd-button
          variant="neutral-transparent"
          size="sm"
          class="tiptap-mark-btn"
          :class="{ 'tiptap-mark-btn--active': editor?.isActive('italic') }"
          :aria-pressed="editor?.isActive('italic') ?? false"
          aria-label="Cursief (Ctrl+I)"
          title="Cursief (Ctrl+I)"
          @mousedown.prevent
          @click="editor?.chain().focus().toggleItalic().run()"
        >
          <span slot="text">
<em>I</em>
          </span>
        </nldd-button>
      </template>
      <nldd-button
        variant="neutral-transparent"
        size="sm"
        v-if="!store.readOnly && suggestion === null && !streamingText && pendingClarification === null"
        :disabled="isLoading || !hasContent"
        @click="requestImprovement"
      >
        <span slot="text">
<span v-if="isLoading">Bezig…</span>
        <span v-else>✦ Verbeter tekst</span>
        </span>
      </nldd-button>
      <span v-if="error" class="tiptap-toolbar__error rvo-text rvo-text--sm" role="alert">{{ error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import type { AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Collaboration } from '@tiptap/extension-collaboration'
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret'
import type * as Y from 'yjs'
import { diffWords } from 'diff'
import type { Change } from 'diff'
import { improveTextStream } from '../services/llmService'
import { htmlToMarkdown, markdownToHtml } from '../utils/htmlRuns'
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
  // When set, the editor binds directly to this shared Yjs fragment
  // (character-level collaboration) instead of round-tripping modelValue. The
  // store's mirror keeps Pinia/persistence current from the fragment.
  fragment?: Y.XmlFragment | null
  // y-websocket provider — enables remote cursors (CollaborationCaret).
  provider?: unknown | null
  user?: { name: string; color: string } | null
  // Non-empty while AI Modus is generating this question's answer — shown as a
  // bar above the content. Empty/undefined hides it.
  aiBusyLabel?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const store = useAssessmentStore()

// Collaborative when bound to a fragment; otherwise the classic v-model editor.
const collaborative = !!props.fragment

function buildExtensions(): AnyExtension[] {
  const placeholder = Placeholder.configure({
    placeholder: props.placeholder ?? 'Vul uw antwoord in…',
  })
  if (props.fragment) {
    // Collaboration provides its own undo history, so disable StarterKit's.
    const ext: AnyExtension[] = [
      StarterKit.configure({ undoRedo: false }),
      placeholder,
      Collaboration.configure({ fragment: props.fragment }),
    ]
    if (props.provider) {
      ext.push(
        CollaborationCaret.configure({
          provider: props.provider as never,
          user: props.user ?? undefined,
        }),
      )
    }
    return ext
  }
  return [StarterKit, placeholder]
}

const editor = shallowRef<Editor | undefined>()

function createEditor() {
  editor.value?.destroy()
  editor.value = new Editor({
    extensions: buildExtensions(),
    // Collaboration loads content from the fragment; don't also set it here.
    content: collaborative ? undefined : props.modelValue,
    // Viewers of a shared dossier can read but not type.
    editable: !store.readOnly,
    onUpdate({ editor: e }) {
      // Fragment-bound: the fragment is the source of truth and the store mirror
      // updates Pinia — don't emit (that would double-write via setAnswer).
      if (collaborative) return
      // Store HTML so bold/italic survive; an empty doc is stored as '' (never
      // '<p></p>') so empty-answer checks and form progress keep working.
      emit('update:modelValue', e.getText().trim() ? e.getHTML() : '')
    },
  })
}
createEditor()

// The y-websocket provider exists only after its module lazy-loads and the
// socket is created — i.e. after this editor mounted. Extensions can't be added
// to a live Tiptap editor, so rebuild it when the provider (dis)appears;
// content is safe because it lives in the shared fragment, not the editor.
watch(
  () => props.provider,
  () => {
    if (collaborative) createEditor()
  },
)

watch(
  () => store.readOnly,
  (ro) => editor.value?.setEditable(!ro),
)

watch(
  () => props.modelValue,
  (newVal) => {
    // Fragment-bound editors take content from the fragment, not modelValue.
    if (collaborative) return
    if (!editor.value) return
    // The store may hold HTML (new answers) or legacy plain text; accept the
    // incoming value when it matches either representation, otherwise it is a
    // real external change (AI Modus, cross-form, import) to load.
    const incoming = newVal ?? ''
    if (incoming === '' && editor.value.getText().trim() === '') return
    if (incoming === editor.value.getHTML()) return
    if (incoming === editor.value.getText()) return
    editor.value.commands.setContent(incoming)
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

// Diffs compare markdown against markdown, so bold/italic markers line up
// with what the improve endpoint sends back.
const diffParts = computed((): Change[] => {
  if (suggestion.value === null) return []
  const original = editor.value ? htmlToMarkdown(editor.value.getHTML()) : ''
  return diffWords(original, suggestion.value)
})

const noChanges = computed(() =>
  suggestion.value !== null &&
  suggestion.value === (editor.value ? htmlToMarkdown(editor.value.getHTML()) : ''),
)

async function runImprove(clarification?: { question: string; answer: string }) {
  if (!editor.value) return
  // Markdown keeps the user's bold/italic through the LLM round-trip; for
  // unformatted text this is identical to plain text.
  const text = htmlToMarkdown(editor.value.getHTML()).trim()
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
  // setContent writes the bound fragment when collaborative (synced to peers);
  // only the classic path needs to emit back to the store.
  editor.value.commands.setContent(markdownToHtml(suggestion.value))
  if (!collaborative) {
    emit('update:modelValue', editor.value.getText().trim() ? editor.value.getHTML() : '')
  }
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
/* Remote collaborators' cursors (CollaborationCaret). The per-user colour is
   set inline on the caret by the extension; these rules give it shape + a name
   label. :deep because the widgets render inside the ProseMirror content. */
.tiptap-wrapper :deep(.collaboration-carets__caret) {
  border-left: 1px solid;
  border-right: 1px solid;
  margin-left: -1px;
  margin-right: -1px;
  pointer-events: none;
  position: relative;
  word-break: normal;
}

.tiptap-wrapper :deep(.collaboration-carets__label) {
  border-radius: 3px 3px 3px 0;
  color: #fff;
  font-size: 0.7rem;
  font-weight: var(--primitives-font-weight-body-bold, 700);
  left: -1px;
  line-height: normal;
  padding: 0.05rem 0.3rem;
  position: absolute;
  top: -1.3em;
  user-select: none;
  white-space: nowrap;
}

/* AI-Modus huisstijl (blauw/paars) — bewust buiten het RVO-palet, gelijk aan
   AiModeToggle. Zit als strook vast bovenop het invoerveld. */
.tiptap-ai-busy {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-4);
  margin: 0;
  padding: var(--primitives-space-4) var(--primitives-space-12);
  box-sizing: border-box;
  background: linear-gradient(135deg, rgba(15, 45, 92, 0.08), rgba(91, 33, 182, 0.12));
  border: 1px solid rgba(91, 33, 182, 0.4);
  border-block-end: 0;
  border-radius: var(--primitives-corner-radius-sm) var(--primitives-corner-radius-sm) 0 0;
  color: #0f2d5c;
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-semi-bold);
}

/* Het veld eronder sluit aan op de strook. */
.tiptap-wrapper:has(.tiptap-ai-busy) .tiptap-editor {
  border-start-start-radius: 0;
  border-start-end-radius: 0;
}

.tiptap-ai-busy__icon {
  animation: tiptap-ai-pulse var(--invulhulp-loop-breathe) var(--invulhulp-ease-in-out) infinite;
  color: #5b21b6;
}

/* De tekst 'ademt' mee zodat zichtbaar is dat er nog gewerkt wordt — een
   voortgangsindicator (WCAG 2.2.2 'essential'), maar de beweging is subtiel
   genoeg om onder reduced-motion helemaal uit te zetten: de tekst zelf blijft. */
.tiptap-ai-busy__label {
  animation: tiptap-ai-fade var(--invulhulp-loop-breathe) var(--invulhulp-ease-in-out) infinite;
}

@keyframes tiptap-ai-pulse {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.2); opacity: 1; }
}

@keyframes tiptap-ai-fade {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.65; }
}

@media (prefers-reduced-motion: reduce) {
  .tiptap-ai-busy__icon,
  .tiptap-ai-busy__label {
    animation: none;
  }
}

.tiptap-suggestion {
  border-radius: 0;
  border-block-start: 0;
}

.tiptap-suggestion__header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--primitives-space-4);
}

.tiptap-suggestion__label {
  font-size: var(--primitives-font-size-80);
  font-weight: var(--primitives-font-weight-body-bold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--semantics-content-accent-color);
}

.tiptap-suggestion__rationale {
  font-size: var(--primitives-font-size-90);
  color: var(--invulhulp-color-text-muted);
  font-style: italic;
}

.tiptap-suggestion__actions {
  margin-block-start: var(--primitives-space-8);
}

.tiptap-diff {
  font-size: var(--primitives-font-size-90);
  line-height: var(--primitives-line-height-snug);
  padding: var(--primitives-space-8) var(--primitives-space-12);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--primitives-corner-radius-sm);
  white-space: pre-wrap;
  word-break: break-word;
  margin-block: var(--primitives-space-8);
}

.tiptap-diff__empty {
  color: var(--invulhulp-color-text-muted);
  font-style: italic;
}

.tiptap-diff__cursor {
  animation: invulhulp-blink var(--invulhulp-loop-blink) step-end infinite;
  margin-inline-start: 1px;
  color: var(--semantics-content-accent-color);
}

.tiptap-diff__add {
  background: var(--semantics-categories-success-tinted-background-color);
  color: var(--semantics-categories-success-tinted-content-color);
  border-radius: 2px;
  padding-inline: 1px;
}

.tiptap-diff__del {
  background: var(--semantics-categories-critical-tinted-background-color);
  color: var(--semantics-categories-critical-tinted-content-color);
  text-decoration: line-through;
  border-radius: 2px;
  padding-inline: 1px;
}

.tiptap-toolbar {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-8);
  padding: var(--primitives-space-4) var(--primitives-space-8);
  border: 1px solid var(--invulhulp-color-border-strong);
  border-block-start: 0;
  border-radius: 0 0 var(--primitives-corner-radius-sm) var(--primitives-corner-radius-sm);
  background: var(--semantics-surfaces-tinted-background-color, #fafafa);
}

.tiptap-toolbar__error {
  color: var(--semantics-content-critical-color);
}

.tiptap-mark-btn {
  min-inline-size: 2rem;
  justify-content: center;
}

.tiptap-mark-btn--active {
  background: var(--semantics-categories-accent-tinted-background-color, #d9ebf7);
  border-radius: var(--primitives-corner-radius-sm);
}

.tiptap-clarification__question {
  font-size: var(--primitives-font-size-90);
  margin-block: var(--primitives-space-4) var(--primitives-space-8);
}

.tiptap-diagram {
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--primitives-corner-radius-sm);
  padding: var(--primitives-space-8);
  margin-block-end: var(--primitives-space-8);
  overflow-x: auto;
}

.tiptap-diagram :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>
