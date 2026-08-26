<template>
  <dialog
    ref="dialogEl"
    class="invulhulp-modal beslishulp"
    aria-labelledby="beslishulp-title"
    @click="onBackdropClick"
    @close="onDialogClose"
  >
    <div class="invulhulp-modal__container beslishulp__container">

      <header class="beslishulp__header">
        <div class="beslishulp__brand">
          <nldd-icon class="beslishulp__brand-icon" name="score-meter" size="32" />
          <div>
            <h2 id="beslishulp-title" class="beslishulp__title">Beslishulp AI-verordening</h2>
            <p class="beslishulp__subtitle">
              Bepaal of de AI-verordening op jouw toepassing van toepassing is — en zo ja, met welke verplichtingen.
            </p>
          </div>
        </div>
        <button type="button" class="beslishulp__close" aria-label="Sluiten" @click="close">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <!-- Phase rail: the tree has two substantive stages plus the conclusion. -->
      <ol class="beslishulp__phases" aria-label="Voortgang">
        <li
          v-for="phase in PHASES"
          :key="phase.id"
          class="beslishulp__phase"
          :class="{
            'beslishulp__phase--active': currentPhase === phase.id,
            'beslishulp__phase--done': phaseIndex(phase.id) < phaseIndex(currentPhase),
          }"
          :aria-current="currentPhase === phase.id ? 'step' : undefined"
        >
          {{ phase.label }}
        </li>
      </ol>

      <div class="beslishulp__body">

        <nldd-text color="inherit" class="beslishulp__status" v-if="loading">Beslishulp laden…</nldd-text>

        <nldd-banner
          variant="critical"
          v-else-if="loadError"
          role="alert"
          :text="loadError"
        />

        <!-- ---------------- Question ---------------- -->
        <template v-else-if="position?.kind === 'question'">
          <p class="beslishulp__kicker">
            {{ position.question.categoryLabel ?? 'Vraag' }}
            <span aria-hidden="true">·</span>
            {{ position.question.subcategory }}
            <span class="beslishulp__step-count">Stap {{ steps.length + 1 }}</span>
          </p>

          <h3 class="beslishulp__question">{{ position.question.question }}</h3>

          <!-- Vendored MinBZK markup (bold/bullets/<br>), not user input. -->
          <div
            v-if="position.question.explanation"
            class="beslishulp__explanation"
            v-html="position.question.explanation"
          />

          <ul class="beslishulp__answers" :class="{ 'beslishulp__answers--grid': useAnswerGrid }">
            <li v-for="(answer, index) in position.question.answers" :key="index">
              <button type="button" class="beslishulp__answer" @click="choose(index)">
                <span class="beslishulp__answer-text">{{ answer.answer }}</span>
                <span class="beslishulp__answer-arrow" aria-hidden="true">→</span>
              </button>
            </li>
          </ul>

          <details v-if="relevantDefinitions.length > 0" class="rvo-expandable-content rvo-expandable-content--subtle beslishulp__details">
            <summary class="rvo-expandable-content__summary invulhulp-text--sm">
              Begrippen in deze vraag ({{ relevantDefinitions.length }})
            </summary>
            <div class="rvo-expandable-content__details">
              <dl class="beslishulp__definitions">
                <template v-for="def in relevantDefinitions" :key="def.term">
                  <dt>{{ def.term }}</dt>
                  <dd>{{ def.definition }}</dd>
                </template>
              </dl>
            </div>
          </details>

          <details v-if="position.question.sources.length > 0" class="rvo-expandable-content rvo-expandable-content--subtle beslishulp__details">
            <summary class="rvo-expandable-content__summary invulhulp-text--sm">
              Bronnen bij deze vraag ({{ position.question.sources.length }})
            </summary>
            <div class="rvo-expandable-content__details">
              <ul class="beslishulp__sources">
                <li v-for="src in position.question.sources" :key="src.url">
                  <nldd-link :href="src.url" target="_blank" rel="noopener noreferrer">{{ src.source }}</nldd-link>
                </li>
              </ul>
            </div>
          </details>
        </template>

        <!-- ---------------- Conclusion ---------------- -->
        <template v-else-if="position?.kind === 'conclusion'">
          <nldd-banner class="beslishulp__verdict" :variant="alertVariant">
            <div class="beslishulp__verdict-row">
              <strong>{{ verdictLine }}</strong>
              <span v-if="savedNotice" class="beslishulp__saved">{{ savedNotice }}</span>
            </div>
          </nldd-banner>

          <nldd-text class="beslishulp__conclusion">{{ position.conclusion.conclusion }}</nldd-text>

          <section v-if="position.conclusion.obligation" class="beslishulp__obligation-block">
            <h4 class="beslishulp__section-title">Wat betekent dit voor jou?</h4>
            <!-- Vendored MinBZK markup: the obligation lists are HTML upstream. -->
            <div class="beslishulp__obligation" v-html="position.conclusion.obligation" />
          </section>

          <section v-if="labelList.length > 0">
            <h4 class="beslishulp__section-title">Vastgestelde kenmerken</h4>
            <ul class="beslishulp__labels">
              <li v-for="label in labelList" :key="label" class="beslishulp__label">{{ label }}</li>
            </ul>
          </section>

          <details class="rvo-expandable-content rvo-expandable-content--subtle beslishulp__details">
            <summary class="rvo-expandable-content__summary invulhulp-text--sm">
              Jouw antwoorden ({{ steps.length }})
            </summary>
            <div class="rvo-expandable-content__details">
              <ol class="beslishulp__trail">
                <li v-for="(step, index) in steps" :key="index">
                  <span class="beslishulp__trail-q">{{ questionTextFor(step.questionId) }}</span>
                  <span class="beslishulp__trail-a">{{ step.answerLabel }}</span>
                  <button type="button" class="invulhulp-linkbutton beslishulp__trail-back" @click="rewindTo(index)">
                    Terug naar deze vraag
                  </button>
                </li>
              </ol>
            </div>
          </details>

          <details v-if="position.conclusion.sources.length > 0" class="rvo-expandable-content rvo-expandable-content--subtle beslishulp__details">
            <summary class="rvo-expandable-content__summary invulhulp-text--sm">
              Bronnen bij deze conclusie ({{ position.conclusion.sources.length }})
            </summary>
            <div class="rvo-expandable-content__details">
              <ul class="beslishulp__sources">
                <li v-for="src in position.conclusion.sources" :key="src.url">
                  <nldd-link :href="src.url" target="_blank" rel="noopener noreferrer">{{ src.source }}</nldd-link>
                </li>
              </ul>
            </div>
          </details>
        </template>

        <!-- ---------------- Dead end ----------------
             Upstream writes no fallback redirect, so a combination of answers can
             in principle match no route. Say so plainly instead of freezing. -->
                <nldd-banner
                  variant="warning"
                  v-else-if="position?.kind === 'deadEnd'"
                  role="alert"
                >
            <div>
              <strong>Geen vervolgvraag gevonden.</strong><br />
              Deze combinatie van antwoorden leidt in de beslisboom niet naar een vervolgvraag of conclusie.
              Ga een stap terug en kies een ander antwoord, of raadpleeg
              <nldd-link href="mailto:ai-verordening@minbzk.nl">ai-verordening@minbzk.nl</nldd-link>.
            </div>
        </nldd-banner>
      </div>

      <footer class="beslishulp__footer">
        <div class="beslishulp__footer-actions">
          <nldd-button
            variant="neutral-transparent"
            size="sm"
            text="← Vorige vraag"
            v-if="steps.length > 0"
            @click="back"
          />
          <nldd-button
            variant="neutral-transparent"
            size="sm"
            text="Opnieuw beginnen"
            v-if="steps.length > 0"
            @click="restart"
          />
          <nldd-button
            variant="primary"
            size="sm"
            class="beslishulp__done"
            text="Sluiten"
            v-if="position?.kind === 'conclusion'"
            @click="close"
          />
        </div>
        <p class="beslishulp__credit">
          Beslisboom:
          <nldd-link :href="tree?.source.repository" target="_blank" rel="noopener noreferrer">
            Beslishulp AI-verordening
          </nldd-link>
          — AI Validatieteam, MinBZK (EUPL-1.2). Geen juridisch advies.
        </p>
      </footer>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { loadBeslishulpTree } from '../services/beslishulpLoader'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAuthStore } from '../stores/authStore'
import {
  answerStep,
  isOutOfScope,
  replay,
  riskLevelFor,
  verdictSummary,
  type BeslishulpDefinition,
  type BeslishulpStep,
  type BeslishulpTree,
} from '../utils/beslishulp'

const emit = defineEmits<{ completed: [] }>()

const store = useAssessmentStore()
const auth = useAuthStore()

const dialogEl = ref<HTMLDialogElement | null>(null)
const tree = ref<BeslishulpTree | null>(null)
const loading = ref(false)
const loadError = ref('')
const steps = ref<BeslishulpStep[]>([])
const savedNotice = ref('')

const state = computed(() => (tree.value ? replay(tree.value, steps.value) : null))
const position = computed(() => state.value?.position ?? null)
const labelList = computed(() => [...(state.value?.labels ?? [])].sort())

// ---- Phase rail -----------------------------------------------------------
// The upstream tree tags every question with a category; those two categories
// plus the conclusion are exactly the stages the user experiences.
const PHASES = [
  { id: 'van_toepassing', label: '1. Geldt de verordening?' },
  { id: 'risicogroep', label: '2. Welke risicogroep?' },
  { id: 'conclusie', label: '3. Conclusie' },
] as const
type PhaseId = (typeof PHASES)[number]['id']

const currentPhase = computed((): PhaseId => {
  const pos = position.value
  if (!pos || pos.kind !== 'question') return 'conclusie'
  // 'tussenscherm' is the interstitial between the two stages; it announces the
  // risk-group stage, so show it as part of that stage.
  return pos.question.category === 'van_toepassing' ? 'van_toepassing' : 'risicogroep'
})

function phaseIndex(id: PhaseId): number {
  return PHASES.findIndex((p) => p.id === id)
}

// ---- Verdict --------------------------------------------------------------
const verdictLine = computed(() =>
  verdictSummary(
    state.value?.labels ?? new Set(),
    position.value?.kind === 'conclusion' ? position.value.conclusion.conclusionId : null,
  ),
)

const alertVariant = computed(() => {
  const conclusionId = position.value?.kind === 'conclusion' ? position.value.conclusion.conclusionId : null
  if (isOutOfScope(state.value?.labels ?? new Set(), conclusionId)) return 'accent'
  switch (riskLevelFor(state.value?.labels ?? new Set())) {
    case 'onaanvaardbaar': return 'critical'
    case 'hoog': return 'warning'
    case 'beperkt': return 'accent'
    default: return 'success'
  }
})

// ---- Glossary -------------------------------------------------------------
// Terms from the vendored Algoritmekader begrippenlijst that literally occur in
// the question being asked. Cheap (108 terms) and keeps the definitions where
// they help, instead of behind a separate glossary nobody opens.
const relevantDefinitions = computed((): BeslishulpDefinition[] => {
  const pos = position.value
  if (!tree.value || pos?.kind !== 'question') return []
  const haystack = `${pos.question.question} ${pos.question.explanation}`
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
  return Object.values(tree.value.definitions)
    .filter((d) => {
      const term = d.term.toLowerCase()
      if (term.length < 4) return false
      const at = haystack.indexOf(term)
      if (at === -1) return false
      // Word boundary on both sides, so "AI-systeem" doesn't match inside
      // "AI-systeem voor algemene doeleinden" and drag in the wrong definition.
      const before = haystack[at - 1] ?? ' '
      const after = haystack[at + term.length] ?? ' '
      return !/[a-z0-9-]/.test(before) && !/[a-z0-9-]/.test(after)
    })
    .sort((a, b) => b.term.length - a.term.length)
    .slice(0, 8)
})

/**
 * Long option lists (question 1.2 has nine) push the question and its
 * explanation off the top of a one-per-row list. Short options get a two-column
 * grid instead, which halves the height; genuinely long options stay stacked,
 * because two columns would just make them wrap into the same space.
 */
const useAnswerGrid = computed(() => {
  const pos = position.value
  if (pos?.kind !== 'question' || pos.question.answers.length < 4) return false
  return pos.question.answers.every((a) => a.answer.length <= 70)
})

function questionTextFor(questionId: string): string {
  return tree.value?.questions.find((q) => q.questionId === questionId)?.question ?? questionId
}

// ---- Flow -----------------------------------------------------------------
function choose(answerIndex: number) {
  const pos = position.value
  if (pos?.kind !== 'question') return
  steps.value = answerStep(pos.question, answerIndex, steps.value)
  persistIfConcluded()
}

function back() {
  steps.value = steps.value.slice(0, -1)
  savedNotice.value = ''
}

function rewindTo(index: number) {
  steps.value = steps.value.slice(0, index)
  savedNotice.value = ''
}

function restart() {
  steps.value = []
  savedNotice.value = ''
}

/** A finished run is recorded on the dossier straight away — the whole point is
 *  that the outcome outlives the modal. Read-only (shared) dossiers keep the
 *  result on screen but write nothing. */
function persistIfConcluded() {
  const pos = position.value
  if (pos?.kind !== 'conclusion' || !tree.value) return
  if (!store.canEdit) {
    savedNotice.value = 'Niet opgeslagen — u heeft leesrechten op dit dossier.'
    return
  }
  store.setBeslishulpRun({
    treeVersion: tree.value.version,
    steps: [...steps.value],
    labels: [...(state.value?.labels ?? [])].sort(),
    conclusionId: pos.conclusion.conclusionId,
    completedAt: Date.now(),
    completedBy: auth.user?.name ?? auth.user?.email ?? undefined,
  })
  savedNotice.value = 'Opgeslagen in dit dossier'
  emit('completed')
}

// ---- Open / close ---------------------------------------------------------
async function open() {
  savedNotice.value = ''
  dialogEl.value?.showModal()
  if (!tree.value && !loading.value) {
    loading.value = true
    loadError.value = ''
    try {
      tree.value = await loadBeslishulpTree()
      resumeFromDossier()
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Beslishulp kon niet worden geladen.'
    } finally {
      loading.value = false
    }
  } else {
    resumeFromDossier()
  }
}

/** Reopen on the stored outcome rather than back at question 1 — unless the
 *  user is mid-run, in which case their unfinished trail wins. */
function resumeFromDossier() {
  if (steps.value.length > 0) return
  const run = store.beslishulpRun
  if (run) steps.value = [...run.steps]
}

function close() {
  dialogEl.value?.close()
}

function onDialogClose() {
  savedNotice.value = ''
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialogEl.value) close()
}

defineExpose({ open })
</script>

<style scoped>
/* Modal shell mirrors ConfirmDialog/DocumentViewerModal (their styles are scoped). */
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

.beslishulp__container {
  background: var(--semantics-surfaces-base-background-color);
  border-radius: var(--primitives-corner-radius-lg);
  box-shadow: 0 0 1.5em 0 rgb(0 0 0 / 35%);
  display: flex;
  flex-direction: column;
  max-block-size: 92vh;
  overflow: hidden;
}

/* --- Header --- */
.beslishulp__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--primitives-space-12);
  padding: var(--primitives-space-24) var(--primitives-space-24) var(--primitives-space-16);
  background: linear-gradient(135deg, var(--semantics-content-accent-color) 0%, #1e3a6d 60%, #2a4a80 100%);
  color: var(--semantics-surfaces-base-background-color);
}

.beslishulp__brand {
  display: flex;
  align-items: flex-start;
  gap: var(--primitives-space-12);
}

.beslishulp__brand-icon {
  flex-shrink: 0;
}

.beslishulp__title {
  margin: 0;
  font-size: var(--primitives-font-size-300);
  font-weight: var(--primitives-font-weight-body-bold);
  color: var(--semantics-surfaces-base-background-color);
}

.beslishulp__subtitle {
  margin: var(--primitives-space-2) 0 0;
  font-size: var(--primitives-font-size-90);
  color: rgb(255 255 255 / 0.8);
  max-inline-size: 52ch;
}

.beslishulp__close {
  background: none;
  border: 0;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  color: rgb(255 255 255 / 0.8);
  padding: 0 var(--primitives-space-2);
}

.beslishulp__close:hover {
  color: var(--semantics-surfaces-base-background-color);
}

/* --- Phase rail --- */
.beslishulp__phases {
  display: flex;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--semantics-surfaces-tinted-background-color);
  border-block-end: 1px solid var(--invulhulp-color-border);
}

.beslishulp__phase {
  flex: 1;
  padding: var(--primitives-space-4) var(--primitives-space-12);
  font-size: var(--primitives-font-size-70, 0.75rem);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: var(--invulhulp-color-text-subtle);
  text-align: center;
  border-block-end: 3px solid transparent;
}

.beslishulp__phase--done {
  color: var(--semantics-content-accent-color);
  border-block-end-color: var(--semantics-dividers-color);
}

.beslishulp__phase--active {
  color: var(--semantics-content-accent-color);
  background: var(--semantics-surfaces-base-background-color);
  border-block-end-color: var(--semantics-content-accent-color);
}

/* --- Body --- */
.beslishulp__body {
  padding: var(--primitives-space-24);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-16);
}

.beslishulp__status {
  margin: 0;
  color: var(--invulhulp-color-text-subtle);
}

.beslishulp__kicker {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-4);
  margin: 0;
  font-size: var(--primitives-font-size-70, 0.75rem);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--invulhulp-color-text-subtle);
}

.beslishulp__step-count {
  margin-inline-start: auto;
  text-transform: none;
  letter-spacing: 0;
}

.beslishulp__question {
  margin: 0;
  font-size: var(--primitives-font-size-200);
  font-weight: var(--primitives-font-weight-body-bold);
  line-height: var(--primitives-line-height-snug);
  color: var(--semantics-content-accent-color);
}

.beslishulp__explanation,
.beslishulp__obligation {
  font-size: var(--primitives-font-size-90);
  line-height: var(--primitives-line-height-loose);
  color: var(--invulhulp-color-text-subtle);
  max-block-size: 22rem;
  /* Scroll internally instead of being squeezed to a clipped single line by the
     flex column when the answer list is tall. */
  flex-shrink: 0;
  overflow-y: auto;
  padding: var(--primitives-space-12) var(--primitives-space-16);
  background: var(--semantics-surfaces-tinted-background-color);
  border-inline-start: 3px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-sm);
}

.beslishulp__explanation :deep(strong),
.beslishulp__obligation :deep(strong) {
  color: var(--semantics-content-color);
}

/* --- Answers --- */
.beslishulp__answers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
  /* Never shrink away under the explanation: the options are the point of the screen. */
  flex-shrink: 0;
}

/* Short option lists: two columns, so nine answers cost five rows instead of nine. */
.beslishulp__answers--grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr));
  align-items: stretch;
}

.beslishulp__answers--grid .beslishulp__answer {
  block-size: 100%;
}

.beslishulp__answer {
  inline-size: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--primitives-space-12);
  text-align: start;
  font: inherit;
  font-size: var(--primitives-font-size-100);
  cursor: pointer;
  padding: var(--primitives-space-12) var(--primitives-space-16);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--primitives-corner-radius-md);
  color: var(--semantics-content-color);
  transition: border-color var(--invulhulp-duration-instant), background var(--invulhulp-duration-instant), transform var(--invulhulp-duration-instant);
}

.beslishulp__answer:hover {
  border-color: var(--semantics-content-accent-color);
  background: var(--semantics-surfaces-tinted-background-color);
  transform: translateX(2px);
}

.beslishulp__answer-arrow {
  color: var(--semantics-content-accent-color);
  flex-shrink: 0;
}

/* --- Conclusion --- */
.beslishulp__verdict-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--primitives-space-12);
  flex-wrap: wrap;
}

.beslishulp__saved {
  font-size: var(--primitives-font-size-70, 0.75rem);
  color: var(--invulhulp-color-text-subtle);
}

.beslishulp__conclusion {
  margin: 0;
}

.beslishulp__section-title {
  margin: 0 0 var(--primitives-space-4);
  font-size: var(--primitives-font-size-100);
  font-weight: var(--primitives-font-weight-body-bold);
  color: var(--semantics-content-accent-color);
}

.beslishulp__labels {
  display: flex;
  flex-wrap: wrap;
  gap: var(--primitives-space-4);
  list-style: none;
  margin: 0;
  padding: 0;
}

.beslishulp__label {
  font-size: var(--primitives-font-size-70, 0.75rem);
  padding: 0 var(--primitives-space-4);
  background: var(--semantics-surfaces-tinted-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  color: var(--semantics-content-accent-color);
}

/* --- Trail & sources --- */
.beslishulp__details {
  margin: 0;
}

.beslishulp__definitions {
  margin: 0;
  font-size: var(--primitives-font-size-90);
}

.beslishulp__definitions dt {
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: var(--semantics-content-accent-color);
}

.beslishulp__definitions dd {
  margin: 0 0 var(--primitives-space-8);
  color: var(--invulhulp-color-text-subtle);
}

.beslishulp__sources {
  margin: 0;
  font-size: var(--primitives-font-size-90);
}

.beslishulp__trail {
  margin: 0;
  padding-inline-start: var(--primitives-space-24);
  font-size: var(--primitives-font-size-90);
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
}

.beslishulp__trail-q {
  display: block;
  color: var(--invulhulp-color-text-subtle);
}

.beslishulp__trail-a {
  font-weight: var(--primitives-font-weight-body-semi-bold);
}

.beslishulp__trail-back {
  background: none;
  border: 0;
  padding: 0;
  margin-inline-start: var(--primitives-space-8);
  font: inherit;
  font-size: var(--primitives-font-size-70, 0.75rem);
  cursor: pointer;
  color: var(--semantics-content-accent-color);
  text-decoration: underline;
}

/* --- Footer --- */
.beslishulp__footer {
  padding: var(--primitives-space-12) var(--primitives-space-24) var(--primitives-space-16);
  border-block-start: 1px solid var(--invulhulp-color-border);
  background: var(--semantics-surfaces-tinted-background-color);
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
}

.beslishulp__footer-actions {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-8);
  flex-wrap: wrap;
}

.beslishulp__done {
  margin-inline-start: auto;
}

.beslishulp__credit {
  margin: 0;
  font-size: var(--primitives-font-size-70, 0.75rem);
  color: var(--invulhulp-color-text-subtle);
}
</style>
