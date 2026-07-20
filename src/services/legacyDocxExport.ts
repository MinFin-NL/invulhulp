import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  BorderStyle,
  VerticalAlign,
} from 'docx'
import { saveAs } from 'file-saver'
import type { Answers, FormConfig } from '../models/Assessment'
import { parseTableAnswer, tableAnswerToPlainText } from '../utils/tableAnswer'

// Legacy exporter: reproduces the exact table-based layout of the official
// "Intakeformulier 2.0" Word template, so a filled dossier can be handed in in
// the format the intakeboard expects. Intake-specific — driven by intake
// question ids. (The modern, styled export lives in wordExport.ts.)

const FONT = 'Calibri'
const SIZE = 22 // 11pt in half-points
const HEADER_FILL = 'B8CCE4' // WEM header shading, from the original template

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const CELL_MARGINS = { top: 60, bottom: 60, left: 100, right: 100 }

/** Answer → plain text, preserving line breaks and flattening table/checkbox
 *  answers. Radio follow-up composites keep only the chosen option's text. */
function plain(value: string | string[] | undefined): string {
  if (!value) return ''
  if (Array.isArray(value)) return value.join('\n')
  const table = parseTableAnswer(value)
  if (table) return tableAnswerToPlainText(table)
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function run(text: string, opts: { bold?: boolean; italics?: boolean } = {}): TextRun {
  return new TextRun({ text, font: FONT, size: SIZE, bold: opts.bold, italics: opts.italics })
}

/** One paragraph per line of text so soft line breaks survive; an empty value
 *  yields a single blank paragraph (keeps the answer cell open). */
function textParagraphs(text: string, opts: { bold?: boolean; italics?: boolean } = {}): Paragraph[] {
  if (!text) return [new Paragraph({ children: [] })]
  return text.split('\n').map((line) => new Paragraph({ children: line ? [run(line, opts)] : [] }))
}

function cell(children: Paragraph[], opts: { width?: number; columnSpan?: number; fill?: string } = {}): TableCell {
  return new TableCell({
    children,
    borders: CELL_BORDERS,
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.TOP,
    ...(opts.width ? { width: { size: opts.width, type: WidthType.DXA } } : {}),
    ...(opts.columnSpan ? { columnSpan: opts.columnSpan } : {}),
    ...(opts.fill ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: opts.fill } } : {}),
  })
}

const CHECKED = '☒'
const UNCHECKED = '☐'

function firstOption(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return plain(value).split('\n---\n')[0].trim()
}

/** "☒ Ja  ☐ Nee"-style options, one per line, driven by a single-select value. */
function checkboxLines(options: string[], selected: string): Paragraph[] {
  const norm = selected.trim().toLowerCase()
  return options.map(
    (opt) =>
      new Paragraph({
        children: [run(`${norm === opt.trim().toLowerCase() ? CHECKED : UNCHECKED} ${opt}`)],
      }),
  )
}

/** Checkbox options for a multi-select (string[]) answer. */
function multiCheckboxLines(options: string[], selected: string[]): Paragraph[] {
  const set = new Set(selected.map((s) => s.trim().toLowerCase()))
  return options.map(
    (opt) =>
      new Paragraph({ children: [run(`${set.has(opt.trim().toLowerCase()) ? CHECKED : UNCHECKED} ${opt}`)] }),
  )
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [run(text, { bold: true })],
  })
}

function table(rows: TableRow[], columnWidths: number[]): Table {
  return new Table({
    width: { size: columnWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths,
    rows,
  })
}

interface QA {
  label: string
  toelichting?: string[]
  id: string
}

/** A label cell (bold question + italic "Toelichting" lines) stacked above an
 *  answer row — the shape used by the details/planning/dependency tables. */
function qaTable(items: QA[], answers: Answers, width: number): Table {
  const rows: TableRow[] = []
  for (const item of items) {
    const labelChildren: Paragraph[] = [new Paragraph({ children: [run(item.label, { bold: true })] })]
    if (item.toelichting?.length) {
      labelChildren.push(new Paragraph({ children: [] }))
      for (const t of item.toelichting) {
        labelChildren.push(new Paragraph({ children: [run(t, { italics: true })] }))
      }
    }
    rows.push(new TableRow({ children: [cell(labelChildren, { width })] }))
    rows.push(new TableRow({ children: [cell(textParagraphs(plain(answers[item.id])), { width })] }))
  }
  return table(rows, [width])
}

export async function exportToLegacyDocx(
  answers: Answers,
  formConfig: FormConfig,
  _systemName?: string,
): Promise<void> {
  const FULL = 9026 // usable A4 width at default 1440-twip margins
  const children: (Paragraph | Table)[] = []

  // 1. Gegevens opdrachtgever en contactpersoon
  children.push(sectionHeading('Gegevens opdrachtgever en contactpersoon'))
  const LABEL_W = 2972
  const VALUE_W = FULL - LABEL_W
  const contactRows: TableRow[] = (
    [
      ['Naam Opdrachtgever', 'intake_a.naam_opdrachtgever'],
      ['Directie/Afdeling(en)', 'intake_a.directie_afdeling'],
      ['Contactpersoon', 'intake_a.contactpersoon'],
      ['E-mail adres', 'intake_a.email'],
      ['Telefoonnummer', 'intake_a.telefoonnummer'],
      ['Melding nummer ITS Topdesk', 'intake_a.topdesk_nummer'],
      ['Datum aanlevering intakeformulier', 'intake_a.datum_aanlevering'],
    ] as const
  ).map(
    ([label, id]) =>
      new TableRow({
        children: [
          cell([new Paragraph({ children: [run(label)] })], { width: LABEL_W }),
          cell(textParagraphs(plain(answers[id])), { width: VALUE_W }),
        ],
      }),
  )
  contactRows.push(
    new TableRow({
      children: [
        cell([new Paragraph({ children: [run('Behandeling aanvraag')] })], { width: LABEL_W }),
        cell(
          checkboxLines(['Ter beoordeling', 'Ter info', 'Ter advisering'], firstOption(answers['intake_a.behandeling_aanvraag'])),
          { width: VALUE_W },
        ),
      ],
    }),
  )
  children.push(table(contactRows, [LABEL_W, VALUE_W]))

  // 2. Details aanvraag
  children.push(sectionHeading('2. Details aanvraag'))
  children.push(
    qaTable(
      [
        {
          label: 'Omschrijving IV-verzoek:',
          toelichting: [
            'Toelichting: geef hier een algemene omschrijving van het IV-verzoek.',
            'Noem daarbij in elk geval wat het probleem is en wat je met het IV-verzoek wilt bereiken.',
          ],
          id: 'intake_b.omschrijving',
        },
        {
          label: 'Aanleiding',
          toelichting: ['Toelichting: op te lossen problemen, urgentie, wettelijke verplichtingen, doelstellingen organisatie etc.'],
          id: 'intake_b.aanleiding',
        },
        {
          label: 'Doelstelling',
          toelichting: ['Toelichting: wanneer is het succesvol, hoe draagt het bij aan de organisatie'],
          id: 'intake_b.doelstelling',
        },
        {
          label: 'Mogelijke oplossingen:',
          toelichting: [
            'Toelichting: geef hier aan of er al onderzoek is gedaan naar mogelijke oplossingen of alternatieven en welke andere zaken van belang zijn om te weten.',
          ],
          id: 'intake_b.oplossingen',
        },
        {
          label: 'Mogelijke impact:',
          toelichting: ['Toelichting: doelgroep, omvang toekomstige gebruikers, benodigde wijzigingen in systemen, organisatie en processen'],
          id: 'intake_b.impact',
        },
      ],
      answers,
      FULL,
    ),
  )

  // 3. Planning en resources
  children.push(sectionHeading('3. Planning en resources'))
  children.push(
    qaTable(
      [
        {
          label: 'Beoogde start/einddatum indien van toepassing',
          toelichting: ['Toelichting: bijv. onderbouwing deadlines in verband met nieuwe wetgeving'],
          id: 'intake_c.planning',
        },
        {
          label: 'Welke resources zijn er naar verwachting nodig voor de vervolgstappen?',
          toelichting: ['Toelichting: zowel IT als Business resources benoemen'],
          id: 'intake_c.resources',
        },
      ],
      answers,
      FULL,
    ),
  )

  // 4. Afhankelijkheden
  children.push(sectionHeading('4. Afhankelijkheden'))
  children.push(
    qaTable(
      [
        { label: 'Is er een relatie en/of afhankelijkheid met andere activiteiten/projecten?', id: 'intake_d.afhankelijkheden' },
        {
          label: 'Zijn er risico’s of andere factoren die belangrijk zijn voor het succesvol afronden van dit initiatief?',
          id: 'intake_d.risicos',
        },
      ],
      answers,
      FULL,
    ),
  )

  // 5. Budget
  children.push(sectionHeading('5. Budget'))
  const budgetType = answers['intake_e.budget_type']
  const budgetRows: TableRow[] = [
    new TableRow({
      children: [
        cell(
          [
            new Paragraph({ children: [run('Geef aan welk type budget van toepassing is en of dit later moet worden aangevraagd:')] }),
            ...multiCheckboxLines(
              ['Centraal projectenbudget', 'Centraal beheerbudget', 'Innovatie budget', 'Decentraal lijnbudget'],
              Array.isArray(budgetType) ? budgetType : [],
            ),
          ],
          { width: FULL },
        ),
      ],
    }),
    new TableRow({ children: [cell([new Paragraph({ children: [run('Geef indien mogelijk een globale raming van de kosten')] })], { width: FULL })] }),
    new TableRow({ children: [cell(textParagraphs(plain(answers['intake_e.kosten_raming'])), { width: FULL })] }),
    new TableRow({
      children: [
        cell(
          [
            new Paragraph({ children: [run('Verzoek tot opvolging:')] }),
            new Paragraph({ children: [run('Toelichting: hoe wil de aanvrager het vervolgtraject aanpakken.', { italics: true })] }),
            ...checkboxLines(['Project', 'Innovatie', 'Reguliere dienstverlening'], firstOption(answers['intake_e.opvolging'])),
          ],
          { width: FULL },
        ),
      ],
    }),
  ]
  children.push(table(budgetRows, [FULL]))

  // 6. Beoordeling en besluit Intakeboard
  children.push(sectionHeading('6. Beoordeling en besluit Intakeboard (in te vullen door servicemanager)'))
  const jaNee = (id: string): Paragraph[] => {
    const sel = firstOption(answers[id]).toLowerCase()
    return [new Paragraph({ children: [run(`${sel === 'ja' ? CHECKED : UNCHECKED} Ja   ${sel === 'nee' ? CHECKED : UNCHECKED} Nee`)] })]
  }
  const BEO_W = [3200, 1500, FULL - 4700]
  const beoordelingRows: TableRow[] = (
    [
      ['Voldoet de aanvraag geheel aan geëiste criteriapunten?', 'intake_f.criteria_geheel', 'GO: Regulier/Project/Innovatie'],
      ['Voldoet de aanvraag gedeeltelijk aan geëiste criteriapunten?', 'intake_f.criteria_gedeeltelijk', 'GO: onder voorbehoud'],
      ['Voldoet de aanvraag niet aan geëiste criteriapunten?', 'intake_f.criteria_niet', 'NO-GO: afwijzing'],
    ] as const
  ).map(
    ([label, id, outcome]) =>
      new TableRow({
        children: [
          cell([new Paragraph({ children: [run(label)] })], { width: BEO_W[0] }),
          cell(jaNee(id), { width: BEO_W[1] }),
          cell([new Paragraph({ children: [run(outcome)] })], { width: BEO_W[2] }),
        ],
      }),
  )
  children.push(table(beoordelingRows, BEO_W))

  // Toelichting besluit
  children.push(
    table(
      [
        new TableRow({ children: [cell([new Paragraph({ children: [run('Toelichting:')] })], { width: FULL })] }),
        new TableRow({ children: [cell(textParagraphs(plain(answers['intake_f.toelichting_besluit'])), { width: FULL })] }),
      ],
      [FULL],
    ),
  )

  // WEM criteria table
  const WEM_W = [700, FULL - 2700, 2000]
  const wemRows: TableRow[] = [
    new TableRow({
      children: [
        cell([new Paragraph({ children: [run('Criteria inzet WEM (indien als oplossing aangevraagd)', { bold: true })] })], {
          columnSpan: 3,
          fill: HEADER_FILL,
        }),
      ],
    }),
  ]
  const WEM_QUESTIONS: [string, string][] = [
    ['1', 'Het is uitsluitend ter ondersteuning van taken binnen Financiën?'],
    ['2', 'Het is uitsluitend ter ondersteuning van niet kritische bedrijfsprocessen?*'],
    ['3', 'Er zijn geen standaardmarktproducten of Rijksvoorzieningen beschikbaar/bekend?'],
    [
      '4',
      'Het is ten behoeven van ondersteunde, repeterende, eenvoudige processen die herhaaldelijk worden uitgevoerd en niet complex van aard zijn (dus bijv. geen ketenproces) en één eindverantwoordelijke hebben?',
    ],
    ['5', 'Het is uitsluitend bedoeld voor taakondersteuning van medewerkers (front-end applicatie)?'],
    ['6', 'De applicatie is niet bedoeld voor archiveringsdoeleinden?'],
    ['7', 'Er is sprake van een beperkt aantal geautomatiseerde koppelvlakken met de omgeving?'],
  ]
  WEM_QUESTIONS.forEach(([num, question], i) => {
    wemRows.push(
      new TableRow({
        children: [
          cell([new Paragraph({ children: [run(num, { bold: true })] })], { width: WEM_W[0] }),
          cell([new Paragraph({ children: [run(question)] })], { width: WEM_W[1] }),
          cell(jaNee(`intake_f.wem_${i + 1}`), { width: WEM_W[2] }),
        ],
      }),
    )
  })
  children.push(table(wemRows, WEM_W))

  children.push(
    new Paragraph({
      spacing: { before: 120 },
      children: [
        run(
          '* Dit proces speelt een primaire rol voor doelstelling van de organisatie. Het bestaansrecht van de organisatie wordt aan dit proces ontleent. Als de activiteit langer dan één week stilvalt of niet goed verloopt heeft dit ernstige gevolgen voor het voortbestaan van de organisatie, c.q. het brengt de organisatie in een hachelijke positie.',
          { italics: true },
        ),
      ],
    }),
  )

  const doc = new Document({
    creator: 'Ministerie van Financiën',
    title: 'Intakeformulier',
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{ properties: {}, children }],
  })

  const blob = await Packer.toBlob(doc)
  const base = formConfig.meta.filename.replace(/\.pdf$/i, '').replace(/\.docx$/i, '')
  saveAs(blob, `${base} 2.0.docx`)
}
