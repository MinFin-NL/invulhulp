<template>
  <div class="invulhulp-measure invulhulp-measure--md invulhulp-measure--pad summary-view">
    <div class="invulhulp-column invulhulp-gap--xl">

      <div class="summary-view__intro">
        <nldd-title size="1"><h1 class="summary-view__title">Samenvatting</h1></nldd-title>
        <nldd-text color="inherit" class="summary-view__lead">Overzicht van alle ingevulde antwoorden.</nldd-text>
      </div>

      <!-- Risk level (forms with riskClassification feature) -->
            <nldd-banner
              v-if="props.formConfig.features.riskClassification && store.riskLevel"
              :variant="alertVariant"
            >
          <div>
            <strong>Risicoclassificatie: {{ riskInfo?.label }}</strong><br />
            {{ riskInfo?.description }}
          </div>
      </nldd-banner>

      <!-- Unanswered mandatory -->
      <nldd-banner
        variant="warning"
        v-if="unansweredMandatory.length > 0"
      >
          <div class="summary-view__unanswered-content">
            <strong>Verplichte vragen niet ingevuld ({{ unansweredMandatory.length }})</strong>
            <nldd-text size="sm" class="summary-view__unanswered-intro">De volgende verplichte vragen zijn nog niet beantwoord:</nldd-text>
            <div v-for="group in unansweredGrouped" :key="group.sectionTitle" class="summary-view__unanswered-group">
              <nldd-text weight="bold" size="sm" class="summary-view__unanswered-section">
                {{ group.sectionTitle }}
              </nldd-text>
              <ul class="summary-view__unanswered-list">
                <li v-for="q in group.questions" :key="q.id" class="invulhulp-text--sm">
                  <em>{{ q.subsectionTitle }}</em> — {{ q.text }}
                </li>
              </ul>
            </div>
          </div>
      </nldd-banner>

      <!-- Name input -->
      <div class="rvo-form-field">
        <label class="rvo-form-field__label" for="summary-system-name">
          {{ props.formConfig.meta.systemNamePlaceholder ? 'Naam (voor export)' : 'Naam van het AI-systeem (voor export)' }}
        </label>
        <input
          id="summary-system-name"
          v-model="systemName"
          type="text"
          class="utrecht-textbox utrecht-textbox--md"
          :placeholder="props.formConfig.meta.systemNamePlaceholder ?? 'Naam van het systeem...'"
        />
      </div>

      <!-- Export buttons -->
      <div class="invulhulp-row invulhulp-gap--md summary-view__exports">
        <nldd-button
          variant="primary"
          text="Download Word rapport"
          @click="exportWord"
        />
        <nldd-button
          variant="secondary"
          text="Download origineel format (Word)"
          v-if="showLegacyExport"
          @click="exportLegacy"
        />
      </div>

      <!-- Import -->
      <div>
        <nldd-text color="inherit" size="sm" class="summary-view__import-hint">
          Of laad een eerder opgeslagen JSON-bestand om verder te gaan waar u gebleven was:
        </nldd-text>
        <div class="invulhulp-row invulhulp-gap--sm summary-view__import-row">
          <input ref="fileInput" type="file" accept=".json" class="invulhulp-visually-hidden" @change="handleImport" />
          <nldd-button
            variant="neutral-transparent"
            text="JSON importeren"
            @click="fileInput?.click()"
          />
          <span v-if="importError" class="invulhulp-text--sm summary-view__import-error">{{ importError }}</span>
          <span v-if="importSuccess" class="invulhulp-text--sm summary-view__import-success">Gegevens hersteld!</span>
        </div>
      </div>

      <!-- Answers by section -->
      <div v-for="section in visibleSections" :key="section.id" class="invulhulp-column invulhulp-gap--lg">
        <nldd-title size="2"><h2 class="summary-view__section-title">
          {{ section.title }}
        </h2></nldd-title>
        <hr class="invulhulp-divider summary-view__section-divider" />

        <div v-for="subsection in section.subsections" :key="subsection.id" class="invulhulp-column invulhulp-gap--md">
          <nldd-title size="3"><h3 class="summary-view__subsection-title">{{ subsection.title }}</h3></nldd-title>

          <article
            v-for="question in subsection.questions"
            :key="question.id"
            class="invulhulp-card invulhulp-card--padding-sm summary-view__card"
            :class="`summary-view__card--${question.importance}`"
          >
            <div class="summary-view__card-body">
              <nldd-text weight="bold" color="inherit" size="sm" class="summary-view__question">
                {{ question.text }}
              </nldd-text>

              <!-- The answer keeps the shape it was written in: paragraphs and
                   lists as markup, checkbox answers as a list, a table answer
                   as an actual table. -->
              <template v-for="answer in [renderedAnswers[question.id]]" :key="question.id">
                <nldd-text color="inherit" size="sm" class="summary-view__answer summary-view__answer--empty" v-if="!answer || answer.kind === 'empty'">
                  (niet ingevuld)
                </nldd-text>

                <ul v-else-if="answer.kind === 'list'" class="invulhulp-text--sm summary-view__answer summary-view__answer-list">
                  <li v-for="item in answer.items" :key="item">{{ item }}</li>
                </ul>

                <div v-else-if="answer.kind === 'table'" class="summary-view__answer">
                  <div v-if="answer.table.rows.length > 0" class="summary-view__table-scroll">
                    <nldd-table
                      class="summary-view__table"
                      :columns="gridColumns(answer.columns.length || answer.table.rows[0].length)"
                      :accessible-label="question.text"
                    >
                      <nldd-table-row v-if="answer.columns.length > 0" slot="header">
                        <nldd-text-cell v-for="col in answer.columns" :key="col" size="sm" :text="col" />
                      </nldd-table-row>
                      <nldd-table-row v-for="(row, i) in answer.table.rows" :key="i">
                        <nldd-text-cell v-for="(cell, j) in row" :key="j" size="sm" :text="cell" />
                      </nldd-table-row>
                    </nldd-table>
                  </div>
                  <div v-if="answer.table.notes" class="invulhulp-text--sm summary-view__answer-html" v-html="answer.notesHtml"></div>
                </div>

                <div
                  v-else
                  class="invulhulp-text--sm summary-view__answer summary-view__answer-html"
                  v-html="answer.html"
                ></div>
              </template>
            </div>
          </article>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { exportToWord } from '../services/wordExport'
import { exportToLegacyDocx } from '../services/legacyDocxExport'
import { exportPpmToTemplateDocx } from '../services/ppmTemplateExport'
import { importFromJson } from '../services/dataExport'
import type { FormConfig, Question } from '../models/Assessment'
import { parseTableAnswer, type TableAnswer } from '../utils/tableAnswer'
import { answerToSafeHtml } from '../utils/answerHtml'

const props = defineProps<{
  formConfig: FormConfig
}>()

const store = useAssessmentStore()
const systemName = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const importError = ref('')
const importSuccess = ref(false)

const visibleSections = computed(() =>
  props.formConfig.sections.filter((s) => {
    if (props.formConfig.features.conditionalPartB && s.part === 'B' && !store.showPartB) return false
    return true
  }),
)

type QuestionWithContext = Question & { sectionTitle: string; subsectionTitle: string }

const allQuestions = computed((): QuestionWithContext[] => {
  const qs: QuestionWithContext[] = []
  for (const section of visibleSections.value) {
    for (const sub of section.subsections) {
      for (const q of sub.questions) {
        qs.push({ ...q, sectionTitle: section.title, subsectionTitle: sub.title })
      }
    }
  }
  return qs
})

const unansweredMandatory = computed(() =>
  allQuestions.value.filter((q) => {
    if (q.importance !== 'mandatory') return false
    const a = store.getAnswer(q.id)
    if (Array.isArray(a)) return a.length === 0
    return !a || a.trim() === ''
  }),
)

const unansweredGrouped = computed(() => {
  const groups: { sectionTitle: string; questions: QuestionWithContext[] }[] = []
  for (const q of unansweredMandatory.value) {
    let g = groups.find((x) => x.sectionTitle === q.sectionTitle)
    if (!g) {
      g = { sectionTitle: q.sectionTitle, questions: [] }
      groups.push(g)
    }
    g.questions.push(q)
  }
  return groups
})

const riskInfo = computed(() =>
  store.riskLevel ? (props.formConfig.riskLevelInfo?.[store.riskLevel] ?? null) : null,
)

/** nldd-table lays its columns out with a CSS grid track list; these tables
 *  have no fixed widths, so every column gets an equal share. */
function gridColumns(count: number): string {
  return `repeat(${Math.max(count, 1)}, minmax(0, 1fr))`
}

const alertVariant = computed(() => {
  switch (store.riskLevel) {
    case 'onaanvaardbaar': return 'critical'
    case 'hoog': return 'warning'
    case 'beperkt': return 'accent'
    default: return 'success'
  }
})

// The summary used to flatten every answer with a tag-stripping regex, which
// turned a bulleted answer into one run-on lump and left HTML entities visible
// as source code. Each answer shape now keeps its own rendering.
type RenderedAnswer =
  | { kind: 'empty' }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; columns: string[]; table: TableAnswer; notesHtml: string }
  | { kind: 'html'; html: string }

function renderAnswer(question: Question): RenderedAnswer {
  const value = store.getAnswer(question.id)
  if (Array.isArray(value)) {
    const items = value.filter((v) => v.trim() !== '')
    return items.length > 0 ? { kind: 'list', items } : { kind: 'empty' }
  }
  if (typeof value !== 'string' || value.trim() === '') return { kind: 'empty' }

  const table = parseTableAnswer(value)
  if (table) {
    const columns = (question.columns ?? []).map((c) => c.label)
    const rows = table.rows
      .filter((row) => row.some((cell) => cell.trim() !== ''))
      // Pad short rows so every row lines up with the header.
      .map((row) => Array.from({ length: Math.max(columns.length, row.length) }, (_, i) => row[i] ?? ''))
    if (rows.length === 0 && !table.notes.trim()) return { kind: 'empty' }
    return {
      kind: 'table',
      columns,
      table: { rows, notes: table.notes.trim() },
      notesHtml: answerToSafeHtml(table.notes),
    }
  }

  // Radio answers with a follow-up are stored as "option\n---\nfollow-up";
  // render the two as separate paragraphs instead of gluing them together.
  const html = value
    .split('\n---\n')
    .map((segment) => answerToSafeHtml(segment))
    .filter((segment) => segment !== '')
    .join('')
  return html ? { kind: 'html', html } : { kind: 'empty' }
}

const renderedAnswers = computed(() => {
  const map: Record<string, RenderedAnswer> = {}
  for (const q of allQuestions.value) map[q.id] = renderAnswer(q)
  return map
})

// "Origineel format": the intake export reproduces the official
// "Intakeformulier 2.0" layout; the PPM export fills the official
// PPM-Projectplan 2.0 Word template itself. Other forms have no such format.
const showLegacyExport = computed(() => ['intake', 'ppm'].includes(props.formConfig.id))

function exportLegacy() {
  if (props.formConfig.id === 'ppm') {
    exportPpmToTemplateDocx(
      store.answers,
      store.activeForm.attachments ?? {},
      store.sessionId,
      systemName.value || undefined,
    )
    return
  }
  exportToLegacyDocx(store.answers, props.formConfig, systemName.value || undefined)
}

function exportWord() {
  exportToWord(
    store.answers,
    props.formConfig,
    store.riskLevel,
    store.goDecision,
    systemName.value || undefined,
    store.activeForm.attachments ?? {},
    store.sessionId,
  )
}

async function handleImport(event: Event) {
  importError.value = ''
  importSuccess.value = false
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const data = await importFromJson(file)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formId = (data as any).formId ?? (data as any).assessmentType ?? 'aiia'
    store.setActiveForm(formId)
    const formState = store.forms[formId]
    formState.answers = data.answers
    formState.riskLevel = data.riskLevel
    formState.goDecision = data.goDecision
    formState.completedSections = data.completedSections
    formState.attachments = data.attachments ?? {}
    systemName.value = data.systemName || ''
    importSuccess.value = true
    input.value = ''
  } catch (e: unknown) {
    importError.value = e instanceof Error ? e.message : 'Import mislukt'
    input.value = ''
  }
}
</script>

<style scoped>
.summary-view {
  padding-block: var(--primitives-space-40) var(--primitives-space-48);
}

.summary-view__title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-8);
}

.summary-view__lead {
  color: var(--invulhulp-color-text-muted);
  margin: 0;
}

.summary-view__unanswered-content {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
}

.summary-view__unanswered-intro {
  margin: 0;
}

.summary-view__unanswered-group {
  margin-block-start: var(--primitives-space-4);
}

.summary-view__unanswered-section {
  margin: var(--primitives-space-4) 0;
}

.summary-view__unanswered-list {
  margin: 0 0 var(--primitives-space-8);
  padding-inline-start: var(--primitives-space-16);
}

.summary-view__exports {
  flex-wrap: wrap;
}

.summary-view__import-hint {
  color: var(--invulhulp-color-text-muted);
  margin: 0 0 var(--primitives-space-8);
}

.summary-view__import-row {
  align-items: center;
  flex-wrap: wrap;
}

.summary-view__import-error {
  color: var(--semantics-content-critical-color);
}

.summary-view__import-success {
  color: var(--semantics-content-success-color);
}

.summary-view__section-title {
  color: var(--semantics-content-accent-color);
  margin: 0;
}

.summary-view__section-divider {
  border-block-end-color: var(--semantics-content-accent-color);
  border-block-end-width: 2px;
  margin: 0;
}

.summary-view__subsection-title {
  color: var(--semantics-content-color);
  margin: 0;
}

.summary-view__card {
  border-inline-start: 4px solid var(--invulhulp-color-border);
}

.summary-view__card--mandatory {
  border-inline-start-color: var(--invulhulp-color-mandatory);
}

.summary-view__card--optional {
  border-inline-start-color: var(--invulhulp-color-optional);
}

.summary-view__card-body {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
}

.summary-view__question {
  margin: 0;
  color: var(--semantics-content-color);
}

.summary-view__answer {
  margin: 0;
  color: var(--semantics-content-color, var(--semantics-content-color));
}

.summary-view__answer--empty {
  color: var(--semantics-content-secondary-color);
  font-style: italic;
}

/* Rich answers keep their own block rhythm: paragraphs stay apart, lists keep
   their bullets, so a long answer reads as text instead of one wall. */
.summary-view__answer-html :deep(p) {
  margin: 0 0 var(--primitives-space-4);
}

.summary-view__answer-html :deep(p:last-child) {
  margin-block-end: 0;
}

.summary-view__answer-html :deep(ul),
.summary-view__answer-html :deep(ol),
.summary-view__answer-list {
  margin: 0 0 var(--primitives-space-4);
  padding-inline-start: var(--primitives-space-16);
}

.summary-view__answer-html :deep(ul:last-child),
.summary-view__answer-html :deep(ol:last-child) {
  margin-block-end: 0;
}

.summary-view__answer-html :deep(li) {
  margin-block-end: var(--primitives-space-2, 4px);
}

.summary-view__answer-html :deep(li > p) {
  margin: 0;
}

.summary-view__answer-html :deep(blockquote) {
  margin: 0 0 var(--primitives-space-4);
  padding-inline-start: var(--primitives-space-8);
  border-inline-start: 2px solid var(--invulhulp-color-border);
}

.summary-view__table-scroll {
  overflow-x: auto;
}

.summary-view__table-scroll + .summary-view__answer-html {
  margin-block-start: var(--primitives-space-4);
}

.summary-view__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--primitives-font-size-90);
}

</style>
