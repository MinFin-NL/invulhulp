/**
 * Contract for the form sidebar (SectionNav): the steps of the open form, in
 * the dossier's navigation column (DossierFormsNav), which inside a form is
 * about that form alone.
 *
 * De zijbalk met "Voortgang: x/y" en de sectielijst is meermaals "weg"
 * geweest. Er zijn precies twee manieren waarop dat kan en dit bestand
 * bewaakt ze allebei:
 *
 *  1. Niet gerenderd. AssessmentForm hing de zijbalk lang aan
 *     `v-if="store.currentView !== 'home'"`, waardoor hij op de introductie —
 *     precies het scherm dat je ziet als je een formulier opent — ontbrak.
 *     Nu staat hij in de dossierkolom zodra er een formulier open is.
 *  2. Wel gerenderd, maar zonder hoogte. De kolommen vullen
 *     `calc(100dvh - <offset>)`; dat wordt 0 of negatief zodra die
 *     runtime-offset ontspoort, en dan is alles onzichtbaar zonder dat er
 *     iets "kapot" is.
 *
 * Dit zijn broncontroles, geen layouttests: zonder echte browser is er geen
 * layout om te meten, en juist de twee schakelaars hierboven zijn wél
 * statisch te zien.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia } from 'pinia'
import SectionNav from './SectionNav.vue'
import DossierFormsNav from './DossierFormsNav.vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import type { FormConfig } from '../models/Assessment'

const here = dirname(fileURLToPath(import.meta.url))
const assessmentForm = readFileSync(join(here, 'AssessmentForm.vue'), 'utf8')
const dossierFormsNav = readFileSync(join(here, 'DossierFormsNav.vue'), 'utf8')

// The registry normally comes from public/forms; two forms in one fase are
// enough to see the open one split its group around its steps.
vi.mock('../composables/useFormProgress', () => ({
  useFormProgress: () => ({
    formIndex: ref([
      { id: 'testform', title: 'Testformulier', track: 'initiatie' },
      { id: 'anderform', title: 'Ander formulier', track: 'initiatie' },
    ]),
    progressFor: () => null,
  }),
}))

describe('de zijbalk wordt altijd gerenderd', () => {
  it('AssessmentForm plaatst <DossierFormsNav> zonder v-if/v-show', () => {
    const tag = assessmentForm.match(/<DossierFormsNav[\s\S]*?\/>/)
    expect(tag, 'AssessmentForm rendert geen <DossierFormsNav />').not.toBeNull()
    expect(tag![0]).not.toMatch(/\bv-(if|show)\b/)
  })

  it('DossierFormsNav plaatst <SectionNav> zonder v-if/v-show', () => {
    const tag = dossierFormsNav.match(/<SectionNav\b[^>]*>/)
    expect(tag, 'DossierFormsNav rendert geen <SectionNav />').not.toBeNull()
    expect(tag![0]).not.toMatch(/\bv-(if|show)\b/)
  })

  it('de zijbalk is de stappenkolom van de split view, vóór de inhoud', () => {
    // Als de zijbalk in een andere kolom belandt staat hij naast de verkeerde
    // content, of klapt hij op smalle schermen in de verkeerde volgorde in.
    const splitView = assessmentForm.indexOf('<nldd-navigation-split-view')
    const pane = assessmentForm.indexOf('slot="primary-sidebar"')
    const nav = assessmentForm.indexOf('<DossierFormsNav')
    const main = assessmentForm.indexOf('slot="main"')
    expect(splitView).toBeGreaterThan(-1)
    expect(pane).toBeGreaterThan(splitView)
    expect(nav).toBeGreaterThan(pane)
    expect(nav).toBeLessThan(main)
  })
})

describe('de kolommen kunnen niet naar nul hoogte inklappen', () => {
  const workspace = assessmentForm.match(/\.assessment-shell__workspace\s*\{([^}]*)\}/)?.[1] ?? ''
  const blockSize = workspace.match(/block-size:\s*(.+);/)?.[1] ?? ''

  it('block-size heeft een ondergrens', () => {
    expect(blockSize).toMatch(/^max\(/)
  })

  it('de runtime-offset heeft een fallback', () => {
    expect(blockSize).toMatch(/var\(--invulhulp-sticky-offset,\s*\d+px\)/)
  })
})

/** Minimal form: one section with one subsection, plus the summary step. */
const formConfig = {
  id: 'testform',
  title: 'Testformulier',
  version: '1.0',
  organisation: 'Test',
  sections: [
    {
      id: 'deel-1',
      title: 'DEEL 1: GEGEVENS',
      subsections: [{ id: 'sub-1', title: '1. Contactgegevens', questions: [] }],
    },
  ],
  navigation: [
    { type: 'subsections', sectionId: 'deel-1' },
    { type: 'view', viewId: 'summary' },
  ],
} as unknown as FormConfig

async function render() {
  const app = createSSRApp(SectionNav as never, {
    formConfig,
    navOrder: ['home', 'sub-1', 'summary'],
  })
  app.use(createPinia())
  return renderToString(app)
}

describe('de zijbalk toont voortgang en secties', () => {
  it('rendert de voortgangsbalk, de secties en de samenvatting', async () => {
    const html = await render()
    expect(html).toContain('Voortgang')
    expect(html).toContain('nldd-progress-bar')
    expect(html).toContain('Introductie')
    expect(html).toContain('1. Contactgegevens')
    expect(html).toContain('Samenvatting')
  })

  it('markeert Introductie als huidige stap zolang currentView "home" is', async () => {
    // Dit is waarom de zijbalk op de introductie hoort te staan: hij is er
    // altijd al op ingericht geweest. `current` op de rij in een
    // navigatielijst is wat NLDD als aria-current="page" doorgeeft.
    const html = await render()
    const rows = html.match(/<nldd-list-item[^>]*>[\s\S]*?<\/nldd-list-item>/g) ?? []
    const current = rows.filter((row) => /^<nldd-list-item[^>]*\scurrent\b/.test(row))
    expect(current).toHaveLength(1)
    expect(current[0]).toContain('Introductie')
    expect(html).toMatch(/<nldd-list[^>]*type="navigation"/)
  })
})

describe('in een formulier gaat de dossierkolom alleen over dat formulier', () => {
  async function renderColumn(activeFormId: string | null) {
    const pinia = createPinia()
    const app = createSSRApp(DossierFormsNav as never, {
      formConfig: activeFormId ? formConfig : null,
      navOrder: ['home', 'sub-1', 'summary'],
    })
    app.use(pinia)
    const store = useAssessmentStore(pinia)
    store.$patch({
      dossiers: {
        d1: { id: 'd1', name: 'Dossier X', createdAt: 0, sessionId: 's', activeFormId, forms: {}, documents: [] },
      },
      dossierOrder: ['d1'],
      activeDossierId: 'd1',
      screen: 'dossier',
    } as never)
    return renderToString(app)
  }
  const listRows = (html: string) => html.match(/<nldd-list-item[^>]*>[\s\S]*?<\/nldd-list-item>/g) ?? []

  it('toont de stappen en de weg terug naar het dossier', async () => {
    const html = await renderColumn('testform')
    expect(html).toContain('Testformulier')
    expect(html).toContain('1. Contactgegevens')
    expect(html).toMatch(/<nldd-button[^>]*text="Dossier X"/)
  })

  it('andere formulieren staan in het menu en als volgend formulier, niet als rij in de kolom', async () => {
    const html = await renderColumn('testform')
    expect(html).toMatch(/<nldd-menu-item[^>]*text="Ander formulier"/)
    const rows = listRows(html).filter((r) => r.includes('Ander formulier'))
    // Only the "Volgend formulier" card, below the steps.
    expect(rows).toHaveLength(1)
    expect(html.indexOf('Volgend formulier')).toBeGreaterThan(html.indexOf('1. Contactgegevens'))
  })

  it('op het overzicht staan alle formulieren als rij', async () => {
    const html = await renderColumn(null)
    const rows = listRows(html)
    expect(rows.some((r) => r.includes('Testformulier'))).toBe(true)
    expect(rows.some((r) => r.includes('Ander formulier'))).toBe(true)
    expect(html).not.toContain('1. Contactgegevens')
  })
})
