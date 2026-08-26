<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm risk-classification">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <div>
        <p class="rvo-text rvo-text--sm risk-classification__kicker">Bijlage 1</p>
        <h1 class="rvo-heading rvo-heading--xl risk-classification__title">Risicoclassificatie AI-verordening</h1>
        <p class="rvo-text risk-classification__lead">
          De risicogroep van dit AI-systeem wordt bepaald met de <strong>Beslishulp AI-verordening</strong> van
          MinBZK — dezelfde beslisboom die het Algoritmekader hanteert. De uitkomst geldt voor het hele dossier
          en wordt hier overgenomen als risiconiveau voor dit assessment.
        </p>
      </div>

      <!-- Not run yet: the beslishulp is the way in. -->
      <div v-if="!run" class="rvo-layout-column rvo-layout-gap--lg">
        <div class="rvo-alert rvo-alert--info rvo-alert--padding-md">
          <div class="rvo-alert__container">
            De beslishulp is voor dit dossier nog niet doorlopen. Doorloop de vragen om de risicogroep vast te stellen;
            u kunt daarna terugkeren naar dit assessment.
          </div>
        </div>
        <nldd-button
          class="risk-classification__start"
          variant="primary"
          start-icon="score-meter"
          text="Beslishulp AI-verordening doorlopen"
          @click="openModal"
        />
      </div>

      <!-- Run available: show it, then let the user adopt it for this assessment. -->
      <div v-else class="rvo-layout-column rvo-layout-gap--lg">
        <div class="rvo-alert rvo-alert--padding-md" :class="`rvo-alert--${alertModifier}`">
          <!-- One element inside the container: rvo-alert lays its children out
               in a row, so a bare <strong> + <br> would sit beside the text. -->
          <div class="rvo-alert__container">
            <div>
              <strong>{{ verdict }}</strong><br />
              <template v-if="levelInfo">{{ levelInfo.description }}</template>
              <template v-else>{{ conclusionText }}</template>
            </div>
          </div>
        </div>

        <section v-if="conclusionText && levelInfo" class="risk-classification__conclusion">
          <h2 class="rvo-heading rvo-heading--md risk-classification__subtitle">Conclusie van de beslishulp</h2>
          <p class="rvo-text rvo-text--sm">{{ conclusionText }}</p>
        </section>

        <section v-if="run.labels.length > 0">
          <h2 class="rvo-heading rvo-heading--md risk-classification__subtitle">Vastgestelde kenmerken</h2>
          <ul class="risk-classification__labels">
            <li v-for="label in run.labels" :key="label" class="risk-classification__label">{{ label }}</li>
          </ul>
        </section>

        <p class="rvo-text rvo-text--sm risk-classification__meta">
          Doorlopen op {{ completedOn }}<template v-if="run.completedBy"> door {{ run.completedBy }}</template>
          · {{ run.steps.length }} {{ run.steps.length === 1 ? 'vraag' : 'vragen' }} beantwoord
          <template v-if="adopted"> · overgenomen in dit assessment</template>
        </p>

        <div class="rvo-layout-row rvo-layout-gap--md risk-classification__result-actions">
          <nldd-button
            variant="secondary"
            text="Beslishulp bekijken of herzien"
            @click="openModal"
          />
          <nldd-button
            variant="primary"
            :text="adopted ? 'Doorgaan →' : 'Overnemen en doorgaan →'"
            @click="onConfirm"
          />
        </div>
      </div>
    </div>

    <BeslishulpModal ref="beslishulpModal" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FormConfig } from '../models/Assessment'
import { useAssessmentStore } from '../stores/assessmentStore'
import { loadBeslishulpTree } from '../services/beslishulpLoader'
import BeslishulpModal from './BeslishulpModal.vue'
import { riskLevelFor, verdictSummary, type BeslishulpTree } from '../utils/beslishulp'

const props = defineProps<{ formConfig: FormConfig }>()
const emit = defineEmits<{ confirmed: [] }>()

const store = useAssessmentStore()
const beslishulpModal = ref<InstanceType<typeof BeslishulpModal> | null>(null)
// Only needed to show the conclusion text belonging to the stored conclusionId;
// the verdict itself is derived from the labels the run recorded.
const tree = ref<BeslishulpTree | null>(null)

const run = computed(() => store.beslishulpRun)
const labels = computed(() => new Set(run.value?.labels ?? []))
const verdict = computed(() => verdictSummary(labels.value, run.value?.conclusionId))
const level = computed(() => (run.value ? riskLevelFor(labels.value) : null))

/** Whether this assessment already carries the beslishulp's verdict. */
const adopted = computed(() => !!level.value && store.riskLevel === level.value)

const levelInfo = computed(() => (level.value ? (props.formConfig.riskLevelInfo?.[level.value] ?? null) : null))

const conclusionText = computed(() => {
  const id = run.value?.conclusionId
  if (!id || !tree.value) return ''
  return tree.value.conclusions.find((c) => c.conclusionId === id)?.conclusion ?? ''
})

const alertModifier = computed(() => {
  const c = levelInfo.value?.color
  return c === 'error' || c === 'warning' || c === 'success' ? c : 'info'
})

const completedOn = computed(() =>
  run.value
    ? new Date(run.value.completedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : '',
)

// Best-effort: without the tree we still show the verdict and the level
// description from the form config, just not the upstream conclusion sentence.
loadBeslishulpTree()
  .then((t) => { tree.value = t })
  .catch(() => { tree.value = null })

function openModal() {
  beslishulpModal.value?.open()
}

/** Adopt the beslishulp verdict as this assessment's risk level. Explicit, so
 *  the assessment never silently changes level when someone redoes the
 *  beslishulp from the dossier page. */
function onConfirm() {
  if (level.value) store.setRiskLevel(level.value)
  store.markSectionCompleted('risk')
  emit('confirmed')
}
</script>

<style scoped>
.risk-classification {
  padding-block: var(--primitives-space-40) var(--primitives-space-48);
}

.risk-classification__kicker {
  color: var(--invulhulp-color-text-subtle);
  margin: 0 0 var(--primitives-space-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.risk-classification__title {
  color: var(--semantics-content-accent-color);
  margin: 0;
}

.risk-classification__lead {
  margin-block-start: var(--primitives-space-12);
}

.risk-classification__subtitle {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-4);
}

.risk-classification__start {
  align-self: flex-start;
  gap: var(--primitives-space-4);
}

.risk-classification__labels {
  display: flex;
  flex-wrap: wrap;
  gap: var(--primitives-space-4);
  list-style: none;
  margin: 0;
  padding: 0;
}

.risk-classification__label {
  font-size: var(--primitives-font-size-90);
  padding: 0 var(--primitives-space-4);
  background: var(--semantics-surfaces-tinted-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  color: var(--semantics-content-accent-color);
}

.risk-classification__meta {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}

.risk-classification__result-actions {
  justify-content: space-between;
}
</style>
