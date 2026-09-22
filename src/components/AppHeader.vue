<template>
  <header ref="headerEl" class="invulhulp-header">
    <!-- Rijkslogo, woordmerk, hoofd- en utility-navigatie komen uit NLDD. De
         globale menubalk klapt onder lg zelf in achter de menuknop. -->
    <!-- Logo, woordmerk en "FinDocs" leiden terug naar het overzicht van het
         open dossier (of naar de dossierlijst als er geen open is). Het zijn
         gewone hash-links: useAppHistory zet de popstate om in de store. -->
    <nldd-top-navigation-bar
      logo-title="Ministerie van Financiën"
      website-title="FinDocs"
      :logo-href="homeHref"
      :website-href="homeHref"
    >
      <nldd-menu-bar slot="global" accessible-label="Hoofdnavigatie">
        <nldd-menu-bar-item
          text="Dossiers"
          icon="folder"
          :current="!auth.userManagementOpen"
          @select="goHome"
        />
        <nldd-menu-bar-item
          v-if="auth.isAdmin"
          text="Gebruikersbeheer"
          icon="gear"
          :current="auth.userManagementOpen"
          @select="openUserManagement"
        />
      </nldd-menu-bar>

      <nldd-menu-bar slot="utility" accessible-label="Accountnavigatie">
        <nldd-menu-bar-item
          v-if="showResetButton"
          text="Opnieuw beginnen"
          icon="arrow-2-counter-clockwise"
          content-priority="text"
          @select="openResetDialog"
        />
        <!-- De naam is geen bestemming maar de opener van het accountmenu; op
             smalle breedtes blijft alleen het icoon staan. -->
        <nldd-menu-bar-item
          :text="userLabel"
          icon="person"
          expandable
          content-priority="icon"
          :accessible-label="`Account: ${userLabel}`"
        >
          <nldd-menu accessible-label="Accountmenu">
            <nldd-menu-item
              text="Uitloggen"
              icon="arrow-right-out-bucket"
              @select="auth.logout()"
            />
          </nldd-menu>
        </nldd-menu-bar-item>
      </nldd-menu-bar>
    </nldd-top-navigation-bar>

    <!-- Breadcrumb: dossier › fase › formulier. The dossier crumb is a real
         hash link: useAppHistory maps the resulting popstate back onto the
         store, and it opens in a new tab like any link. -->
    <div v-if="showBreadcrumb" class="invulhulp-header__breadcrumb-bar">
      <nldd-breadcrumbs class="invulhulp-header__breadcrumb">
        <nldd-breadcrumbs-item
          :href="store.activeFormId !== null ? dossierHref : undefined"
          :current="store.activeFormId === null"
        >
          <!-- No whitespace between icon and name: it would be underlined as part of the link. -->
          <nldd-icon class="invulhulp-header__crumb-icon" name="folder" size="20" color="inherit" />{{ store.activeDossier.name }}
        </nldd-breadcrumbs-item>
        <!-- Lifecycle phase of the open form. Not a link: there is no
             per-phase destination, the phase only exists as a grouping. -->
        <nldd-breadcrumbs-item
          v-if="activePhaseLabel"
          class="invulhulp-header__crumb--phase"
          :text="activePhaseLabel"
        />
        <nldd-breadcrumbs-item v-if="activeFormTitle" current :text="activeFormTitle" />
      </nldd-breadcrumbs>
      <PresenceBar :dossier-id="store.activeDossierId" class="invulhulp-header__presence" />
    </div>
  </header>

  <ConfirmDialog
    ref="resetDialog"
    :title="resetTitle"
    :message="`Al uw antwoorden in dit formulier worden gewist.`"
    confirm-label="Opnieuw beginnen"
    cancel-label="Annuleren"
    variant="warning"
    @confirm="store.resetActive()"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAuthStore } from '../stores/authStore'
import { loadAvailableForms, type FormIndexEntry } from '../services/formLoader'
import { trackIdFor, trackLabel } from '../utils/tracks'
import { serialize } from '../composables/useAppHistory'
import ConfirmDialog from './ConfirmDialog.vue'
import PresenceBar from './PresenceBar.vue'

const store = useAssessmentStore()
const auth = useAuthStore()
const availableForms = ref<FormIndexEntry[]>([])
const resetDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const headerEl = ref<HTMLElement | null>(null)

onMounted(async () => {
  availableForms.value = await loadAvailableForms()
})

// The header is not a fixed height: the breadcrumb row wraps, the phase crumb
// drops out below 640px, and the presence bar appears only in a shared dossier.
// The form sidebar sticks right under it, so publish the measured height as a
// custom property instead of letting every consumer hardcode a guess.
let headerObserver: ResizeObserver | null = null

onMounted(() => {
  if (!headerEl.value) return
  headerObserver = new ResizeObserver(([entry]) => {
    // Border-box, not contentRect: the header may grow padding or a border
    // later and the sidebar has to clear all of it.
    const height = entry.target.getBoundingClientRect().height
    document.documentElement.style.setProperty(
      '--invulhulp-header-height',
      `${Math.round(height)}px`,
    )
  })
  headerObserver.observe(headerEl.value)
})

onBeforeUnmount(() => {
  headerObserver?.disconnect()
  headerObserver = null
  document.documentElement.style.removeProperty('--invulhulp-header-height')
})

const userLabel = computed(() => auth.user?.name ?? auth.user?.email ?? 'Account')

// Reset applies to a single form, so only offer it while a form is actually
// open — not on the dossier list or dossier detail page, where activeFormId
// can still hold a stale value from the last visited form.
const showResetButton = computed(
  () =>
    store.screen === 'dossier' &&
    !auth.userManagementOpen &&
    store.activeFormId !== null &&
    store.currentView !== 'home',
)

const showBreadcrumb = computed(
  () => store.screen === 'dossier' && !auth.userManagementOpen && store.activeDossier.name !== '',
)

const dossierHref = computed(() =>
  serialize({
    admin: false,
    screen: 'dossier',
    dossierId: store.activeDossierId,
    formId: null,
    view: null,
  }),
)

const homeHref = computed(() =>
  store.screen === 'dossier' && store.activeDossierId ? dossierHref.value : '#/dossiers',
)

const activeFormTitle = computed(() => {
  if (store.activeFormId === null) return null
  return availableForms.value.find((f) => f.id === store.activeFormId)?.title ?? null
})

const activePhaseLabel = computed(() => {
  if (store.activeFormId === null) return null
  const track = availableForms.value.find((f) => f.id === store.activeFormId)?.track
  // A form with a typo'd track is already surfaced on the dossier page; don't
  // repeat "Niet ingedeeld" in the breadcrumb of every one of its views.
  if (!track || trackIdFor(track, store.activeFormId) === 'onbekend') return null
  return trackLabel(track)
})

const resetTitle = computed(() => {
  const label = availableForms.value.find((f) => f.id === store.activeFormId)?.title ?? 'dit formulier'
  return `"${label}" opnieuw beginnen?`
})

function goHome() {
  auth.userManagementOpen = false
  store.goToDossierList()
}

function openUserManagement() {
  auth.userManagementOpen = true
}

function openResetDialog() {
  resetDialog.value?.open()
}
</script>

<style scoped>
.invulhulp-header {
  background-color: var(--semantics-surfaces-base-background-color);
  /* Stays put: the form sidebar sticks to the header's underside via
     --invulhulp-header-height, which only lines up if the header itself never
     leaves. Above the AI banner (z-index 20); NLDD modals (native <dialog> inside) render in
     the top layer and are unaffected by this. */
  position: sticky;
  top: 0;
  z-index: 30;
  border-block-end: 1px solid var(--semantics-dividers-color);
}

/* The nav bar caps its own content to the page-section width; the breadcrumb
   row below it has to line up with that same measure. */
.invulhulp-header__breadcrumb-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--primitives-space-8);
  max-inline-size: var(--semantics-page-sections-body-max-width);
  margin-inline: auto;
  padding-inline: var(--semantics-page-sections-md-margin-inline, var(--primitives-space-16));
  padding-block: var(--primitives-space-8);
  border-block-start: var(--semantics-dividers-thickness) solid var(--semantics-dividers-color);
}

/* Push the "who's here" avatars to the trailing edge of the breadcrumb row. */
.invulhulp-header__presence {
  margin-inline-start: auto;
}

.invulhulp-header__crumb-icon {
  vertical-align: text-bottom;
  margin-inline-end: var(--primitives-space-4);
}

/* The phase is context, not a destination — and the first thing to go when
   the row gets tight. */
@media (max-width: 640px) {
  .invulhulp-header__crumb--phase {
    display: none;
  }
}
</style>
