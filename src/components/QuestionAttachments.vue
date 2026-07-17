<template>
  <div class="question-attachments" @paste="onPaste">
    <div class="question-attachments__list" v-if="attachments.length > 0">
      <figure v-for="att in attachments" :key="att.id" class="question-attachments__item">
        <div class="question-attachments__thumb-wrap">
          <img
            v-if="!broken.has(att.id)"
            class="question-attachments__thumb"
            :src="imageUrl(att.id, store.sessionId)"
            :alt="att.caption || att.filename"
            loading="lazy"
            @error="broken.add(att.id)"
          />
          <span v-else class="question-attachments__thumb question-attachments__thumb--missing">
            (afbeelding niet beschikbaar)
          </span>
          <button
            v-if="store.canEdit"
            type="button"
            class="question-attachments__delete"
            :aria-label="`Verwijder afbeelding ${att.filename}`"
            title="Verwijder afbeelding"
            @click="store.removeAttachment(questionId, att.id)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M9 3v1H4v2h1v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9Zm0 5h2v11H9V8Zm4 0h2v11h-2V8Z"/>
            </svg>
          </button>
        </div>
        <figcaption>
          <input
            type="text"
            class="utrecht-textbox utrecht-textbox--sm question-attachments__caption"
            placeholder="Bijschrift (optioneel)"
            :value="att.caption"
            :disabled="store.readOnly"
            @input="store.updateAttachmentCaption(questionId, att.id, ($event.target as HTMLInputElement).value)"
          />
        </figcaption>
      </figure>
    </div>

    <div v-if="store.canEdit" class="question-attachments__actions">
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg"
        multiple
        class="invulhulp-visually-hidden"
        @change="onFilesSelected"
      />
      <button
        type="button"
        class="rvo-button rvo-button--tertiary rvo-button--sm question-attachments__add"
        :disabled="uploading"
        @click="fileInput?.click()"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path fill="currentColor" d="M19 5v14H5V5h14Zm0-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-4.86 8.86-3 3.87L9 13.14 6 17h12l-3.86-5.14Z"/>
        </svg>
        {{ uploading ? 'Bezig met uploaden…' : 'Afbeelding toevoegen' }}
      </button>
      <span class="rvo-text rvo-text--sm question-attachments__hint">of plak een afbeelding (Ctrl+V)</span>
    </div>
    <p v-if="error" class="rvo-text rvo-text--sm question-attachments__error" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { imageUrl, uploadImage } from '../services/llmService'

const props = defineProps<{
  questionId: string
}>()

const store = useAssessmentStore()
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const error = ref('')
// Attachment ids whose bytes are gone on the server (e.g. JSON imported on
// another account) — render a placeholder instead of a broken image.
const broken = ref(new Set<string>())

const attachments = computed(() => store.attachmentsFor(props.questionId))

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = new Set(['image/png', 'image/jpeg'])

async function measureDimensions(file: File): Promise<{ width?: number; height?: number }> {
  try {
    const bmp = await createImageBitmap(file)
    const dims = { width: bmp.width, height: bmp.height }
    bmp.close()
    return dims
  } catch {
    return {} // exports fall back to decoding the bytes themselves
  }
}

async function uploadFiles(files: File[]) {
  error.value = ''
  const images = files.filter((f) => ACCEPTED.has(f.type))
  if (images.length === 0) {
    error.value = 'Alleen PNG- of JPEG-afbeeldingen zijn toegestaan.'
    return
  }
  uploading.value = true
  try {
    for (const file of images) {
      if (file.size > MAX_BYTES) {
        error.value = `"${file.name}" is te groot (maximaal 5 MB).`
        continue
      }
      const dims = await measureDimensions(file)
      const uploaded = await uploadImage(file, store.sessionId)
      store.addAttachment(props.questionId, {
        id: uploaded.imageId,
        filename: uploaded.filename,
        caption: '',
        mimeType: uploaded.mime,
        ...dims,
        uploadedAt: Date.now(),
      })
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Uploaden mislukt'
  } finally {
    uploading.value = false
  }
}

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length > 0) uploadFiles(files)
}

// Scoped to this component's root so it doesn't fight Tiptap's paste handling.
function onPaste(event: ClipboardEvent) {
  if (store.readOnly) return
  const files = Array.from(event.clipboardData?.files ?? []).filter((f) => ACCEPTED.has(f.type))
  if (files.length === 0) return
  event.preventDefault()
  uploadFiles(files)
}
</script>

<style scoped>
.question-attachments {
  margin-block-start: var(--rvo-space-xs);
}

.question-attachments__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rvo-space-sm);
  margin-block-end: var(--rvo-space-xs);
}

.question-attachments__item {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-3xs);
  max-inline-size: 240px;
}

.question-attachments__thumb-wrap {
  position: relative;
  display: inline-flex;
}

.question-attachments__thumb {
  max-inline-size: 240px;
  max-block-size: 160px;
  object-fit: contain;
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--rvo-border-radius-sm, 4px);
  background: var(--rvo-color-grijs-100, #f3f3f3);
}

.question-attachments__thumb--missing {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 240px;
  block-size: 80px;
  font-size: var(--rvo-font-size-sm);
  font-style: italic;
  color: var(--rvo-color-grijs-500, #999);
}

.question-attachments__delete {
  position: absolute;
  inset-block-start: 4px;
  inset-inline-end: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 24px;
  block-size: 24px;
  padding: 0;
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--rvo-border-radius-sm, 4px);
  background: var(--rvo-color-wit);
  color: var(--rvo-color-grijs-700, #555);
  cursor: pointer;
}

.question-attachments__delete:hover {
  color: var(--rvo-color-rood);
}

.question-attachments__caption {
  inline-size: 100%;
  font-size: var(--rvo-font-size-sm);
}

.question-attachments__actions {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-xs);
  flex-wrap: wrap;
}

.question-attachments__add {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-3xs);
}

.question-attachments__hint {
  color: var(--invulhulp-color-text-subtle);
}

.question-attachments__error {
  margin: var(--rvo-space-3xs) 0 0;
  color: var(--rvo-color-rood);
}
</style>
