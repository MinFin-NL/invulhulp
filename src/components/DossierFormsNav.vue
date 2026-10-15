<template>
  <!-- De navigatiekolom van het dossier. Op het overzicht: alle formulieren,
       gegroepeerd zoals de dossierpagina ze groepeert (Vooraf, dan per fase).
       In een formulier gaat de kolom alleen over dát formulier: terug naar het
       dossier, wisselen via een menu, de stappen (SectionNav) en daaronder het
       volgende formulier. Twintig andere formulieren die meescrollen
       verdrongen de stappen, en een tweede kolom kostte de inhoud 320px. -->
  <nldd-page sticky-header :accessible-label="pageLabel">
    <nldd-top-title-bar
      slot="header"
      class="invulhulp-pane-bar"
      :text="activeEntry?.title ?? dossierName"
      heading-level="2"
      collapse-anchor="dossier-nav-title"
    />
    <nldd-simple-section width="full">
      <!-- In een formulier. Waits for the form's config only for the steps,
           so the head does not flash the previous form while it loads. -->
      <template v-if="activeEntry">
        <div class="dossier-nav__back">
          <nldd-button
            variant="neutral-transparent"
            size="sm"
            start-icon="chevron-left"
            :text="dossierName"
            :accessible-label="`Terug naar dossier ${dossierName}`"
            @click="emit('overview')"
          />
        </div>
        <nldd-spacer size="12" />
        <!-- The position line is the switcher: "formulier 1 van 2" already says
             there are more, so that is where you click to pick another one.
             The title keeps the full width. -->
        <div class="dossier-nav__switch">
          <nldd-button
            variant="neutral-transparent"
            size="xs"
            expandable
            :text="positionText"
            :accessible-label="`${positionText}: ander formulier openen`"
          >
            <nldd-menu slot="popup" accessible-label="Formulieren in dit dossier" max-items="12">
              <nldd-menu-group v-for="group in groups" :key="group.key" :text="group.label">
                <nldd-menu-item
                  v-for="form in group.forms"
                  :key="form.id"
                  type="radio"
                  :selected="form.id === store.activeFormId || undefined"
                  :text="form.title"
                  :details="menuDetails(form.id)"
                  @select="form.id !== store.activeFormId && emit('open', form.id)"
                />
              </nldd-menu-group>
            </nldd-menu>
          </nldd-button>
        </div>
        <nldd-spacer size="4" />
        <nldd-title id="dossier-nav-title" size="3" heading-level="2" :text="activeEntry.title" />
        <nldd-spacer size="16" />

        <!-- Do not put a v-if on the SectionNav tag itself:
             sectionNav.contract.test.ts fails if you do. -->
        <template v-if="formConfig">
          <SectionNav
            :form-config="formConfig"
            :nav-order="navOrder"
            @navigate="emit('navigate', $event)"
          >
            <template v-if="nextForm" #after-steps>
              <nldd-spacer size="24" />
              <nldd-title size="5" heading-level="3" text="Volgend formulier" />
              <nldd-spacer size="8" />
              <nldd-list variant="box-tinted" type="navigation" aria-label="Volgend formulier">
                <nldd-list-item size="md" button @click="emit('open', nextForm.form.id)">
                  <nldd-text-cell :text="nextForm.form.title" :supporting-text="nextForm.supportingText" />
                  <nldd-spacer-cell size="8" />
                  <nldd-icon-cell size="20" icon="arrow-right" />
                </nldd-list-item>
              </nldd-list>
            </template>
          </SectionNav>
        </template>
      </template>

      <!-- Op het overzicht: alle formulieren. -->
      <template v-else>
        <nldd-title id="dossier-nav-title" size="3" heading-level="2" :text="dossierName" />
        <nldd-spacer size="16" />

        <nldd-list variant="simple" type="navigation" aria-label="Dossier">
          <nldd-list-item size="md" button current @click="emit('overview')">
            <nldd-icon-cell size="20" icon="folder" />
            <nldd-spacer-cell size="8" />
            <nldd-text-cell text="Overzicht" />
            <nldd-spacer-cell size="8" />
            <nldd-icon-cell size="20" icon="chevron-right" />
          </nldd-list-item>
        </nldd-list>

        <template v-for="group in groups" :key="group.key">
          <nldd-spacer size="24" />
          <nldd-title size="5" heading-level="3" :text="group.label" />
          <nldd-spacer size="8" />
          <nldd-list variant="simple" type="navigation" :aria-label="`Formulieren: ${group.label}`">
            <nldd-list-item
              v-for="form in group.forms"
              :key="form.id"
              size="md"
              button
              @click="emit('open', form.id)"
            >
              <nldd-text-cell :text="form.title" :supporting-text="statusText(form.id)" />
              <nldd-spacer-cell size="8" />
              <nldd-icon-cell size="20" icon="chevron-right" />
            </nldd-list-item>
          </nldd-list>
        </template>
      </template>
    </nldd-simple-section>
  </nldd-page>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useFormProgress } from '../composables/useFormProgress'
import { formStatusLabel } from '../utils/formProgress'
import { groupFormsByTrack } from '../utils/tracks'
import { evaluateApplicability } from '../utils/toepassingsscan'
import type { FormIndexEntry } from '../services/formLoader'
import type { FormConfig } from '../models/Assessment'
import SectionNav from './SectionNav.vue'

defineProps<{
  /** Config of the open form; null on the overview and while it loads. */
  formConfig: FormConfig | null
  navOrder: string[]
}>()

const emit = defineEmits<{ overview: []; open: [formId: string]; navigate: [viewId: string] }>()

const store = useAssessmentStore()
// Only forms that can be opened: placeholders have no JSON and no steps.
const { formIndex, progressFor } = useFormProgress()

const dossierName = computed(() => store.activeDossier.name || 'Dossier')

interface FormGroup {
  key: string
  label: string
  forms: FormIndexEntry[]
}

// Same split as the dossier page: intake and aanbieding precede the phases and
// share one "Vooraf" group; the `onbekend` bucket stays visible as the safety
// net for a typo in index.json.
const groups = computed((): FormGroup[] => {
  const byTrack = groupFormsByTrack(formIndex.value)
  const prelude = byTrack
    .filter((g) => !g.isPhase && g.track !== 'onbekend')
    .flatMap((g) => g.forms)
  const out: FormGroup[] = []
  if (prelude.length > 0) out.push({ key: 'vooraf', label: 'Vooraf', forms: prelude })
  for (const g of byTrack) {
    if ((g.isPhase || g.track === 'onbekend') && g.forms.length > 0) {
      out.push({ key: g.track, label: g.label, forms: g.forms })
    }
  }
  return out
})

const activeGroup = computed(() =>
  groups.value.find((g) => g.forms.some((f) => f.id === store.activeFormId)) ?? null,
)
const activeEntry = computed(() =>
  activeGroup.value?.forms.find((f) => f.id === store.activeFormId) ?? null,
)

const pageLabel = computed(() =>
  activeEntry.value ? `${activeEntry.value.title} in ${dossierName.value}` : `Formulieren in ${dossierName.value}`,
)

// "Initiatiefase · formulier 6 van 11": where this form sits without the list.
const positionText = computed(() => {
  const group = activeGroup.value
  if (!group) return ''
  const i = group.forms.findIndex((f) => f.id === store.activeFormId)
  return `${group.label} · formulier ${i + 1} van ${group.forms.length}`
})

function isNvt(form: FormIndexEntry): boolean {
  return evaluateApplicability(form.applicability, store.kenmerken).status === 'nvt'
}

function statusText(formId: string): string {
  const progress = progressFor(store.activeDossier, formId)
  return progress ? formStatusLabel(progress) : ''
}

function menuDetails(formId: string): string {
  const form = formIndex.value.find((f) => f.id === formId)
  return form && isNvt(form) ? 'Geldt niet' : statusText(formId)
}

// The first form after this one that still asks something of you: it applies
// to the dossier (toepassingsscan) and is not finished. Crosses into the next
// phase when this one has nothing left.
const nextForm = computed(() => {
  const ordered = groups.value.flatMap((g) => g.forms.map((form) => ({ form, group: g })))
  const i = ordered.findIndex((e) => e.form.id === store.activeFormId)
  if (i === -1) return null
  const next = ordered.slice(i + 1).find(({ form }) =>
    !isNvt(form) && progressFor(store.activeDossier, form.id)?.status !== 'afgerond',
  )
  if (!next) return null
  const status = statusText(next.form.id)
  return { form: next.form, supportingText: status ? `${next.group.label} · ${status}` : next.group.label }
})
</script>

<style scoped>
/* The back button and the switcher sit on the column's edge, not stretched
   across it; the negative margin lines their text up with the title. */
.dossier-nav__back {
  display: flex;
  margin-inline-start: calc(-1 * var(--primitives-space-8));
}

.dossier-nav__switch {
  display: flex;
  margin-inline-start: calc(-1 * var(--semantics-buttons-xs-inline-padding));
}
</style>
