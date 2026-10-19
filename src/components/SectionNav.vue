<template>
  <!-- De stappen van het open formulier als genummerde tijdlijn, in de
       zijbalk die in een formulier alleen over dat formulier gaat
       (DossierFormsNav). De voortgang staat bovenaan, AI Modus onderaan.
       Eén lijst, zodat de tijdlijn doorloopt; de koppen van de delen zijn
       rijen zonder stip. -->
  <div class="invulhulp-nav">
    <!-- accessible-label overschrijft de aria-valuetext ("x% voltooid") die
         de balk zelf zou opbouwen; stappen tellen hier, geen percentages. -->
    <nldd-progress-bar
      size="sm"
      text="Voortgang"
      value-format="fraction"
      :value="completedCount"
      :max="totalCount"
      :accessible-label="`${completedCount} van ${totalCount} stappen voltooid`"
    />
    <nldd-spacer size="16" />

    <nldd-list
      variant="simple"
      type="navigation"
      dividers="never"
      :aria-label="`Stappen van ${formConfig.title}`"
    >
      <template v-for="(row, idx) in rows" :key="row.key">
        <nldd-list-item v-if="row.kind === 'header'" size="sm">
          <nldd-timeline-track-cell
            size="md"
            variant="none"
            :status="statusAt(idx)"
            :position="positionAt(idx)"
          />
          <nldd-spacer-cell size="12" />
          <nldd-title-cell size="6" heading-level="3" :text="row.label" />
        </nldd-list-item>

        <!-- A part that opens once a decision allows it: shown, so the length
             of the form is no surprise, but not a link yet. -->
        <nldd-list-item v-else-if="row.kind === 'locked'" size="sm">
          <nldd-timeline-track-cell size="md" status="future" :position="positionAt(idx)" icon="lock-closed" />
          <nldd-spacer-cell size="12" />
          <nldd-text-cell :text="row.label" :supporting-text="row.supportingText" />
        </nldd-list-item>

        <nldd-list-item
          v-else
          size="sm"
          button
          :current="store.currentView === row.key || undefined"
          @click="navigate(row.key)"
        >
          <nldd-timeline-track-cell
            size="md"
            :status="statusAt(idx)"
            :position="positionAt(idx)"
            :icon="row.icon ?? (row.done ? 'check-mark' : undefined)"
            :text="row.number"
          />
          <nldd-spacer-cell size="12" />
          <nldd-text-cell :text="row.label" :supporting-text="row.supportingText" />
        </nldd-list-item>
      </template>
    </nldd-list>

    <!-- What comes after this form (DossierFormsNav fills it). -->
    <slot name="after-steps" />

    <!-- AI Mode: always reachable while working in the form -->
    <div class="invulhulp-nav__ai-mode">
      <hr class="invulhulp-divider" />
      <nldd-text size="xxs" weight="bold" color="inherit" class="invulhulp-nav__ai-label">AI Modus</nldd-text>
      <AiModeToggle
        :form-id="formConfig.id"
        :has-documents="readyDocIds.length > 0"
        :is-active="aiModeActive.has(formConfig.id)"
        :is-done="formConfig.id in aiModeDone"
        :done-filled-count="aiModeDone[formConfig.id] ?? 0"
        :done-total-count="aiModeTotal[formConfig.id] ?? 0"
        :progress="aiModeProgress[formConfig.id] ?? null"
        @activate="startAiMode"
        @cancel="cancelAiMode"
        @dismiss="dismissAiModeDone"
      />
      <nldd-text line-height="snug" size="xxs" color="inherit" class="invulhulp-nav__ai-hint">
        <template v-if="readyDocIds.length > 0">
          Overschrijft alle antwoorden met AI op basis van {{ readyDocIds.length }} brondocument{{ readyDocIds.length === 1 ? '' : 'en' }}.
        </template>
        <template v-else>
          Upload brondocumenten op het dossieroverzicht om AI Modus te gebruiken.
        </template>
      </nldd-text>
    </div>

    <!-- Opnieuw beginnen wist alleen dit formulier, dus het staat in de
         stappenkolom van dit formulier — onderaan, ver van de stappenlijst,
         zodat een misklik daar hem niet raakt. Pas zichtbaar zodra er iets
         te wissen valt. -->
    <div v-if="hasProgress" class="invulhulp-nav__reset">
      <hr class="invulhulp-divider" />
      <nldd-button
        variant="neutral-transparent"
        size="sm"
        start-icon="arrow-2-counter-clockwise"
        text="Formulier opnieuw beginnen"
        @click="resetDialog?.open()"
      />
    </div>

    <!-- Buiten de v-if: NLDD wil de dialoog in de DOM houden, anders vallen
         de animaties weg — en na bevestigen verdwijnt de knop meteen. -->
    <ConfirmDialog
      ref="resetDialog"
      :title="`&quot;${formConfig.title}&quot; opnieuw beginnen?`"
      message="Al uw antwoorden in dit formulier worden gewist."
      confirm-label="Opnieuw beginnen"
      cancel-label="Annuleren"
      variant="warning"
      @confirm="store.resetActive()"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAiMode } from '../composables/useAiMode'
import type { FormConfig, NavStepSubsections, NavStepSpecialView, Subsection } from '../models/Assessment'
import { answeredSubsections, formProgress, missingMandatoryBySubsection } from '../utils/formProgress'
import AiModeToggle from './AiModeToggle.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{
  formConfig: FormConfig
  navOrder: string[]
}>()

const emit = defineEmits<{ navigate: [viewId: string] }>()

const store = useAssessmentStore()
const { aiModeActive, aiModeProgress, aiModeDone, aiModeTotal, readyDocIds, startAiMode, cancelAiMode, dismissAiModeDone } = useAiMode()

const riskLabels: Record<string, string> = {
  onaanvaardbaar: 'Verboden',
  hoog: 'Hoog',
  beperkt: 'Beperkt',
  minimaal: 'Minimaal',
}

interface Row {
  /** The view id for a step; a stable key for headers and locked parts. */
  key: string
  kind: 'step' | 'header' | 'locked'
  label: string
  supportingText?: string
  done?: boolean
  /** Introductie and Samenvatting carry an icon instead of a number. */
  icon?: string
  number?: string
}

function getSubsections(step: NavStepSubsections): Subsection[] {
  const section = props.formConfig.sections.find((s) => s.id === step.sectionId)
  if (!section) return []
  return section.subsections.filter((sub) => !step.exclude?.includes(sub.id))
}

function completionId(step: NavStepSpecialView): string {
  return step.completionSectionId ?? step.viewId
}

// Open verplichte vragen per subsectie. Een subsectie telt pas als afgerond
// wanneer hij is doorlopen én er geen verplichte vraag meer leeg staat — het
// vinkje in de zijbalk en de voortgangsteller gaan over hetzelfde.
const openMandatory = computed(() => missingMandatoryBySubsection(props.formConfig, store.activeForm))

// Filled in without pressing "Volgende" (sidebar, AI Modus) counts too.
const answered = computed(() => answeredSubsections(props.formConfig, store.activeForm))

function isSubsectionDone(subId: string): boolean {
  return (store.isSectionCompleted(subId) || answered.value.has(subId)) && !openMandatory.value.has(subId)
}

// Doorgeklikt, maar er staan nog verplichte vragen open: geen vinkje, wel de
// telling als zichtbare tekst. Anders leest de zijbalk het formulier af als
// klaar terwijl het leeg is. "Afgerond" staat er als tekst naast het vinkje,
// zodat het niet alleen aan de stip te zien is.
function subsectionStatus(subId: string): string {
  if (isSubsectionDone(subId)) return 'Afgerond'
  const open = openMandatory.value.get(subId)
  if (open && store.isSectionCompleted(subId)) {
    return open === 1 ? 'Nog 1 verplichte vraag' : `Nog ${open} verplichte vragen`
  }
  return ''
}

const rows = computed((): Row[] => {
  const out: Row[] = [{ key: 'home', kind: 'step', label: 'Introductie', icon: 'info-circle' }]
  let n = 0
  const numbered = (row: Omit<Row, 'number'>): Row => ({ ...row, number: String(++n) })
  for (const step of props.formConfig.navigation) {
    if (step.type === 'subsections') {
      const title = props.formConfig.sections.find((s) => s.id === step.sectionId)?.title ?? step.sectionId
      const subs = getSubsections(step)
      if (step.condition) {
        const value = store[step.condition.storeKey]
        // Decided the other way: the part is not part of this form.
        if (value !== step.condition.value && value !== null && value !== undefined) continue
        if (value !== step.condition.value) {
          out.push({ key: `${step.sectionId}-header`, kind: 'header', label: title })
          out.push({
            key: `${step.sectionId}-locked`,
            kind: 'locked',
            label: subs.length === 1 ? '1 stap' : `${subs.length} stappen`,
            supportingText: 'Komt vrij na de beslissing',
          })
          continue
        }
      }
      out.push({ key: `${step.sectionId}-header`, kind: 'header', label: title })
      for (const sub of subs) {
        out.push(numbered({
          key: sub.id,
          kind: 'step',
          label: sub.title,
          supportingText: subsectionStatus(sub.id),
          done: isSubsectionDone(sub.id),
        }))
      }
    } else if (step.viewId !== 'summary') {
      const done = store.isSectionCompleted(completionId(step))
      // A special view joins the part above it unless it opens one of its own.
      if (step.navGroupHeader) {
        out.push({ key: `${step.viewId}-header`, kind: 'header', label: step.navGroupHeader })
      }
      out.push(numbered({
        key: step.viewId,
        kind: 'step',
        label: step.navLabel ?? step.viewId,
        supportingText:
          step.viewId === 'risk' && store.riskLevel
            ? `Risiconiveau: ${riskLabels[store.riskLevel]}`
            : done ? 'Afgerond' : '',
        done,
      }))
    }
  }
  out.push({ key: 'summary', kind: 'step', label: 'Samenvatting & export', icon: 'clipboard-bullet-list' })
  return out
})

// The track is covered up to the step you are on, whatever is done: where you
// are is the dot that stands out, what is done is the check in the dot.
const currentIndex = computed(() => rows.value.findIndex((r) => r.key === store.currentView))

function statusAt(idx: number): 'past' | 'current' | 'future' {
  if (idx === currentIndex.value) return 'current'
  return idx < currentIndex.value ? 'past' : 'future'
}

function positionAt(idx: number): 'first' | 'between' | 'last' {
  if (idx === 0) return 'first'
  return idx === rows.value.length - 1 ? 'last' : 'between'
}

const completedCount = computed(
  () =>
    new Set([...store.completedSections, ...answered.value].filter((id) => !openMandatory.value.has(id))).size,
)
const totalCount = computed(() => props.navOrder.filter((v) => v !== 'home' && v !== 'summary').length)

// Same notion of "begonnen" as the form cards: a completed step or an answer.
const hasProgress = computed(
  () => formProgress(props.formConfig, store.activeForm).status !== 'niet-gestart',
)
const resetDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)

function navigate(id: string) {
  store.setCurrentView(id)
  emit('navigate', id)
}
</script>

<style scoped>
.invulhulp-nav__ai-mode {
  margin-block-start: var(--primitives-space-24);
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-8);
}

.invulhulp-nav__ai-label {
  margin: 0;
  color: var(--semantics-content-secondary-color);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.invulhulp-nav__ai-hint {
  margin: 0;
  color: var(--invulhulp-color-text-subtle);
}

.invulhulp-nav__reset {
  margin-block-start: var(--primitives-space-24);
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-8);
}

/* Not stretched to the column width like the divider: a full-width
   destructive action reads heavier than it is. */
.invulhulp-nav__reset > nldd-button {
  align-self: flex-start;
}
</style>
