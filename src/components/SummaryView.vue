<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm summary-view">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <div class="summary-view__intro">
        <h1 class="rvo-heading rvo-heading--xl summary-view__title">Samenvatting</h1>
        <p class="rvo-text summary-view__lead">Overzicht van alle ingevulde antwoorden.</p>
      </div>

      <!-- Risk level (forms with riskClassification feature) -->
      <div
        v-if="props.formConfig.features.riskClassification && store.riskLevel"
        class="rvo-alert rvo-alert--padding-md"
        :class="`rvo-alert--${alertType}`"
      >
        <div class="rvo-alert__container">
          <strong>Risicoclassificatie: {{ riskInfo?.label }}</strong><br />
          {{ riskInfo?.description }}
        </div>
      </div>

      <!-- Unanswered mandatory -->
      <div v-if="unansweredMandatory.length > 0" class="rvo-alert rvo-alert--warning rvo-alert--padding-md">
        <div class="rvo-alert__container">
          <div class="summary-view__unanswered-content">
            <strong>Verplichte vragen niet ingevuld ({{ unansweredMandatory.length }})</strong>
            <p class="rvo-text rvo-text--sm summary-view__unanswered-intro">De volgende verplichte vragen zijn nog niet beantwoord:</p>
            <div v-for="group in unansweredGrouped" :key="group.sectionTitle" class="summary-view__unanswered-group">
              <p class="rvo-text rvo-text--sm summary-view__unanswered-section">
                {{ group.sectionTitle }}
              </p>
              <ul class="summary-view__unanswered-list">
                <li v-for="q in group.questions" :key="q.id" class="rvo-text rvo-text--sm">
                  <em>{{ q.subsectionTitle }}</em> — {{ q.text }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

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
      <div class="rvo-layout-row rvo-layout-gap--md summary-view__exports">
        <button @click="exportPdf" class="rvo-button rvo-button--primary">
          Download PDF rapport
        </button>
        <button @click="exportWord" class="rvo-button rvo-button--secondary">
          Download Word rapport
        </button>
        <button @click="doExportJson" class="rvo-button rvo-button--secondary">
          Download JSON (hervatten)
        </button>
      </div>

      <!-- Import -->
      <div>
        <p class="rvo-text rvo-text--sm summary-view__import-hint">
          Of laad een eerder opgeslagen JSON-bestand om verder te gaan waar u gebleven was:
        </p>
        <div class="rvo-layout-row rvo-layout-gap--sm summary-view__import-row">
          <input ref="fileInput" type="file" accept=".json" class="invulhulp-visually-hidden" @change="handleImport" />
          <button @click="fileInput?.click()" class="rvo-button rvo-button--tertiary">
            JSON importeren
          </button>
          <span v-if="importError" class="rvo-text rvo-text--sm summary-view__import-error">{{ importError }}</span>
          <span v-if="importSuccess" class="rvo-text rvo-text--sm summary-view__import-success">Gegevens hersteld!</span>
        </div>
      </div>

      <!-- Answers by section -->
      <div v-for="section in visibleSections" :key="section.id" class="rvo-layout-column rvo-layout-gap--lg">
        <h2 class="rvo-heading rvo-heading--lg summary-view__section-title">
          {{ section.title }}
        </h2>
        <hr class="invulhulp-divider summary-view__section-divider" />

        <div v-for="subsection in section.subsections" :key="subsection.id" class="rvo-layout-column rvo-layout-gap--md">
          <h3 class="rvo-heading rvo-heading--md summary-view__subsection-title">{{ subsection.title }}</h3>

          <article
            v-for="question in subsection.questions"
            :key="question.id"
            class="rvo-card rvo-card--outline rvo-card--padding--sm summary-view__card"
            :class="`summary-view__card--${question.importance}`"
          >
            <div class="summary-view__card-body">
              <p class="rvo-text rvo-text--sm summary-view__question">
                {{ question.text }}
              </p>
              <p
                class="rvo-text rvo-text--sm summary-view__answer"
                :class="{ 'summary-view__answer--empty': !hasAnswer(question.id) }"
              >
                {{ formattedAnswer(question.id) }}
              </p>
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
import { exportToPdf } from '../services/pdfExport'
import { exportToWord } from '../services/wordExport'
import { exportToJson, importFromJson } from '../services/dataExport'
import type { FormConfig, Question } from '../models/Assessment'
import { parseTableAnswer, tableAnswerToPlainText } from '../utils/tableAnswer'

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

const alertType = computed(() => {
  switch (store.riskLevel) {
    case 'onaanvaardbaar': return 'error'
    case 'hoog': return 'warning'
    case 'beperkt': return 'info'
    default: return 'success'
  }
})

function hasAnswer(id: string): boolean {
  const a = store.getAnswer(id)
  if (Array.isArray(a)) return a.length > 0
  return typeof a === 'string' && a.trim() !== ''
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

function formattedAnswer(id: string): string {
  const a = store.getAnswer(id)
  if (!a) return '(niet ingevuld)'
  if (Array.isArray(a)) return a.length > 0 ? a.join(', ') : '(niet ingevuld)'
  const table = parseTableAnswer(a)
  if (table) return tableAnswerToPlainText(table) || '(niet ingevuld)'
  const clean = stripHtml(a).replace('\n---\n', ' — ')
  return clean.trim() || '(niet ingevuld)'
}

function exportPdf() {
  exportToPdf(
    store.answers,
    props.formConfig,
    store.riskLevel,
    store.goDecision,
    systemName.value || undefined,
    store.activeForm.attachments ?? {},
    store.sessionId,
  )
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

function doExportJson() {
  exportToJson(
    store.answers,
    props.formConfig.id,
    store.riskLevel,
    store.goDecision,
    store.completedSections,
    systemName.value,
    store.activeForm.attachments ?? {},
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
  padding-block: var(--rvo-space-2xl) var(--rvo-space-3xl);
}

.summary-view__title {
  color: var(--rvo-color-lintblauw);
  margin: 0 0 var(--rvo-space-xs);
}

.summary-view__lead {
  color: var(--invulhulp-color-text-muted);
  margin: 0;
}

.summary-view__unanswered-content {
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-2xs);
}

.summary-view__unanswered-intro {
  margin: 0;
}

.summary-view__unanswered-group {
  margin-block-start: var(--rvo-space-2xs);
}

.summary-view__unanswered-section {
  margin: var(--rvo-space-2xs) 0;
  font-weight: var(--rvo-font-weight-semibold);
}

.summary-view__unanswered-list {
  margin: 0 0 var(--rvo-space-xs);
  padding-inline-start: var(--rvo-space-md);
}

.summary-view__exports {
  flex-wrap: wrap;
}

.summary-view__import-hint {
  color: var(--invulhulp-color-text-muted);
  margin: 0 0 var(--rvo-space-xs);
}

.summary-view__import-row {
  align-items: center;
  flex-wrap: wrap;
}

.summary-view__import-error {
  color: var(--rvo-color-rood);
}

.summary-view__import-success {
  color: var(--rvo-color-groen);
}

.summary-view__section-title {
  color: var(--rvo-color-lintblauw);
  margin: 0;
}

.summary-view__section-divider {
  border-block-end-color: var(--rvo-color-lintblauw);
  border-block-end-width: 2px;
  margin: 0;
}

.summary-view__subsection-title {
  color: var(--rvo-color-grijs-800);
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
  gap: var(--rvo-space-2xs);
}

.summary-view__question {
  font-weight: var(--rvo-font-weight-semibold);
  margin: 0;
  color: var(--rvo-color-grijs-800);
}

.summary-view__answer {
  margin: 0;
  color: var(--rvo-color-grijs-900, var(--rvo-color-grijs-800));
}

.summary-view__answer--empty {
  color: var(--rvo-color-grijs-500);
  font-style: italic;
}
</style>
