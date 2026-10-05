/**
 * The text inside `<tag>…</tag>` of an LLM stream that may still be arriving:
 * everything after the opening tag, cut at the closing tag once it is there.
 * Empty until the opening tag has streamed in, so the preamble never shows.
 */
export function streamingTagContent(raw: string, tag: string): string {
  const afterOpen = raw.match(new RegExp(`<${tag}>([\\s\\S]*)`, 'i'))
  if (!afterOpen) return ''
  const content = afterOpen[1]
  const beforeClose = content.match(new RegExp(`([\\s\\S]*?)</${tag}>`, 'i'))
  return (beforeClose ? beforeClose[1] : content).trim()
}
