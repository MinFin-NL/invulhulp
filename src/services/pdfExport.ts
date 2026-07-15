import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import type { Answers, Question, QuestionAttachment, RiskLevelValue, FormConfig } from '../models/Assessment'
import { parseTableAnswer } from '../utils/tableAnswer'
import { fetchImageDataUrl } from './llmService'

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

/** Real pdfmake table (header + rows) for a table question, or null when the
 *  answer is empty/not a table. */
function tableAnswerContent(question: Question, value: string | string[] | undefined): Content[] | null {
  if (question.type !== 'table' || typeof value !== 'string') return null
  const table = parseTableAnswer(value)
  if (!table || table.rows.length === 0) return null
  const columns = question.columns ?? []
  const header = columns.map((c) => ({ text: c.label, bold: true, fillColor: '#f0f4f8' }))
  const rows = table.rows.map((row) => columns.map((_, i) => ({ text: row[i] ?? '' })))
  const content: Content[] = [
    {
      table: {
        headerRows: 1,
        widths: columns.map(() => '*'),
        body: [header, ...rows],
      },
      layout: 'lightHorizontalLines',
      style: 'answerText',
      margin: [0, 0, 0, table.notes ? 4 : 8] as [number, number, number, number],
    },
  ]
  if (table.notes.trim()) {
    content.push({
      text: `${question.notesLabel ?? 'Toelichting'}: ${table.notes.trim()}`,
      style: 'answerText',
      margin: [0, 0, 0, 8] as [number, number, number, number],
    })
  }
  return content
}

/** Image + caption content for a question's attachments. Bytes are looked up
 *  in `dataUrls`; attachments whose fetch failed degrade to a placeholder. */
function attachmentContent(
  attachments: QuestionAttachment[],
  dataUrls: Map<string, string>,
): Content[] {
  const content: Content[] = []
  for (const att of attachments) {
    const dataUrl = dataUrls.get(att.id)
    if (!dataUrl) {
      content.push({
        text: `(afbeelding niet beschikbaar: ${att.filename})`,
        style: 'emptyAnswer',
        margin: [0, 2, 0, 8] as [number, number, number, number],
      })
      continue
    }
    content.push({
      unbreakable: true,
      stack: [
        { image: dataUrl, fit: [430, 280] as [number, number], margin: [0, 4, 0, 2] as [number, number, number, number] },
        ...(att.caption.trim()
          ? [{ text: att.caption.trim(), style: 'meta', margin: [0, 0, 0, 8] as [number, number, number, number] }]
          : []),
      ],
    })
  }
  return content
}

export async function exportToPdf(
  answers: Answers,
  formConfig: FormConfig,
  riskLevel: RiskLevelValue,
  goDecision: boolean | null,
  systemName?: string,
  attachments: Record<string, QuestionAttachment[]> = {},
): Promise<void> {
  // Pre-fetch all attachment bytes as data URLs (pdfmake embeds base64).
  const allAttachments = Object.values(attachments).flat()
  const dataUrls = new Map<string, string>()
  await Promise.allSettled(
    allAttachments.map(async (att) => {
      dataUrls.set(att.id, await fetchImageDataUrl(att.id))
    }),
  )
  const hasConditionalPartB = formConfig.features.conditionalPartB
  const riskInfo = riskLevel ? (formConfig.riskLevelInfo?.[riskLevel] ?? null) : null
  const today = new Date().toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const content: Content[] = [
    // Cover
    {
      text: formConfig.meta.docTitle,
      style: 'title',
      margin: [0, 0, 0, 8],
    },
    {
      text: 'Ministerie van Financiën',
      style: 'subtitle',
      margin: [0, 0, 0, 4],
    },
    {
      text: `Versie ${formConfig.version} | ${today}`,
      style: 'meta',
      margin: [0, 0, 0, 4],
    },
    systemName
      ? {
          text: `${hasConditionalPartB ? 'Systeem' : 'Project'}: ${systemName}`,
          style: 'meta',
          margin: [0, 0, 0, 20],
        }
      : { text: '', margin: [0, 0, 0, 20] },

    // Risk level badge (forms with riskClassification)
    hasConditionalPartB && riskInfo
      ? {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  text: `Risiconiveau: ${riskInfo.label}`,
                  bold: true,
                  color: '#ffffff',
                  fillColor:
                    riskLevel === 'onaanvaardbaar'
                      ? '#c0392b'
                      : riskLevel === 'hoog'
                        ? '#e67e22'
                        : riskLevel === 'beperkt'
                          ? '#2980b9'
                          : '#27ae60',
                  margin: [8, 6, 8, 6],
                },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 20],
        }
      : { text: '', margin: [0, 0, 0, 20] },

    { text: '', pageBreak: 'after' },
  ]

  // Filter sections
  const sectionsToInclude = formConfig.sections.filter((s) => {
    if (hasConditionalPartB && s.part === 'B' && !goDecision) return false
    return true
  })

  for (const section of sectionsToInclude) {
    content.push({
      text: section.title,
      style: 'sectionTitle',
      margin: [0, 16, 0, 8],
    })

    for (const subsection of section.subsections) {
      content.push({
        text: subsection.title,
        style: 'subsectionTitle',
        margin: [0, 12, 0, 6],
      })

      for (const question of subsection.questions) {
        const answer = answers[question.id]
        const hasAnswer = answer && (Array.isArray(answer) ? answer.length > 0 : answer.trim() !== '')

        const questionLabel =
          question.importance === 'mandatory'
            ? `${question.text} *`
            : question.text

        content.push({
          columns: [
            {
              width: 8,
              canvas: [
                {
                  type: 'rect',
                  x: 0,
                  y: 0,
                  w: 4,
                  h: 40,
                  color: question.importance === 'mandatory' ? '#0070bb' : '#39870c',
                },
              ],
            },
            {
              width: '*',
              stack: [
                {
                  text: questionLabel,
                  style: 'questionText',
                  margin: [0, 0, 0, 2] as [number, number, number, number],
                },
                ...((hasAnswer && tableAnswerContent(question, answer)) || [
                  {
                    text: hasAnswer ? formatAnswer(answer) : '(niet ingevuld)',
                    style: hasAnswer ? 'answerText' : 'emptyAnswer',
                    margin: [0, 0, 0, 8] as [number, number, number, number],
                  },
                ]),
                ...attachmentContent(attachments[question.id] ?? [], dataUrls),
              ],
            },
          ],
          margin: [0, 4, 0, 0] as [number, number, number, number],
        })
      }
    }
  }

  const docDefinition: TDocumentDefinitions = {
    content,
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      lineHeight: 1.4,
    },
    styles: {
      title: { fontSize: 22, bold: true, color: '#154273' },
      subtitle: { fontSize: 14, color: '#154273' },
      meta: { fontSize: 10, color: '#666666' },
      sectionTitle: { fontSize: 14, bold: true, color: '#154273' },
      subsectionTitle: { fontSize: 12, bold: true, color: '#333333' },
      questionText: { fontSize: 10, color: '#333333' },
      answerText: { fontSize: 10, color: '#000000', italics: false },
      emptyAnswer: { fontSize: 10, color: '#999999', italics: true },
    },
    pageMargins: [40, 60, 40, 60],
    footer: (currentPage, pageCount) => ({
      text: `${formConfig.meta.footerLabel} | Pagina ${currentPage} van ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#999999',
      margin: [40, 0],
    }),
  }

  // Dynamic import to avoid SSR issues
  const [pdfMakeModule, vfsFontsModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  const pdfMake = pdfMakeModule.default
  const vfs = (vfsFontsModule as { default?: { pdfMake?: { vfs: Record<string, string> } } })
    .default?.pdfMake?.vfs
  if (vfs) pdfMake.vfs = vfs
  pdfMake.createPdf(docDefinition).download(formConfig.meta.filename)
}
