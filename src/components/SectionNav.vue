<template>
  <!-- Tweede kolom van het dossier: de stappen van het open formulier. De
       voortgang staat bovenaan, AI Modus onderaan; daartussen per deel van het
       formulier een lijst, zoals de eerste kolom de formulieren per fase toont. -->
  <nldd-page sticky-header :accessible-label="`Stappen van ${formConfig.title}`">
    <nldd-top-title-bar
      slot="header"
      class="invulhulp-pane-bar"
      :text="formConfig.title"
      :back-text="backText"
      heading-level="2"
      collapse-anchor="form-nav-title"
    />
    <nldd-simple-section width="full">
      <nldd-title id="form-nav-title" size="3" heading-level="2" :text="formConfig.title" />
      <nldd-spacer size="16" />

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

      <template v-for="(group, idx) in groups" :key="group.key">
        <nldd-spacer :size="idx === 0 ? '16' : '24'" />
        <template v-if="group.title">
          <nldd-title size="5" heading-level="3" :text="group.title" />
          <nldd-spacer size="8" />
        </template>
        <nldd-list variant="simple" type="navigation" :aria-label="group.title ?? group.label">
          <nldd-list-item
            v-for="item in group.items"
            :key="item.id"
            size="md"
            button
            :current="store.currentView === item.id || undefined"
            @click="navigate(item.id)"
          >
            <template v-if="item.icon">
              <nldd-icon-cell size="20" :icon="item.icon" />
              <nldd-spacer-cell size="8" />
            </template>
            <nldd-text-cell :text="item.label" :supporting-text="item.supportingText" />
            <nldd-spacer-cell size="8" />
            <template v-if="item.done">
              <nldd-icon-cell size="20" icon="check-mark-circle" color="success" />
              <nldd-spacer-cell size="4" />
            </template>
            <nldd-icon-cell size="20" icon="chevron-right" />
          </nldd-list-item>
        </nldd-list>
      </template>

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
          :phase="aiModePhase[formConfig.id] ?? null"
          :can-undo-smoothing="hasSmoothingUndo(formConfig.id)"
          @activate="startAiMode"
          @cancel="cancelAiMode"
          @dismiss="dismissAiModeDone"
          @undo-smoothing="undoSmoothing"
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
    </nldd-simple-section>
  </nldd-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAiMode } from '../composables/useAiMode'
import type { FormConfig, NavStepSubsections, NavStepSpecialView, Subsection } from '../models/Assessment'
import { formProgress, missingMandatoryBySubsection } from '../utils/formProgress'
import AiModeToggle from './AiModeToggle.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{
  formConfig: FormConfig
  navOrder: string[]
  /** Label of the title bar's back button: the pane it returns to (the
   *  dossier's forms list). Only visible once the panes stack. */
  backText?: string
}>()

const emit = defineEmits<{ navigate: [viewId: string] }>()

const store = useAssessmentStore()
const { aiModeActive, aiModeProgress, aiModeDone, aiModeTotal, aiModePhase, readyDocIds, startAiMode, cancelAiMode, dismissAiModeDone, hasSmoothingUndo, undoSmoothing } = useAiMode()

const riskLabels: Record<string, string> = {
  onaanvaardbaar: 'Verboden',
  hoog: 'Hoog',
  beperkt: 'Beperkt',
  minimaal: 'Minimaal',
}

interface StepItem {
  id: string
  label: string
  supportingText: string
  done: boolean
  icon?: string
}

interface StepGroup {
  key: string
  /** Visible heading; null for the groups that stand on their own (Introductie,
   *  Samenvatting). */
  title: string | null
  /** Accessible name of the list when it has no visible heading. */
  label: string
  items: StepItem[]
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

function isSubsectionDone(subId: string): boolean {
  return store.isSectionCompleted(subId) && !openMandatory.value.has(subId)
}

// Doorgeklikt, maar er staan nog verplichte vragen open: geen vinkje, wel de
// telling als zichtbare tekst. Anders leest de zijbalk het formulier af als
// klaar terwijl het leeg is.
function subsectionStatus(subId: string): string {
  if (isSubsectionDone(subId)) return 'Afgerond'
  const open = openMandatory.value.get(subId)
  if (open && store.isSectionCompleted(subId)) {
    return open === 1 ? 'Nog 1 verplichte vraag' : `Nog ${open} verplichte vragen`
  }
  return ''
}

const groups = computed((): StepGroup[] => {
  const out: StepGroup[] = [
    {
      key: 'start',
      title: null,
      label: 'Start',
      items: [{ id: 'home', label: 'Introductie', supportingText: '', done: false, icon: 'info-circle' }],
    },
  ]
  for (const step of props.formConfig.navigation) {
    if (step.type === 'subsections') {
      if (step.condition && store[step.condition.storeKey] === false) continue
      const title = props.formConfig.sections.find((s) => s.id === step.sectionId)?.title ?? step.sectionId
      out.push({
        key: step.sectionId,
        title,
        label: title,
        items: getSubsections(step).map((sub) => ({
          id: sub.id,
          label: sub.title,
          supportingText: subsectionStatus(sub.id),
          done: isSubsectionDone(sub.id),
        })),
      })
    } else if (step.viewId !== 'summary') {
      const done = store.isSectionCompleted(completionId(step))
      const item: StepItem = {
        id: step.viewId,
        label: step.navLabel ?? step.viewId,
        supportingText:
          step.viewId === 'risk' && store.riskLevel
            ? `Risiconiveau: ${riskLabels[store.riskLevel]}`
            : done ? 'Afgerond' : '',
        done,
      }
      // A special view joins the list above it unless it opens a group of its own.
      if (step.navGroupHeader) {
        out.push({ key: step.viewId, title: step.navGroupHeader, label: step.navGroupHeader, items: [item] })
      } else {
        out[out.length - 1].items.push(item)
      }
    }
  }
  out.push({
    key: 'summary',
    title: null,
    label: 'Afronden',
    items: [{ id: 'summary', label: 'Samenvatting & export', supportingText: '', done: false, icon: 'clipboard-bullet-list' }],
  })
  return out
})

const completedCount = computed(
  () => store.completedSections.filter((id) => !openMandatory.value.has(id)).length,
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
