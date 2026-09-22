/**
 * Render smoke test for FormCard.
 *
 * The card is used in two places (de fasetijdlijn en de "Vooraf"-band) and has
 * two variants (een echt formulier en een aangekondigde placeholder). Deze test
 * bewijst dat beide varianten renderen en dat de placeholder daadwerkelijk
 * onklikbaar is — precies de regressie die een logicatest niet vangt.
 * SSR houdt hem dependency-vrij: geen DOM, geen @vue/test-utils.
 */
import { describe, it, expect } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import FormCard from './FormCard.vue'
import type { ApplicabilityVerdict } from '../utils/toepassingsscan'

const ALWAYS: ApplicabilityVerdict = { status: 'altijd', reason: '', kenmerken: [] }

async function render(props: Record<string, unknown>) {
  return renderToString(createSSRApp(FormCard, props))
}

describe('FormCard renders', () => {
  it('a real form as an openable card', async () => {
    const html = await render({
      form: { id: 'intake', title: 'Intakeformulier', shortDescription: 'Registreer een verzoek.', domains: ['project'] },
      status: { status: 'bezig', completed: 3, total: 12 },
      verdict: ALWAYS,
    })
    expect(html).toContain('invulhulp-card')
    expect(html).toContain('Intakeformulier')
    expect(html).toContain('Bezig (3/12)')
    // "Verder" in plaats van "Openen" zodra er antwoorden staan.
    expect(html).toContain('Verder')
    expect(html).not.toContain('disabled')
    // Secundair: de ene primaire actie van de dossierpagina staat in de
    // "volgende stap"-band, niet op elk van de twaalf kaarten.
    expect(html).toContain('variant="secondary"')
    expect(html).not.toContain('variant="primary"')
  })

  it('an onvolledig form as an amber tag with the open-question count', async () => {
    const html = await render({
      form: { id: 'dpia', title: 'DPIA' },
      status: { status: 'onvolledig', completed: 8, total: 8, missingMandatory: 3 },
      verdict: ALWAYS,
    })
    // Doorgeklikt is niet afgerond — dat moet de kaart zeggen, niet alleen
    // in de kleur maar in de tekst.
    expect(html).not.toContain('Afgerond')
    expect(html).toContain('Nog 3 verplichte vragen')
    expect(html).toContain('color="warning"')
    expect(html).toContain('Afmaken')
  })

  it('a placeholder as a visibly disabled card', async () => {
    const html = await render({
      form: { id: 'bia', title: 'BIA', shortDescription: 'Nog te bouwen.', placeholder: 'onzeker' },
      verdict: ALWAYS,
    })
    expect(html).toContain('form-card--placeholder')
    // De status staat als tekst op de kaart, niet alleen in de kleur.
    expect(html).toContain('Nog niet besloten')
    expect(html).toContain('Nog niet beschikbaar')
    expect(html).toContain('disabled')
  })

  it('the toepassingsscan reason as text, not only as a title attribute', async () => {
    const html = await render({
      form: { id: 'dpia', title: 'DPIA' },
      verdict: { status: 'verplicht', reason: 'Dit dossier verwerkt persoonsgegevens.', kenmerken: [] },
    })
    expect(html).toContain('invulhulp-visually-hidden')
    expect(html).toContain('Dit dossier verwerkt persoonsgegevens.')
  })
})
