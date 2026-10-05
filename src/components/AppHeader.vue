<template>
  <header ref="headerEl" class="invulhulp-header">
    <!-- Bètamelding: NLDD's statusbalk hoort helemaal bovenaan, boven het lint.
         Hij draagt maar één actie en geen links in de tekst, dus de hele balk
         is de mailto-link. Binnen de sticky header blijft hij in beeld, en de
         gemeten headerhoogte telt hem mee. -->
    <nldd-status-bar
      variant="warning"
      text="Dit is een bètaversie van dit hulpmiddel. Vragen of feedback? innovatiemanagamentfinancien@minfin.nl"
      href="mailto:innovatiemanagamentfinancien@minfin.nl"
    />

    <!-- Rijkslogo, woordmerk, hoofd- en utility-navigatie komen uit NLDD. De
         globale menubalk klapt onder lg zelf in achter de menuknop. -->
    <!-- Logo, woordmerk en "FinDocs" leiden terug naar het overzicht van het
         open dossier (of naar de dossierlijst als er geen open is). Het zijn
         gewone hash-links: useAppHistory zet de popstate om in de store. -->
    <!-- Binnen een dossier of formulier valt het logolint weg: de sticky
         header zou daar met titelbalk erbij te veel hoogte innemen. "FinDocs"
         blijft staan als weg terug. Via de property, niet het attribuut: Vue
         zou anders no-logo="false" zetten, en Lit leest elk aanwezig
         boolean-attribuut als true. -->
    <nldd-top-navigation-bar
      :noLogo.prop="inDossier"
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
      </nldd-menu-bar>

      <nldd-menu-bar slot="utility" accessible-label="Accountnavigatie">
        <!-- De naam is geen bestemming maar de opener van het accountmenu; op
             smalle breedtes blijft alleen het icoon staan. Gebruikersbeheer is
             een beheertaak van dit account, geen hoofdbestemming, dus die
             staat hier en niet in de hoofdnavigatie. -->
        <nldd-menu-bar-item
          :text="userLabel"
          icon="person"
          expandable
          content-priority="icon"
          :accessible-label="`Account: ${userLabel}`"
        >
          <nldd-menu accessible-label="Accountmenu">
            <!-- Op smalle schermen staat alleen het icoon in de balk; de kop
                 laat dan alsnog zien met welk account je bent ingelogd. -->
            <nldd-container slot="header" padding-inline="16" padding-block="12">
              <nldd-identity :text="userLabel" :supporting-text="userSupportingText">
                <nldd-avatar
                  slot="avatars"
                  :name="userLabel"
                  :initials="initials(userLabel)"
                  decorative
                />
              </nldd-identity>
            </nldd-container>
            <nldd-menu-item
              v-if="auth.isAdmin"
              text="Gebruikersbeheer"
              icon="gear"
              @select="openUserManagement"
            />
            <nldd-menu-item
              text="Uitloggen"
              icon="arrow-right-out-bucket"
              @select="auth.logout()"
            />
          </nldd-menu>
        </nldd-menu-bar-item>
      </nldd-menu-bar>
    </nldd-top-navigation-bar>

    <!-- Title bar: the back link goes one level up (form → dossier → list).
         It is a real hash link: useAppHistory maps the resulting popstate back
         onto the store, and it opens in a new tab like any link.
         There is no collapse-anchor: the bar only collapses on scroll inside an
         nldd-page, which this app shell does not use. Without one the state is
         static: on a form, `text` is set and the bar is compact (icon back
         button + form title); on the dossier page, `text` is empty and the back
         button shows its label. -->
    <nldd-top-title-bar
      v-if="showTitleBar"
      class="invulhulp-header__title-bar"
      :back-text="backText"
      :back-href="backHref"
      :text="activeFormTitle ?? ''"
      :supporting-text="formContext"
    >
      <div slot="toolbar" class="invulhulp-header__toolbar">
        <PresenceBar :dossier-id="store.activeDossierId" />
        <!-- The toolbar never shrinks, so on a phone the labelled button would
             squeeze the form title; the icon button takes over there. -->
        <template v-if="showResetButton">
          <nldd-button
            class="invulhulp-header__reset--wide"
            variant="neutral-transparent"
            start-icon="arrow-2-counter-clockwise"
            text="Opnieuw beginnen"
            @click="openResetDialog"
          />
          <nldd-icon-button
            class="invulhulp-header__reset--narrow"
            variant="neutral-transparent"
            icon="arrow-2-counter-clockwise"
            text="Opnieuw beginnen"
            @click="openResetDialog"
          />
        </template>
      </div>
    </nldd-top-title-bar>
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
import { initials } from '../utils/initials'
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

// The header is not a fixed height: the title bar shows only inside a dossier,
// and its toolbar (presence avatars, reset button) comes and goes.
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

// The e-mail under the name, unless it already is the name line.
const userSupportingText = computed(() => {
  const email = auth.user?.email ?? ''
  return email === userLabel.value ? '' : email
})

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

const inDossier = computed(() => store.screen === 'dossier' && !auth.userManagementOpen)

const showTitleBar = computed(() => inDossier.value && store.activeDossier.name !== '')

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

// NLDD labels the back button with the title of the page it returns to.
const backText = computed(() => (store.activeFormId !== null ? store.activeDossier.name : 'Dossiers'))
const backHref = computed(() => (store.activeFormId !== null ? dossierHref.value : '#/dossiers'))

// On a compact bar the back button is icon-only, so the dossier name would
// otherwise only show in its tooltip; the subtitle keeps it visible.
const formContext = computed(() => {
  if (store.activeFormId === null) return ''
  return [store.activeDossier.name, activePhaseLabel.value].filter(Boolean).join(' · ')
})

const activeFormTitle = computed(() => {
  if (store.activeFormId === null) return null
  return availableForms.value.find((f) => f.id === store.activeFormId)?.title ?? null
})

const activePhaseLabel = computed(() => {
  if (store.activeFormId === null) return null
  const track = availableForms.value.find((f) => f.id === store.activeFormId)?.track
  // A form with a typo'd track is already surfaced on the dossier page; don't
  // repeat "Niet ingedeeld" in the title bar of every one of its views.
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

/* The nav bar caps its own content to the page-section width; the title bar
   below it has to line up with that same measure. Its controls carry a top
   margin inside the shadow root; the bottom padding balances that. */
.invulhulp-header__title-bar {
  max-inline-size: var(--semantics-page-sections-body-max-width);
  margin-inline: auto;
  padding-inline: var(--semantics-page-sections-md-margin-inline);
  padding-block-end: var(--primitives-space-6);
  border-block-start: var(--semantics-dividers-thickness) solid var(--semantics-dividers-color);
}

.invulhulp-header__toolbar {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-12);
}

.invulhulp-header__reset--narrow {
  display: none;
}

/* Same steps as the nav bar's own side margin: NLDD's sm (≤640px) and lg
   (≥1008px) breakpoints. The header spans the viewport, so a media query sees
   the width the nav bar's container query does. */
@media (max-width: 640px) {
  .invulhulp-header__title-bar {
    padding-inline: var(--semantics-page-sections-sm-margin-inline);
  }

  .invulhulp-header__reset--wide {
    display: none;
  }

  .invulhulp-header__reset--narrow {
    display: inline-flex;
  }

  /* The avatars carry their own names; the caption is what has to give. */
  .invulhulp-header__toolbar :deep(.presence-label) {
    display: none;
  }
}

@media (min-width: 1008px) {
  .invulhulp-header__title-bar {
    padding-inline: var(--semantics-page-sections-lg-margin-inline);
  }
}
</style>
