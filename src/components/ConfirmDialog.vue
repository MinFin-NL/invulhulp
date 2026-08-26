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

        <!-- Danger zone: onomkeerbare actie. De gevolgen staan er voluit,
             daarna typt de gebruiker de naam over — een bevestigingsknop alleen
             is te makkelijk per ongeluk te raken. -->
                <nldd-banner
                  variant="critical"
                  class="invulhulp-modal__danger invulhulp-modal__danger-body"
                  v-if="confirmPhrase"
                >
            <strong class="invulhulp-modal__danger-title">Let op: dit kan niet ongedaan worden gemaakt</strong>
            <slot name="danger" />
            <div class="rvo-form-field invulhulp-modal__danger-field">
              <label class="rvo-form-field__label" :for="phraseId">
                Typ <strong>{{ confirmPhrase }}</strong> om te bevestigen
              </label>
              <input
                :id="phraseId"
                ref="phraseEl"
                v-model="phraseValue"
                type="text"
                autocomplete="off"
                class="utrecht-textbox utrecht-textbox--md invulhulp-modal__input"
                :aria-describedby="phraseHintId"
              />
              <span :id="phraseHintId" class="rvo-text rvo-text--sm invulhulp-modal__danger-hint">
                {{ phraseMatches
                  ? 'De naam komt overeen — de knop is nu actief.'
                  : 'De knop wordt actief zodra de naam exact overeenkomt.' }}
              </span>
            </div>
        </nldd-banner>

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
        <nldd-button
          type="submit"
          :variant="confirmVariant"
          :text="confirmLabel"
          :disabled="confirmDisabled"
        />
        <nldd-button
          variant="secondary"
          :text="cancelLabel"
          v-if="cancelLabel"
          @click="cancel"
        />
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
  /** Onomkeerbare actie: de gebruiker moet deze tekst (de dossier- of
   *  gebruikersnaam) letterlijk overtypen voordat bevestigen mogelijk is. */
  confirmPhrase?: string
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
const phraseEl = ref<HTMLInputElement | null>(null)
const inputValue = ref('')
const phraseValue = ref('')
const uid = Math.random().toString(36).slice(2, 9)
const inputId = `invulhulp-dialog-input-${uid}`
const phraseId = `invulhulp-dialog-phrase-${uid}`
const phraseHintId = `invulhulp-dialog-phrase-hint-${uid}`
const titleId = `invulhulp-dialog-title-${uid}`

// A warning confirm is the destructive path (dossier wissen, gebruiker
// verwijderen); everything else is the ordinary primary action.
const confirmVariant = computed(() =>
  props.variant === 'warning' ? 'destructive' : 'primary',
)

// Spaties aan de randen negeren (plakken uit de kaart levert die zo op), maar
// verder letterlijk: de naam overtypen is juist de rem.
const phraseMatches = computed(
  () => !!props.confirmPhrase && phraseValue.value.trim() === props.confirmPhrase.trim(),
)
const confirmDisabled = computed(() => !!props.confirmPhrase && !phraseMatches.value)

async function open(initial?: string) {
  inputValue.value = initial ?? props.initialValue ?? ''
  phraseValue.value = ''
  dialogEl.value?.showModal()
  await nextTick()
  if (props.kind === 'prompt') {
    inputEl.value?.focus()
    inputEl.value?.select()
  } else if (props.confirmPhrase) {
    phraseEl.value?.focus()
  }
}

function onConfirm() {
  // Vangnet naast :disabled — Enter in het tekstveld submit het formulier ook.
  if (confirmDisabled.value) return
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
  animation: invulhulp-modal-fade-in var(--invulhulp-duration-fast) var(--invulhulp-ease);
}

.invulhulp-modal[open] {
  animation: invulhulp-modal-zoom-in var(--invulhulp-duration-fast) var(--invulhulp-ease);
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
.invulhulp-modal__close:hover {
  color: var(--semantics-content-color, var(--semantics-content-color));
}

.invulhulp-modal__divider {
  margin: 0;
}

.invulhulp-modal__body {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-12);
}

.invulhulp-modal__message {
  margin: 0;
}

.invulhulp-modal__input {
  inline-size: 100%;
}

.invulhulp-modal__danger-body {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-12);
}

.invulhulp-modal__danger-title {
  display: block;
}

.invulhulp-modal__danger-field {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
}

.invulhulp-modal__danger-hint {
  color: var(--invulhulp-color-text-subtle);
}

/* Een uitgeschakelde knop blijft leesbaar (contrast ≥ 4,5:1) — hij is de
   volgende stap, niet weggevallen decor. */
.invulhulp-modal__actions nldd-button[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

.invulhulp-modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--primitives-space-8);
  margin-block-start: var(--primitives-space-4);
}
</style>
