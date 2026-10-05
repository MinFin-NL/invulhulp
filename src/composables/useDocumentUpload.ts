import { ref } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { PdfNoTextError } from '../services/llmService'

// Eén lijst voor elke upload-input (de knop en de sleepzone), zodat ze niet uit
// elkaar kunnen lopen.
export const UPLOAD_ACCEPT =
  '.txt,.md,.docx,.xlsx,.pptx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation'

/**
 * Reading source documents in the browser and handing them to the store:
 * .docx/.xlsx/.pptx/.txt/.md become text here, PDFs go to the backend whole.
 * Moved out of DossierDetail unchanged when the page was split into views.
 */
export function useDocumentUpload() {
  const store = useAssessmentStore()

  const uploadError = ref('')
  const isDragOver = ref(false)
  const successMessage = ref('')
  const isUploading = ref(false)
  const uploadingLabel = ref('')
  const recentlyAddedIds = ref<Set<string>>(new Set())

  async function extractPptxText(file: File): Promise<string> {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const n = (s: string) => parseInt(s.match(/\d+/)?.[0] ?? '0', 10)
        return n(a) - n(b)
      })
    const parts: string[] = []
    for (const slidePath of slideFiles) {
      const xml = await zip.files[slidePath].async('string')
      const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? []
      const slideText = matches
        .map((m) => m.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
        .join(' ')
      if (slideText) parts.push(slideText)
    }
    return parts.join('\n\n')
  }

  async function onFilesSelected(e: Event) {
    const target = e.target as HTMLInputElement
    await ingestFiles(target.files ? Array.from(target.files) : [])
    // Reset the input that fired, not a ref: the upload button and the empty-state
    // dropzone each have their own input.
    target.value = ''
  }

  function onDragOver(e: DragEvent) {
    if (!store.canEdit || isUploading.value) return
    e.preventDefault()
    isDragOver.value = true
  }

  function onDragLeave() {
    isDragOver.value = false
  }

  async function onDrop(e: DragEvent) {
    if (!store.canEdit || isUploading.value) return
    e.preventDefault()
    isDragOver.value = false
    await ingestFiles(Array.from(e.dataTransfer?.files ?? []))
  }

  /** Waarom een upload strandde, in één zin. Een `TypeError` uit `fetch` betekent
   *  dat het verzoek de server niet haalde — dat is iets anders dan een bestand
   *  dat niet te lezen is, en de gebruiker moet het verschil zien. */
  function uploadFailureReason(err: unknown): string {
    if (err instanceof TypeError) return 'de server is niet bereikbaar. Draait de backend?'
    const message = err instanceof Error ? err.message.trim() : String(err).trim()
    return message || 'onbekende oorzaak.'
  }

  async function ingestFiles(files: File[]) {
    if (files.length === 0) return

    uploadError.value = ''
    successMessage.value = ''
    isUploading.value = true

    const addedNames: string[] = []
    const errors: string[] = []
    const previousIds = new Set(store.documents.map((d) => d.id))

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      uploadingLabel.value =
        files.length > 1
          ? `Inlezen van ${file.name} (${i + 1} van ${files.length})…`
          : `Inlezen van ${file.name}…`

      const ext = file.name.toLowerCase().split('.').pop() ?? ''
      if (!['txt', 'md', 'docx', 'xlsx', 'pptx', 'pdf'].includes(ext)) {
        errors.push(`${file.name}: alleen .txt, .md, .docx, .xlsx, .pptx en .pdf zijn toegestaan.`)
        continue
      }
      try {
        // PDFs go to the backend whole: server-side extraction keeps tables and
        // figures intact, which the browser text layer cannot do.
        if (ext === 'pdf') {
          await store.addPdfDocument(file)
          addedNames.push(file.name)
          continue
        }
        let text: string
        if (ext === 'docx') {
          const mammoth = await import('mammoth/mammoth.browser')
          const arrayBuffer = await file.arrayBuffer()
          const result = await mammoth.extractRawText({ arrayBuffer })
          text = result.value
        } else if (ext === 'xlsx') {
          const XLSX = await import('xlsx')
          const arrayBuffer = await file.arrayBuffer()
          const wb = XLSX.read(arrayBuffer, { type: 'array' })
          const parts: string[] = []
          for (const sheetName of wb.SheetNames) {
            const sheet = wb.Sheets[sheetName]
            const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
            if (csv.trim()) parts.push(`# ${sheetName}\n${csv}`)
          }
          text = parts.join('\n\n')
        } else if (ext === 'pptx') {
          text = await extractPptxText(file)
        } else {
          text = await file.text()
        }
        if (!text.trim()) {
          errors.push(`${file.name}: geen tekst gevonden.`)
          continue
        }
        // PDFs keep their own name — the backend extracts them as-is.
        const baseName = file.name.replace(/\.(docx|xlsx|pptx)$/i, '.txt')
        await store.addDocument(baseName, text)
        addedNames.push(file.name)
      } catch (err) {
        if (err instanceof PdfNoTextError) {
          errors.push(
            `${file.name}: dit is een gescande PDF (alleen afbeeldingen) — er kon geen tekst uit worden gehaald. Upload een tekst-PDF of het originele Word-bestand.`,
          )
        } else {
          // De oorzaak zit vaak niet in het bestand maar in de server (backend
          // plat, indexering mislukt); die reden hoort zichtbaar te zijn.
          errors.push(`${file.name}: kon bestand niet inlezen — ${uploadFailureReason(err)}`)
        }
      }
    }

    const newIds = store.documents.map((d) => d.id).filter((id) => !previousIds.has(id))
    recentlyAddedIds.value = new Set(newIds)
    setTimeout(() => {
      for (const id of newIds) recentlyAddedIds.value.delete(id)
      recentlyAddedIds.value = new Set(recentlyAddedIds.value)
    }, 3000)

    isUploading.value = false
    uploadingLabel.value = ''
    if (addedNames.length > 0) {
      successMessage.value = addedNames.join(', ')
      setTimeout(() => {
        successMessage.value = ''
      }, 4000)
    }
    if (errors.length > 0) {
      uploadError.value = errors.join(' ')
    }
  }


  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return {
    uploadError,
    isDragOver,
    successMessage,
    isUploading,
    uploadingLabel,
    recentlyAddedIds,
    onFilesSelected,
    onDragOver,
    onDragLeave,
    onDrop,
    formatSize,
  }
}
