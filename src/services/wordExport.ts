import {
  Document,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  Table,
  TableRow,
  TableCell,
  TableLayoutType,
  WidthType,
  ShadingType,
  BorderStyle,
  HeightRule,
} from 'docx'
import { saveAs } from 'file-saver'
import type { Answers, Question, QuestionAttachment, RiskLevelValue, FormConfig } from '../models/Assessment'
import { parseTableAnswer } from '../utils/tableAnswer'
import { htmlToParagraphs } from '../utils/htmlRuns'
import { fetchImageArrayBuffer } from './llmService'

// Rijkshuisstijl / NL Design System styling for the modern report export.
//
// Font: the Rijksoverheid corporate typeface is "Rijksoverheid Sans", which is
// licensed and cannot be embedded in a distributable .docx. The Rijkshuisstijl
// prescribes **Verdana** as the substitute font for office documents (Word,
// PowerPoint), which is what the RVO design tokens also fall back to
// (`Verdana, Calibri, Arial`). Verdana is available on every OS, so the file
// renders identically for every recipient.
const FONT = 'Verdana'

// Type scale in half-points (Verdana runs visually larger than Arial, so the
// body sits at 10pt rather than 11pt).
const SIZE = {
  coverTitle: 40,
  coverKicker: 18,
  meta: 18,
  sectionTitle: 26,
  sectionKicker: 15,
  subsection: 22,
  description: 18,
  label: 20,
  body: 20,
  cell: 18,
  caption: 16,
  chrome: 15,
}

// NL Design System (RVO) palette, mirrored from @nl-rvo/design-tokens so the
// exported document reads as the same visual system as the app itself.
const RVO = {
  lintblauw: '154273',
  donkerblauw: '01689B',
  donkerblauwTint: 'D9E9F0',
  hemelblauw: '007BC7',
  groen: '39870C',
  rood: 'D51B1E',
  grijs900: '0F172A',
  grijs700: '334155',
  grijs500: '64748B',
  grijs200: 'E2E8F0',
  grijs050: 'F8FAFC',
  wit: 'FFFFFF',
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: RVO.wit }
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }

const CHECKED = '☒'
const UNCHECKED = '☐'

// Left indent (twips) that aligns question labels and answers into one column,
// leaving room for the colored accent border on the left.
const BODY_INDENT = 240

// Usable text width on A4 at the default 1440-twip margins (11906 − 2×1440).
// Full-bleed banner tables must set this explicitly, otherwise Word's autofit
// collapses a single-cell table to its minimum content width.
const CONTENT_WIDTH = 9026

function stripHtml(html: string): string {
  return html
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

function formatAnswer(value: string | string[] | undefined): string {
  if (!value) return '(niet ingevuld)'
  if (Array.isArray(value)) return value.map(stripHtml).join(', ') || '(niet ingevuld)'
  return stripHtml(value) || '(niet ingevuld)'
}

/** Styled paragraphs (bold/italic runs) for a string answer, or null when the
 *  value flattens to nothing so the caller falls back to "(niet ingevuld)". */
function styledAnswerParagraphs(value: string): Paragraph[] | null {
  const paragraphs = htmlToParagraphs(value)
  if (paragraphs.length === 0) return null
  return paragraphs.map(
    (p, i) =>
      new Paragraph({
        indent: { left: BODY_INDENT },
        spacing: { after: i === paragraphs.length - 1 ? 220 : 60, line: 276 },
        children: p.runs.map(
          (r) =>
            new TextRun({
              text: r.text,
              size: SIZE.body,
              color: RVO.grijs900,
              bold: r.bold,
              italics: r.italics,
              break: r.breakBefore ? 1 : undefined,
            }),
        ),
      }),
  )
}

/** Radio/checkbox questions render every option as a ☒/☐ line — the reader
 *  sees the full choice set with the selection marked, like the official
 *  template. Returns null for non-choice questions. Unanswered choice
 *  questions still render (all boxes empty). */
function choiceAnswerParagraphs(
  question: Question,
  value: string | string[] | undefined,
): Paragraph[] | null {
  if ((question.type !== 'radio' && question.type !== 'checkbox') || !question.options?.length) return null

  const selected = new Set<string>()
  let followUp = ''
  if (Array.isArray(value)) {
    for (const v of value) selected.add(stripHtml(v).trim().toLowerCase())
  } else if (typeof value === 'string' && value.trim()) {
    const [picked, follow] = value.split('\n---\n')
    selected.add(stripHtml(picked).trim().toLowerCase())
    if (follow) followUp = stripHtml(follow).trim()
  }

  const options = question.options
  const paragraphs = options.map(
    (opt, i) =>
      new Paragraph({
        indent: { left: BODY_INDENT },
        spacing: { after: i === options.length - 1 && !followUp ? 220 : 40 },
        children: [
          new TextRun({
            text: `${selected.has(opt.trim().toLowerCase()) ? CHECKED : UNCHECKED}  ${opt}`,
            size: SIZE.body,
            color: RVO.grijs900,
          }),
        ],
      }),
  )
  if (followUp) {
    paragraphs.push(
      new Paragraph({
        indent: { left: BODY_INDENT },
        spacing: { before: 40, after: 220 },
        children: [new TextRun({ text: followUp, size: SIZE.body, color: RVO.grijs900 })],
      }),
    )
  }
  return paragraphs
}

/** Real docx table (shaded header + bordered rows) for a table question, or
 *  null when the answer is empty/not a table. */
function tableAnswerChildren(
  question: Question,
  value: string | string[] | undefined,
): (Paragraph | Table)[] | null {
  if (question.type !== 'table' || typeof value !== 'string') return null
  const table = parseTableAnswer(value)
  if (!table || table.rows.length === 0) return null
  const columns = question.columns ?? []

  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: RVO.grijs200 }
  const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder }

  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map(
      (c) =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: RVO.lintblauw },
          borders: cellBorders,
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [
            new Paragraph({ children: [new TextRun({ text: c.label, bold: true, size: SIZE.cell, color: RVO.wit })] }),
          ],
        }),
    ),
  })
  const dataRows = table.rows.map(
    (row, ri) =>
      new TableRow({
        children: columns.map(
          (_, i) =>
            new TableCell({
              shading:
                ri % 2 === 1 ? { type: ShadingType.CLEAR, color: 'auto', fill: RVO.grijs050 } : undefined,
              borders: cellBorders,
              margins: { top: 60, bottom: 60, left: 120, right: 120 },
              children: [
                new Paragraph({ children: [new TextRun({ text: row[i] ?? '', size: SIZE.cell, color: RVO.grijs900 })] }),
              ],
            }),
        ),
      }),
  )

  const children: (Paragraph | Table)[] = [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      indent: { size: BODY_INDENT, type: WidthType.DXA },
      rows: [headerRow, ...dataRows],
    }),
  ]
  if (table.notes.trim()) {
    children.push(
      new Paragraph({
        indent: { left: BODY_INDENT },
        spacing: { before: 100, after: 220 },
        children: [
          new TextRun({ text: `${question.notesLabel ?? 'Toelichting'}: `, bold: true, size: SIZE.cell, color: RVO.grijs700 }),
          new TextRun({ text: table.notes.trim(), size: SIZE.cell, color: RVO.grijs900 }),
        ],
      }),
    )
  } else {
    children.push(new Paragraph({ children: [], spacing: { after: 220 } }))
  }
  return children
}

// Fit within the printable page width (A4 minus margins), in px.
const IMAGE_MAX_WIDTH = 520

async function imageDimensions(att: QuestionAttachment, data: ArrayBuffer): Promise<{ width: number; height: number }> {
  let { width, height } = att
  if (!width || !height) {
    // Metadata predates dimension capture — decode the bytes instead.
    try {
      const bmp = await createImageBitmap(new Blob([data], { type: att.mimeType }))
      width = bmp.width
      height = bmp.height
      bmp.close()
    } catch {
      width = IMAGE_MAX_WIDTH
      height = Math.round(IMAGE_MAX_WIDTH * 0.6)
    }
  }
  const scale = Math.min(1, IMAGE_MAX_WIDTH / width)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Paragraphs for a question's attachments: the image (scaled to fit the
 *  page) plus its caption. Unfetchable images degrade to a placeholder. */
async function attachmentParagraphs(attachments: QuestionAttachment[], sessionId: string): Promise<Paragraph[]> {
  const paragraphs: Paragraph[] = []
  for (const att of attachments) {
    try {
      const data = await fetchImageArrayBuffer(att.id, sessionId)
      const { width, height } = await imageDimensions(att, data)
      paragraphs.push(
        new Paragraph({
          indent: { left: BODY_INDENT },
          spacing: { before: 80, after: att.caption.trim() ? 40 : 220 },
          children: [
            new ImageRun({
              type: att.mimeType === 'image/png' ? 'png' : 'jpg',
              data,
              transformation: { width, height },
            }),
          ],
        }),
      )
      if (att.caption.trim()) {
        paragraphs.push(
          new Paragraph({
            indent: { left: BODY_INDENT },
            spacing: { after: 220 },
            children: [new TextRun({ text: att.caption.trim(), size: SIZE.caption, color: RVO.grijs500, italics: true })],
          }),
        )
      }
    } catch {
      paragraphs.push(
        new Paragraph({
          indent: { left: BODY_INDENT },
          spacing: { after: 220 },
          children: [
            new TextRun({
              text: `(afbeelding niet beschikbaar: ${att.filename})`,
              size: SIZE.body,
              color: RVO.grijs500,
              italics: true,
            }),
          ],
        }),
      )
    }
  }
  return paragraphs
}

function riskColor(level: RiskLevelValue): string {
  switch (level) {
    case 'onaanvaardbaar': return 'C0392B'
    case 'hoog': return 'E67E22'
    case 'beperkt': return '2980B9'
    default: return '27AE60'
  }
}

/** Split "Deel 1: Gegevens…" into a small kicker ("DEEL 1") and the title, so
 *  section headers get a two-line, styled treatment. */
function splitSectionTitle(title: string): { kicker: string | null; title: string } {
  const m = title.match(/^\s*(Deel\s+\d+|Onderdeel\s+\d+|Fase\s+\d+)\s*[:.\-–]\s*(.+)$/i)
  if (m) return { kicker: m[1].toUpperCase(), title: m[2].trim() }
  return { kicker: null, title }
}

export async function exportToWord(
  answers: Answers,
  formConfig: FormConfig,
  riskLevel: RiskLevelValue,
  goDecision: boolean | null,
  systemName?: string,
  attachments: Record<string, QuestionAttachment[]> = {},
  sessionId = '',
): Promise<void> {
  const hasConditionalPartB = formConfig.features.conditionalPartB
  const riskInfo = riskLevel ? (formConfig.riskLevelInfo?.[riskLevel] ?? null) : null
  const today = new Date().toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const children: (Paragraph | Table)[] = []

  // Cover: a full-width lintblauw band with a bright hemelblauw accent stripe
  // beneath it (the app's header identity), carrying the ministry name + title.
  children.push(
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [CONTENT_WIDTH],
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: CONTENT_WIDTH, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: RVO.lintblauw },
              borders: NO_BORDERS,
              margins: { top: 640, bottom: 640, left: 460, right: 460 },
              children: [
                new Paragraph({
                  spacing: { after: 200 },
                  children: [new TextRun({ text: 'MINISTERIE VAN FINANCIËN', size: SIZE.coverKicker, color: '9DBAD6', bold: true })],
                }),
                new Paragraph({
                  children: [new TextRun({ text: formConfig.meta.docTitle, bold: true, size: SIZE.coverTitle, color: RVO.wit })],
                }),
              ],
            }),
          ],
        }),
        // Thin accent stripe flush under the band.
        new TableRow({
          height: { value: 90, rule: HeightRule.EXACT },
          children: [
            new TableCell({
              width: { size: CONTENT_WIDTH, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: RVO.hemelblauw },
              borders: NO_BORDERS,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: [new Paragraph({ spacing: { after: 0, line: 90 }, children: [new TextRun({ text: '', size: 2 })] })],
            }),
          ],
        }),
      ],
    }),
    // Metadata block.
    new Paragraph({
      spacing: { before: 360, after: 40 },
      children: [
        new TextRun({ text: 'Versie ', size: SIZE.meta, color: RVO.grijs500 }),
        new TextRun({ text: formConfig.version, size: SIZE.meta, color: RVO.grijs700, bold: true }),
        new TextRun({ text: '      ·      ', size: SIZE.meta, color: RVO.grijs200 }),
        new TextRun({ text: today, size: SIZE.meta, color: RVO.grijs700 }),
      ],
    }),
  )
  if (systemName) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `${hasConditionalPartB ? 'Systeem' : 'Project'}: `, size: SIZE.meta, color: RVO.grijs500 }),
          new TextRun({ text: systemName, size: SIZE.meta, color: RVO.grijs700, bold: true }),
        ],
      }),
    )
  }
  // Rule closing the cover metadata.
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 0 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RVO.grijs200, space: 1 } },
      children: [new TextRun({ text: '', size: 2 })],
    }),
  )

  if (hasConditionalPartB && riskInfo) {
    children.push(
      new Paragraph({ children: [], spacing: { after: 200 } }),
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: [CONTENT_WIDTH],
        layout: TableLayoutType.FIXED,
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: CONTENT_WIDTH, type: WidthType.DXA },
                shading: { type: ShadingType.CLEAR, color: 'auto', fill: riskColor(riskLevel) },
                borders: NO_BORDERS,
                margins: { top: 140, bottom: 140, left: 240, right: 240 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: `Risiconiveau: ${riskInfo.label}`, bold: true, color: RVO.wit, size: 24 }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    )
  }

  // Page break after the cover so the content starts on a fresh page.
  children.push(new Paragraph({ children: [], pageBreakBefore: true }))

  // Sections
  const sectionsToInclude = formConfig.sections.filter((s) => {
    if (hasConditionalPartB && s.part === 'B' && !goDecision) return false
    return true
  })

  for (const [sectionIndex, section] of sectionsToInclude.entries()) {
    const { kicker, title } = splitSectionTitle(section.title)
    if (kicker) {
      children.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: sectionIndex === 0 ? 0 : 440, after: 20 },
          children: [new TextRun({ text: kicker, bold: true, size: SIZE.sectionKicker, color: RVO.hemelblauw })],
        }),
      )
    }
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RVO.donkerblauwTint, space: 6 } },
        spacing: { before: kicker ? 0 : sectionIndex === 0 ? 0 : 440, after: 240 },
        children: [new TextRun({ text: title, bold: true, size: SIZE.sectionTitle, color: RVO.lintblauw })],
      }),
    )

    for (const subsection of section.subsections) {
      children.push(
        new Paragraph({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: RVO.grijs050 },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: RVO.donkerblauw, space: 10 } },
          spacing: { before: 280, after: subsection.description ? 60 : 180 },
          children: [new TextRun({ text: subsection.title, bold: true, size: SIZE.subsection, color: RVO.lintblauw })],
        }),
      )
      if (subsection.description) {
        children.push(
          new Paragraph({
            spacing: { after: 180 },
            children: [new TextRun({ text: subsection.description, italics: true, size: SIZE.description, color: RVO.grijs500 })],
          }),
        )
      }

      for (const question of subsection.questions) {
        const answer = answers[question.id]
        const hasAnswer = answer && (Array.isArray(answer) ? answer.length > 0 : answer.trim() !== '')
        const accent = question.importance === 'mandatory' ? RVO.donkerblauw : RVO.groen

        // Question label — regular weight in lintblauw (distinguished from the
        // black answer by color + the colored accent bar, not by boldness), with
        // the mandatory asterisk in red.
        const labelRuns = [new TextRun({ text: question.text, size: SIZE.label, color: RVO.lintblauw })]
        if (question.importance === 'mandatory') {
          labelRuns.push(new TextRun({ text: '  *', size: SIZE.label, color: RVO.rood }))
        }
        children.push(
          new Paragraph({
            keepNext: true,
            indent: { left: BODY_INDENT },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: accent, space: 14 } },
            spacing: { before: 220, after: 80 },
            children: labelRuns,
          }),
        )

        // Answer body.
        const answerChildren =
          choiceAnswerParagraphs(question, answer) ||
          (hasAnswer && tableAnswerChildren(question, answer)) ||
          (hasAnswer && typeof answer === 'string' && styledAnswerParagraphs(answer)) || [
            new Paragraph({
              indent: { left: BODY_INDENT },
              spacing: { after: 220 },
              children: [
                new TextRun({
                  text: hasAnswer ? formatAnswer(answer) : 'Niet ingevuld',
                  size: SIZE.body,
                  color: hasAnswer ? RVO.grijs900 : RVO.grijs500,
                  italics: !hasAnswer,
                }),
              ],
            }),
          ]
        children.push(...answerChildren)
        children.push(...(await attachmentParagraphs(attachments[question.id] ?? [], sessionId)))
      }
    }
  }

  const doc = new Document({
    creator: 'Ministerie van Financiën',
    title: formConfig.meta.docTitle,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE.body, color: RVO.grijs900 },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { bold: true, size: SIZE.sectionTitle, color: RVO.lintblauw, font: FONT },
        },
      ],
    },
    sections: [
      {
        properties: { titlePage: true },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RVO.grijs200, space: 4 } },
                children: [new TextRun({ text: formConfig.meta.docTitle, size: SIZE.chrome, color: RVO.grijs500 })],
              }),
            ],
          }),
          first: new Header({ children: [new Paragraph({ children: [] })] }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: RVO.grijs200, space: 4 } },
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `${formConfig.meta.footerLabel} | Pagina `, size: SIZE.chrome, color: RVO.grijs500 }),
                  new TextRun({ children: [PageNumber.CURRENT], size: SIZE.chrome, color: RVO.grijs500 }),
                  new TextRun({ text: ' van ', size: SIZE.chrome, color: RVO.grijs500 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: SIZE.chrome, color: RVO.grijs500 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const filename = formConfig.meta.filename.replace(/\.pdf$/i, '') + '.docx'
  saveAs(blob, filename)
}
