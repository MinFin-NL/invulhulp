<template>
  <ModalWindow ref="win" :title="source?.docName ?? 'Brondocument'" width="720">
    <nldd-text color="inherit" class="doc-viewer__missing" v-if="!documentContent">
      Dit document is niet meer beschikbaar. Hieronder staat het bewaarde fragment.
    </nldd-text>

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
  </ModalWindow>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import ModalWindow from './ModalWindow.vue'
import type { AnswerSource } from '../models/Assessment'
import { useAssessmentStore } from '../stores/assessmentStore'
import { matchAnswerToChunk, segmentText, type TextSegment } from '../utils/sourceMatching'

const store = useAssessmentStore()

const win = ref<InstanceType<typeof ModalWindow> | null>(null)
const chunkEl = ref<HTMLElement | null>(null)
const source = ref<AnswerSource | null>(null)
const answerText = ref('')

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
  win.value?.show()
  await nextTick()
  chunkEl.value?.scrollIntoView({ block: 'center' })
}

defineExpose({ open })
</script>

<style scoped>
.doc-viewer__missing {
  margin: 0;
  font-style: italic;
  color: var(--invulhulp-color-text-subtle);
}

.doc-viewer__text {
  font-size: var(--primitives-font-size-90);
  line-height: var(--primitives-line-height-snug);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--invulhulp-color-text-subtle);
}

.doc-viewer__chunk {
  display: inline;
  background: var(--semantics-surfaces-tinted-background-color);
  box-shadow: 0 0 0 2px var(--semantics-surfaces-tinted-background-color);
  border-radius: 2px;
  color: var(--semantics-content-color);
}

.doc-viewer__mark {
  background: var(--semantics-categories-warning-tinted-background-color);
  box-shadow: 0 0 0 2px var(--semantics-categories-warning-tinted-background-color);
  border-radius: 2px;
  font-weight: var(--primitives-font-weight-body-semi-bold);
}
</style>
