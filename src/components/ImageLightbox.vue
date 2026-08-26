<template>
  <dialog
    ref="dialogEl"
    class="invulhulp-modal image-lightbox"
    :aria-labelledby="titleId"
    @click="onBackdropClick"
  >
    <div class="invulhulp-modal__container">
      <header class="invulhulp-modal__header">
        <h3 :id="titleId" class="utrecht-heading-3 invulhulp-modal__title">
          {{ title }}
        </h3>
        <button type="button" class="invulhulp-modal__close" aria-label="Sluiten" @click="close">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <hr class="rvo-hr invulhulp-modal__divider" />

      <div class="invulhulp-modal__body image-lightbox__body">
        <img v-if="src" class="image-lightbox__image" :src="src" :alt="title" />
      </div>

      <p v-if="src" class="rvo-text rvo-text--sm image-lightbox__footer">
        <!-- A diagram lifted from a PDF can be denser than 80vh allows; the raw
             image opens at its own resolution for the fine print. -->
        <a class="rvo-link" :href="src" target="_blank" rel="noopener">
          Open op ware grootte in een nieuw tabblad
        </a>
      </p>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { imageUrl } from '../services/llmService'
import { useAssessmentStore } from '../stores/assessmentStore'
import type { QuestionAttachment } from '../models/Assessment'

const store = useAssessmentStore()

const dialogEl = ref<HTMLDialogElement | null>(null)
const src = ref('')
const title = ref('')
const titleId = `image-lightbox-title-${Math.random().toString(36).slice(2, 9)}`

function open(attachment: QuestionAttachment) {
  src.value = imageUrl(attachment.id, store.sessionId)
  title.value = attachment.caption.trim() || attachment.filename
  dialogEl.value?.showModal()
}

function close() {
  dialogEl.value?.close()
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialogEl.value) close()
}

defineExpose({ open })
</script>

<style scoped>
/* Modal shell copied from ConfirmDialog.vue (styles there are scoped). */
.invulhulp-modal {
  border: 0;
  padding: 0;
  background: transparent;
  max-inline-size: min(1100px, 94vw);
  inline-size: 100%;
  margin-block-start: 4vh;
  color: inherit;
}

.invulhulp-modal::backdrop {
  background: rgb(0 0 0 / 50%);
}

.invulhulp-modal__container {
  background: var(--semantics-surfaces-base-background-color);
  border-radius: var(--primitives-corner-radius-lg);
  box-shadow: 0 0 1em 0 rgb(0 0 0 / 30%);
  padding: var(--primitives-space-16);
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-12);
}

.invulhulp-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--primitives-space-12);
}

.invulhulp-modal__title {
  margin: 0;
  flex: 1;
  color: var(--semantics-content-accent-color);
  word-break: break-word;
}

.invulhulp-modal__close {
  background: none;
  border: 0;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  color: var(--invulhulp-color-text-muted);
  padding: 0 var(--primitives-space-2);
}

.invulhulp-modal__divider {
  margin: 0;
}

.image-lightbox__body {
  display: flex;
  justify-content: center;
}

.image-lightbox__image {
  max-inline-size: 100%;
  /* Leaves room for the header, footer link and the dialog's own margins. */
  max-block-size: 76vh;
  object-fit: contain;
  background: var(--semantics-surfaces-tinted-background-color, #f3f3f3);
}

.image-lightbox__footer {
  margin: 0;
  text-align: center;
  color: var(--invulhulp-color-text-subtle);
}
</style>
