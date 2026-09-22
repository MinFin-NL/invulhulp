<template>
  <!-- nldd-modal-dialog brengt de modal-mechaniek (top layer, backdrop, Esc,
       focus) en de opbouw: titel, toelichting, inhoud, knoppen. De inhoud en
       de knoppen staan in aparte slots, dus de <form> omvat alleen de velden;
       Enter in dat ene veld submit hem via NLDD's implicit submission. -->
  <nldd-modal-dialog
    ref="dialogEl"
    :text="title"
    :supporting-text="message ?? ''"
    :variant="confirmPhrase ? 'alert' : undefined"
    @close.self="onClosed"
  >
    <form
      v-if="confirmPhrase || kind === 'prompt'"
      class="invulhulp-modal__body"
      @submit.prevent="onConfirm"
    >
      <!-- Danger zone: onomkeerbare actie. De gevolgen staan er voluit,
           daarna typt de gebruiker de naam over — een bevestigingsknop alleen
           is te makkelijk per ongeluk te raken. -->
      <nldd-banner
        v-if="confirmPhrase"
        variant="critical"
        class="invulhulp-modal__danger-body"
      >
        <strong class="invulhulp-modal__danger-title">Let op: dit kan niet ongedaan worden gemaakt</strong>
        <slot name="danger" />
        <div class="invulhulp-modal__field">
          <label class="invulhulp-modal__field-label" :for="phraseId">
            Typ <strong>{{ confirmPhrase }}</strong> om te bevestigen
          </label>
          <nldd-text-field
            :input-id="phraseId"
            ref="phraseEl"
            class="invulhulp-modal__input"
            autocomplete="off"
            :value="phraseValue"
            :error-message-ids="phraseHintId"
            @input="phraseValue = $event.detail.value"
          />
          <span :id="phraseHintId" class="invulhulp-text--sm invulhulp-modal__danger-hint">
            {{ phraseMatches
              ? 'De naam komt overeen — de knop is nu actief.'
              : 'De knop wordt actief zodra de naam exact overeenkomt.' }}
          </span>
        </div>
      </nldd-banner>

      <div v-if="kind === 'prompt'" class="invulhulp-modal__field">
        <label class="invulhulp-modal__field-label" :for="inputId">{{ inputLabel || 'Naam' }}</label>
        <nldd-text-field
          :input-id="inputId"
          ref="inputEl"
          class="invulhulp-modal__input"
          :value="inputValue"
          :placeholder="inputPlaceholder ?? ''"
          @input="inputValue = $event.detail.value"
        />
      </div>
    </form>

    <nldd-button
      slot="actions"
      :variant="confirmVariant"
      :text="confirmLabel"
      :disabled="confirmDisabled"
      width="full"
      @click="onConfirm"
    />
    <nldd-button
      v-if="cancelLabel"
      slot="actions"
      variant="secondary"
      :text="cancelLabel"
      width="full"
      @click="cancel"
    />
  </nldd-modal-dialog>
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

type ModalDialog = HTMLElement & { show(): void; hide(): void }
const dialogEl = ref<ModalDialog | null>(null)
const inputEl = ref<HTMLElement | null>(null)
const phraseEl = ref<HTMLElement | null>(null)

/** nldd-text-field delegates focus() to its inner <input>, but exposes no
 *  select(). Reach for the native input only for that, so opening the rename
 *  dialog still lets the user type straight over the current name. */
function selectAll(el: HTMLElement | null) {
  el?.shadowRoot?.querySelector('input')?.select()
}
const inputValue = ref('')
const phraseValue = ref('')
const uid = Math.random().toString(36).slice(2, 9)
const inputId = `invulhulp-dialog-input-${uid}`
const phraseId = `invulhulp-dialog-phrase-${uid}`
const phraseHintId = `invulhulp-dialog-phrase-hint-${uid}`

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

// Set once the user confirms, so the `close` that follows is not also reported
// as a cancel. Every other way out — Esc, backdrop, Annuleren — is a cancel.
let settled = false

async function open(initial?: string) {
  inputValue.value = initial ?? props.initialValue ?? ''
  phraseValue.value = ''
  settled = false
  dialogEl.value?.show()
  await nextTick()
  if (props.kind === 'prompt') {
    inputEl.value?.focus()
    selectAll(inputEl.value)
  } else if (props.confirmPhrase) {
    phraseEl.value?.focus()
  }
}

function onConfirm() {
  // Vangnet naast :disabled — Enter in het tekstveld submit het formulier ook.
  if (confirmDisabled.value) return
  settled = true
  emit('confirm', inputValue.value)
  dialogEl.value?.hide()
}

function cancel() {
  dialogEl.value?.hide()
}

function onClosed() {
  if (!settled) emit('cancel')
  settled = true
}

defineExpose({ open })
</script>

<style scoped>
.invulhulp-modal__body {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-12);
  margin-block-start: var(--primitives-space-12);
}

.invulhulp-modal__input {
  inline-size: 100%;
}

/* These two fields keep their own <label for> rather than an nldd-form-field
   wrapper: the phrase label carries inline markup (the name in <strong>) and
   the hint below is wired with error-message-ids. Same type as a
   form-field label. */
.invulhulp-modal__field {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
}

.invulhulp-modal__field-label {
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-medium);
  line-height: var(--primitives-line-height-snug);
}

.invulhulp-modal__danger-body {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-12);
}

.invulhulp-modal__danger-title {
  display: block;
}

.invulhulp-modal__danger-hint {
  color: var(--invulhulp-color-text-subtle);
}

/* Een uitgeschakelde knop blijft leesbaar (contrast ≥ 4,5:1) — hij is de
   volgende stap, niet weggevallen decor. */
nldd-button[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
