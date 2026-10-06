<template>
  <ModalWindow
    ref="win"
    title="Toepassingsscan"
    supporting-text="Wat doet en levert dit project? Daarmee bepalen we welke formulieren hier gelden."
    width="800"
    @open="onWindowOpen"
  >
    <!-- Six independent questions, so they go on one page: a wizard would
         add eight screens of chrome around forty words of question. Each is
         a labelled group of NLDD radio or checkbox fields, exactly as
         QuestionItem renders a form question. -->
    <ol class="scan__questions">
      <li v-for="question in SCAN_QUESTIONS" :key="question.id">
        <div v-if="question.type === 'single'" class="scan__fieldset">
          <!-- tabindex -1: the dossier overview can open the scan on this
               question, and focus has to land on the question itself. -->
          <p :id="`${question.id}-label`" class="scan__legend" tabindex="-1">
            <span class="scan__question">{{ question.vraag }}</span>
          </p>
          <p v-if="question.toelichting" class="scan__explanation">
            {{ question.toelichting }}
          </p>
          <nldd-radio-button-group
            :name="question.id"
            :accessible-labeled-by="`${question.id}-label`"
            @change="chooseSingle(question.id, $event.detail.value)"
          >
            <nldd-radio-button-field
              v-for="option in question.opties"
              :key="option.id"
              :label="optionLabel(option)"
              :value="option.id"
              :checked="isChosen(question.id, option.id)"
            />
          </nldd-radio-button-group>
        </div>

        <fieldset v-else class="scan__fieldset">
          <legend :id="`${question.id}-label`" class="scan__legend" tabindex="-1">
            <span class="scan__question">{{ question.vraag }}</span>
          </legend>
          <p v-if="question.toelichting" class="scan__explanation">
            {{ question.toelichting }}
          </p>
          <div class="scan__options">
            <nldd-checkbox-field
              v-for="option in question.opties"
              :key="option.id"
              :label="optionLabel(option)"
              :name="question.id"
              :value="option.id"
              :checked="isChosen(question.id, option.id)"
              @change="setMulti(question.id, option.id, $event.detail.checked)"
            />
          </div>
        </fieldset>
      </li>
    </ol>

    <!-- The consequence list, live: answering a question moves a form in it
         immediately, which is the whole argument for asking. -->
    <section class="scan__result" aria-labelledby="scan-result-title">
      <nldd-title size="3"><h3 class="scan__result-title" id="scan-result-title">
        Wat dit betekent voor de formulieren
      </h3></nldd-title>

      <!-- The list updates on every answer. Announcing all ten rows each
           time would drown a screenreader, so the live region carries the
           tally and the list itself stays quiet. -->
      <p class="invulhulp-visually-hidden" role="status">{{ tally }}</p>

      <nldd-text size="sm" color="secondary" v-if="consequences.length === 0">
        Beantwoord de vragen hierboven — hier verschijnt meteen per formulier of het geldt.
      </nldd-text>
      <ul v-else class="invulhulp-item-list scan__consequences">
        <li v-for="row in consequences" :key="row.id" class="invulhulp-item-list__item scan__consequence">
          <span class="scan__consequence-title">{{ row.title }}</span>
          <nldd-tag
            size="sm"
            :color="tagColor(row.status)"
            :text="applicabilityLabel(row.status)"
          />
          <span class="invulhulp-text--sm invulhulp-text--subtle scan__consequence-reason">{{ row.reason }}</span>
        </li>
      </ul>

      <nldd-banner
        variant="accent"
        class="scan__alert"
        v-if="!hasBeslishulp && kenmerken.algoritme_of_ai !== false"
      >
        <div class="scan__alert-body">
            Of de AI-verordening geldt, bepaalt de <strong>Beslishulp AI-verordening</strong> —
            op de dossierpagina bij de EU AI Act-kaart.
          </div>
      </nldd-banner>

      <nldd-text size="sm" color="secondary" class="scan__note">
        Advies, geen juridisch oordeel: leg een "geldt niet" voor aan de FG, privacy
        officer of CISO.
      </nldd-text>
    </section>

    <template #footer>
      <div class="scan__footer">
        <div class="invulhulp-row invulhulp-gap--sm scan__footer-actions">
          <nldd-button
            variant="primary"
            size="sm"
            text="Opslaan in dossier"
            :disabled="!store.canEdit"
            @click="save"
          />
          <nldd-button
            variant="neutral-transparent"
            size="sm"
            text="Opnieuw beginnen"
            @click="restart"
          />
        </div>
        <nldd-text color="inherit" size="sm" class="scan__saved" v-if="savedNotice" role="status">{{ savedNotice }}</nldd-text>
      </div>
    </template>
  </ModalWindow>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { loadAvailableForms, type FormIndexEntry } from '../services/formLoader'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAuthStore } from '../stores/authStore'
import ModalWindow from './ModalWindow.vue'
import {
  SCAN_QUESTIONS,
  SCAN_VERSION,
  applicabilityLabel,
  deriveKenmerken,
  evaluateApplicability,
  nextMultiChoice,
  type ApplicabilityStatus,
  type ScanAnswers,
} from '../utils/toepassingsscan'

const emit = defineEmits<{ completed: [] }>()

const store = useAssessmentStore()
const auth = useAuthStore()

const win = ref<InstanceType<typeof ModalWindow> | null>(null)
const forms = ref<FormIndexEntry[]>([])
const answers = ref<ScanAnswers>({})
const savedNotice = ref('')

onMounted(async () => {
  forms.value = await loadAvailableForms()
})

const kenmerken = computed(() => deriveKenmerken(answers.value, store.beslishulpRun))
const hasBeslishulp = computed(() => store.beslishulpRun !== null)

const ORDER: Record<ApplicabilityStatus, number> = {
  verplicht: 0, mogelijk: 1, nvt: 2, altijd: 3, onbepaald: 4,
}

/** Only the forms the scan actually says something about — "altijd" is noise here. */
const consequences = computed(() =>
  forms.value
    .map((f) => ({ id: f.id, title: f.title, ...evaluateApplicability(f.applicability, kenmerken.value) }))
    .filter((row) => row.status !== 'altijd' && row.status !== 'onbepaald')
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]),
)

/** What the live region says: the tally, not the ten rows behind it. */
const tally = computed(() => {
  if (consequences.value.length === 0) return ''
  const count = (status: ApplicabilityStatus) =>
    consequences.value.filter((row) => row.status === status).length
  const n = (status: ApplicabilityStatus) => count(status) === 1 ? '1 geldt' : `${count(status)} gelden`
  return `${n('verplicht')} voor dit project, ${count('mogelijk')} nog onbekend, ${n('nvt')} niet.`
})

/** Stock nldd-tag colours, so the scan introduces none of its own.
 *  "Geldt" stays the neutral default — it is the ordinary case; the
 *  one state worth noticing gets the warning treatment, and "niet van
 *  toepassing" recedes into the secondary channel. */
function tagColor(status: ApplicabilityStatus): string {
  if (status === 'mogelijk') return 'warning'
  if (status === 'nvt') return 'neutral'
  return 'accent'
}

// ---- Answering ------------------------------------------------------------
/** nldd-radio-button-field en -checkbox-field nemen hun label als platte
 *  tekst — er is geen slot voor een tweede regel. De hint schuift daarom in
 *  het label zelf, zodat hij zichtbaar blijft én in de toegankelijke naam
 *  staat, zoals in de oude <label>-opmaak. */
function optionLabel(option: { label: string; hint?: string }): string {
  return option.hint ? `${option.label} — ${option.hint}` : option.label
}

function isChosen(questionId: string, optionId: string): boolean {
  return (answers.value[questionId] ?? []).includes(optionId)
}

function chooseSingle(questionId: string, optionId: string) {
  answers.value = { ...answers.value, [questionId]: [optionId] }
  savedNotice.value = ''
}

/** Sets the state the checkbox reports rather than toggling: every click
 *  arrives as two `change` events (see nextMultiChoice). */
function setMulti(questionId: string, optionId: string, checked: boolean) {
  const q = SCAN_QUESTIONS.find((question) => question.id === questionId)
  if (!q) return
  const current = answers.value[q.id] ?? []
  const chosen = nextMultiChoice(q, current, optionId, checked)
  if (chosen === current) return
  answers.value = { ...answers.value, [q.id]: chosen }
  savedNotice.value = ''
}

function restart() {
  answers.value = {}
  savedNotice.value = ''
}

/** Saved only on request: unlike the beslishulp, a filled-in question is not
 *  itself a conclusion — the consequence list is what the user reviews. */
function save() {
  if (!store.canEdit) {
    savedNotice.value = 'Niet opgeslagen — u heeft leesrechten op dit dossier.'
    return
  }
  store.setToepassingsscanRun({
    scanVersion: SCAN_VERSION,
    answers: { ...answers.value },
    kenmerken: kenmerken.value,
    completedAt: Date.now(),
    completedBy: auth.user?.name ?? auth.user?.email ?? undefined,
  })
  savedNotice.value = 'Opgeslagen in dit dossier.'
  emit('completed')
}

// ---- Open / close ---------------------------------------------------------
// The question to land on, set by open() and used once the window is open.
let focusQuestionId: string | null = null

/** Open the scan, optionally on one question: the dossier overview links each
 *  open point straight to the question that decides it. */
function open(questionId?: string) {
  savedNotice.value = ''
  // Reopen on the stored answers so "bijwerken" is an edit, not a redo.
  const run = store.toepassingsscanRun
  if (run && Object.keys(answers.value).length === 0) answers.value = { ...run.answers }
  focusQuestionId = questionId ?? null
  win.value?.show()
}

/** nldd-window moves focus into itself when it opens; only after that can the
 *  focus go to the requested question without being taken back. */
function onWindowOpen() {
  const id = focusQuestionId
  focusQuestionId = null
  if (!id) return
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const label = document.getElementById(`${id}-label`)
      label?.scrollIntoView({ block: 'start' })
      label?.focus({ preventScroll: true })
    }),
  )
}

defineExpose({ open })
</script>

<style scoped>
/* Layout only — every colour, space and font value is an NLDD token; the
   window, title bar and footer bar come from ModalWindow. */
/* De vraag staat op het witte corpus, met de ruimte van het venster eromheen —
   geen eigen vlak of rand. Bij het meerkeuzetype is dit een echte <fieldset>
   (de groepssemantiek moet ergens vandaan komen); bij het enkelkeuzetype doet
   nldd-radio-button-group dat zelf en is dit een gewone <div>. De opties
   staan zoals in die radiogroep zonder tussenruimte onder elkaar: elk veld
   heeft zijn eigen hoogte. */
.scan__options {
  display: flex;
  flex-direction: column;
}

.scan__fieldset {
  background: transparent;
  border: 0;
  margin: 0;
  padding: 0;
  min-inline-size: 0;
}

/* One question after another, so the separation has to come from spacing
   rather than from a screen change. */
.scan__questions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-32);
}

.scan__legend {
  padding: 0;
  margin: 0 0 var(--primitives-space-4);
  /* Opened on this question from the overview: land below the window's sticky
     title bar, which nldd-page publishes as --context-inset-top. */
  scroll-margin-block-start: calc(var(--context-inset-top, 0px) + var(--primitives-space-16));
}

.scan__legend:focus {
  outline: none;
}

.scan__legend:focus-visible {
  border-radius: var(--primitives-corner-radius-sm);
  box-shadow: var(--semantics-focus-ring-box-shadow);
}

.scan__question {
  font-size: var(--primitives-font-size-200);
  font-weight: var(--primitives-font-weight-body-bold);
  line-height: var(--primitives-line-height-tight);
}

.scan__explanation {
  margin: 0 0 var(--primitives-space-12);
  max-inline-size: 68ch;
}

/* --- Result --- */
.scan__result {
  margin-block-start: var(--primitives-space-32);
  padding-block-start: var(--primitives-space-24);
  border-block-start: 1px solid var(--semantics-dividers-color);
}

.scan__result-title {
  margin: 0 0 var(--primitives-space-12);
}

.scan__note {
  margin: var(--primitives-space-16) 0 0;
  max-inline-size: 68ch;
}

.scan__consequences {
  margin: 0;
}

.scan__consequence {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--primitives-space-2) var(--primitives-space-12);
}

.scan__consequence-title {
  font-weight: var(--primitives-font-weight-body-semi-bold);
}

.scan__consequence-reason {
  grid-column: 1 / -1;
}

.scan__alert {
  margin-block-start: var(--primitives-space-16);
}

/* Lopende tekst in een gekleurd vlak heeft lucht nodig: padding-md in plaats
   van -sm op het vlak zelf, en een ruimere regelafstand erbinnen. */
.scan__alert-body {
  line-height: var(--primitives-line-height-snug);
  max-inline-size: 72ch;
}

.scan__saved {
  margin: 0;
  color: var(--semantics-content-success-color);
}

/* --- Footer --- */
.scan__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--primitives-space-12);
  inline-size: 100%;
}

.scan__footer-actions {
  display: flex;
  gap: var(--primitives-space-4);
  flex-wrap: wrap;
}
</style>
