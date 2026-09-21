// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { fillPpmTemplate, normalizeHeading, PPM_PARAGRAPHS } from './ppmTemplateExport'
import { serializeTableAnswer } from '../utils/tableAnswer'
import type { FormConfig } from '../models/Assessment'

const root = resolve(__dirname, '../..')
const template = readFileSync(resolve(root, 'public/templates/PPM-Projectplan-2.0.docx'))
const form = JSON.parse(readFileSync(resolve(root, 'public/forms/ppm.json'), 'utf8')) as FormConfig
const questionIds = new Set(form.sections.flatMap((s) => s.subsections.flatMap((ss) => ss.questions.map((q) => q.id))))

async function documentXml(zip: JSZip): Promise<string> {
  return zip.file('word/document.xml')!.async('string')
}

describe('PPM-Projectplan 2.0 template export', () => {
  it('maps every Kop2 heading it knows to a heading that exists in the template', async () => {
    const zip = await JSZip.loadAsync(template)
    const doc = new DOMParser().parseFromString(await documentXml(zip), 'application/xml')
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    const headings = new Set(
      Array.from(doc.getElementsByTagNameNS(W, 'p'))
        .filter((p) => p.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') === 'Kop2')
        .map((p) => normalizeHeading(Array.from(p.getElementsByTagNameNS(W, 't')).map((t) => t.textContent).join(''))),
    )
    for (const heading of Object.keys(PPM_PARAGRAPHS)) expect(headings, heading).toContain(heading)
  })

  it('only maps question ids that exist in ppm.json', () => {
    for (const slots of Object.values(PPM_PARAGRAPHS)) {
      for (const slot of slots) expect(questionIds, slot.id).toContain(slot.id)
    }
  })

  it('fills cover, colofon, paragraphs and the analyses table', async () => {
    const zip = await fillPpmTemplate(template, {
      'ppm_0.naam_project': 'Vervanging declaratiesysteem',
      'ppm_0.versie': '0.3',
      'ppm_0.auteurs': 'Team Declaraties',
      'ppm_a.achtergrond': '<p>Het huidige systeem is <strong>verouderd</strong>.</p>',
      'ppm_7.impact_techniek': '<p>Koppeling met SAP wordt vervangen.</p>',
      'ppm_6.risicos': serializeTableAnswer({ rows: [['Vertraging leverancier', 'Middel', 'Hoog', 'Boeteclausule']], notes: '' }),
      'ppm_8.analyses': serializeTableAnswer({
        rows: [
          ['Quick scan', 'Wel', 'CISO', 'BBN2'],
          ['DPIA', 'Niet', '', 'Geen persoonsgegevens'],
        ],
        notes: '',
      }),
    })
    const xml = await documentXml(zip)

    expect(xml).toContain('Projectplan Vervanging declaratiesysteem')
    expect(xml).not.toContain('&lt;&lt;Naam project&gt;&gt;')
    expect(xml).toContain('Versie 0.3')
    expect(xml).toContain('Team Declaraties')

    // Answered: guidance replaced by the answer, formatting kept.
    expect(xml).toContain('verouderd')
    expect(xml).not.toContain('Een duidelijke beschrijving van de situatie vóór het project.')
    // Unanswered: guidance stays.
    expect(xml).toContain('Beschrijving van de resultaten aan het einde van het project.')

    // Impact: only the technical sub-paragraph is replaced, with its label.
    expect(xml).toContain('Koppeling met SAP wordt vervangen.')
    expect(xml).not.toContain('Beschrijving van de technisch benodigde aanpassingen')
    expect(xml).toContain('Beschrijving van de beheer organisatie')

    // Table answers become Word tables.
    expect(xml).toContain('Vertraging leverancier')
    expect(xml).toContain('Beheersmaatregel')

    // Analyses are matched to the template's own rows by name.
    expect(xml).toContain('BBN2')
    expect(xml).toContain('Geen persoonsgegevens')

    const settings = await zip.file('word/settings.xml')!.async('string')
    expect(settings).toContain('<w:updateFields w:val="true"/>')

    // Still a well-formed document.
    const parsed = new DOMParser().parseFromString(xml, 'application/xml')
    expect(parsed.getElementsByTagName('parsererror')).toHaveLength(0)
  })

  it('embeds attachment images as new media parts', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) =>
      c.charCodeAt(0),
    )
    const zip = await fillPpmTemplate(
      template,
      { 'ppm_d.projectmanagement': '<p>Zie organogram.</p>' },
      { images: { 'ppm_d.projectmanagement': [{ data: png.buffer, mimeType: 'image/png', width: 100, height: 50, caption: 'Organogram' }] } },
    )
    expect(zip.file('word/media/invulhulp-1.png')).not.toBeNull()
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    expect(rels).toContain('rIdInvulhulp1')
    const xml = await documentXml(zip)
    expect(xml).toContain('r:embed="rIdInvulhulp1"')
    expect(xml).toContain('Organogram')
  })
})
