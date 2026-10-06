<template>
  <!-- Open vragen: wat de gebruiker nog moet beslissen. Eén regel per vraag die
       iets beslist, niet per formulier — één antwoord zet vaak twee formulieren
       vast. Alleen na een scan: daarvoor is "Start toepassingsscan" de vraag. -->
  <section v-if="openQuestions.length > 0" class="open-questions" aria-labelledby="open-questions-title">
    <nldd-title size="2"><h2 class="open-questions__title" id="open-questions-title">
      Open vragen
    </h2></nldd-title>
    <nldd-text size="sm" color="inherit" class="open-questions__lead">
      Hiervan hangt nog af of een formulier voor dit project geldt.
    </nldd-text>
    <ul class="invulhulp-item-list open-questions__list">
      <li v-for="q in openQuestions" :key="q.key" class="invulhulp-item-list__item open-questions__item">
        <div class="open-questions__text">
          <span class="open-questions__question">{{ q.vraag }}</span>
          <span class="invulhulp-text--sm invulhulp-text--subtle">Bepaalt {{ list(q.forms) }}.</span>
        </div>
        <nldd-button
          variant="secondary"
          size="sm"
          :text="q.decider.kind === 'scan' ? 'Beantwoorden' : 'Beslishulp openen'"
          :accessible-label="q.decider.kind === 'scan'
            ? `Beantwoorden in de toepassingsscan: ${q.vraag}`
            : 'Beslishulp AI-verordening openen'"
          @click="openDecider(q.decider)"
        />
      </li>
    </ul>
  </section>

  <!-- Oriëntatie (werkplan-kompas §4): per formulier of het geldt, waarom, voor
       wie, en hoe ver het is. De scan staat erboven als kop: hij is de reden
       voor alles eronder. "Nog onbekend" heeft een eigen groep — een vraag die
       niemand beantwoordde is geen "nee". Een checklist, dus geen omschrijving
       per formulier: die staat op de kaarten in Formulieren. -->
  <section class="applicability" aria-labelledby="applicability-title">
    <div class="applicability__head">
      <div class="applicability__head-text">
        <nldd-title size="2"><h2 class="applicability__title" id="applicability-title">
          Wat geldt voor dit project
        </h2></nldd-title>
        <nldd-text size="sm" color="inherit" class="applicability__lead">
          <template v-if="run">
            Volgens de toepassingsscan van {{ completedOn }}<template v-if="run.completedBy">
            door {{ run.completedBy }}</template>. Advies, geen juridisch oordeel: leg een "geldt niet"
            voor aan de eigenaar van het formulier.
          </template>
          <template v-else>
            Er is nog geen toepassingsscan gedaan. Formulieren zonder toepassingsregel gelden altijd;
            voor de rest beslist de scan.
          </template>
        </nldd-text>
        <ul v-if="tags.length > 0" class="applicability__tags" aria-label="Kenmerken volgens de scan">
          <li v-for="k in tags" :key="k"><nldd-tag size="sm" :text="KENMERK_LABEL[k]" /></li>
        </ul>
      </div>
      <nldd-button
        :variant="run ? 'secondary' : 'primary'"
        size="sm"
        :text="run ? 'Scan bijwerken' : 'Start toepassingsscan'"
        @click="emit('scan')"
      />
    </div>

    <!-- "Geldt niet" ingeklapt: de redenen moeten er zijn, maar de lijst is wat
         wél moet gebeuren. -->
    <component
      :is="group.collapsed ? 'details' : 'div'"
      v-for="group in groups"
      :key="group.id"
      class="applicability__group"
      :class="{ 'invulhulp-disclosure': group.collapsed }"
    >
      <component :is="group.collapsed ? 'summary' : 'div'" class="applicability__group-head">
        <nldd-title size="4"><h3 class="applicability__group-title">
          {{ group.label }} ({{ group.rows.length }})
        </h3></nldd-title>
      </component>
      <nldd-text v-if="group.lead" size="sm" color="inherit" class="applicability__group-lead">
        {{ group.lead }}
      </nldd-text>
      <ul class="invulhulp-item-list applicability__list">
        <li
          v-for="row in group.rows"
          :key="row.form.id"
          class="invulhulp-item-list__item applicability__row"
          :class="{ 'applicability__row--nvt': group.id === 'nvt' }"
        >
          <div class="applicability__text">
            <span class="applicability__name">
              <span class="applicability__form">{{ row.form.title }}</span>
              <nldd-tag
                v-if="row.status && group.id !== 'nvt'"
                size="sm"
                :color="formStatusColor(row.status.status)"
                :text="formStatusLabel(row.status)"
              />
            </span>
            <span v-if="row.reason" class="invulhulp-text--sm applicability__reason">
              <span class="applicability__term">Waarom:</span> {{ row.reason }}
            </span>
            <span v-if="row.owner" class="invulhulp-text--sm">
              <span class="applicability__term">Eigenaar:</span> {{ row.owner }}
            </span>
          </div>
          <nldd-button
            variant="neutral-transparent"
            size="sm"
            :text="openText(row, group.id)"
            :accessible-label="openLabel(row, group.id)"
            @click="emit('open', row.form.id)"
          />
        </li>
      </ul>
    </component>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useDossierForms } from '../composables/useDossierForms'
import { OWNER_UNKNOWN, type FormIndexEntry } from '../services/formLoader'
import { formStatusColor, formStatusLabel, type FormProgress } from '../utils/formProgress'
import {
  KENMERK_LABEL,
  SCAN_QUESTIONS,
  activeKenmerken,
  decidersFor,
  orientationOf,
  type ApplicabilityStatus,
  type Decider,
} from '../utils/toepassingsscan'

const emit = defineEmits<{ open: [id: string]; scan: [questionId?: string]; beslishulp: [] }>()

const store = useAssessmentStore()
const { forms, verdictFor, statusFor } = useDossierForms()

const run = computed(() => store.toepassingsscanRun)
const tags = computed(() => (store.kenmerken ? activeKenmerken(store.kenmerken) : []))
const completedOn = computed(() =>
  run.value
    ? new Date(run.value.completedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
    : '',
)

// Built forms only: an announced placeholder has nothing to fill in yet. In
// registry order, which is the order of the phases.
const builtForms = computed(() => forms.value.filter((f) => !f.placeholder))

function list(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}` : names.join('')
}

// ---- Open vragen ------------------------------------------------------------
interface OpenQuestion {
  key: string
  decider: Decider
  vraag: string
  forms: string[]
}

/** The question in one line: a scan question's own wording up to its first
 *  question mark ("Wat doet het systeem?"), without the ticking instruction. */
function questionText(decider: Decider): string {
  if (decider.kind === 'beslishulp') return 'Valt het systeem onder de AI-verordening?'
  const vraag = SCAN_QUESTIONS.find((q) => q.id === decider.questionId)?.vraag ?? decider.questionId
  const end = vraag.indexOf('?')
  return end === -1 ? vraag : vraag.slice(0, end + 1)
}

const openQuestions = computed<OpenQuestion[]>(() => {
  const kenmerken = store.kenmerken
  if (!kenmerken) return []
  const byKey = new Map<string, OpenQuestion>()
  for (const form of builtForms.value) {
    if (orientationOf(verdictFor(form.id).status) !== 'onbekend') continue
    for (const decider of decidersFor(form.applicability, kenmerken)) {
      const key = decider.kind === 'scan' ? decider.questionId : 'beslishulp'
      let q = byKey.get(key)
      if (!q) byKey.set(key, (q = { key, decider, vraag: questionText(decider), forms: [] }))
      if (!q.forms.includes(form.title)) q.forms.push(form.title)
    }
  }
  // Scan order, the beslishulp last: the same order as the scan itself.
  const rank = (q: OpenQuestion) =>
    q.decider.kind === 'scan' ? SCAN_QUESTIONS.findIndex((s) => s.id === q.key) : SCAN_QUESTIONS.length
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b))
})

function openDecider(decider: Decider) {
  if (decider.kind === 'scan') emit('scan', decider.questionId)
  else emit('beslishulp')
}

// ---- Wat geldt --------------------------------------------------------------
type GroupId = 'project' | 'altijd' | 'onbekend' | 'nvt'

interface Row {
  form: FormIndexEntry
  /** Empty when the group states the reason once for all its rows. */
  reason: string
  /** Only a recorded owner; "TODO" is no information. */
  owner: string
  status: FormProgress | null
}

const GROUPS: { id: GroupId; label: string; collapsed?: boolean }[] = [
  { id: 'project', label: 'Geldt voor dit project' },
  { id: 'altijd', label: 'Geldt voor elk IV-verzoek' },
  { id: 'onbekend', label: 'Nog onbekend' },
  { id: 'nvt', label: 'Geldt niet', collapsed: true },
]

function groupOf(status: ApplicabilityStatus): GroupId {
  if (status === 'altijd') return 'altijd'
  if (status === 'verplicht') return 'project'
  if (status === 'nvt') return 'nvt'
  return 'onbekend'
}

const groups = computed(() => {
  const rows = new Map<GroupId, { form: FormIndexEntry; reason: string }[]>(GROUPS.map((g) => [g.id, []]))
  for (const form of builtForms.value) {
    const verdict = verdictFor(form.id)
    rows.get(groupOf(verdict.status))!.push({ form, reason: verdict.reason })
  }
  return GROUPS.map((g) => {
    const raw = rows.get(g.id)!
    // One reason for the whole group goes above it, once — the "geldt voor
    // elk IV-verzoek" group says it in its name, and before a scan the head
    // already says there is none.
    const shared = raw.length > 0 && raw.every((r) => r.reason === raw[0].reason) ? raw[0].reason : ''
    const lead = g.id === 'altijd' || !store.kenmerken ? '' : shared
    return {
      ...g,
      lead,
      rows: raw.map<Row>(({ form, reason }) => ({
        form,
        reason: g.id === 'altijd' || shared ? '' : reason,
        owner: form.owner && form.owner !== OWNER_UNKNOWN ? form.owner : '',
        status: statusFor(form.id),
      })),
    }
  }).filter((g) => g.rows.length > 0)
})

function openText(row: Row, group: GroupId): string {
  if (group === 'nvt') return 'Toch openen'
  if (row.status?.status === 'onvolledig') return 'Afmaken'
  if (row.status?.status === 'bezig') return 'Verder'
  return 'Openen'
}

function openLabel(row: Row, group: GroupId): string {
  const text = openText(row, group)
  return text === 'Verder' ? `Verder met ${row.form.title}` : `${row.form.title} ${text.toLowerCase()}`
}
</script>

<style scoped>
.open-questions,
.applicability {
  margin-block-end: var(--primitives-space-40);
  padding: var(--primitives-space-24) var(--primitives-space-32);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
}

/* Wat de gebruiker nog moet doen: dezelfde lintblauwe leesrand als "Begin
   hier", zodat het zich onderscheidt van de lijst die alleen informeert. */
.open-questions {
  border-inline-start: 4px solid var(--semantics-content-accent-color);
}

.open-questions__title,
.applicability__title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-4);
}

.open-questions__lead,
.applicability__lead {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  max-inline-size: 60ch;
}

.open-questions__list {
  margin-block-start: var(--primitives-space-12);
}

.open-questions__item,
.applicability__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--primitives-space-16);
}

.open-questions__text,
.applicability__text {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-2);
  min-inline-size: 0;
}

.open-questions__question,
.applicability__form {
  font-weight: var(--primitives-font-weight-body-semi-bold);
}

.applicability__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--primitives-space-16);
}

.applicability__head-text {
  min-inline-size: 0;
}

.applicability__tags {
  list-style: none;
  margin: var(--primitives-space-12) 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--primitives-space-4);
}

.applicability__group {
  margin-block-start: var(--primitives-space-24);
}

.applicability__group-title {
  margin: 0;
}

/* The summary carries the chevron (.invulhulp-disclosure); the heading inside
   keeps its own colour. */
.applicability__group-head {
  margin-block-end: var(--primitives-space-8);
}

.applicability__group-lead {
  color: var(--invulhulp-color-text-subtle);
  margin: 0 0 var(--primitives-space-8);
}

.applicability__name {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--primitives-space-8);
}

.applicability__term {
  font-weight: var(--primitives-font-weight-body-semi-bold);
}

/* Same treatment as the n.v.t. group in Formulieren: struck through, but still
   there and still readable — the reason is the point. */
.applicability__row--nvt .applicability__form {
  text-decoration: line-through;
  text-decoration-color: var(--semantics-content-secondary-color);
  color: var(--semantics-content-secondary-color);
}

/* NLDD's sm breakpoint: the text needs the full width, the button goes under it. */
@media (max-width: 640px) {
  .open-questions,
  .applicability {
    padding: var(--primitives-space-16);
  }

  .open-questions__item,
  .applicability__row,
  .applicability__head {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--primitives-space-8);
  }
}
</style>
