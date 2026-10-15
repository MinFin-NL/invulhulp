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

    <!-- Inside a dossier the header is an app toolbar, as in the RegelRecht
         editor: top left a home link to the dossier list, top right the
         account. The columns below carry their own title bars (and the way
         back to this dossier), so nothing else goes here. The home link is a
         plain hash link: useAppHistory turns the popstate into the store. -->
    <nldd-container v-if="inDossier" padding="8">
      <nldd-toolbar label="Dossierwerkbalk">
        <nldd-toolbar-item slot="start" priority="1">
          <!-- Same face as the website title on the dossier list (the
               top-navigation-bar's own title tokens), with a house in front.
               No NLDD component carries that title outside the bar, so this
               is a plain link on those tokens. -->
          <a class="invulhulp-header__home" href="#/dossiers" aria-label="FinDocs: naar alle dossiers">
            <nldd-icon icon="house" size="24" />
            <span>FinDocs</span>
          </a>
          <nldd-menu-item slot="overflow" text="FinDocs" icon="house" @select="goHome" />
        </nldd-toolbar-item>
        <nldd-toolbar-item slot="end">
          <nldd-button
            variant="neutral-transparent"
            start-icon="person"
            :text="userLabel"
            expandable
            :accessible-label="`Account: ${userLabel}`"
          >
            <AccountMenu slot="popup" />
          </nldd-button>
          <nldd-menu-item
            v-if="auth.isAdmin"
            slot="overflow"
            text="Gebruikersbeheer"
            icon="gear"
            @select="auth.userManagementOpen = true"
          />
          <nldd-menu-item
            slot="overflow"
            text="Uitloggen"
            icon="arrow-right-out-bucket"
            @select="auth.logout()"
          />
        </nldd-toolbar-item>
      </nldd-toolbar>
    </nldd-container>

    <!-- Rijkslogo, woordmerk, hoofd- en utility-navigatie komen uit NLDD. De
         globale menubalk klapt onder lg zelf in achter de menuknop. Logo,
         woordmerk en "FinDocs" leiden terug naar het overzicht van het open
         dossier (of naar de dossierlijst als er geen open is). Het zijn
         gewone hash-links: useAppHistory zet de popstate om in de store. -->
    <nldd-top-navigation-bar
      v-else
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
          <AccountMenu />
        </nldd-menu-bar-item>
      </nldd-menu-bar>
    </nldd-top-navigation-bar>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAuthStore } from '../stores/authStore'
import { serialize } from '../composables/useAppHistory'
import { useAccountLabels } from '../composables/useAccountLabels'
import AccountMenu from './AccountMenu.vue'

const store = useAssessmentStore()
const auth = useAuthStore()
const headerEl = ref<HTMLElement | null>(null)

// The header is not a fixed height: outside a dossier it is the logo and nav
// bar, inside one a single toolbar, and the status bar wraps on narrow
// viewports. The dossier columns fill the viewport right under it, so publish
// the measured height as a custom property instead of letting every consumer
// hardcode a guess.
let headerObserver: ResizeObserver | null = null

onMounted(() => {
  if (!headerEl.value) return
  headerObserver = new ResizeObserver(([entry]) => {
    // Border-box, not contentRect: the header may grow padding or a border
    // later and the columns have to clear all of it.
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

const { userLabel } = useAccountLabels()

const inDossier = computed(() => store.screen === 'dossier' && !auth.userManagementOpen)

const dossierHref = computed(() =>
  serialize({
    admin: false,
    screen: 'dossier',
    dossierId: store.activeDossierId,
    formId: null,
    view: null,
    dossierView: 'overzicht',
  }),
)

const homeHref = computed(() =>
  store.screen === 'dossier' && store.activeDossierId ? dossierHref.value : '#/dossiers',
)

function goHome() {
  auth.userManagementOpen = false
  store.goToDossierList()
}
</script>

<style scoped>
.invulhulp-header {
  background-color: var(--semantics-surfaces-base-background-color);
  /* Stays put: the dossier columns size themselves to the space under it via
     --invulhulp-header-height, which only lines up if the header itself never
     leaves. Above the AI banner (z-index 20); NLDD modals (native <dialog>
     inside) render in the top layer and are unaffected by this. */
  position: sticky;
  top: 0;
  z-index: 30;
  border-block-end: 1px solid var(--semantics-dividers-color);
}

.invulhulp-header__home {
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-8);
  min-block-size: var(--semantics-controls-md-min-size);
  padding-inline: var(--primitives-space-8);
  border-radius: var(--primitives-corner-radius-xxs);
  font: var(--components-top-navigation-bar-title-lg-font);
  color: var(--semantics-content-color);
  text-decoration: none;
  white-space: nowrap;
}

.invulhulp-header__home:focus-visible {
  outline: var(--semantics-focus-ring-outline);
  outline-offset: var(--semantics-focus-ring-outline-offset);
  box-shadow: var(--semantics-focus-ring-box-shadow);
}
</style>
