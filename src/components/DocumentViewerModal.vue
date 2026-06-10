<template>
  <dialog
    ref="dialogEl"
    class="invulhulp-modal doc-viewer"
    :aria-labelledby="titleId"
    @click="onBackdropClick"
  >
    <div class="invulhulp-modal__container">
      <header class="invulhulp-modal__header">
        <h3 :id="titleId" class="utrecht-heading-3 invulhulp-modal__title">
          {{ source?.docName ?? 'Brondocument' }}
        </h3>
        <button
          type="button"
          class="invulhulp-modal__close"
          aria-label="Sluiten"
          @click="close"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <hr class="rvo-hr invulhulp-modal__divider" />

      <div class="invulhulp-modal__body doc-viewer__body">
        <p v-if="!documentContent" class="rvo-text doc-viewer__missing">
          Dit document is niet meer beschikbaar. Hieronder staat het bewaarde fragment.
        </p>

        <div class="doc-viewer__text">
          <template v-if="documentContent && chunkPos !== null">
            <span>{{ documentContent.slice(0, chunkPos.start) }}</span>
            <span ref="chunkEl" class="doc-viewer__chunk">
              <span
                v-for="(seg, i) in chunkSegments"
                :key="i"
                :class="{ 'doc-viewer__mark': seg.marked }"
              >{{ seg.text }}</span>
            </span>
            <span>{{ documentContent.slice(chunkPos.end) }}</span>
          </template>
          <!-- Fallback: chunk not located in (or document missing from) the store -->
          <span v-else ref="chunkEl" class="doc-viewer__chunk">
            <span
              v-for="(seg, i) in chunkSegments"
              :key="i"
              :class="{ 'doc-viewer__mark': seg.marked }"
            >{{ seg.text }}</span>
          </span>
        </div>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { AnswerSource } from '../models/Assessment'
import { useAssessmentStore } from '../stores/assessmentStore'
import { matchAnswerToChunk, segmentText, type TextSegment } from '../utils/sourceMatching'

const store = useAssessmentStore()

const dialogEl = ref<HTMLDialogElement | null>(null)
const chunkEl = ref<HTMLElement | null>(null)
const source = ref<AnswerSource | null>(null)
const answerText = ref('')
const titleId = `doc-viewer-title-${Math.random().toString(36).slice(2, 9)}`

const documentContent = computed((): string | null => {
  if (!source.value) return null
  return store.documents.find((d) => d.id === source.value!.docId)?.content ?? null
})

// Where the chunk sits in the full document text. Chunking strips/joins
// whitespace, so fall back to a whitespace-tolerant search.
const chunkPos = computed((): { start: number; end: number } | null => {
  const content = documentContent.value
  const chunk = source.value?.text
  if (!content || !chunk) return null
  const exact = content.indexOf(chunk)
  if (exact !== -1) return { start: exact, end: exact + chunk.length }
  const pattern = chunk
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')
  try {
    const m = new RegExp(pattern).exec(content)
    if (m) return { start: m.index, end: m.index + m[0].length }
  } catch {
    // pattern too large/invalid — fall through to chunk-only view
  }
  return null
})

const chunkSegments = computed((): TextSegment[] => {
  if (!source.value) return []
  const chunkText = chunkPos.value && documentContent.value
    ? documentContent.value.slice(chunkPos.value.start, chunkPos.value.end)
    : source.value.text
  const match = matchAnswerToChunk(answerText.value, chunkText)
  return segmentText(chunkText, match.ranges)
})

async function open(src: AnswerSource, answer: string) {
  source.value = src
  answerText.value = answer
  dialogEl.value?.showModal()
  await nextTick()
  chunkEl.value?.scrollIntoView({ block: 'center' })
}

function close() {
  dialogEl.value?.close()
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialogEl.value) close()
}

defineExpose({ open })
</script>

<style scoped>
/* Modal shell copied from ConfirmDialog.vue (styles there are scoped). */
.invulhulp-modal {
  border: 0;
  padding: 0;
  background: transparent;
  max-inline-size: min(720px, 92vw);
  inline-size: 100%;
  margin-block-start: 5vh;
  color: inherit;
}

.invulhulp-modal::backdrop {
  background: rgb(0 0 0 / 50%);
}

.invulhulp-modal__container {
  background: var(--rvo-color-wit);
  border-radius: var(--rvo-border-radius-lg);
  box-shadow: 0 0 1em 0 rgb(0 0 0 / 30%);
  padding: var(--rvo-space-md);
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-sm);
}

.invulhulp-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rvo-space-sm);
}

.invulhulp-modal__title {
  margin: 0;
  flex: 1;
  color: var(--rvo-color-lintblauw);
  word-break: break-word;
}

.invulhulp-modal__close {
  background: none;
  border: 0;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  color: var(--invulhulp-color-text-muted);
  padding: 0 var(--rvo-space-3xs);
}

.invulhulp-modal__divider {
  margin: 0;
}

.doc-viewer__body {
  max-block-size: 70vh;
  overflow-y: auto;
}

.doc-viewer__missing {
  margin: 0;
  font-style: italic;
  color: var(--invulhulp-color-text-subtle);
}

.doc-viewer__text {
  font-size: var(--rvo-font-size-sm);
  line-height: var(--rvo-line-height-md);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--invulhulp-color-text-subtle);
}

.doc-viewer__chunk {
  display: inline;
  background: var(--rvo-color-lichtblauw-150, var(--rvo-color-grijs-100));
  box-shadow: 0 0 0 2px var(--rvo-color-lichtblauw-150, var(--rvo-color-grijs-100));
  border-radius: 2px;
  color: var(--rvo-color-zwart, inherit);
}

.doc-viewer__mark {
  background: var(--rvo-color-donkergeel-150);
  box-shadow: 0 0 0 2px var(--rvo-color-donkergeel-150);
  border-radius: 2px;
  font-weight: var(--rvo-font-weight-semibold);
}
</style>
