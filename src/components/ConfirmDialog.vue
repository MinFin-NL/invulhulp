<template>
  <dialog
    ref="dialogEl"
    class="invulhulp-modal"
    :aria-labelledby="titleId"
    @close="onClose"
    @click="onBackdropClick"
  >
    <form method="dialog" class="invulhulp-modal__container" @submit.prevent="onConfirm">
      <header class="invulhulp-modal__header">
        <h3 :id="titleId" class="utrecht-heading-3 invulhulp-modal__title">{{ title }}</h3>
        <button
          type="button"
          class="invulhulp-modal__close"
          aria-label="Sluiten"
          @click="cancel"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <hr class="rvo-hr invulhulp-modal__divider" />

      <div class="invulhulp-modal__body">
        <p v-if="message" class="rvo-text invulhulp-modal__message">{{ message }}</p>

        <div v-if="kind === 'prompt'" class="rvo-form-field">
          <label class="rvo-form-field__label" :for="inputId">{{ inputLabel || 'Naam' }}</label>
          <input
            :id="inputId"
            ref="inputEl"
            v-model="inputValue"
            type="text"
            class="utrecht-textbox utrecht-textbox--md invulhulp-modal__input"
            :placeholder="inputPlaceholder ?? ''"
          />
        </div>
      </div>

      <div class="invulhulp-modal__actions">
        <button
          type="submit"
          class="rvo-button"
          :class="confirmVariant"
        >
          {{ confirmLabel }}
        </button>
        <button type="button" class="rvo-button rvo-button--secondary" @click="cancel">
          {{ cancelLabel }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'

type DialogKind = 'confirm' | 'prompt'

const props = withDefaults(defineProps<{
  title: string
  message?: string
  kind?: DialogKind
  inputLabel?: string
  inputPlaceholder?: string
  initialValue?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'primary' | 'warning'
}>(), {
  kind: 'confirm',
  confirmLabel: 'Bevestigen',
  cancelLabel: 'Annuleren',
  variant: 'primary',
})

const emit = defineEmits<{
  confirm: [value: string]
  cancel: []
}>()

const dialogEl = ref<HTMLDialogElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const inputValue = ref('')
const uid = Math.random().toString(36).slice(2, 9)
const inputId = `invulhulp-dialog-input-${uid}`
const titleId = `invulhulp-dialog-title-${uid}`

const confirmVariant = computed(() =>
  props.variant === 'warning' ? 'rvo-button--warning' : 'rvo-button--primary',
)

async function open(initial?: string) {
  inputValue.value = initial ?? props.initialValue ?? ''
  dialogEl.value?.showModal()
  if (props.kind === 'prompt') {
    await nextTick()
    inputEl.value?.focus()
    inputEl.value?.select()
  }
}

function onConfirm() {
  emit('confirm', inputValue.value)
  dialogEl.value?.close()
}

function cancel() {
  emit('cancel')
  dialogEl.value?.close()
}

function onClose() {
  // native close (Esc) — handled by browser
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialogEl.value) cancel()
}

defineExpose({ open })
</script>

<style scoped>
/* Modeled after MinBZK/amt's .minbzk-modal pattern, on top of the native <dialog>. */

.invulhulp-modal {
  border: 0;
  padding: 0;
  background: transparent;
  max-inline-size: min(560px, 90vw);
  inline-size: 100%;
  margin-block-start: 5vh;
  color: inherit;
}

.invulhulp-modal::backdrop {
  background: rgb(0 0 0 / 50%);
  animation: invulhulp-modal-fade-in 150ms ease;
}

.invulhulp-modal[open] {
  animation: invulhulp-modal-zoom-in 150ms ease;
}

@keyframes invulhulp-modal-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes invulhulp-modal-zoom-in {
  from { transform: scale(0.95); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

.invulhulp-modal__container {
  background: var(--rvo-color-wit);
  border-radius: var(--rvo-border-radius-lg);
  box-shadow: 0 0 1em 0 rgb(0 0 0 / 30%);
  padding: var(--rvo-space-md);
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-sm);
}

.invulhulp-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rvo-space-sm);
}

.invulhulp-modal__title {
  margin: 0;
  flex: 1;
  color: var(--rvo-color-lintblauw);
}

.invulhulp-modal__close {
  background: none;
  border: 0;
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  color: var(--invulhulp-color-text-muted);
  padding: 0 var(--rvo-space-3xs);
}
.invulhulp-modal__close:hover {
  color: var(--rvo-color-grijs-900, var(--rvo-color-grijs-800));
}

.invulhulp-modal__divider {
  margin: 0;
}

.invulhulp-modal__body {
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-sm);
}

.invulhulp-modal__message {
  margin: 0;
}

.invulhulp-modal__input {
  inline-size: 100%;
}

.invulhulp-modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rvo-space-xs);
  margin-block-start: var(--rvo-space-2xs);
}
</style>
