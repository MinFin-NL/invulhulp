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
      <button
        type="button"
        class="rvo-button rvo-button--tertiary rvo-button--size-sm source-panel__warning-dismiss"
        @click="emit('dismiss-warning')"
      >
        Gecontroleerd
      </button>
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

      <div v-if="open" class="source-panel__cards">
        <div v-for="entry in matchedSources" :key="`${entry.source.docId}-${entry.source.chunkIndex}`" class="source-panel__card">
          <div class="source-panel__card-header">
            <span class="source-panel__doc-name">{{ entry.source.docName }}</span>
            <span class="source-panel__fragment">fragment {{ entry.source.chunkIndex + 1 }}</span>
          </div>
          <div class="source-panel__snippet">
            <span
              v-for="(seg, i) in entry.segments"
              :key="i"
              :class="{ 'source-panel__mark': seg.marked }"
            >{{ seg.text }}</span>
          </div>
          <button
            type="button"
            class="rvo-button rvo-button--tertiary rvo-button--size-sm source-panel__show-doc"
            @click="emit('show-document', entry.source)"
          >
            Toon in document
          </button>
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
}>(), {
  grounded: true,
  defaultOpen: false,
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
</script>

<style scoped>
.source-panel {
  margin-block-start: var(--rvo-space-xs);
}

.source-panel__warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--rvo-space-xs);
  background: var(--rvo-color-donkergeel-150);
  border: 1px solid var(--rvo-color-donkergeel-300);
  border-radius: var(--rvo-border-radius-sm);
  padding: var(--rvo-space-2xs) var(--rvo-space-sm);
  margin-block-end: var(--rvo-space-2xs);
}

.source-panel__warning-text {
  font-size: var(--rvo-font-size-sm);
  font-weight: var(--rvo-font-weight-semibold);
  color: var(--rvo-color-oranje-750);
}

.source-panel__warning-dismiss {
  flex-shrink: 0;
}

.source-panel__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-2xs);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font-weight: var(--rvo-font-weight-semibold);
  color: var(--invulhulp-color-text-muted);
  font-size: var(--rvo-font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.source-panel__toggle:hover {
  color: var(--rvo-color-lintblauw);
}

.source-panel__chevron {
  font-size: var(--rvo-font-size-sm);
}

.source-panel__cards {
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-xs);
  margin-block-start: var(--rvo-space-2xs);
}

.source-panel__card {
  background: var(--rvo-color-wit);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--rvo-border-radius-sm);
  padding: var(--rvo-space-xs) var(--rvo-space-sm);
}

.source-panel__card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--rvo-space-sm);
  margin-block-end: var(--rvo-space-2xs);
}

.source-panel__doc-name {
  font-weight: var(--rvo-font-weight-semibold);
  font-size: var(--rvo-font-size-sm);
  color: var(--rvo-color-lintblauw);
  word-break: break-word;
}

.source-panel__fragment {
  font-size: var(--rvo-font-size-xs);
  color: var(--invulhulp-color-text-subtle);
  flex-shrink: 0;
}

.source-panel__snippet {
  font-size: var(--rvo-font-size-sm);
  line-height: var(--rvo-line-height-md);
  white-space: pre-wrap;
  word-break: break-word;
  max-block-size: 12em;
  overflow-y: auto;
  color: var(--invulhulp-color-text-subtle);
}

.source-panel__mark {
  background: var(--rvo-color-donkergeel-150);
  color: var(--rvo-color-zwart, inherit);
  border-radius: 2px;
  box-shadow: 0 0 0 2px var(--rvo-color-donkergeel-150);
}

.source-panel__show-doc {
  margin-block-start: var(--rvo-space-2xs);
}
</style>
