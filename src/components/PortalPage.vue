<template>
  <div class="portal-page">
    <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm">

      <!-- Hero -->
      <div class="portal-hero">
        <h1 class="rvo-heading rvo-heading--2xl portal-title">Invulhulp</h1>
        <p class="rvo-text rvo-text--lg portal-subtitle">
          Digitale instrumenten voor IV-projecten, privacy en AI-impact assessments — Ministerie van Financiën
        </p>
      </div>

      <!-- Track sections -->
      <div v-for="group in trackGroups" :key="group.track" class="track-section">
        <div class="track-header">
          <h2 class="rvo-heading rvo-heading--xl track-title">{{ group.label }}</h2>
          <p class="rvo-text track-desc">{{ group.description }}</p>
        </div>

        <div class="card-row">
          <template v-for="(form, idx) in group.forms" :key="form.id">
            <div v-if="idx > 0" class="card-connector">
              {{ group.track === 'assessment' ? '↔' : '→' }}
            </div>
            <div class="form-card">
              <div class="card-body">
                <h3 class="rvo-heading rvo-heading--lg card-title">{{ form.title }}</h3>
                <p class="rvo-text card-desc">{{ form.shortDescription }}</p>
              </div>
              <button
                class="rvo-button rvo-button--primary card-btn"
                @click="$emit('open', form.id)"
              >
                Openen
              </button>
            </div>
          </template>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { loadAvailableForms, type FormIndexEntry } from '../services/formLoader'

defineEmits<{ open: [id: string] }>()

const forms = ref<FormIndexEntry[]>([])

onMounted(async () => {
  forms.value = await loadAvailableForms()
})

const TRACK_META: Record<string, { label: string; description: string; order: number }> = {
  project: {
    label: 'Projectspoor',
    description: 'Gebruik deze formulieren in volgorde om een IV-project voor te bereiden, in te dienen bij het portfolioboard en architectureel te onderbouwen.',
    order: 1,
  },
  privacy: {
    label: 'Privacyspoor',
    description: 'Doorloop deze stappen om te bepalen of een volledige DPIA verplicht is voor de verwerking van persoonsgegevens.',
    order: 2,
  },
  assessment: {
    label: 'Assessments',
    description: 'Volledige impact assessments voor privacy en AI — worden gevoed door informatie uit het project- en privacyspoor.',
    order: 3,
  },
}

const trackGroups = computed(() => {
  const byTrack: Record<string, FormIndexEntry[]> = {}
  for (const form of forms.value) {
    const t = form.track ?? 'assessment'
    if (!byTrack[t]) byTrack[t] = []
    byTrack[t].push(form)
  }
  return Object.entries(byTrack)
    .sort(([a], [b]) => (TRACK_META[a]?.order ?? 99) - (TRACK_META[b]?.order ?? 99))
    .map(([track, trackForms]) => ({
      track,
      label: TRACK_META[track]?.label ?? track,
      description: TRACK_META[track]?.description ?? '',
      forms: [...trackForms].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    }))
})
</script>

<style scoped>
.portal-page {
  padding: 48px 0 64px;
  background: #f8f9fb;
  min-height: 100%;
}

.portal-hero {
  margin-bottom: 48px;
}

.portal-title {
  color: #154273;
  margin-bottom: 12px;
}

.portal-subtitle {
  color: #555;
  max-width: 640px;
}

.track-section {
  margin-bottom: 48px;
}

.track-header {
  margin-bottom: 20px;
}

.track-title {
  color: #154273;
  margin-bottom: 4px;
}

.track-desc {
  color: #666;
  font-size: 0.9rem;
}

.card-row {
  display: flex;
  align-items: stretch;
  gap: 0;
  flex-wrap: wrap;
}

.card-connector {
  display: flex;
  align-items: center;
  padding: 0 8px;
  color: #9ab0cc;
  font-size: 1.1rem;
  flex-shrink: 0;
  align-self: center;
}

.form-card {
  background: white;
  border: 1px solid #d0dce8;
  border-radius: 6px;
  padding: 20px 20px 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 210px;
  flex-shrink: 0;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.form-card:hover {
  box-shadow: 0 2px 8px rgba(21, 66, 115, 0.12);
  border-color: #9ab0cc;
}

.card-body {
  margin-bottom: 16px;
}

.card-title {
  color: #154273;
  font-size: 0.95rem;
  margin-bottom: 8px;
}

.card-desc {
  color: #555;
  font-size: 0.8rem;
  line-height: 1.5;
}

.card-btn {
  font-size: 0.85rem;
  padding: 6px 14px;
  align-self: flex-start;
}
</style>
