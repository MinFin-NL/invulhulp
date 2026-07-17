// Answers are stored either as legacy plain text or as Tiptap HTML
// (<p>, <strong>, <em>, <br>, lists). These converters flatten both shapes
// into styled runs for the PDF/Word exports and into Markdown for the
// improve-text LLM round-trip. Kept deliberately small: only the node set
// Tiptap's StarterKit can actually produce.

export interface RunSpec {
  text: string
  bold?: boolean
  italics?: boolean
  // Render as a soft line break (<br> / single \n) before this run.
  breakBefore?: boolean
}

export interface ParagraphSpec {
  runs: RunSpec[]
}

const HTML_RE = /<[a-z][\s\S]*>/i
const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE'])

interface InlineStyle {
  bold: boolean
  italics: boolean
}

function pushRun(runs: RunSpec[], text: string, style: InlineStyle, breakBefore: boolean): void {
  if (!text && !breakBefore) return
  const last = runs[runs.length - 1]
  if (last && !breakBefore && !!last.bold === style.bold && !!last.italics === style.italics) {
    last.text += text
    return
  }
  runs.push({
    text,
    ...(style.bold ? { bold: true } : {}),
    ...(style.italics ? { italics: true } : {}),
    ...(breakBefore ? { breakBefore: true } : {}),
  })
}

function walkInline(node: Node, style: InlineStyle, runs: RunSpec[], state: { pendingBreak: boolean }): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''
      if (text) {
        pushRun(runs, text, style, state.pendingBreak)
        state.pendingBreak = false
      }
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as Element
    const tag = el.tagName
    if (tag === 'BR') {
      state.pendingBreak = true
      continue
    }
    const next: InlineStyle = {
      bold: style.bold || tag === 'STRONG' || tag === 'B',
      italics: style.italics || tag === 'EM' || tag === 'I',
    }
    // Unknown inline tags (u, code, s, a, mark, span…) are transparent.
    walkInline(el, next, runs, state)
  }
}

function paragraphFromElement(el: Element, prefix = ''): ParagraphSpec | null {
  const runs: RunSpec[] = []
  if (prefix) pushRun(runs, prefix, { bold: false, italics: false }, false)
  walkInline(el, { bold: false, italics: false }, runs, { pendingBreak: false })
  if (runs.every((r) => r.text.trim() === '')) return null
  return { runs }
}

function paragraphsFromHtml(html: string): ParagraphSpec[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const paragraphs: ParagraphSpec[] = []

  const visit = (node: Element): void => {
    for (const child of Array.from(node.children.length ? node.children : [])) {
      const tag = child.tagName
      if (tag === 'UL' || tag === 'OL') {
        let n = 1
        for (const li of Array.from(child.children)) {
          if (li.tagName !== 'LI') continue
          const prefix = tag === 'OL' ? `${n}. ` : '• '
          n++
          const p = paragraphFromElement(li, prefix)
          if (p) paragraphs.push(p)
        }
      } else if (BLOCK_TAGS.has(tag)) {
        const p = paragraphFromElement(child)
        if (p) paragraphs.push(p)
      } else {
        const p = paragraphFromElement(child)
        if (p) paragraphs.push(p)
      }
    }
  }

  if (doc.body.children.length === 0) {
    const p = paragraphFromElement(doc.body)
    return p ? [p] : []
  }
  visit(doc.body)
  return paragraphs
}

function paragraphsFromPlainText(text: string): ParagraphSpec[] {
  const paragraphs: ParagraphSpec[] = []
  for (const block of text.split(/\n{2,}/)) {
    if (!block.trim()) continue
    const runs: RunSpec[] = []
    block.split('\n').forEach((line, i) => {
      if (i === 0) pushRun(runs, line, { bold: false, italics: false }, false)
      else runs.push({ text: line, breakBefore: true })
    })
    paragraphs.push({ runs })
  }
  return paragraphs
}

/** Tiptap HTML (or legacy plain text) → paragraphs of styled runs.
 *  Radio composite answers ("option\n---\nfollowup") get a literal '---'
 *  separator paragraph so exporters need no special casing. */
export function htmlToParagraphs(value: string): ParagraphSpec[] {
  if (!value || !value.trim()) return []
  const segments = value.split('\n---\n')
  const paragraphs: ParagraphSpec[] = []
  segments.forEach((segment, i) => {
    if (i > 0) paragraphs.push({ runs: [{ text: '---' }] })
    const segmentParagraphs = HTML_RE.test(segment)
      ? paragraphsFromHtml(segment)
      : paragraphsFromPlainText(segment)
    paragraphs.push(...segmentParagraphs)
  })
  return paragraphs
}

/** Tiptap HTML → Markdown (**bold**, *italic*, lists, blank-line paragraphs)
 *  for the improve-text LLM round-trip. Plain input is returned as-is. */
export function htmlToMarkdown(value: string): string {
  if (!HTML_RE.test(value)) return value
  return htmlToParagraphs(value)
    .map((p) =>
      p.runs
        .map((r) => {
          const text = (r.breakBefore ? '\n' : '') + wrapMarkdown(r)
          return text
        })
        .join(''),
    )
    .join('\n\n')
    .trim()
}

function wrapMarkdown(run: RunSpec): string {
  // Emphasis markers must hug non-whitespace; keep edge whitespace outside.
  const m = run.text.match(/^(\s*)([\s\S]*?)(\s*)$/)
  const [, lead, core, trail] = m ?? ['', '', run.text, '']
  if (!core) return run.text
  let wrapped = core
  if (run.italics) wrapped = `*${wrapped}*`
  if (run.bold) wrapped = `**${wrapped}**`
  return lead + wrapped + trail
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// **bold**, *italic* and _italic_; non-greedy, no marker nesting inside.
const MD_INLINE_RE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_/g

function inlineMarkdownToHtml(line: string): string {
  let out = ''
  let last = 0
  for (const m of line.matchAll(MD_INLINE_RE)) {
    out += escapeHtml(line.slice(last, m.index))
    if (m[1] !== undefined) out += `<strong>${escapeHtml(m[1])}</strong>`
    else if (m[2] !== undefined) out += `<em>${escapeHtml(m[2])}</em>`
    else out += `<em>${escapeHtml(m[3])}</em>`
    last = m.index + m[0].length
  }
  out += escapeHtml(line.slice(last))
  return out
}

/** Markdown (as returned by the improve LLM) → Tiptap-compatible HTML.
 *  Plain text without markers becomes plain <p> paragraphs. */
export function markdownToHtml(md: string): string {
  const blocks = md.trim().split(/\n{2,}/)
  const html: string[] = []
  for (const block of blocks) {
    if (!block.trim()) continue
    const lines = block.split('\n')
    const isBullet = lines.every((l) => /^\s*[-*•]\s+/.test(l))
    const isOrdered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l))
    if (isBullet || isOrdered) {
      const items = lines
        .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''))
        .map((l) => `<li><p>${inlineMarkdownToHtml(l)}</p></li>`)
        .join('')
      html.push(isOrdered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`)
    } else {
      html.push(`<p>${lines.map(inlineMarkdownToHtml).join('<br>')}</p>`)
    }
  }
  return html.join('')
}
