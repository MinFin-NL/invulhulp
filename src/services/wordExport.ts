import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Footer,
  PageNumber,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  BorderStyle,
} from 'docx'
import { saveAs } from 'file-saver'
import type { Answers, RiskLevelValue, FormConfig } from '../models/Assessment'

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

function riskColor(level: RiskLevelValue): string {
  switch (level) {
    case 'onaanvaardbaar': return 'C0392B'
    case 'hoog': return 'E67E22'
    case 'beperkt': return '2980B9'
    default: return '27AE60'
  }
}

export async function exportToWord(
  answers: Answers,
  formConfig: FormConfig,
  riskLevel: RiskLevelValue,
  goDecision: boolean | null,
  systemName?: string,
): Promise<void> {
  const hasConditionalPartB = formConfig.features.conditionalPartB
  const riskInfo = riskLevel ? (formConfig.riskLevelInfo?.[riskLevel] ?? null) : null
  const today = new Date().toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const children: (Paragraph | Table)[] = []

  // Cover
  children.push(
    new Paragraph({
      children: [new TextRun({ text: formConfig.meta.docTitle, bold: true, size: 44, color: '154273' })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Ministerie van Financiën', size: 28, color: '154273' })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Versie ${formConfig.version} | ${today}`, size: 20, color: '666666' })],
      spacing: { after: 100 },
    }),
  )

  if (systemName) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${hasConditionalPartB ? 'Systeem' : 'Project'}: ${systemName}`,
            size: 20,
            color: '666666',
          }),
        ],
        spacing: { after: 400 },
      }),
    )
  }

  if (hasConditionalPartB && riskInfo) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { type: ShadingType.CLEAR, color: 'auto', fill: riskColor(riskLevel) },
                borders: {
                  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: `Risiconiveau: ${riskInfo.label}`, bold: true, color: 'FFFFFF', size: 24 }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    )
    children.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 400 } }))
  }

  // Sections
  const sectionsToInclude = formConfig.sections.filter((s) => {
    if (hasConditionalPartB && s.part === 'B' && !goDecision) return false
    return true
  })

  for (const section of sectionsToInclude) {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 160 },
      }),
    )

    for (const subsection of section.subsections) {
      children.push(
        new Paragraph({
          text: subsection.title,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
        }),
      )

      for (const question of subsection.questions) {
        const answer = answers[question.id]
        const hasAnswer = answer && (Array.isArray(answer) ? answer.length > 0 : answer.trim() !== '')
        const questionLabel =
          question.importance === 'mandatory' ? `${question.text} *` : question.text

        children.push(
          new Paragraph({
            children: [new TextRun({ text: questionLabel, bold: true, size: 22, color: '333333' })],
            spacing: { before: 120, after: 40 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: hasAnswer ? formatAnswer(answer) : '(niet ingevuld)',
                size: 22,
                color: hasAnswer ? '000000' : '999999',
                italics: !hasAnswer,
              }),
            ],
            spacing: { after: 160 },
          }),
        )
      }
    }
  }

  const doc = new Document({
    creator: 'Ministerie van Financiën',
    title: formConfig.meta.docTitle,
    styles: {
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { bold: true, size: 28, color: '154273' },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { bold: true, size: 24, color: '333333' },
        },
      ],
    },
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `${formConfig.meta.footerLabel} | Pagina `, size: 16, color: '999999' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999' }),
                  new TextRun({ text: ' van ', size: 16, color: '999999' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '999999' }),
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
