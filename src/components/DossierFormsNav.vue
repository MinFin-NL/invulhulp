<template>
  <!-- Eerste kolom van het dossier: het overzicht plus álle formulieren,
       gegroepeerd zoals de dossierpagina ze groepeert (Vooraf, dan per fase).
       Een formulier kiezen opent zijn stappen in de tweede kolom. -->
  <nldd-page sticky-header :accessible-label="`Formulieren in ${dossierName}`">
    <nldd-top-title-bar
      slot="header"
      class="invulhulp-pane-bar"
      :text="dossierName"
      heading-level="2"
      collapse-anchor="dossier-nav-title"
    />
    <nldd-simple-section width="full">
      <nldd-title id="dossier-nav-title" size="3" heading-level="2" :text="dossierName" />
      <nldd-spacer size="16" />

      <nldd-list variant="simple" type="navigation" aria-label="Dossier">
        <nldd-list-item
          size="md"
          button
          :current="store.activeFormId === null || undefined"
          @click="emit('overview')"
        >
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
            :current="form.id === store.activeFormId || undefined"
            @click="emit('open', form.id)"
          >
            <nldd-text-cell :text="form.title" :supporting-text="statusText(form.id)" />
            <nldd-spacer-cell size="8" />
            <nldd-icon-cell size="20" icon="chevron-right" />
          </nldd-list-item>
        </nldd-list>
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
import type { FormIndexEntry } from '../services/formLoader'

const emit = defineEmits<{ overview: []; open: [formId: string] }>()

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

function statusText(formId: string): string {
  const progress = progressFor(store.activeDossier, formId)
  return progress ? formStatusLabel(progress) : ''
}
</script>
