<template>
  <!-- The companion tile fused to the EU AI Act card: the beslishulp determines
       *whether* the verordening applies, the checklist works out *how*. They are
       one move in two steps, so they read as one object in the track. -->
  <article class="beslishulp-tile" :class="`beslishulp-tile--${toneClass}`">
    <div class="beslishulp-tile__body">
      <nldd-icon class="beslishulp-tile__icon" name="score-meter" size="28" />
      <p class="beslishulp-tile__kicker">Beslishulp</p>
      <h3 class="beslishulp-tile__title">AI-verordening</h3>

      <template v-if="run">
        <p class="beslishulp-tile__verdict">{{ verdict }}</p>
        <p class="beslishulp-tile__meta">
          Doorlopen op {{ completedOn }}<template v-if="run.completedBy"> · {{ run.completedBy }}</template>
        </p>
      </template>
      <p v-else class="beslishulp-tile__desc">
        Geldt de AI-verordening voor jouw toepassing, en in welke risicogroep valt die?
      </p>
    </div>

    <div class="beslishulp-tile__actions">
      <button type="button" class="beslishulp-tile__btn" @click="$emit('open')">
        {{ run ? 'Uitkomst bekijken' : 'Start beslishulp' }}
        <span aria-hidden="true">›</span>
      </button>
      <p class="beslishulp-tile__credit">MinBZK · Algoritmekader</p>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { isOutOfScope, riskLevelFor, verdictSummary, type BeslishulpRun } from '../utils/beslishulp'

const props = defineProps<{ run: BeslishulpRun | null }>()
defineEmits<{ open: [] }>()

const labels = computed(() => new Set(props.run?.labels ?? []))
const verdict = computed(() => verdictSummary(labels.value, props.run?.conclusionId))

/** Not-yet-run stays neutral; a finished run colours the tile by severity, so the
 *  verdict is legible from across the forms page. */
const toneClass = computed(() => {
  if (!props.run) return 'neutral'
  // Out of scope is not "low risk" — keep it factual rather than green.
  if (isOutOfScope(labels.value, props.run.conclusionId)) return 'info'
  switch (riskLevelFor(labels.value)) {
    case 'onaanvaardbaar': return 'error'
    case 'hoog': return 'warning'
    case 'beperkt': return 'info'
    default: return 'success'
  }
})

const completedOn = computed(() =>
  props.run ? new Date(props.run.completedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
)
</script>

<style scoped>
.beslishulp-tile {
  inline-size: 190px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--primitives-space-16);
  padding: var(--primitives-space-16);
  color: var(--semantics-categories-accent-filled-content-color);
  background: var(--semantics-categories-accent-filled-background-color);
  /* Fused to the EU AI Act card: square inner corners, no seam between them. */
  border: 1px solid var(--semantics-content-accent-color);
  border-start-start-radius: var(--primitives-corner-radius-md);
  border-end-start-radius: var(--primitives-corner-radius-md);
  border-inline-end: 0;
  position: relative;
}

/* The join: a hairline the same colour as the card border, so the pair reads as
   one framed object rather than two cards touching. */
.beslishulp-tile::after {
  content: '';
  position: absolute;
  inset-block: var(--primitives-space-12);
  inset-inline-end: 0;
  inline-size: 1px;
  background: color-mix(in srgb, var(--semantics-categories-accent-filled-content-color) 25%, transparent);
}

.beslishulp-tile__body {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-2);
}

.beslishulp-tile__icon {
  display: block;
  margin-block-end: var(--primitives-space-4);
}

.beslishulp-tile__kicker {
  margin: 0;
  font-size: var(--primitives-font-size-70);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--semantics-categories-accent-filled-content-secondary-color);
}

.beslishulp-tile__title {
  margin: 0;
  font-size: var(--primitives-font-size-100);
  font-weight: var(--primitives-font-weight-body-bold);
  line-height: 1.2;
  color: var(--semantics-categories-accent-filled-content-color);
}

.beslishulp-tile__desc {
  margin: var(--primitives-space-4) 0 0;
  font-size: var(--primitives-font-size-70);
  line-height: var(--primitives-line-height-snug);
  color: var(--semantics-categories-accent-filled-content-secondary-color);
}

.beslishulp-tile__verdict {
  margin: var(--primitives-space-4) 0 0;
  /* Role lists get long ("aanbieder + gebruiksverantwoordelijke") and the tile is
     narrow by design — wrap inside the box rather than spilling over the card. */
  overflow-wrap: anywhere;
  font-size: var(--primitives-font-size-70);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  line-height: var(--primitives-line-height-snug);
  padding: var(--primitives-space-2) var(--primitives-space-4);
  border-radius: var(--primitives-corner-radius-sm);
  background: color-mix(in srgb, var(--semantics-categories-accent-filled-content-color) 14%, transparent);
  border-inline-start: 3px solid var(--tile-accent);
}

.beslishulp-tile__meta {
  margin: var(--primitives-space-4) 0 0;
  font-size: var(--primitives-font-size-70);
  color: var(--semantics-categories-accent-filled-content-secondary-color);
}

.beslishulp-tile__actions {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
}

.beslishulp-tile__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-2);
  align-self: flex-start;
  font: inherit;
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  cursor: pointer;
  padding: var(--primitives-space-4) var(--primitives-space-12);
  color: var(--semantics-content-accent-color);
  background: var(--semantics-surfaces-base-background-color);
  border: 0;
  border-radius: var(--primitives-corner-radius-md);
  transition: transform var(--invulhulp-duration-instant), box-shadow var(--invulhulp-duration-instant);
}

.beslishulp-tile__btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--primitives-box-shadows-level-2);
}

.beslishulp-tile__credit {
  margin: 0;
  font-size: var(--primitives-font-size-70);
  color: var(--semantics-categories-accent-filled-content-secondary-color);
}

/* Verdict accent — the only thing that varies once a run exists. */
.beslishulp-tile--neutral { --tile-accent: var(--semantics-dividers-color); }
.beslishulp-tile--success { --tile-accent: var(--primitives-color-success-300); }
.beslishulp-tile--info    { --tile-accent: var(--primitives-color-lichtblauw-300); }
.beslishulp-tile--warning { --tile-accent: var(--primitives-color-warning-300); }
.beslishulp-tile--error   { --tile-accent: var(--primitives-color-critical-300); }

.beslishulp-tile--error {
  background: var(--semantics-categories-critical-filled-background-color);
  border-color: var(--semantics-categories-critical-filled-background-color);
}
</style>
