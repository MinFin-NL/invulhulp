<template>
  <dialog
    ref="dialogEl"
    class="invulhulp-modal scan"
    aria-labelledby="scan-title"
    @click="onBackdropClick"
  >
    <div class="invulhulp-modal__container scan__container">

      <header class="scan__header">
        <div class="scan__brand">
          <nldd-icon class="scan__brand-icon" name="magnifier" size="48" />
          <div>
            <nldd-title size="2"><h2 class="scan__title" id="scan-title">Toepassingsscan</h2></nldd-title>
            <nldd-text line-height="snug" color="inherit" size="sm" class="scan__subtitle">
              Wat doet en levert dit project? Daarmee bepalen we welke formulieren hier gelden.
            </nldd-text>
          </div>
        </div>
        <!-- Plain button, not nldd-button: on the dark header a filled button
             variant would need overriding anyway. Mirrors BeslishulpModal. -->
        <button type="button" class="scan__close" aria-label="Sluiten" @click="close">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div class="scan__body">

        <!-- Six independent questions, so they go on one page: a wizard would
             add eight screens of chrome around forty words of question. Each is
             a fieldset/legend with native inputs and the RVO classes, exactly as
             QuestionItem renders a form question. -->
        <ol class="scan__questions">
          <li v-for="question in SCAN_QUESTIONS" :key="question.id">
            <div v-if="question.type === 'single'" class="scan__fieldset">
              <p :id="`${question.id}-label`" class="scan__legend">
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
              <legend class="scan__legend">
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
                  @change="toggleMulti(question.id, option.id)"
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
            Advies, geen juridisch oordeel: leg een "niet van toepassing" voor aan de FG, privacy
            officer of CISO.
          </nldd-text>
        </section>
      </div>

      <footer class="scan__footer">
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
      </footer>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { loadAvailableForms, type FormIndexEntry } from '../services/formLoader'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAuthStore } from '../stores/authStore'
import {
  SCAN_QUESTIONS,
  SCAN_VERSION,
  applicabilityLabel,
  deriveKenmerken,
  evaluateApplicability,
  type ApplicabilityStatus,
  type ScanAnswers,
} from '../utils/toepassingsscan'

const emit = defineEmits<{ completed: [] }>()

const store = useAssessmentStore()
const auth = useAuthStore()

const dialogEl = ref<HTMLDialogElement | null>(null)
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
  return `${count('verplicht')} van toepassing, ${count('mogelijk')} mogelijk relevant, ${count('nvt')} niet van toepassing.`
})

/** Stock nldd-tag colours, so the scan introduces none of its own.
 *  "Van toepassing" stays the neutral default — it is the ordinary case; the
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

function toggleMulti(questionId: string, optionId: string) {
  const q = SCAN_QUESTIONS.find((question) => question.id === questionId)
  if (!q) return
  const current = answers.value[q.id] ?? []
  const isExclusive = (id: string) => q.opties.find((o) => o.id === id)?.exclusief === true
  // "Nee, geen van deze" contradicts every other option, so ticking it clears
  // the rest — and ticking anything else clears it.
  const chosen = current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : isExclusive(optionId)
      ? [optionId]
      : [...current.filter((id) => !isExclusive(id)), optionId]
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
function open() {
  savedNotice.value = ''
  // Reopen on the stored answers so "bijwerken" is an edit, not a redo.
  const run = store.toepassingsscanRun
  if (run && Object.keys(answers.value).length === 0) answers.value = { ...run.answers }
  dialogEl.value?.showModal()
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
/* Layout and the modal shell only — every colour, space and font value is an
   RVO token. The shell mirrors BeslishulpModal (their styles are scoped, so it
   is repeated here rather than shared — same trade-off as ConfirmDialog). */
.invulhulp-modal {
  border: 0;
  padding: 0;
  background: transparent;
  max-inline-size: min(820px, 94vw);
  inline-size: 100%;
  margin-block-start: 4vh;
  color: inherit;
}

.invulhulp-modal::backdrop {
  background: rgb(15 45 92 / 55%);
}

.scan__container {
  background: var(--semantics-surfaces-base-background-color);
  border-radius: var(--primitives-corner-radius-lg);
  box-shadow: 0 0 1.5em 0 rgb(0 0 0 / 35%);
  display: flex;
  flex-direction: column;
  max-block-size: 92vh;
  overflow: hidden;
}

/* --- Header --- */
/* Ruimer dan het corpus: dit is een gekleurd vlak, en tekst die tot aan de rand
   van een gekleurd vlak loopt oogt geknepen. Inline gelijk aan .scan__body en
   .scan__footer, zodat titel, vraag en knoppen op één lijn beginnen. */
.scan__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--primitives-space-16);
  padding: var(--primitives-space-32);
  background: var(--semantics-content-accent-color);
  color: var(--semantics-surfaces-base-background-color);
}

.scan__brand {
  display: flex;
  align-items: flex-start;
  gap: var(--primitives-space-16);
}

.scan__brand-icon {
  margin-block-start: var(--primitives-space-2);
  flex-shrink: 0;
}

.scan__title {
  margin: 0;
  color: var(--semantics-surfaces-base-background-color);
}

.scan__subtitle {
  margin: var(--primitives-space-8) 0 0;
  max-inline-size: 56ch;
  /* Solid tint rather than an opacity, so the contrast ratio is knowable. */
  color: var(--semantics-categories-accent-tinted-background-color);
}

.scan__close {
  font: inherit;
  font-size: var(--primitives-font-size-300);
  line-height: 1;
  cursor: pointer;
  padding: 0 var(--primitives-space-4);
  color: var(--semantics-surfaces-base-background-color);
  background: transparent;
  border: 0;
}

/* --- Body --- */
.scan__body {
  padding: var(--primitives-space-32);
  overflow-y: auto;
}

/* De vraag staat op het witte corpus, met de ruimte van .scan__body eromheen —
   geen eigen vlak of rand. Bij het meerkeuzetype is dit een echte <fieldset>
   (de groepssemantiek moet ergens vandaan komen); bij het enkelkeuzetype doet
   nldd-radio-button-group dat zelf en is dit een gewone <div>. */
.scan__options {
  display: flex;
  flex-direction: column;
  gap: var(--semantics-forms-gap-tight, var(--primitives-space-8));
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

/* The hint under an option label: a block inside the RVO label span, so the
   whole thing stays one click target and one accessible name. */
.scan__hint {
  display: block;
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

/* Not-applicable rows are quieter than the rest of the list, but never hidden. */
.scan__tag--nvt {
  color: var(--semantics-content-secondary-color);
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
  padding: var(--primitives-space-16) var(--primitives-space-32);
  border-block-start: 1px solid var(--semantics-dividers-color);
  background: var(--semantics-surfaces-tinted-background-color);
}

.scan__footer-actions {
  display: flex;
  gap: var(--primitives-space-4);
  flex-wrap: wrap;
}
</style>
