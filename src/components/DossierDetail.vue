<template>
  <div class="portal-page">
    <div class="invulhulp-measure invulhulp-measure--lg invulhulp-measure--pad">

      <!-- Dossier page header -->
      <section class="dossier-header" aria-labelledby="dossier-title">
        <div class="dossier-header__row">
          <div class="dossier-header__title-group">
            <nldd-icon class="dossier-header__icon" icon="folder" size="32" color="accent" />
            <nldd-title size="1"><h1 class="dossier-header__name" id="dossier-title">
              {{ store.activeDossier.name }}
            </h1></nldd-title>
          </div>
          <div class="dossier-actions">
            <nldd-button
              variant="neutral-transparent"
              size="sm"
              class="dossier-actions__share"
              v-if="store.isOwner"
              @click="openShareDialog"
            >
              <span slot="text">
<nldd-icon class="dossier-actions__share-icon" icon="square-arrow-up" size="16" />
              Delen
              </span>
            </nldd-button>
            <nldd-button
              variant="neutral-transparent"
              size="sm"
              text="Hernoemen"
              v-if="store.canEdit"
              @click="openRenameDialog"
            />
            <nldd-button
              variant="secondary"
              size="sm"
              text="Verwijderen"
              v-if="store.isOwner"
              @click="openDeleteDialog"
            />
          </div>
        </div>
        <nldd-text size="sm" color="inherit" class="dossier-header__desc">
          Dit dossier groepeert de brondocumenten en formulierantwoorden voor één project of systeem.
        </nldd-text>
        <nldd-banner
          variant="accent"
          size="sm"
          v-if="store.readOnly"
          :text="`Gedeeld door ${store.activeDossier.ownerName ?? 'een collega'} — u heeft leesrechten.`"
        />
        <nldd-banner
          variant="critical"
          size="sm"
          v-if="shareError"
          role="alert"
          :text="shareError"
        />
      </section>

      <!-- Vier weergaven, elk met één vraag. Gewone hash-links: useAppHistory
           zet de navigatie om in de store, zodat terug-knop en deeplinks werken.
           In een navigatiebalk zet NLDD aria-current="page" alleen op een link. -->
      <div ref="viewsEl" class="dossier-views">
        <nldd-tab-bar navigation accessible-label="Weergaven van dit dossier">
          <nldd-tab-bar-item
            v-for="view in DOSSIER_VIEWS"
            :key="view.id"
            :text="view.label"
            :href="viewHref(view.id)"
            :current="store.dossierView === view.id || undefined"
          />
        </nldd-tab-bar>
      </div>

      <DossierOverview
        v-if="store.dossierView === 'overzicht'"
        @open="$emit('open', $event)"
        @scan="scanModal?.open()"
      />
      <DossierProject v-else-if="store.dossierView === 'project'" @scan="scanModal?.open()" />
      <DossierForms
        v-else-if="store.dossierView === 'formulieren'"
        @open="$emit('open', $event)"
        @beslishulp="beslishulpModal?.open()"
      />
      <DossierSources v-else />

    </div>

    <ConfirmDialog
      ref="aiModeErrorDialog"
      title="Documenten niet bereikbaar"
      message="De brondocumenten zijn niet meer beschikbaar in de index. Verwijder de documenten en upload ze opnieuw om AI Modus te gebruiken."
      confirm-label="Sluiten"
      cancel-label=""
      @confirm="onAiModeErrorDismissed"
      @cancel="onAiModeErrorDismissed"
    />
    <ConfirmDialog
      ref="renameDialog"
      title="Dossier hernoemen"
      kind="prompt"
      input-label="Nieuwe naam"
      confirm-label="Opslaan"
      @confirm="onRenameConfirmed"
    />
    <ConfirmDialog
      ref="deleteDialog"
      title="Dossier definitief verwijderen"
      :message="deleteMessage"
      :confirm-phrase="store.activeDossier?.name"
      confirm-label="Dossier verwijderen"
      cancel-label="Annuleren"
      variant="warning"
      @confirm="onDeleteConfirmed"
    >
      <template #danger>
        <ul class="invulhulp-item-list">
          <li v-for="line in deleteImpact" :key="line" class="invulhulp-item-list__item">{{ line }}</li>
        </ul>
      </template>
    </ConfirmDialog>
    <ShareDialog
      v-if="store.activeDossierId"
      ref="shareDialog"
      :dossier-id="store.activeDossierId"
    />
    <BeslishulpModal ref="beslishulpModal" />
    <ToepassingsscanModal ref="scanModal" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAiMode } from '../composables/useAiMode'
import { refreshDossierForms } from '../composables/useDossierForms'
import { serialize } from '../composables/useAppHistory'
import { DOSSIER_VIEWS, type DossierView } from '../utils/dossierViews'
import ConfirmDialog from './ConfirmDialog.vue'
import ShareDialog from './ShareDialog.vue'
import BeslishulpModal from './BeslishulpModal.vue'
import ToepassingsscanModal from './ToepassingsscanModal.vue'
import DossierOverview from './DossierOverview.vue'
import DossierProject from './DossierProject.vue'
import DossierForms from './DossierForms.vue'
import DossierSources from './DossierSources.vue'
import { fetchDossier, saveDossier } from '../services/dossierService'

defineEmits<{ open: [id: string] }>()

const store = useAssessmentStore()
const { aiModeError, dismissAiModeError } = useAiMode()

const renameDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const deleteDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const shareDialog = ref<InstanceType<typeof ShareDialog> | null>(null)
const shareError = ref('')
const aiModeErrorDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const aiModeErrorFormId = ref<string | null>(null)
const beslishulpModal = ref<InstanceType<typeof BeslishulpModal> | null>(null)
const scanModal = ref<InstanceType<typeof ToepassingsscanModal> | null>(null)

function viewHref(view: DossierView): string {
  return serialize({
    admin: false,
    screen: 'dossier',
    dossierId: store.activeDossierId,
    formId: null,
    view: null,
    dossierView: view,
  })
}

// AI Modus can be started from a card (Formulieren) or for the whole dossier
// (Bronnen); the dialog that reports missing documents lives here so it shows
// whichever view is open.
watch(aiModeError, (errors) => {
  const formId = Object.keys(errors)[0]
  if (formId && !aiModeErrorFormId.value) {
    aiModeErrorFormId.value = formId
    aiModeErrorDialog.value?.open()
  }
}, { deep: true })

const deleteMessage = computed(() => {
  const current = store.activeDossierId ? store.dossiers[store.activeDossierId] : null
  if (!current) return ''
  return `U staat op het punt het dossier "${current.name}" en alle bijbehorende gegevens te verwijderen.`
})

/** Wat er concreet weg is na het verwijderen — zodat de bevestiging over dit
 *  dossier gaat en niet over "een dossier". */
const deleteImpact = computed(() => {
  const current = store.activeDossierId ? store.dossiers[store.activeDossierId] : null
  if (!current) return []
  const docs = current.documents.length
  const filled = Object.values(current.forms).filter(
    (f) => Object.values(f.answers ?? {}).some((a) => a),
  ).length
  return [
    `${docs} ${docs === 1 ? 'brondocument' : 'brondocumenten'}, inclusief de zoekindex en geüploade afbeeldingen`,
    `Alle ingevulde antwoorden${filled ? ` (${filled} ${filled === 1 ? 'formulier' : 'formulieren'})` : ''} en de bewerkgeschiedenis`,
    'De toegang van iedereen met wie dit dossier is gedeeld',
  ]
})

onMounted(async () => {
  store.ensureDossier()
  await refreshDossierForms()
})

// On a narrow screen the view bar scrolls sideways; a deep link to the last
// view, or a window made narrower, would otherwise leave its own tab out of
// sight. Only the bar scrolls — scrollIntoView could also move the page.
const viewsEl = ref<HTMLElement | null>(null)
let viewsObserver: ResizeObserver | null = null

async function revealCurrentView() {
  await nextTick()
  // The tabs are Lit elements: wait until the bar has rendered and been laid
  // out, or there is no width to measure yet.
  const bar = viewsEl.value?.querySelector('nldd-tab-bar') as
    | (HTMLElement & { updateComplete?: Promise<unknown> })
    | null
  await bar?.updateComplete
  requestAnimationFrame(() => {
    const wrap = viewsEl.value
    const tab = wrap?.querySelector('nldd-tab-bar-item[current]')
    if (!wrap || !tab) return
    const w = wrap.getBoundingClientRect()
    const t = tab.getBoundingClientRect()
    if (t.left < w.left) wrap.scrollLeft -= w.left - t.left
    else if (t.right > w.right) wrap.scrollLeft += t.right - w.right
  })
}

watch(() => store.dossierView, revealCurrentView)

onMounted(() => {
  if (!viewsEl.value || typeof ResizeObserver === 'undefined') return
  viewsObserver = new ResizeObserver(() => revealCurrentView())
  viewsObserver.observe(viewsEl.value)
})

onBeforeUnmount(() => {
  viewsObserver?.disconnect()
  viewsObserver = null
})

function onAiModeErrorDismissed() {
  if (aiModeErrorFormId.value) {
    dismissAiModeError(aiModeErrorFormId.value)
    aiModeErrorFormId.value = null
  }
}

function openRenameDialog() {
  if (!store.activeDossierId) return
  const current = store.dossiers[store.activeDossierId]
  if (!current) return
  renameDialog.value?.open(current.name)
}

function openDeleteDialog() {
  if (!store.activeDossierId) return
  deleteDialog.value?.open()
}

async function openShareDialog() {
  const id = store.activeDossierId
  const dossier = id ? store.dossiers[id] : null
  if (!id || !dossier) return
  shareError.value = ''
  let grants
  try {
    grants = (await fetchDossier(id)).grants
  } catch {
    // Not on the server yet (never synced) — push it now so it can be shared.
    try {
      const saved = await saveDossier({
        id,
        name: dossier.name,
        createdAt: dossier.createdAt,
        updatedAt: dossier.updatedAt,
        sessionId: dossier.sessionId,
        activeFormId: dossier.activeFormId,
        forms: dossier.forms,
      })
      dossier.myRole = saved.myRole
      grants = saved.grants
    } catch (e) {
      // Sharing needs the server; tell the user why it won't open.
      shareError.value = e instanceof TypeError
        ? 'Delen lukt niet: geen verbinding met de server.'
        : `Delen lukt niet: ${e instanceof Error ? e.message : String(e)}`
      return
    }
  }
  shareDialog.value?.open(grants)
}

function onRenameConfirmed(name: string) {
  if (!store.activeDossierId) return
  const trimmed = name.trim()
  if (!trimmed) return
  store.renameDossier(store.activeDossierId, trimmed)
}

async function onDeleteConfirmed() {
  if (!store.activeDossierId) return
  shareError.value = ''
  try {
    await store.deleteDossier(store.activeDossierId)
  } catch (e) {
    // De server weigerde (bijv. geen eigenaar meer): het dossier blijft staan,
    // dus blijf hier en zeg waarom in plaats van stil terug te navigeren.
    shareError.value = `Verwijderen lukt niet: ${e instanceof Error ? e.message : String(e)}`
    return
  }
  // Never land unannounced in whichever dossier became active next
  store.goToDossierList()
}
</script>

<style scoped>
.portal-page {
  /* Shared by the phase rail and the timeline spine. lichtblauw-300 is
     invisible against the lichtblauw-150 page background — tint the page's own
     accent down instead. */
  --track-line: color-mix(in srgb, var(--semantics-content-accent-color) 22%, transparent);
  padding: var(--primitives-space-48) 0 var(--primitives-space-64);
  background: var(--semantics-surfaces-tinted-background-color);
  min-height: 100%;
}

.dossier-header {
  margin-block-end: var(--primitives-space-40);
}

.dossier-header__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--primitives-space-16);
  flex-wrap: wrap;
}

.dossier-header__title-group {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-12);
  min-inline-size: 0;
}

.dossier-header__icon {
  flex-shrink: 0;
}

.dossier-header__name {
  color: var(--semantics-content-accent-color);
  margin: 0;
  overflow-wrap: anywhere;
}

.dossier-header__desc {
  color: var(--invulhulp-color-text-subtle);
  margin: var(--primitives-space-4) 0 0;
}

.dossier-actions {
  display: flex;
  gap: var(--primitives-space-8);
  align-items: center;
}

.dossier-actions__share {
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-2);
}

.dossier-actions__share-icon {
  flex-shrink: 0;
}

/* De weergavekeuze staat los onder de kop; de inhoud eronder begint op afstand.
   NLDD kapt een tablabel af zodra de tab smaller wordt dan zijn tekst. Daarom
   houdt de balk zijn eigen breedte en scrolt hij op een smal scherm zijwaarts:
   de labels blijven heel en een half zichtbare tab laat zien dat er meer is. */
.dossier-views {
  margin-block-end: var(--primitives-space-32);
  overflow-x: auto;
}

.dossier-views > nldd-tab-bar {
  display: block;
  inline-size: max-content;
  /* De globale reset zet max-inline-size: 100%, en daarmee knijpt de balk weer
     tot de breedte van de kolom. */
  max-inline-size: none;
}
</style>
