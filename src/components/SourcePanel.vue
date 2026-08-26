<template>
  <div v-if="sources.length > 0 || grounded === false" class="source-panel">
    <div
      v-if="grounded === false"
      class="source-panel__warning"
      role="alert"
    >
      <span class="source-panel__warning-text">
        ⚠ Niet teruggevonden in de bronnen — controleer dit antwoord
      </span>
      <nldd-button
        variant="neutral-transparent"
        size="sm"
        class="source-panel__warning-dismiss"
        text="Gecontroleerd"
        @click="emit('dismiss-warning')"
      />
    </div>

    <template v-if="sources.length > 0">
      <button
        type="button"
        class="source-panel__toggle"
        :aria-expanded="open"
        @click="open = !open"
      >
        <span aria-hidden="true">📄</span>
        Bronnen ({{ sources.length }})
        <span class="source-panel__chevron" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
      </button>

      <p v-if="open && smoothed" class="source-panel__stale" role="note">
        Dit antwoord is na het ophalen gladgestreken; de gemarkeerde passages
        horen bij de oorspronkelijke tekst.
      </p>

      <div v-if="open" class="source-panel__cards">
        <div v-for="entry in matchedSources" :key="`${entry.source.docId}-${entry.source.chunkIndex}`" class="source-panel__card">
          <div class="source-panel__card-header">
            <span class="source-panel__doc-name">{{ entry.source.docName }}</span>
            <span class="source-panel__fragment">{{ fragmentLabel(entry.source) }}</span>
          </div>
          <div class="source-panel__snippet">
            <span
              v-for="(seg, i) in entry.segments"
              :key="i"
              :class="{ 'source-panel__mark': seg.marked }"
            >{{ seg.text }}</span>
          </div>
          <nldd-button
            variant="neutral-transparent"
            size="sm"
            class="source-panel__show-doc"
            text="Toon in document"
            @click="emit('show-document', entry.source)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AnswerSource } from '../models/Assessment'
import { matchAnswerToChunk, segmentText, type TextSegment } from '../utils/sourceMatching'

const props = withDefaults(defineProps<{
  sources: AnswerSource[]
  answerText: string
  grounded?: boolean
  defaultOpen?: boolean
  /** The answer was rewritten by the smoothing pass after these sources were
   *  recorded, so the highlights describe text the field no longer shows. */
  smoothed?: boolean
}>(), {
  grounded: true,
  defaultOpen: false,
  smoothed: false,
})

const emit = defineEmits<{
  'show-document': [source: AnswerSource]
  'dismiss-warning': []
}>()

const open = ref(props.defaultOpen)

// Sort best-supported sources first; highlight the matched passages.
const matchedSources = computed(
  (): { source: AnswerSource; segments: TextSegment[]; score: number }[] =>
    props.sources
      .map((source) => {
        const match = matchAnswerToChunk(props.answerText, source.text)
        return { source, segments: segmentText(source.text, match.ranges), score: match.score }
      })
      .sort((a, b) => b.score - a.score),
)

// PDFs indexed server-side carry a page number and a block type; older text
// uploads only have the chunk position.
function fragmentLabel(source: AnswerSource): string {
  const where = source.page ? `pagina ${source.page}` : `fragment ${source.chunkIndex + 1}`
  if (source.blockType === 'table') return `${where} · tabel`
  if (source.blockType === 'figure') return `${where} · afbeelding`
  return where
}
</script>

<style scoped>
.source-panel {
  margin-block-start: var(--primitives-space-8);
}

.source-panel__stale {
  margin: var(--primitives-space-4) 0;
  font-size: var(--primitives-font-size-90);
  color: var(--semantics-content-secondary-color, #4f5457);
}

.source-panel__warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--primitives-space-8);
  background: var(--semantics-categories-warning-tinted-background-color);
  border: 1px solid var(--semantics-categories-warning-tinted-highlight-border-color);
  border-radius: var(--primitives-corner-radius-sm);
  padding: var(--primitives-space-4) var(--primitives-space-12);
  margin-block-end: var(--primitives-space-4);
}

.source-panel__warning-text {
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: var(--semantics-categories-warning-tinted-content-color);
}

.source-panel__warning-dismiss {
  flex-shrink: 0;
}

.source-panel__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-4);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: var(--invulhulp-color-text-muted);
  font-size: var(--primitives-font-size-80);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.source-panel__toggle:hover {
  color: var(--semantics-content-accent-color);
}

.source-panel__chevron {
  font-size: var(--primitives-font-size-90);
}

.source-panel__cards {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-8);
  margin-block-start: var(--primitives-space-4);
}

.source-panel__card {
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--primitives-corner-radius-sm);
  padding: var(--primitives-space-8) var(--primitives-space-12);
}

.source-panel__card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--primitives-space-12);
  margin-block-end: var(--primitives-space-4);
}

.source-panel__doc-name {
  font-weight: var(--primitives-font-weight-body-semi-bold);
  font-size: var(--primitives-font-size-90);
  color: var(--semantics-content-accent-color);
  word-break: break-word;
}

.source-panel__fragment {
  font-size: var(--primitives-font-size-80);
  color: var(--invulhulp-color-text-subtle);
  flex-shrink: 0;
}

.source-panel__snippet {
  font-size: var(--primitives-font-size-90);
  line-height: var(--primitives-line-height-snug);
  white-space: pre-wrap;
  word-break: break-word;
  max-block-size: 12em;
  overflow-y: auto;
  color: var(--invulhulp-color-text-subtle);
}

.source-panel__mark {
  background: var(--semantics-categories-warning-tinted-background-color);
  color: var(--semantics-content-color, inherit);
  border-radius: 2px;
  box-shadow: 0 0 0 2px var(--semantics-categories-warning-tinted-background-color);
}

.source-panel__show-doc {
  margin-block-start: var(--primitives-space-4);
}
</style>
