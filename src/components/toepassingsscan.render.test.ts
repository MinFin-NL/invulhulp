/**
 * Render smoke test for the two toepassingsscan components.
 *
 * Not a UI spec — it only proves the templates compile and `setup` survives
 * both states (no scan yet / a finished scan), which is the failure mode a
 * pure-logic test cannot catch. SSR keeps it dependency-free: no DOM, no
 * @vue/test-utils.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia } from 'pinia'
import ToepassingsscanTile from './ToepassingsscanTile.vue'
import ToepassingsscanModal from './ToepassingsscanModal.vue'
import { deriveKenmerken, SCAN_VERSION } from '../utils/toepassingsscan'

async function render(component: unknown, props: Record<string, unknown> = {}) {
  const app = createSSRApp(component as never, props)
  app.use(createPinia())
  return renderToString(app)
}

describe('toepassingsscan components render', () => {
  it('tile without a run', async () => {
    const html = await render(ToepassingsscanTile, {
      run: null,
      kenmerken: null,
      counts: { verplicht: 0, mogelijk: 0, nvt: 0 },
    })
    expect(html).toContain('Start toepassingsscan')
  })

  it('tile with a run', async () => {
    const answers = { pg: ['ja'], gedrag: ['geen'] }
    const html = await render(ToepassingsscanTile, {
      run: { scanVersion: SCAN_VERSION, answers, kenmerken: deriveKenmerken(answers), completedAt: Date.now() },
      kenmerken: deriveKenmerken(answers),
      counts: { verplicht: 3, mogelijk: 2, nvt: 4 },
    })
    expect(html).toContain('persoonsgegevens')
    expect(html).toContain('niet van toepassing')
  })

  it('modal', async () => {
    const html = await render(ToepassingsscanModal)
    expect(html).toContain('Toepassingsscan')
  })
})

/**
 * NL Design System guard rail. The scan is itself a form, so it must use the
 * NLDD form components and no bespoke inputs — see the NLDD rule in CLAUDE.md.
 */
describe('NLDD design system conformance', () => {
  it('renders the tile as a card with NLDD tags', async () => {
    const answers = { pg: ['ja'] }
    const html = await render(ToepassingsscanTile, {
      run: { scanVersion: SCAN_VERSION, answers, kenmerken: deriveKenmerken(answers), completedAt: Date.now() },
      kenmerken: deriveKenmerken(answers),
      counts: { verplicht: 1, mogelijk: 0, nvt: 0 },
    })
    expect(html).toContain('invulhulp-card')
    expect(html).toContain('<nldd-tag')
    expect(html).toContain('<nldd-button')
  })

  it('asks the questions with NLDD radio and checkbox fields', async () => {
    const html = await render(ToepassingsscanModal)
    // Single-choice questions are a radio group; the group owns the a11y
    // semantics, so it points at the question text instead of a <legend>.
    expect(html).toContain('<nldd-radio-button-group')
    expect(html).toContain('<nldd-radio-button-field')
    expect(html).toContain('accessible-labeled-by')
    // Multi-choice keeps a real fieldset: NLDD ships no checkbox *group*.
    expect(html).toContain('<fieldset')
    expect(html).toContain('<nldd-checkbox-field')
  })

  it('uses no colours of its own', async () => {
    // Raw hex in a scoped <style> means a token was skipped. (The shared modal
    // backdrop rgb() values are inherited from the other dialogs.)
    for (const file of ['ToepassingsscanTile.vue', 'ToepassingsscanModal.vue']) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
      expect(source, `${file} contains a hard-coded colour`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })
})
