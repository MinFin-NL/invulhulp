import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAuthStore } from '../stores/authStore'

/**
 * Browser-history integratie voor een app zonder router.
 *
 * De navigatiestatus leeft in Pinia (screen / actief dossier / actief
 * formulier / currentView). Zonder deze koppeling kent de browser maar één
 * history-entry, dus "vorige" verliet de applicatie in plaats van terug te
 * gaan naar het vorige scherm.
 *
 * Werkwijze: elke wijziging van die vier waarden krijgt een `pushState` met de
 * locatie in de state én in de hash (`#/dossier/<id>/form/<formId>/<view>`).
 * Bij `popstate` wordt de locatie terug in de store gezet. De hash is bewust
 * gekozen boven een pad: hij bereikt de server nooit, dus proxy, SPA-fallback
 * en de OIDC-redirect blijven ongemoeid.
 */

export interface AppLocation {
  /** Gebruikersbeheer staat open (los van het onderliggende scherm). */
  admin: boolean
  screen: 'dossierList' | 'dossier'
  dossierId: string | null
  formId: string | null
  view: string | null
}

const MARKER = 'invulhulp'

export function serialize(loc: AppLocation): string {
  if (loc.admin) return '#/beheer'
  if (loc.screen === 'dossierList' || !loc.dossierId) return '#/dossiers'
  const base = `#/dossier/${encodeURIComponent(loc.dossierId)}`
  if (!loc.formId) return base
  const form = `${base}/form/${encodeURIComponent(loc.formId)}`
  return loc.view ? `${form}/${encodeURIComponent(loc.view)}` : form
}

export function parseHash(hash: string): AppLocation | null {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length === 0) return null
  const empty: AppLocation = {
    admin: false,
    screen: 'dossierList',
    dossierId: null,
    formId: null,
    view: null,
  }
  if (parts[0] === 'beheer') return { ...empty, admin: true }
  if (parts[0] === 'dossiers') return empty
  if (parts[0] === 'dossier' && parts[1]) {
    const loc: AppLocation = { ...empty, screen: 'dossier', dossierId: parts[1] }
    if (parts[2] === 'form' && parts[3]) {
      loc.formId = parts[3]
      loc.view = parts[4] ?? null
    }
    return loc
  }
  return null
}

function sameLocation(a: AppLocation, b: AppLocation): boolean {
  return (
    a.admin === b.admin &&
    a.screen === b.screen &&
    a.dossierId === b.dossierId &&
    a.formId === b.formId &&
    a.view === b.view
  )
}

export function useAppHistory() {
  const store = useAssessmentStore()
  const auth = useAuthStore()

  const current = computed<AppLocation>(() => ({
    admin: auth.userManagementOpen,
    screen: store.screen,
    dossierId: store.activeDossierId,
    formId: store.activeFormId,
    // currentView is een getter met fallback; zonder open formulier zegt hij
    // niets, dus dan hoort er ook geen view in de locatie te staan.
    view: store.activeFormId ? store.currentView : null,
  }))

  // De locatie die op dit moment bovenaan de history-stack staat. De watcher
  // vergelijkt hiermee in plaats van met een "bezig met terugzetten"-vlag: dat
  // is onafhankelijk van de volgorde waarin Vue zijn watchers doorspoelt, dus
  // een popstate kan nooit alsnog een dubbele entry pushen.
  let currentEntry: AppLocation | null = null

  /** Breng de store in lijn met een locatie uit de history. */
  function apply(loc: AppLocation) {
    currentEntry = loc
    auth.userManagementOpen = loc.admin

    if (loc.screen === 'dossierList' || !loc.dossierId) {
      store.goToDossierList()
    } else if (!store.dossiers[loc.dossierId]) {
      // Een dossier dat intussen verwijderd is (of van een ander apparaat komt)
      // kan niet geopend worden — val terug op het overzicht.
      store.goToDossierList()
    } else {
      if (store.activeDossierId !== loc.dossierId) {
        // openDossier sluit een eventueel open formulier en haalt de documenten
        // opnieuw op; alleen aanroepen als we echt van dossier wisselen.
        store.openDossier(loc.dossierId)
      }
      if (loc.formId) {
        store.setActiveForm(loc.formId)
        if (loc.view) store.setCurrentView(loc.view)
      } else {
        store.goToPortal()
      }
    }
    // De store kan de locatie hebben bijgesteld (onbekend dossier, formulier
    // dat niet meer laadt): dan is dát wat er nu op het scherm staat.
    currentEntry = current.value
  }

  function onPopState(event: PopStateEvent) {
    const state = event.state as (AppLocation & { [MARKER]?: true }) | null
    const loc = state && state[MARKER] ? state : parseHash(window.location.hash)
    // Geen bruikbare locatie (een entry van vóór deze sessie): laat de browser
    // met rust in plaats van de gebruiker naar een willekeurig scherm te gooien.
    if (!loc) return
    if (sameLocation(loc, current.value)) return
    apply(loc)
  }

  onMounted(() => {
    // Een hash in de URL (deeplink of herladen) wint van de opgeslagen
    // navigatiestatus, zodat een gedeelde link op het juiste scherm uitkomt.
    const fromUrl = parseHash(window.location.hash)
    if (fromUrl && !sameLocation(fromUrl, current.value)) apply(fromUrl)

    const loc = current.value
    currentEntry = loc
    window.history.replaceState({ ...loc, [MARKER]: true }, '', serialize(loc))
    window.addEventListener('popstate', onPopState)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('popstate', onPopState)
  })

  watch(current, (loc) => {
    if (currentEntry && sameLocation(loc, currentEntry)) return
    currentEntry = loc
    window.history.pushState({ ...loc, [MARKER]: true }, '', serialize(loc))
  })
}
