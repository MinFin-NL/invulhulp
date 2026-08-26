/**
 * Contract for the form sidebar (SectionNav).
 *
 * De zijbalk met "Voortgang: x/y" en de sectielijst is meermaals "weg"
 * geweest. Er zijn precies twee manieren waarop dat kan en dit bestand
 * bewaakt ze allebei:
 *
 *  1. Niet gerenderd. AssessmentForm hing de zijbalk lang aan
 *     `v-if="store.currentView !== 'home'"`, waardoor hij op de introductie —
 *     precies het scherm dat je ziet als je een formulier opent — ontbrak.
 *  2. Wel gerenderd, maar zonder hoogte. `block-size: calc(100vh - <offset>)`
 *     wordt 0 of negatief zodra die runtime-offset ontspoort, en dan is de
 *     kolom onzichtbaar zonder dat er iets "kapot" is.
 *
 * Dit zijn broncontroles, geen layouttests: zonder echte browser is er geen
 * layout om te meten, en juist de twee schakelaars hierboven zijn wél
 * statisch te zien.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia } from 'pinia'
import SectionNav from './SectionNav.vue'
import type { FormConfig } from '../models/Assessment'

const here = dirname(fileURLToPath(import.meta.url))
const assessmentForm = readFileSync(join(here, 'AssessmentForm.vue'), 'utf8')
const sectionNav = readFileSync(join(here, 'SectionNav.vue'), 'utf8')

describe('de zijbalk wordt altijd gerenderd', () => {
  it('AssessmentForm plaatst <SectionNav> zonder v-if/v-show', () => {
    const tag = assessmentForm.match(/<SectionNav[\s\S]*?\/>/)
    expect(tag, 'AssessmentForm rendert geen <SectionNav />').not.toBeNull()
    expect(tag![0]).not.toMatch(/\bv-(if|show)\b/)
  })

  it('de zijbalk zit in de tak die een geopend formulier toont', () => {
    // Same branch as the form body: als de zijbalk buiten
    // assessment-shell__layout belandt staat hij naast de verkeerde content.
    const layout = assessmentForm.indexOf('assessment-shell__layout')
    const nav = assessmentForm.indexOf('<SectionNav')
    const main = assessmentForm.indexOf('assessment-shell__main')
    expect(layout).toBeGreaterThan(-1)
    expect(nav).toBeGreaterThan(layout)
    expect(nav).toBeLessThan(main)
  })
})

describe('de zijbalk kan niet naar nul hoogte inklappen', () => {
  const blockSize = sectionNav.match(/^\s*block-size:\s*(.+);$/m)?.[1] ?? ''

  it('block-size heeft een ondergrens', () => {
    expect(blockSize).toMatch(/^max\(/)
  })

  it('de runtime-offset heeft een fallback, ook in top', () => {
    expect(blockSize).toMatch(/var\(--invulhulp-sticky-offset,\s*\d+px\)/)
    expect(sectionNav).toMatch(/top:\s*var\(--invulhulp-sticky-offset,\s*\d+px\)/)
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
    // altijd al op ingericht geweest.
    const html = await render()
    expect(html).toMatch(/aria-current="page"[\s\S]{0,200}Introductie/)
  })
})
