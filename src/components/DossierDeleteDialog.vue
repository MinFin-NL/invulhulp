<template>
  <!-- Eén verwijderdialoog voor de dossierpagina én het dossieroverzicht, zodat
       de rem (de naam overtypen) en de opsomming van wat er weg is overal
       dezelfde zijn. -->
  <ConfirmDialog
    ref="dialog"
    title="Dossier definitief verwijderen"
    :message="message"
    :confirm-phrase="dossier?.name"
    confirm-label="Dossier verwijderen"
    cancel-label="Annuleren"
    variant="warning"
    @confirm="onConfirmed"
  >
    <template #danger>
      <ul class="invulhulp-item-list">
        <li v-for="line in impact" :key="line" class="invulhulp-item-list__item">{{ line }}</li>
      </ul>
    </template>
  </ConfirmDialog>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useAssessmentStore, type DossierId } from '../stores/assessmentStore'
import ConfirmDialog from './ConfirmDialog.vue'

const emit = defineEmits<{
  deleted: [id: DossierId]
  failed: [message: string]
}>()

const store = useAssessmentStore()
const dialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const dossierId = ref<DossierId | null>(null)

const dossier = computed(() => (dossierId.value ? store.dossiers[dossierId.value] ?? null : null))

const message = computed(() =>
  dossier.value
    ? `U staat op het punt het dossier "${dossier.value.name}" en alle bijbehorende gegevens te verwijderen.`
    : '',
)

/** Wat er concreet weg is na het verwijderen — zodat de bevestiging over dit
 *  dossier gaat en niet over "een dossier". */
const impact = computed(() => {
  const d = dossier.value
  if (!d) return []
  const docs = d.documents.length
  const filled = Object.values(d.forms).filter(
    (f) => Object.values(f.answers ?? {}).some((a) => a),
  ).length
  return [
    `${docs} ${docs === 1 ? 'brondocument' : 'brondocumenten'}, inclusief de zoekindex en geüploade afbeeldingen`,
    `Alle ingevulde antwoorden${filled ? ` (${filled} ${filled === 1 ? 'formulier' : 'formulieren'})` : ''} en de bewerkgeschiedenis`,
    'De toegang van iedereen met wie dit dossier is gedeeld',
  ]
})

async function open(id: DossierId) {
  if (!store.dossiers[id]) return
  dossierId.value = id
  // Eerst de naam doorgeven, dan openen: de dialoog leest de bevestigingszin
  // bij het openen.
  await nextTick()
  dialog.value?.open()
}

async function onConfirmed() {
  const id = dossierId.value
  if (!id) return
  try {
    await store.deleteDossier(id)
  } catch (e) {
    // De server weigerde (bijv. geen eigenaar meer): het dossier blijft staan.
    emit('failed', `Verwijderen lukt niet: ${e instanceof Error ? e.message : String(e)}`)
    return
  }
  dossierId.value = null
  emit('deleted', id)
}

defineExpose({ open })
</script>
