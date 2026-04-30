import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import type { Answers, RiskLevelValue, FormConfig } from '../models/Assessment'

function formatAnswer(value: string | string[] | undefined): string {
  if (!value) return '(niet ingevuld)'
  if (Array.isArray(value)) return value.join(', ') || '(niet ingevuld)'
  return value.trim() || '(niet ingevuld)'
}

export function exportToPdf(
  answers: Answers,
  formConfig: FormConfig,
  riskLevel: RiskLevelValue,
  goDecision: boolean | null,
  systemName?: string,
): void {
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
                {
                  text: hasAnswer ? formatAnswer(answer) : '(niet ingevuld)',
                  style: hasAnswer ? 'answerText' : 'emptyAnswer',
                  margin: [0, 0, 0, 8] as [number, number, number, number],
                },
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
  import('pdfmake/build/pdfmake').then((pdfMakeModule) => {
    import('pdfmake/build/vfs_fonts').then((vfsFontsModule) => {
      const pdfMake = pdfMakeModule.default
      const vfs = (vfsFontsModule as { default?: { pdfMake?: { vfs: Record<string, string> } } })
        .default?.pdfMake?.vfs
      if (vfs) pdfMake.vfs = vfs
      pdfMake.createPdf(docDefinition).download(formConfig.meta.filename)
    })
  })
}
