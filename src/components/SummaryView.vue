<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm" style="padding-top: 32px; padding-bottom: 48px;">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <div>
        <h1 class="rvo-heading rvo-heading--xl" style="color: #154273; margin: 0 0 8px 0;">Samenvatting</h1>
        <p class="rvo-text" style="color: #555; margin: 0;">Overzicht van alle ingevulde antwoorden.</p>
      </div>

      <!-- Risk level (forms with riskClassification feature) -->
      <div v-if="props.formConfig.features.riskClassification && store.riskLevel" :class="`rvo-alert rvo-alert--${alertType}`" style="border-radius: 4px;">
        <div class="rvo-alert__content">
          <strong>Risicoclassificatie: {{ riskInfo?.label }}</strong><br />
          {{ riskInfo?.description }}
        </div>
      </div>

      <!-- Unanswered mandatory -->
      <div v-if="unansweredMandatory.length > 0" class="rvo-alert rvo-alert--warning" style="border-radius: 4px;">
        <div class="rvo-alert__content">
          <strong>Verplichte vragen niet ingevuld ({{ unansweredMandatory.length }})</strong><br />
          De volgende verplichte vragen zijn nog niet beantwoord:
          <ul style="margin: 8px 0 0; padding-left: 20px;">
            <li v-for="q in unansweredMandatory" :key="q.id" class="rvo-text rvo-text--sm">
              {{ q.id }}: {{ q.text.slice(0, 80) }}...
            </li>
          </ul>
        </div>
      </div>

      <!-- Name input -->
      <div>
        <label class="rvo-text rvo-text--md" style="font-weight: 500; display: block; margin-bottom: 6px;">
          {{ props.formConfig.meta.systemNamePlaceholder ? 'Naam (voor export)' : 'Naam van het AI-systeem (voor export)' }}
        </label>
        <input
          v-model="systemName"
          type="text"
          class="aiia-textarea"
          style="min-height: unset; padding: 10px 12px; resize: none; height: auto;"
          :placeholder="props.formConfig.meta.systemNamePlaceholder ?? 'Naam van het systeem...'"
        />
      </div>

      <!-- Export buttons -->
      <div class="rvo-layout-row rvo-layout-gap--md" style="flex-wrap: wrap;">
        <button @click="exportPdf" class="rvo-button rvo-button--primary">
          Download PDF rapport
        </button>
        <button @click="doExportJson" class="rvo-button rvo-button--secondary">
          Download JSON (hervatten)
        </button>
      </div>

      <!-- Import -->
      <div>
        <p class="rvo-text rvo-text--sm" style="color: #555; margin: 0 0 8px 0;">
          Of laad een eerder opgeslagen JSON-bestand om verder te gaan waar u gebleven was:
        </p>
        <div class="rvo-layout-row rvo-layout-gap--sm" style="align-items: center; flex-wrap: wrap;">
          <input ref="fileInput" type="file" accept=".json" style="display:none" @change="handleImport" />
          <button @click="fileInput?.click()" class="rvo-button rvo-button--tertiary">
            JSON importeren
          </button>
          <span v-if="importError" class="rvo-text rvo-text--sm" style="color: #c0392b;">{{ importError }}</span>
          <span v-if="importSuccess" class="rvo-text rvo-text--sm" style="color: #27ae60;">Gegevens hersteld!</span>
        </div>
      </div>

      <!-- Answers by section -->
      <div v-for="section in visibleSections" :key="section.id" class="rvo-layout-column rvo-layout-gap--lg">
        <h2 class="rvo-heading rvo-heading--lg" style="color: #154273; border-bottom: 2px solid #154273; padding-bottom: 8px;">
          {{ section.title }}
        </h2>

        <div v-for="subsection in section.subsections" :key="subsection.id" class="rvo-layout-column rvo-layout-gap--md">
          <h3 class="rvo-heading rvo-heading--md" style="color: #333;">{{ subsection.title }}</h3>

          <div v-for="question in subsection.questions" :key="question.id" style="padding: 12px; background: white; border-radius: 4px; border: 1px solid #e8e8e8;">
            <div class="rvo-layout-row" style="gap: 8px; align-items: flex-start;">
              <div
                style="width: 4px; height: 100%; min-height: 40px; border-radius: 2px; flex-shrink: 0; align-self: stretch;"
                :style="{ background: question.importance === 'mandatory' ? '#0070bb' : '#39870c' }"
              ></div>
              <div class="rvo-layout-column" style="gap: 4px; flex: 1;">
                <p class="rvo-text rvo-text--sm" style="font-weight: 500; margin: 0; color: #333;">
                  {{ question.id }}: {{ question.text }}
                </p>
                <p class="rvo-text rvo-text--sm" :style="{ color: hasAnswer(question.id) ? '#000' : '#999', fontStyle: hasAnswer(question.id) ? 'normal' : 'italic', margin: 0 }">
                  {{ formattedAnswer(question.id) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { exportToPdf } from '../services/pdfExport'
import { exportToJson, importFromJson } from '../services/dataExport'
import type { FormConfig, Question } from '../models/Assessment'

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

const allQuestions = computed((): Question[] => {
  const qs: Question[] = []
  for (const section of visibleSections.value) {
    for (const sub of section.subsections) {
      qs.push(...sub.questions)
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

function formattedAnswer(id: string): string {
  const a = store.getAnswer(id)
  if (!a) return '(niet ingevuld)'
  if (Array.isArray(a)) return a.length > 0 ? a.join(', ') : '(niet ingevuld)'
  const clean = a.replace('\n---\n', ' — ')
  return clean.trim() || '(niet ingevuld)'
}

function exportPdf() {
  exportToPdf(
    store.answers,
    props.formConfig,
    store.riskLevel,
    store.goDecision,
    systemName.value || undefined,
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
    // Support both old assessmentType field and new formId field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formId = (data as any).formId ?? (data as any).assessmentType ?? 'aiia'
    store.setActiveForm(formId)
    const formState = store.forms[formId]
    formState.answers = data.answers
    formState.riskLevel = data.riskLevel
    formState.goDecision = data.goDecision
    formState.completedSections = data.completedSections
    systemName.value = data.systemName || ''
    importSuccess.value = true
    input.value = ''
  } catch (e: unknown) {
    importError.value = e instanceof Error ? e.message : 'Import mislukt'
    input.value = ''
  }
}
</script>
