<template>
  <div v-if="hasContent" class="ontology">
    <button
      type="button"
      class="ontology-toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="ontology-toggle-icon" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
      Wat zit er in dit document?
    </button>

    <div v-if="open" class="ontology-body">
      <p v-if="ontology.samenvatting" class="ontology-summary">{{ ontology.samenvatting }}</p>

      <div v-if="(ontology.onderwerpen?.length ?? 0) > 0" class="ontology-row">
        <span class="ontology-label">Onderwerpen</span>
        <div class="ontology-chips">
          <span v-for="t in ontology.onderwerpen" :key="t" class="ontology-chip">{{ t }}</span>
        </div>
      </div>

      <div v-for="(group, key) in entityGroups" :key="key" class="ontology-row">
        <span class="ontology-label">{{ group.label }}</span>
        <div class="ontology-chips">
          <span v-for="e in group.items" :key="e" class="ontology-chip ontology-chip--ent">{{ e }}</span>
        </div>
      </div>

      <div v-if="(ontology.besluiten?.length ?? 0) > 0" class="ontology-row">
        <span class="ontology-label">Besluiten</span>
        <ul class="ontology-list">
          <li v-for="(b, i) in ontology.besluiten" :key="i">
            {{ b.tekst }}
            <span v-if="b.datum" class="ontology-date">({{ b.datum }})</span>
          </li>
        </ul>
      </div>

      <div v-if="(ontology.openstaande_vragen?.length ?? 0) > 0" class="ontology-row">
        <span class="ontology-label">Openstaande vragen</span>
        <ul class="ontology-list">
          <li v-for="(q, i) in ontology.openstaande_vragen" :key="i">{{ q }}</li>
        </ul>
      </div>

      <div v-if="(ontology.relaties?.length ?? 0) > 0" class="ontology-row">
        <span class="ontology-label">Relaties</span>
        <ul class="ontology-list">
          <li v-for="(r, i) in ontology.relaties" :key="i">
            <strong>{{ r.van }}</strong> — <em>{{ r.type }}</em> → <strong>{{ r.naar }}</strong>
          </li>
        </ul>
      </div>

      <p v-if="ontology._parse_error" class="ontology-note">
        Kon de structuur niet volledig uit dit document afleiden.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DocumentOntology } from '../stores/assessmentStore'

const props = defineProps<{ ontology: DocumentOntology | undefined }>()
const open = ref(false)

const ontology = computed<DocumentOntology>(() => props.ontology ?? {})

const entityGroups = computed(() => {
  const ent = ontology.value.entiteiten ?? {}
  return [
    { label: 'Personen', items: ent.personen ?? [] },
    { label: 'Organisaties', items: ent.organisaties ?? [] },
    { label: 'Systemen', items: ent.systemen ?? [] },
    { label: 'Datasoorten', items: ent.datasoorten ?? [] },
  ].filter((g) => g.items.length > 0)
})

const hasContent = computed(() => {
  const o = ontology.value
  return Boolean(
    o.samenvatting ||
      (o.onderwerpen?.length ?? 0) > 0 ||
      entityGroups.value.length > 0 ||
      (o.besluiten?.length ?? 0) > 0 ||
      (o.openstaande_vragen?.length ?? 0) > 0 ||
      (o.relaties?.length ?? 0) > 0,
  )
})
</script>

<style scoped>
.ontology {
  margin-block-start: var(--rvo-space-2xs);
  border-block-start: 1px dashed var(--invulhulp-color-border);
  padding-block-start: var(--rvo-space-2xs);
}

.ontology-toggle {
  background: none;
  border: 0;
  padding: var(--rvo-space-3xs) 0;
  cursor: pointer;
  font-size: var(--rvo-font-size-sm);
  color: var(--rvo-color-lintblauw);
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-2xs);
  font-weight: var(--rvo-font-weight-semibold);
}

.ontology-toggle:hover {
  text-decoration: underline;
}

.ontology-toggle-icon {
  font-size: var(--rvo-font-size-xs);
}

.ontology-body {
  margin-block-start: var(--rvo-space-xs);
  padding: var(--rvo-space-xs) var(--rvo-space-sm);
  background: var(--rvo-color-hemelblauw-150);
  border: 1px solid var(--rvo-color-hemelblauw-300);
  border-radius: var(--rvo-border-radius-sm);
  font-size: var(--rvo-font-size-sm);
  color: var(--rvo-color-grijs-800);
}

.ontology-summary {
  margin: 0 0 var(--rvo-space-xs);
  font-style: italic;
  line-height: var(--rvo-line-height-md);
}

.ontology-row {
  margin-block-end: var(--rvo-space-xs);
}

.ontology-row:last-child {
  margin-block-end: 0;
}

.ontology-label {
  display: block;
  font-size: var(--rvo-font-size-2xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: var(--rvo-font-weight-semibold);
  color: var(--invulhulp-color-text-muted);
  margin-block-end: var(--rvo-space-3xs);
}

.ontology-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rvo-space-3xs) var(--rvo-space-2xs);
}

.ontology-chip {
  background: var(--rvo-color-hemelblauw-150);
  border: 1px solid var(--rvo-color-hemelblauw-300);
  color: var(--rvo-color-lintblauw);
  border-radius: 999px;
  padding: 2px 9px;
  font-size: var(--rvo-font-size-xs);
  line-height: 1.4;
}

.ontology-chip--ent {
  background: var(--rvo-color-groen-150);
  border-color: var(--rvo-color-groen-300);
  color: var(--rvo-color-groen-750);
}

.ontology-list {
  margin: 0;
  padding-inline-start: var(--rvo-space-md);
  line-height: var(--rvo-line-height-md);
}

.ontology-date {
  color: var(--invulhulp-color-text-subtle);
  font-size: var(--rvo-font-size-xs);
}

.ontology-note {
  margin: var(--rvo-space-xs) 0 0;
  font-size: var(--rvo-font-size-xs);
  color: var(--rvo-color-oranje-750);
  font-style: italic;
}
</style>
