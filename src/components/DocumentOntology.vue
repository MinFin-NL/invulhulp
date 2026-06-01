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
  margin-top: 6px;
  border-top: 1px dashed #d4d8e0;
  padding-top: 6px;
}

.ontology-toggle {
  background: none;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  font-size: 0.8rem;
  color: #154273;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.ontology-toggle:hover {
  text-decoration: underline;
}

.ontology-toggle-icon {
  font-size: 0.7rem;
}

.ontology-body {
  margin-top: 8px;
  padding: 10px 12px;
  background: #f4f7fb;
  border: 1px solid #d8e1ed;
  border-radius: 4px;
  font-size: 0.82rem;
  color: #2a3a4f;
}

.ontology-summary {
  margin: 0 0 10px;
  font-style: italic;
  line-height: 1.45;
}

.ontology-row {
  margin-bottom: 8px;
}

.ontology-row:last-child {
  margin-bottom: 0;
}

.ontology-label {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  color: #5a6d88;
  margin-bottom: 4px;
}

.ontology-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
}

.ontology-chip {
  background: #e6edf6;
  border: 1px solid #c8d4e3;
  color: #154273;
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 0.75rem;
  line-height: 1.4;
}

.ontology-chip--ent {
  background: #eaf3ec;
  border-color: #bcd5c1;
  color: #1a5b2e;
}

.ontology-list {
  margin: 0;
  padding-left: 18px;
  line-height: 1.5;
}

.ontology-date {
  color: #6b7a8c;
  font-size: 0.75rem;
}

.ontology-note {
  margin: 8px 0 0;
  font-size: 0.75rem;
  color: #8a6d2e;
  font-style: italic;
}
</style>
