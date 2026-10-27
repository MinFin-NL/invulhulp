/**
 * Builds docs/ljson/ai-belastingtelefoon.ljson — a demo for the TekstOntleder —
 * with the real exporter, and fails when the committed file no longer matches
 * what the exporter makes of it. Regenerate after a deliberate change with
 *
 *   UPDATE_LJSON_DEMO=1 npx vitest run src/services/ljsonExport.demo.test.ts
 *
 * The dossier is fictitious: an AIIA for an "AI Belastingtelefoon" voice
 * assistant, filled in by three made-up people with AI Modus, an AI
 * suggestion, "Verbeter tekst", a copy from the intake form, and one answer
 * from before revisions were recorded (text without origin).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import type { AnswerRevision, Answers, FormConfig } from '../models/Assessment'
import { buildLjsonDocument } from './ljsonExport'

const ROOT = resolve(__dirname, '../..')
const DEMO = resolve(ROOT, 'docs/ljson/ai-belastingtelefoon.ljson')
const aiia = JSON.parse(readFileSync(resolve(ROOT, 'public/forms/aiia.json'), 'utf-8')) as FormConfig

const at = (iso: string) => Date.parse(iso)
const MODEL = 'azure/gpt-5.3-chat'

const anouk = { name: 'Anouk Jansen', email: 'a.jansen@belastingdienst.example' }
const ruben = { name: 'Ruben de Wit', email: 'r.dewit@belastingdienst.example' }
const fatima = { name: 'Fatima El Amrani', email: 'f.elamrani@belastingdienst.example' }

const typed = (who: typeof anouk, when: string, text: string): AnswerRevision => ({
  ...who, by: 'human', at: at(when), text,
})
const generated = (
  who: typeof anouk,
  when: string,
  trigger: AnswerRevision['trigger'],
  text: string,
): AnswerRevision => ({ ...who, by: 'ai', model: MODEL, trigger, at: at(when), text })

const history: Record<string, AnswerRevision[]> = {
  // AI Modus drafts the goal; Anouk sharpens it; Ruben adds a boundary.
  '1.1.1': [
    generated(anouk, '2026-10-20T09:12:00Z', 'ai-modus',
      'De AI Belastingtelefoon is een spraakassistent die bellers van de BelastingTelefoon te woord staat. ' +
      'Het systeem herkent de vraag van de beller, beantwoordt veelgestelde vragen over de inkomstenbelasting ' +
      'en betalingsregelingen direct en verbindt complexe vragen door naar een medewerker. Verwacht resultaat ' +
      'is een kortere wachttijd en meer tijd voor medewerkers voor ingewikkelde vragen.'),
    typed(anouk, '2026-10-20T09:40:00Z',
      'De AI Belastingtelefoon is een spraakassistent die bellers van de BelastingTelefoon te woord staat. ' +
      'Het systeem herkent de vraag van de beller, beantwoordt veelgestelde vragen over de inkomstenbelasting ' +
      'en betalingsregelingen direct, op basis van goedgekeurde antwoordteksten, en verbindt complexe vragen ' +
      'door naar een medewerker. Verwacht resultaat is een gemiddeld 30% kortere wachttijd en meer tijd voor ' +
      'medewerkers voor ingewikkelde vragen.'),
    typed(ruben, '2026-10-21T14:05:00Z',
      'De AI Belastingtelefoon is een spraakassistent die bellers van de BelastingTelefoon te woord staat. ' +
      'Het systeem herkent de vraag van de beller, beantwoordt veelgestelde vragen over de inkomstenbelasting ' +
      'en betalingsregelingen direct, op basis van goedgekeurde antwoordteksten, en verbindt complexe vragen ' +
      'door naar een medewerker. Verwacht resultaat is een gemiddeld 30% kortere wachttijd en meer tijd voor ' +
      'medewerkers voor ingewikkelde vragen. Het systeem neemt zelf geen besluiten over de belastingzaak van ' +
      'de beller.'),
  ],
  // Written by hand, start to finish.
  '1.1.3': [
    typed(anouk, '2026-10-20T10:02:00Z',
      'Bij de directie Klantinteractie en Dienstverlening, in het eerste contact van de BelastingTelefoon ' +
      '(keuzemenu en wachtrij). Medewerkers in het contactcenter zien een samenvatting van het gesprek ' +
      'wanneer de beller wordt doorverbonden.'),
  ],
  // Copied from the intake form when the AIIA was opened; Fatima adds data.
  '1.1.4': [
    {
      ...anouk, by: 'copied', source: 'Intakeformulier nieuwe IV-verzoeken', at: at('2026-10-20T09:05:00Z'),
      text: 'Rond de aangifte inkomstenbelasting wachten bellers op piekmomenten gemiddeld meer dan twintig minuten.',
    },
    typed(fatima, '2026-10-22T09:30:00Z',
      'Rond de aangifte inkomstenbelasting wachten bellers op piekmomenten gemiddeld meer dan twintig minuten. ' +
      'Uit een analyse van 2025 blijkt dat ruim 40% van de gesprekken over dezelfde tien onderwerpen gaat; ' +
      'die vragen lenen zich voor automatische beantwoording.'),
  ],
  // AI Modus, then Fatima corrects the technique, then "Verbeter tekst".
  '1.2.1': [
    generated(anouk, '2026-10-20T09:12:00Z', 'ai-modus',
      'Het systeem combineert spraakherkenning, een groot taalmodel en een zoekfunctie over de kennisbank ' +
      'van de BelastingTelefoon (RAG). Het taalmodel formuleert een antwoord uitsluitend op basis van de ' +
      'gevonden kennisartikelen. Gesprekken worden niet gebruikt om het model te trainen.'),
    typed(fatima, '2026-10-22T10:15:00Z',
      'Het systeem combineert spraakherkenning, een groot taalmodel dat binnen de eigen Azure-tenant draait ' +
      'en een zoekfunctie over de kennisbank van de BelastingTelefoon (RAG). Spraakherkenning gebeurt met ' +
      'Whisper large-v3, lokaal gehost. Het taalmodel formuleert een antwoord uitsluitend op basis van de ' +
      'gevonden kennisartikelen. Gesprekken worden niet gebruikt om het model te trainen.'),
    generated(fatima, '2026-10-22T10:20:00Z', 'tekst-verbeteren',
      'Het systeem combineert drie onderdelen: spraakherkenning, een groot taalmodel dat binnen de eigen ' +
      'Azure-tenant draait en een zoekfunctie over de kennisbank van de BelastingTelefoon (RAG). ' +
      'Spraakherkenning gebeurt met Whisper large-v3, lokaal gehost. Het taalmodel formuleert een antwoord ' +
      'uitsluitend op basis van de gevonden kennisartikelen. Gesprekken worden niet gebruikt om het model ' +
      'te trainen.'),
  ],
  // Ruben writes, Anouk adds a sentence.
  '1.2.3': [
    typed(ruben, '2026-10-21T13:30:00Z',
      'Overwogen zijn een uitgebreider keuzemenu en terugbelverzoeken. Een keuzemenu helpt bellers niet bij ' +
      'vragen die ze niet in een categorie kunnen plaatsen; terugbellen verschuift de piek alleen. Ook is ' +
      'gekeken naar een chatbot op de website, die als aanvulling blijft bestaan.'),
    typed(anouk, '2026-10-23T08:45:00Z',
      'Overwogen zijn een uitgebreider keuzemenu en terugbelverzoeken. Een keuzemenu helpt bellers niet bij ' +
      'vragen die ze niet in een categorie kunnen plaatsen; terugbellen verschuift de piek alleen. Ook is ' +
      'gekeken naar een chatbot op de website, die als aanvulling blijft bestaan. Een regelgebaseerd ' +
      'spraaksysteem viel af omdat het de variatie in vraagstelling slecht aankan.'),
  ],
  // An accepted AI suggestion nobody changed.
  '1.3.2': [
    generated(ruben, '2026-10-21T13:50:00Z', 'suggestie',
      'Gebruikers zijn de medewerkers van de BelastingTelefoon, die doorverbonden gesprekken met een ' +
      'samenvatting ontvangen. Betrokkenen zijn de bellers: burgers en ondernemers, onder wie mensen met ' +
      'beperkte digitale vaardigheden of taalvaardigheid.'),
  ],
  // '1.3.3' has an answer but no history: filled in before revisions were kept.
  // AI Modus writes one thin sentence; Ruben rewrites most of it.
  '4.1.1': [
    generated(anouk, '2026-10-20T09:12:00Z', 'ai-modus',
      'Het systeem wordt op bias getest door de antwoorden voor verschillende groepen bellers te vergelijken.'),
    typed(ruben, '2026-10-21T14:20:00Z',
      'Spraakherkenning presteert slechter bij dialecten en bij sprekers met een accent. Daarom wordt de ' +
      'herkenning per groep bellers getest, en verbindt het systeem bij lage herkenningszekerheid altijd door ' +
      'naar een medewerker. De antwoorden voor verschillende groepen bellers worden maandelijks vergeleken.'),
  ],
  '4.1.2': [
    typed(fatima, '2026-10-22T11:00:00Z',
      'Gedeeltelijk\nDe testset bevat nog te weinig opnames van sprekers met een accent. Aanvullende opnames ' +
      'worden in het eerste kwartaal van 2027 verzameld.'),
  ],
}

const html = (text: string) => `<p>${text}</p>`
const last = (qid: string) => history[qid][history[qid].length - 1].text
const answers: Answers = {
  ...Object.fromEntries(Object.keys(history).filter((q) => q !== '4.1.2').map((q) => [q, html(last(q))])),
  '1.3.3': html('Het klantpanel, de ondernemingsraad, de functionaris gegevensbescherming en het CIO-office.'),
  '4.1.2': `Gedeeltelijk\n---\n${html(last('4.1.2').split('\n')[1])}`,
}

describe('LJSON-demo AI Belastingtelefoon', () => {
  it('komt overeen met wat de export ervan maakt', async () => {
    const doc = await buildLjsonDocument({
      documentId: 'demo-ai-belastingtelefoon:aiia',
      title: aiia.meta.docTitle,
      subtitle: 'AI Belastingtelefoon (fictief voorbeeld)',
      sections: aiia.sections,
      answers,
      history,
    })
    const json = JSON.stringify(doc, null, 2) + '\n'
    if (process.env.UPDATE_LJSON_DEMO) {
      mkdirSync(dirname(DEMO), { recursive: true })
      writeFileSync(DEMO, json)
    }
    expect(readFileSync(DEMO, 'utf-8')).toBe(json)
    // Every kind of origin the demo is meant to show is in it.
    expect(new Set(doc.provenance_spans.map((s) => s.source_type))).toEqual(new Set(['human', 'ai', 'copied']))
  })
})
