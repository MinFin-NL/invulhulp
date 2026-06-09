<template>
  <div class="ai-mode-toggle">
    <!-- Done state -->
    <div v-if="isDone" class="ai-mode-done" role="status">
      <span class="ai-mode-done__icon" aria-hidden="true">✓</span>
      <span class="ai-mode-done__text">{{ doneFilledCount }} vragen ingevuld</span>
      <button
        type="button"
        class="rvo-button rvo-button--tertiary rvo-button--size-sm ai-mode-done__close"
        @click="$emit('dismiss', formId)"
      >
        Sluiten
      </button>
    </div>

    <!-- Active / scanning state -->
    <div v-else-if="isActive" class="ai-mode-active" role="status" aria-live="polite">
      <span class="ai-mode-active__spinner" aria-hidden="true">◉</span>
      <span class="ai-mode-active__label">
        AI Mode
        <template v-if="progress">
          — {{ progress.filled }}&thinsp;/&thinsp;{{ progress.total }}
        </template>
      </span>
      <button
        type="button"
        class="rvo-button rvo-button--tertiary rvo-button--size-sm ai-mode-stop-btn"
        @click="$emit('cancel', formId)"
      >
        Stop
      </button>
    </div>

    <!-- Idle state -->
    <button
      v-else
      type="button"
      class="ai-mode-btn"
      :disabled="!hasDocuments"
      :title="hasDocuments ? 'Vul dit formulier automatisch in met AI op basis van je brondocumenten' : 'Upload eerst brondocumenten'"
      @click="$emit('activate', formId)"
    >
      <span class="ai-mode-btn__icon" aria-hidden="true">✦</span>
      AI Mode
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  formId: string
  hasDocuments: boolean
  isActive: boolean
  isDone: boolean
  doneFilledCount: number
  progress: { filled: number; total: number } | null
}>()

defineEmits<{
  activate: [formId: string]
  cancel: [formId: string]
  dismiss: [formId: string]
}>()
</script>

<style scoped>
.ai-mode-toggle {
  margin-block-start: var(--rvo-space-sm);
}

/* ── Idle button ─────────────────────────────────────────────────────────── */

.ai-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-2xs);
  padding: var(--rvo-space-2xs) var(--rvo-space-sm);
  background: linear-gradient(135deg, #0f2d5c 0%, #5b21b6 50%, #0ea5e9 100%);
  background-size: 200% 100%;
  color: #fff;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: var(--rvo-font-size-sm);
  font-weight: var(--rvo-font-weight-semibold);
  cursor: pointer;
  letter-spacing: 0.01em;
  transition: box-shadow 0.2s, background-position 0.6s ease;
}

.ai-mode-btn:hover:not(:disabled) {
  background-position: 100% 0;
  box-shadow: 0 0 14px 4px rgba(91, 33, 182, 0.5);
}

.ai-mode-btn:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
}

.ai-mode-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ai-mode-btn__icon {
  font-style: normal;
  animation: ai-star-pulse 3s ease-in-out infinite;
}

/* ── Active / scanning state ─────────────────────────────────────────────── */

.ai-mode-active {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-xs);
  padding: var(--rvo-space-2xs) var(--rvo-space-sm);
  background: linear-gradient(135deg, rgba(15, 45, 92, 0.08), rgba(91, 33, 182, 0.12));
  border: 1px solid rgba(91, 33, 182, 0.4);
  border-radius: 999px;
  font-size: var(--rvo-font-size-sm);
}

.ai-mode-active__spinner {
  display: inline-block;
  color: #5b21b6;
  animation: ai-spin 1.8s linear infinite;
  font-style: normal;
  flex-shrink: 0;
}

.ai-mode-active__label {
  font-weight: var(--rvo-font-weight-semibold);
  color: #0f2d5c;
}

.ai-mode-stop-btn {
  color: var(--rvo-color-rood) !important;
}

/* ── Done state ──────────────────────────────────────────────────────────── */

.ai-mode-done {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-xs);
  padding: var(--rvo-space-2xs) var(--rvo-space-sm);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(15, 45, 92, 0.1));
  border: 1px solid rgba(14, 165, 233, 0.45);
  border-radius: 999px;
  font-size: var(--rvo-font-size-sm);
}

.ai-mode-done__icon {
  color: #0ea5e9;
  font-weight: bold;
}

.ai-mode-done__text {
  font-weight: var(--rvo-font-weight-semibold);
  color: #0f2d5c;
}

/* ── Keyframes ───────────────────────────────────────────────────────────── */

@keyframes ai-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@keyframes ai-star-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.75; transform: scale(1.2); }
}
</style>
