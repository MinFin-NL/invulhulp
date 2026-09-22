<template>
  <ModalWindow ref="win" :title="title" width="1280">
    <div class="image-lightbox__body">
      <img v-if="src" class="image-lightbox__image" :src="src" :alt="title" />
    </div>

    <nldd-text color="inherit" size="sm" class="image-lightbox__footer" v-if="src">
      <!-- A diagram lifted from a PDF can be denser than the window allows; the
           raw image opens at its own resolution for the fine print. -->
      <nldd-link :href="src" target="_blank" rel="noopener">
        Open op ware grootte in een nieuw tabblad
      </nldd-link>
    </nldd-text>
  </ModalWindow>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ModalWindow from './ModalWindow.vue'
import { imageUrl } from '../services/llmService'
import { useAssessmentStore } from '../stores/assessmentStore'
import type { QuestionAttachment } from '../models/Assessment'

const store = useAssessmentStore()

const win = ref<InstanceType<typeof ModalWindow> | null>(null)
const src = ref('')
const title = ref('')

function open(attachment: QuestionAttachment) {
  src.value = imageUrl(attachment.id, store.sessionId)
  title.value = attachment.caption.trim() || attachment.filename
  win.value?.show()
}

defineExpose({ open })
</script>

<style scoped>
.image-lightbox__body {
  display: flex;
  justify-content: center;
}

.image-lightbox__image {
  max-inline-size: 100%;
  /* Leaves room for the title bar, footer link and the window's inset. */
  max-block-size: 72vh;
  object-fit: contain;
  background: var(--semantics-surfaces-tinted-background-color);
}

.image-lightbox__footer {
  margin: 0;
  text-align: center;
  color: var(--invulhulp-color-text-subtle);
}
</style>
