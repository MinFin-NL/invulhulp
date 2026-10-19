<template>
  <div class="invulhulp-measure invulhulp-measure--md invulhulp-measure--pad section-view">
    <div class="invulhulp-column invulhulp-gap--xl">

      <!-- Section header -->
      <header>
        <div class="section-view__kicker-row">
          <nldd-text color="inherit" size="sm" class="section-view__kicker">
            {{ kicker }}
          </nldd-text>
          <!-- Opslagstatus. Antwoorden gaan meteen naar localStorage en
               gedebounced naar de server; zonder deze regel krijgt iemand die
               drie kwartier aan een DPIA werkt nooit te horen dat zijn werk
               ergens staat. Bewust geen live region voor de normale statussen:
               die wisselen bij elke toetsaanslag en zouden een schermlezer
               onophoudelijk onderbreken. De foutmelding hieronder wél. -->
          <nldd-text color="inherit" size="sm" class="section-view__save" v-if="saveLabel">
            {{ saveLabel }}
          </nldd-text>
        </div>
        <nldd-title size="1"><h1 class="section-view__title">
          {{ section.title }}
        </h1></nldd-title>
      </header>

      <nldd-banner
        variant="warning"
        v-if="saveStatus === 'error'"
        role="alert"
        text="Opslaan op de server lukt even niet. Je antwoorden staan wel op dit apparaat bewaard — bij de volgende wijziging probeert de app het opnieuw."
      />

      <!-- Sections another party fills in: say so, and say that AI Modus keeps
           its hands off, so nobody wonders where an answer came from. -->
      <nldd-banner
        variant="accent"
        v-if="section.aiFill === false"
        text="Dit onderdeel wordt door een andere partij ingevuld. AI Modus vult hier niets in — antwoorden komen alleen van de beoordelaar zelf."
      />

      <!-- Verdiepingsgesprek prototype: the questions AI Modus left empty,
           and a switch to show only those. -->
      <nldd-banner
        v-if="openCount > 0"
        variant="accent"
        :text="openCount === 1
          ? 'AI Modus vond voor 1 vraag in dit formulier geen antwoord in de documenten.'
          : `AI Modus vond voor ${openCount} vragen in dit formulier geen antwoord in de documenten.`"
        supporting-text="Die vul je zelf in. Bij elke open vraag staat wat kan helpen."
      >
        <nldd-button
          slot="actions"
          variant="secondary"
          size="sm"
          :text="gapFilter ? 'Toon alle vragen' : 'Toon alleen open vragen'"
          :aria-pressed="gapFilter ? 'true' : 'false'"
          @click="gapFilter = !gapFilter"
        />
      </nldd-banner>

      <nldd-text
        v-if="filtering && shownSubsections.length === 0"
        color="inherit"
        size="sm"
        class="section-view__subsection-desc"
      >
        Geen open vragen in dit onderdeel.
      </nldd-text>

      <!-- Subsections -->
      <div v-for="subsection in shownSubsections" :key="subsection.id" class="invulhulp-column invulhulp-gap--lg">
        <div>
          <nldd-title size="2"><h2 class="section-view__subsection-title">
            {{ subsection.title }}
          </h2></nldd-title>
          <nldd-text color="inherit" size="sm" class="section-view__subsection-desc" v-if="subsection.description">
            {{ subsection.description }}
          </nldd-text>
        </div>

        <QuestionItem
          v-for="question in shownQuestions(subsection)"
          :key="question.id"
          :question="question"
          :modelValue="store.getAnswer(question.id)"
          @update:modelValue="store.setAnswer(question.id, $event)"
        />
      </div>

      <!-- Navigation -->
      <div class="invulhulp-row invulhulp-gap--md section-view__nav">
        <nldd-button
          variant="secondary"
          text="← Vorige"
          v-if="hasPrev"
          @click="$emit('prev')"
        />
        <div v-else aria-hidden="true"></div>
        <nldd-button
          variant="primary"
          @click="onNext"
        >
          <span slot="text">
{{ nextLabel }} →
          </span>
        </nldd-button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentStore, saveStatus, lastSavedAt } from '../stores/assessmentStore'
import type { Question, Section, Subsection } from '../models/Assessment'
import { isQuestionVisible } from '../utils/answerRefs'
import { useAiMode } from '../composables/useAiMode'
import QuestionItem from './QuestionItem.vue'

const props = defineProps<{
  section: Section
  hasPrev: boolean
  nextLabel?: string
}>()

const emit = defineEmits<{
  next: []
  prev: []
}>()

const store = useAssessmentStore()

const nextLabel = computed(() => props.nextLabel ?? 'Volgende')

const { gapFilter, gapPanelFor, gapCount } = useAiMode()
// Empty unless the prototype flag is on: only then does AI Modus store panels.
const openCount = computed(() => (store.activeFormId ? gapCount(store.activeFormId) : 0))
const filtering = computed(() => gapFilter.value && openCount.value > 0)

function shownQuestions(subsection: Subsection): Question[] {
  const formId = store.activeFormId
  return subsection.questions.filter(
    (q) =>
      isQuestionVisible(q, store.getAnswer) &&
      (!filtering.value || (!!formId && gapPanelFor(formId, q.id) !== undefined)),
  )
}

const shownSubsections = computed(() =>
  filtering.value
    ? props.section.subsections.filter((sub) => shownQuestions(sub).length > 0)
    : props.section.subsections,
)

// Eyebrow label above the title. Uses the section's own `kicker` when set,
// otherwise a generic "Deel {part}" (or "Samenvatting" for the summary part).
const kicker = computed(
  () => props.section.kicker ?? (props.section.part === 'summary' ? 'Samenvatting' : `Deel ${props.section.part}`),
)

const timeFormat = new Intl.DateTimeFormat('nl-NL', { timeStyle: 'short' })

// Leeg zolang er in deze sessie nog niets gewijzigd is: "Opgeslagen" bij een
// formulier waar je nog niets aan gedaan hebt, zegt niets.
const saveLabel = computed(() => {
  switch (saveStatus.value) {
    case 'pending':
    case 'saving':
      return 'Bezig met opslaan…'
    case 'saved':
      return lastSavedAt.value ? `Opgeslagen · ${timeFormat.format(lastSavedAt.value)}` : 'Opgeslagen'
    case 'error':
      return 'Alleen lokaal opgeslagen'
    default:
      return ''
  }
})

function onNext() {
  store.markSectionCompleted(props.section.id)
  emit('next')
}
</script>

<style scoped>
.section-view {
  padding-block: var(--primitives-space-40) var(--primitives-space-48);
}

.section-view__kicker-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--primitives-space-16);
  flex-wrap: wrap;
  margin-block-end: var(--primitives-space-2);
}

.section-view__kicker {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section-view__save {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.section-view__title {
  color: var(--semantics-content-accent-color);
  margin: 0;
}

.section-view__subsection-title {
  color: var(--semantics-content-color);
  margin: 0 0 var(--primitives-space-4);
}

.section-view__subsection-desc {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  /* Preserve paragraph breaks / bullet lines coming from the form JSON. */
  white-space: pre-line;
}

.section-view__nav {
  justify-content: space-between;
  border-block-start: 1px solid var(--invulhulp-color-border);
  padding-block-start: var(--primitives-space-32);
}
</style>
