<template>
  <!-- De gedeelde NLDD-compositie voor een modaal venster met inhoud:
       nldd-window (top layer, backdrop, Esc, focus) met daarin een nldd-page
       waarvan de titelbalk en de knoppenbalk blijven staan terwijl de inhoud
       scrollt. De sluitknop van nldd-top-title-bar vuurt `dismiss`, waar het
       venster zelf op sluit. Korte bevestigingen gebruiken ConfirmDialog
       (nldd-modal-dialog). -->
  <nldd-window
    ref="windowEl"
    centered
    :width="`var(--primitives-area-${width})`"
    :accessible-label="title"
    :no-light-dismiss="noLightDismiss"
    @open.self="$emit('open')"
    @close.self="$emit('close')"
  >
    <nldd-page sticky-header :sticky-footer="!!$slots.footer">
      <nldd-top-title-bar
        slot="header"
        :text="title"
        :supporting-text="supportingText ?? ''"
        dismiss-text="Sluiten"
      />
      <!-- Blijft onder de titel staan terwijl de inhoud scrollt (bv. een voortgangsbalk). -->
      <div v-if="$slots.subheader" slot="header" class="modal-window__subheader">
        <slot name="subheader" />
      </div>
      <div class="modal-window__body">
        <slot />
      </div>
      <div v-if="$slots.footer" slot="footer" class="modal-window__footer">
        <slot name="footer" />
      </div>
    </nldd-page>
  </nldd-window>
</template>

<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{
  title: string
  supportingText?: string
  /** Breedte als NLDD-area-stap (--primitives-area-*). */
  width?: '480' | '640' | '720' | '800' | '960' | '1280'
  /** Klik op de backdrop sluit niet — voor een venster waar wegklikken werk kost. */
  noLightDismiss?: boolean
}>(), {
  width: '640',
  noLightDismiss: false,
})

defineEmits<{ open: []; close: [] }>()

type NlddWindow = HTMLElement & { show(): void; hide(): void }
const windowEl = ref<NlddWindow | null>(null)

defineExpose({
  show: () => windowEl.value?.show(),
  hide: () => windowEl.value?.hide(),
})
</script>

<style scoped>
.modal-window__body {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-12);
  padding: var(--primitives-space-16) var(--primitives-space-24) var(--primitives-space-24);
}

/* Full-bleed: what goes here draws its own band. */
.modal-window__subheader {
  background: var(--semantics-surfaces-base-background-color);
}

.modal-window__footer {
  display: flex;
  flex-wrap: wrap;
  gap: var(--primitives-space-8);
  padding: var(--primitives-space-12) var(--primitives-space-24);
  background: var(--semantics-surfaces-base-background-color);
  border-block-start: var(--semantics-dividers-thickness) solid var(--semantics-dividers-color);
}
</style>
