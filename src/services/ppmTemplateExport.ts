import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import type { Answers, QuestionAttachment } from '../models/Assessment'
import { htmlToParagraphs } from '../utils/htmlRuns'
import { parseTableAnswer } from '../utils/tableAnswer'
import { fetchImageArrayBuffer } from './llmService'
import { imageDimensions } from './wordExport'

// "Origineel format" export for the PPM Projectplan: fills the official
// PPM-Projectplan 2.0 Word template itself (public/templates/), so the cover,
// woordmerk, heading numbering and table of contents are MinFin's own.
//
// Every §x.y in the template is a `Kop2` heading followed by grey italic
// guidance. An answered question replaces its guidance; an unanswered one
// leaves the guidance in place, so the reader sees what is still missing.
// The mapping is by heading text (PPM_PARAGRAPHS) — if MinFin renames a
// heading in a new template version, that paragraph silently stays guidance;
// ppmTemplateExport.test.ts pins that every mapped heading is found.

export const PPM_TEMPLATE_URL = '/templates/PPM-Projectplan-2.0.docx'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'

const HEADER_FILL = '002060' // the template's dark-blue table header
const BODY_SIZE = '20' // 10pt, the size of the template's guidance text
const BODY_INDENT = '576' // aligns with the guidance paragraphs under each Kop2

interface Slot {
  id: string
  label?: string
}

/** Kop2 heading text (normalized) → the question(s) that answer it. A heading
 *  with several slots has one guidance paragraph per slot in the template. */
export const PPM_PARAGRAPHS: Record<string, Slot[]> = {
  aanleiding: [{ id: 'ppm_a.achtergrond' }],
  doelstelling: [{ id: 'ppm_a.doelstellingen' }],
  'overwogen opties en argumentatie voor gekozen optie': [{ id: 'ppm_b.overwogen_opties' }],
  projectresultaat: [{ id: 'ppm_2.projectresultaat' }],
  projectscope: [{ id: 'ppm_a.scope' }],
  randvoorwaarden: [{ id: 'ppm_2.randvoorwaarden' }, { id: 'ppm_a.beperkingen', label: 'Beperkingen en aannames' }],
  afhankelijkheden: [{ id: 'ppm_a.afhankelijkheden' }],
  projectorganisatie: [{ id: 'ppm_d.projectmanagement' }],
  stakeholders: [{ id: 'ppm_d.stakeholders' }],
  besluitvorming: [{ id: 'ppm_3.besluitvorming' }],
  resources: [{ id: 'ppm_3.resources' }],
  communicatie: [{ id: 'ppm_3.communicatie' }],
  'beschrijving van de gekozen aanpak': [{ id: 'ppm_c.gekozen_aanpak' }],
  fasering: [{ id: 'ppm_b.fasering' }],
  planning: [{ id: 'ppm_4.planning' }],
  mijlpalen: [{ id: 'ppm_a.eindresultaten' }],
  'baten - kwalitatief & kwantitatief': [{ id: 'ppm_5.baten' }],
  'kosten - eenmalig & beheer': [{ id: 'ppm_5.kosten' }],
  "projectrisico's en beheersmaatregelen": [{ id: 'ppm_6.risicos' }],
  toleranties: [{ id: 'ppm_6.toleranties' }],
  'beschrijving eindproduct': [{ id: 'ppm_e.doel_eindproduct' }],
  'vereiste maatregelen risico analyses': [{ id: 'ppm_7.maatregelen' }],
  impact: [
    { id: 'ppm_7.impact_gebruikers', label: 'Gebruikers, processen, organisatie' },
    { id: 'ppm_7.impact_techniek', label: 'Technische systemen & aspecten' },
    { id: 'ppm_c.beheeromgeving', label: 'Beheerorganisatie' },
  ],
  'exit strategie': [{ id: 'ppm_7.exitstrategie' }],
  toelichting: [{ id: 'ppm_8.toelichting' }],
}

/** Column headers for the table questions, in column order. */
const TABLE_HEADERS: Record<string, string[]> = {
  'ppm_3.resources': ['Rol / specialisme', 'Business of IT', 'Intern of extern', 'Tijdsindicatie'],
  'ppm_a.eindresultaten': ['Mijlpaal of besluitmoment', 'Beoogde datum'],
  'ppm_6.risicos': ['Risico', 'Kans', 'Impact', 'Beheersmaatregel'],
  'ppm_6.toleranties': ['Aspect', 'Maximale afwijking'],
}

export interface TemplateImage {
  data: ArrayBuffer
  mimeType: string
  width: number // px, already scaled to fit the page
  height: number
  caption: string
}

export interface FillOptions {
  /** Fallback for the project name when the form's own field is empty. */
  systemName?: string
  /** Pre-loaded attachment images per question id. */
  images?: Record<string, TemplateImage[]>
  /** Date for the cover when the form's own field is empty. */
  today?: Date
}

export function normalizeHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Plain text of an answer, for table cells and the cover. */
function plain(value: string | string[] | undefined): string {
  if (!value) return ''
  if (Array.isArray(value)) return value.join(', ')
  return htmlToParagraphs(value)
    .map((p) => p.runs.map((r) => (r.breakBefore ? '\n' : '') + r.text).join(''))
    .join('\n')
    .trim()
}

function hasAnswer(value: string | string[] | undefined): boolean {
  if (!value) return false
  if (Array.isArray(value)) return value.length > 0
  const table = parseTableAnswer(value)
  if (table) return table.notes.trim() !== '' || table.rows.some((r) => r.some((c) => c.trim() !== ''))
  return plain(value) !== ''
}

// ── DOM helpers ────────────────────────────────────────────────────────────

class Builder {
  constructor(private doc: XMLDocument) {}

  el(name: string, attrs: Record<string, string> = {}, children: Node[] = []): Element {
    const node = this.doc.createElementNS(W, `w:${name}`)
    for (const [k, v] of Object.entries(attrs)) node.setAttributeNS(W, `w:${k}`, v)
    for (const c of children) node.appendChild(c)
    return node
  }

  rPr(opts: { bold?: boolean; italics?: boolean; color?: string; size?: string }): Element {
    const children: Node[] = []
    if (opts.bold) children.push(this.el('b'), this.el('bCs'))
    if (opts.italics) children.push(this.el('i'), this.el('iCs'))
    if (opts.color) children.push(this.el('color', { val: opts.color }))
    if (opts.size) children.push(this.el('sz', { val: opts.size }), this.el('szCs', { val: opts.size }))
    return this.el('rPr', {}, children)
  }

  run(text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: string; breakBefore?: boolean } = {}, rPr?: Element): Element {
    const r = this.el('r', {}, [rPr ? (rPr.cloneNode(true) as Element) : this.rPr(opts)])
    if (opts.breakBefore) r.appendChild(this.el('br'))
    if (text) {
      const t = this.el('t', {}, [this.doc.createTextNode(text)])
      t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve')
      r.appendChild(t)
    }
    return r
  }

  paragraph(runs: Element[], opts: { indent?: boolean; keepNext?: boolean } = {}): Element {
    const pPr = this.el('pPr')
    if (opts.keepNext) pPr.appendChild(this.el('keepNext'))
    if (opts.indent !== false) pPr.appendChild(this.el('ind', { left: BODY_INDENT }))
    return this.el('p', {}, [pPr, ...runs])
  }

  /** Answer HTML → body paragraphs in the template's body style. */
  answerParagraphs(value: string): Element[] {
    return htmlToParagraphs(value).map((p) =>
      this.paragraph(
        p.runs.map((r) => this.run(r.text, { bold: r.bold, italics: r.italics, breakBefore: r.breakBefore, size: BODY_SIZE })),
      ),
    )
  }

  cell(text: string, width: number, opts: { header?: boolean } = {}): Element {
    const tcPr = this.el('tcPr', {}, [this.el('tcW', { w: String(width), type: 'dxa' })])
    if (opts.header) tcPr.appendChild(this.el('shd', { val: 'clear', color: 'auto', fill: HEADER_FILL }))
    const lines = text ? text.split('\n') : ['']
    const paragraphs = lines.map((line) =>
      this.paragraph(
        [this.run(line, opts.header ? { bold: true, color: 'FFFFFF', size: BODY_SIZE } : { size: BODY_SIZE })],
        { indent: false },
      ),
    )
    return this.el('tc', {}, [tcPr, ...paragraphs])
  }

  /** A table answer as a real Word table, in the template's header style. */
  table(headers: string[], rows: string[][]): Element {
    const total = 9072 - Number(BODY_INDENT) // text width minus the indent
    const width = Math.floor(total / headers.length)
    const tblPr = this.el('tblPr', {}, [
      this.el('tblStyle', { val: 'Tabelraster' }),
      this.el('tblW', { w: String(width * headers.length), type: 'dxa' }),
      this.el('tblInd', { w: BODY_INDENT, type: 'dxa' }),
      this.el('tblLook', { val: '04A0', firstRow: '1', lastRow: '0', firstColumn: '0', lastColumn: '0', noHBand: '0', noVBand: '1' }),
    ])
    const grid = this.el('tblGrid', {}, headers.map(() => this.el('gridCol', { w: String(width) })))
    const headerRow = this.el('tr', {}, [
      this.el('trPr', {}, [this.el('tblHeader')]),
      ...headers.map((h) => this.cell(h, width, { header: true })),
    ])
    const bodyRows = rows.map((row) => this.el('tr', {}, headers.map((_, i) => this.cell(row[i] ?? '', width))))
    return this.el('tbl', {}, [tblPr, grid, headerRow, ...bodyRows])
  }
}

function textOf(node: Element): string {
  return Array.from(node.getElementsByTagNameNS(W, 't'))
    .map((t) => t.textContent ?? '')
    .join('')
}

function styleOf(p: Element): string | null {
  const pPr = Array.from(p.childNodes).find((n) => (n as Element).localName === 'pPr') as Element | undefined
  const style = pPr?.getElementsByTagNameNS(W, 'pStyle')[0]
  return style?.getAttributeNS(W, 'val') ?? style?.getAttribute('w:val') ?? null
}

function directChildren(el: Element, localName: string): Element[] {
  return Array.from(el.childNodes).filter(
    (n): n is Element => n.nodeType === 1 && (n as Element).localName === localName && (n as Element).namespaceURI === W,
  )
}

/** Replace a cell's content with `text`, reusing its first paragraph's
 *  properties (and the paragraph-mark run formatting as the run formatting,
 *  which is how Word formats text typed into an empty cell). */
function setCellText(b: Builder, tc: Element, text: string, style?: { bold?: boolean; color?: string; size?: string }): void {
  const paragraphs = directChildren(tc, 'p')
  const first = paragraphs[0]
  if (!first) return
  paragraphs.slice(1).forEach((p) => tc.removeChild(p))
  const pPr = directChildren(first, 'pPr')[0]
  Array.from(first.childNodes).forEach((n) => {
    if (n !== pPr) first.removeChild(n)
  })
  const markRPr = pPr ? directChildren(pPr, 'rPr')[0] : undefined
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    const target = i === 0 ? first : (first.cloneNode(false) as Element)
    if (i > 0) {
      if (pPr) target.appendChild(pPr.cloneNode(true))
      tc.appendChild(target)
    }
    target.appendChild(style || !markRPr ? b.run(line, style ?? {}) : b.run(line, {}, markRPr))
  })
}

// ── Images ─────────────────────────────────────────────────────────────────

class MediaRegistry {
  private relsDoc: XMLDocument
  private next = 1
  private docPrId = 1000
  private extensions = new Set<string>()

  constructor(
    private zip: JSZip,
    relsXml: string,
  ) {
    this.relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml')
  }

  /** Adds the image part + relationship, returns the relationship id. */
  add(image: TemplateImage): { rId: string; docPrId: number } {
    const ext = image.mimeType === 'image/png' ? 'png' : 'jpeg'
    const rId = `rIdInvulhulp${this.next}`
    const target = `media/invulhulp-${this.next}.${ext}`
    this.next++
    this.zip.file(`word/${target}`, image.data)
    this.extensions.add(ext)
    const rel = this.relsDoc.createElementNS(REL_NS, 'Relationship')
    rel.setAttribute('Id', rId)
    rel.setAttribute('Type', IMAGE_REL)
    rel.setAttribute('Target', target)
    this.relsDoc.documentElement.appendChild(rel)
    return { rId, docPrId: this.docPrId++ }
  }

  async finish(): Promise<void> {
    if (this.next === 1) return
    this.zip.file('word/_rels/document.xml.rels', serialize(this.relsDoc))
    const ctPath = '[Content_Types].xml'
    let ct = (await this.zip.file(ctPath)!.async('string')) as string
    for (const ext of this.extensions) {
      if (!new RegExp(`Extension="${ext}"`, 'i').test(ct)) {
        ct = ct.replace('<Default ', `<Default Extension="${ext}" ContentType="image/${ext}"/><Default `)
      }
    }
    this.zip.file(ctPath, ct)
  }
}

function imageParagraph(doc: XMLDocument, rId: string, docPrId: number, image: TemplateImage): Element {
  const emu = (px: number) => String(Math.round(px * 9525))
  const cx = emu(image.width)
  const cy = emu(image.height)
  const xml =
    `<w:p xmlns:w="${W}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:pPr><w:ind w:left="${BODY_INDENT}"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${docPrId}" name="Afbeelding ${docPrId}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="Afbeelding ${docPrId}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  const fragment = new DOMParser().parseFromString(xml, 'application/xml')
  return doc.importNode(fragment.documentElement, true) as Element
}

function serialize(doc: XMLDocument): string {
  const xml = new XMLSerializer().serializeToString(doc)
  return xml.startsWith('<?xml') ? xml : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}`
}

// ── Filling ────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`
}

/** Fills the PPM-Projectplan 2.0 template. Returns the zip so the caller
 *  picks the output type (a Blob in the browser, bytes in tests). */
export async function fillPpmTemplate(template: ArrayBuffer | Uint8Array, answers: Answers, opts: FillOptions = {}): Promise<JSZip> {
  const zip = await JSZip.loadAsync(template)
  const doc = new DOMParser().parseFromString(await zip.file('word/document.xml')!.async('string'), 'application/xml')
  const b = new Builder(doc)
  const media = new MediaRegistry(zip, await zip.file('word/_rels/document.xml.rels')!.async('string'))
  const body = doc.getElementsByTagNameNS(W, 'body')[0]

  const projectName = plain(answers['ppm_0.naam_project']) || opts.systemName?.trim() || ''

  // Cover. Each text box exists twice (DrawingML + VML fallback), so every
  // matching text node is replaced, not just the first.
  const version = plain(answers['ppm_0.versie'])
  const date = plain(answers['ppm_0.datum']) || formatDate(opts.today ?? new Date())
  const status = plain(answers['ppm_0.status'])
  for (const t of Array.from(doc.getElementsByTagNameNS(W, 't'))) {
    const text = t.textContent ?? ''
    if (projectName && text.includes('<<Naam project>>')) t.textContent = text.replace('<<Naam project>>', projectName)
    else if (version && /^\s*Versie 0\.1$/.test(text)) t.textContent = text.replace('0.1', version)
    else if (text === '1-1-2026') t.textContent = date
    else if (status && text === 'Concept') t.textContent = status
  }

  const tables = directChildren(body, 'tbl')
  const firstCellText = (tbl: Element) => textOf(directChildren(directChildren(tbl, 'tr')[0], 'tc')[0]).trim()

  // Colofon: label in column 1, value in column 2.
  const colofon = tables.find((t) => firstCellText(t) === 'Titel')
  if (colofon) {
    const values: Record<string, string> = {
      Titel: projectName ? `Projectplan ${projectName}` : '',
      'Auteur(s)': plain(answers['ppm_0.auteurs']),
      Bijlagen: plain(answers['ppm_0.bijlagen']),
      Inlichtingen: plain(answers['ppm_0.inlichtingen']),
    }
    for (const tr of directChildren(colofon, 'tr')) {
      const [labelCell, valueCell] = directChildren(tr, 'tc')
      const value = values[textOf(labelCell).trim()]
      if (value && valueCell) {
        // The title row is dark blue; write the value in white like its label would read.
        setCellText(b, valueCell, value, textOf(labelCell).trim() === 'Titel' ? { bold: true, color: 'FFFFFF', size: '22' } : { size: '22' })
      }
    }
  }

  // Revisiegegevens: one template row per revision, cloned when there are more.
  const revisions = tables.find((t) => firstCellText(t) === 'Versie')
  const revisionRows = parseTableAnswer(answers['ppm_0.revisies'])?.rows.filter((r) => r.some((c) => c.trim())) ?? []
  // (Plain 10pt: the template's empty cells carry a bold paragraph mark.)
  if (revisions && revisionRows.length) fillRows(b, revisions, revisionRows, { size: BODY_SIZE })

  // Tabel ondersteunende documenten: fixed rows per analysis, matched on name.
  const analyses = tables.find((t) => firstCellText(t) === 'Documenten')
  const analysisRows = parseTableAnswer(answers['ppm_8.analyses'])?.rows.filter((r) => r.some((c) => c.trim())) ?? []
  if (analyses && analysisRows.length) fillAnalyses(b, analyses, analysisRows)

  // Paragraphs under each Kop2 heading.
  const children = Array.from(body.childNodes).filter((n): n is Element => n.nodeType === 1)
  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.localName !== 'p' || styleOf(node) !== 'Kop2') continue
    const slots = PPM_PARAGRAPHS[normalizeHeading(textOf(node))]
    if (!slots) continue

    const block: Element[] = []
    for (let j = i + 1; j < children.length; j++) {
      const next = children[j]
      if (next.localName !== 'p') break
      const style = styleOf(next)
      if (style === 'Kop1' || style === 'Kop2') break
      block.push(next)
    }
    const guidance = block.filter((p) => textOf(p).trim() !== '')

    const content = (slot: Slot, withLabel: boolean): Element[] => {
      const value = answers[slot.id]
      const out: Element[] = []
      if (withLabel && slot.label) {
        out.push(b.paragraph([b.run(slot.label, { bold: true, size: BODY_SIZE })], { keepNext: true }))
      }
      const table = parseTableAnswer(value)
      if (table) {
        const rows = table.rows.filter((r) => r.some((c) => c.trim()))
        const headers = TABLE_HEADERS[slot.id]
        if (rows.length && headers) {
          out.push(b.table(headers, rows))
        }
        if (table.notes.trim()) out.push(...b.answerParagraphs(table.notes))
      } else if (typeof value === 'string') {
        out.push(...b.answerParagraphs(value))
      }
      for (const image of opts.images?.[slot.id] ?? []) {
        const { rId, docPrId } = media.add(image)
        out.push(imageParagraph(doc, rId, docPrId, image))
        if (image.caption.trim()) {
          out.push(b.paragraph([b.run(image.caption.trim(), { italics: true, color: '808080', size: '18' })]))
        }
      }
      return out
    }
    const answered = (slot: Slot) => hasAnswer(answers[slot.id]) || (opts.images?.[slot.id]?.length ?? 0) > 0

    if (slots.length > 1 && guidance.length === slots.length) {
      // One guidance paragraph per slot: replace each on its own.
      slots.forEach((slot, k) => {
        if (!answered(slot)) return
        for (const el of content(slot, true)) body.insertBefore(el, guidance[k])
        body.removeChild(guidance[k])
      })
    } else if (slots.some(answered)) {
      const anchor = guidance[0] ?? block[0] ?? children[i + 1] ?? null
      for (const slot of slots.filter(answered)) {
        for (const el of content(slot, slots.length > 1)) body.insertBefore(el, anchor)
      }
      guidance.forEach((p) => body.removeChild(p))
    }
  }

  zip.file('word/document.xml', serialize(doc))
  await media.finish()

  // Ask Word to refresh the table of contents (page numbers move once the
  // guidance is replaced by real content).
  const settingsFile = zip.file('word/settings.xml')
  if (settingsFile) {
    const settings = await settingsFile.async('string')
    if (!settings.includes('w:updateFields')) {
      zip.file('word/settings.xml', settings.replace('<w:compat>', '<w:updateFields w:val="true"/><w:compat>'))
    }
  }

  const coreFile = zip.file('docProps/core.xml')
  if (coreFile && projectName) {
    const core = await coreFile.async('string')
    const title = `Projectplan ${projectName}`.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    zip.file('docProps/core.xml', core.replace(/<dc:title>[^<]*<\/dc:title>|<dc:title\/>/, `<dc:title>${title}</dc:title>`))
  }

  return zip
}

/** Fill the body rows of a header + N-rows table, cloning the last row when
 *  there are more values than template rows. */
function fillRows(b: Builder, tbl: Element, rows: string[][], style?: { size?: string }): void {
  const trs = directChildren(tbl, 'tr')
  const template = trs[trs.length - 1]
  const bodyRows = trs.slice(1)
  rows.forEach((values, i) => {
    let tr = bodyRows[i]
    if (!tr) {
      tr = template.cloneNode(true) as Element
      tbl.appendChild(tr)
    }
    directChildren(tr, 'tc').forEach((tc, c) => setCellText(b, tc, values[c] ?? '', style))
  })
}

const docKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function fillAnalyses(b: Builder, tbl: Element, rows: string[][]): void {
  const trs = directChildren(tbl, 'tr').slice(1)
  const used = new Set<number>()
  for (const tr of trs) {
    const cells = directChildren(tr, 'tc')
    const key = docKey(textOf(cells[0]))
    const idx = rows.findIndex((r, k) => !used.has(k) && docKey(r[0] ?? '') === key)
    if (idx < 0) continue
    used.add(idx)
    cells.slice(1).forEach((tc, c) => setCellText(b, tc, rows[idx][c + 1] ?? ''))
  }
  // Analyses the template doesn't list get a row of their own.
  const template = trs[trs.length - 1]
  rows.forEach((row, k) => {
    if (used.has(k) || !row[0]?.trim()) return
    const tr = template.cloneNode(true) as Element
    tbl.appendChild(tr)
    directChildren(tr, 'tc').forEach((tc, c) => setCellText(b, tc, row[c] ?? '', c === 0 ? { color: HEADER_FILL } : undefined))
  })
}

async function loadImages(
  attachments: Record<string, QuestionAttachment[]>,
  sessionId: string,
): Promise<Record<string, TemplateImage[]>> {
  const out: Record<string, TemplateImage[]> = {}
  for (const [questionId, list] of Object.entries(attachments)) {
    for (const att of list) {
      try {
        const data = await fetchImageArrayBuffer(att.id, sessionId)
        const { width, height } = await imageDimensions(att, data)
        ;(out[questionId] ??= []).push({ data, mimeType: att.mimeType, width, height, caption: att.caption })
      } catch {
        // An unfetchable image is left out; the answer text still exports.
      }
    }
  }
  return out
}

export async function exportPpmToTemplateDocx(
  answers: Answers,
  attachments: Record<string, QuestionAttachment[]>,
  sessionId: string,
  systemName?: string,
): Promise<void> {
  const res = await fetch(PPM_TEMPLATE_URL)
  if (!res.ok) throw new Error(`Sjabloon niet gevonden (HTTP ${res.status})`)
  const images = await loadImages(attachments, sessionId)
  const zip = await fillPpmTemplate(await res.arrayBuffer(), answers, { systemName, images })
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  saveAs(blob, 'PPM-Projectplan 2.0.docx')
}
