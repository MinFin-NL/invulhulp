<template>
  <!-- Dossier-level, above the phases: which forms apply is a property of the
       dossier, not of any one form (docs §5.1). The kenmerk tags are the
       visible explanation for every "Van toepassing" and "Niet van toepassing"
       badge further down the page.

       Stock NLDS: an outlined rvo-card like the form cards, rvo-tag pills for
       the kenmerken, rvo-button for the action. No colours of its own — see
       the NL Design System rule in CLAUDE.md.

       Padding--xl and no left gutter: the title has to start on the same
       vertical line as "Vul dit dossier in met AI" and "Vooraf" around it, so
       the icon rides along in the kicker line instead of in a column of its
       own. -->
  <section
    class="invulhulp-card invulhulp-card--padding-xl scan-tile"
    aria-labelledby="scan-tile-title"
  >
    <div class="scan-tile__body">
      <nldd-text color="inherit" size="sm" weight="bold" class="scan-tile__kicker">
        <nldd-icon class="scan-tile__icon" name="magnifier" size="24" color="accent" />
        Toepassingsscan
      </nldd-text>
      <nldd-title size="2"><h2 class="scan-tile__title" id="scan-tile-title">
        {{ run ? 'Kenmerken van dit dossier' : 'Welke formulieren gelden hier eigenlijk?' }}
      </h2></nldd-title>

      <template v-if="run">
        <ul v-if="tags.length > 0" class="scan-tile__tags">
          <li v-for="k in tags" :key="k">
            <nldd-tag size="sm" :text="KENMERK_LABEL[k]" />
          </li>
        </ul>
        <nldd-text line-height="snug" size="sm" color="secondary" class="scan-tile__line" v-else>
          De scan stelde geen van de kenmerken vast.
        </nldd-text>
        <nldd-text line-height="snug" size="sm" color="secondary" class="scan-tile__line">
          {{ counts.verplicht }} van toepassing · {{ counts.mogelijk }} mogelijk relevant ·
          {{ counts.nvt }} niet van toepassing ·
          gescand op {{ completedOn }}<template v-if="run.completedBy"> door {{ run.completedBy }}</template>
        </nldd-text>
        <nldd-text line-height="snug" size="sm" color="secondary" class="scan-tile__line" v-if="unknowns.length > 0">
          Nog onbekend: {{ unknowns.map((k) => KENMERK_LABEL[k]).join(', ') }}.
        </nldd-text>
      </template>

      <!-- Question count from the scan itself: a hardcoded "acht vragen" drifts
           the moment a question is added or dropped. -->
      <nldd-text line-height="snug" size="sm" class="scan-tile__line scan-tile__intro" v-else>
        {{ SCAN_QUESTIONS.length }} vragen over wat dit project doet en oplevert. Daarna staat per
        formulier of het geldt — en zo niet, waarom niet.
      </nldd-text>
    </div>

    <div class="scan-tile__actions">
      <nldd-button
        variant="primary"
        size="sm"
        :text="run ? 'Scan bekijken of bijwerken' : 'Start toepassingsscan'"
        @click="$emit('open')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  KENMERK_LABEL,
  SCAN_QUESTIONS,
  activeKenmerken,
  unknownKenmerken,
  type Kenmerken,
  type ToepassingsscanRun,
} from '../utils/toepassingsscan'

const props = defineProps<{
  run: ToepassingsscanRun | null
  /** Live-derived kenmerken; null while no scan has been run. */
  kenmerken: Kenmerken | null
  counts: { verplicht: number; mogelijk: number; nvt: number }
}>()
defineEmits<{ open: [] }>()

const tags = computed(() => (props.kenmerken ? activeKenmerken(props.kenmerken) : []))
const unknowns = computed(() => (props.kenmerken ? unknownKenmerken(props.kenmerken) : []))

const completedOn = computed(() =>
  props.run
    ? new Date(props.run.completedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
    : '',
)
</script>

<style scoped>
/* Layout only: colour, spacing, radius and type all come from RVO tokens, and
   the card frame itself from .rvo-card--outline. */
.scan-tile {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--primitives-space-16);
  margin-block-end: var(--primitives-space-40);
  /* Same frame as the bands above and below it (bulk-ai, Vooraf), so the four
     dossier-level blocks read as one column instead of four stray boxes. */
  --rvo-card-outline-border-color: var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
}

.scan-tile__body {
  flex: 1 1 28rem;
}

.scan-tile__icon {
  flex-shrink: 0;
  margin-inline-end: var(--primitives-space-4);
}

.scan-tile__kicker {
  display: flex;
  align-items: center;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--semantics-content-accent-color);
}

.scan-tile__title {
  margin: 0 0 var(--primitives-space-4);
  color: var(--semantics-content-accent-color);
}

.scan-tile__line {
  margin: 0;
}

.scan-tile__intro {
  max-inline-size: 72ch;
}

.scan-tile__tags {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--primitives-space-4);
  margin: 0 0 var(--primitives-space-4);
  padding: 0;
}

.scan-tile__actions {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-4);
}
</style>
