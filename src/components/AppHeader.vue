<template>
  <header ref="headerEl" class="invulhulp-header">
    <!-- Rijkslogo, woordmerk, hoofd- en utility-navigatie komen uit NLDD. De
         globale menubalk klapt onder lg zelf in achter de menuknop. -->
    <nldd-top-navigation-bar
      logo-title="Ministerie van Financiën"
      website-title="FinDocs"
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

    <!-- Breadcrumb: dossier › fase › formulier -->
    <div v-if="showBreadcrumb" class="invulhulp-header__breadcrumb-bar">
      <nav class="invulhulp-header__breadcrumb" aria-label="Kruimelpad">
        <button
          v-if="store.activeFormId !== null"
          type="button"
          class="invulhulp-header__crumb invulhulp-header__crumb--link"
          @click="store.goToPortal()"
        >
          <nldd-icon name="folder" size="20" color="inherit" />
          {{ store.activeDossier.name }}
        </button>
        <span v-else class="invulhulp-header__crumb invulhulp-header__crumb--current" aria-current="page">
          <nldd-icon name="folder" size="20" color="inherit" />
          {{ store.activeDossier.name }}
        </span>
        <!-- Lifecycle phase of the open form. Not a link: there is no
             per-phase destination, the phase only exists as a grouping. -->
        <template v-if="activePhaseLabel">
          <span class="invulhulp-header__crumb-sep invulhulp-header__crumb-sep--phase" aria-hidden="true">›</span>
          <span class="invulhulp-header__crumb invulhulp-header__crumb--phase">
            {{ activePhaseLabel }}
          </span>
        </template>
        <template v-if="activeFormTitle">
          <span class="invulhulp-header__crumb-sep" aria-hidden="true">›</span>
          <span class="invulhulp-header__crumb invulhulp-header__crumb--current" aria-current="page">
            {{ activeFormTitle }}
          </span>
        </template>
        <PresenceBar :dossier-id="store.activeDossierId" class="invulhulp-header__presence" />
      </nav>
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
     leaves. Above the AI banner (z-index 20); native <dialog> modals render in
     the top layer and are unaffected by this. */
  position: sticky;
  top: 0;
  z-index: 30;
  border-block-end: 1px solid var(--semantics-dividers-color);
}

/* The nav bar caps its own content to the page-section width; the breadcrumb
   row below it has to line up with that same measure. */
.invulhulp-header__breadcrumb-bar {
  max-inline-size: var(--semantics-page-sections-body-max-width, 80rem);
  margin-inline: auto;
  padding-inline: var(--semantics-page-sections-md-margin-inline, var(--primitives-space-16));
}

/* Push the "who's here" avatars to the trailing edge of the breadcrumb row. */
.invulhulp-header__presence {
  margin-inline-start: auto;
}

.invulhulp-header__breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--primitives-space-4);
  border-block-start: 1px solid var(--semantics-dividers-color);
  padding-block: var(--primitives-space-8);
}

.invulhulp-header__crumb {
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-8);
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  white-space: nowrap;
  padding: var(--primitives-space-2) var(--primitives-space-8);
  border-radius: var(--primitives-corner-radius-md, 4px);
}

.invulhulp-header__crumb--current {
  color: var(--semantics-content-color);
}

.invulhulp-header__crumb--link {
  border: 0;
  background: transparent;
  color: var(--invulhulp-color-text-subtle);
  font: inherit;
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  cursor: pointer;
  transition: background var(--invulhulp-duration-fast), color var(--invulhulp-duration-fast);
}

.invulhulp-header__crumb--link:hover {
  background: var(--semantics-surfaces-tinted-background-color);
  color: var(--semantics-content-accent-color);
}

.invulhulp-header__crumb--link:focus-visible {
  outline: var(--semantics-focus-ring-outline);
  outline-offset: var(--semantics-focus-ring-outline-offset);
}

.invulhulp-header__crumb-sep {
  color: var(--invulhulp-color-text-subtle);
  user-select: none;
}

/* The phase is context, not a destination — quieter than the two crumbs it
   sits between, and the first thing to go when the row gets tight. */
.invulhulp-header__crumb--phase {
  color: var(--invulhulp-color-text-subtle);
  font-weight: var(--primitives-font-weight-body-regular);
}

@media (max-width: 640px) {
  .invulhulp-header__crumb--phase,
  .invulhulp-header__crumb-sep--phase {
    display: none;
  }
}
</style>
