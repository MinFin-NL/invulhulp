<template>
  <div class="ai-mode-toggle">
    <!-- Empty-result state: AI ran but filled nothing -->
    <div v-if="isDone && doneFilledCount === 0" class="ai-mode-empty" role="status">
      <span class="ai-mode-empty__icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5a1.25 1.25 0 1 1 0 2.5A1.25 1.25 0 0 1 12 7Zm1.25 10h-2.5v-6h2.5Z"/>
        </svg>
      </span>
      <span class="ai-mode-empty__body">
        <span class="ai-mode-empty__title">AI vond geen antwoorden</span>
        <span class="ai-mode-empty__hint">Controleer of je de juiste brondocumenten hebt geüpload.</span>
      </span>
      <span class="ai-mode-empty__actions">
        <button
          type="button"
          class="rvo-button rvo-button--secondary rvo-button--size-sm"
          @click="$emit('activate', formId)"
        >
          Probeer opnieuw
        </button>
        <button
          type="button"
          class="rvo-button rvo-button--tertiary rvo-button--size-sm"
          @click="$emit('dismiss', formId)"
        >
          Sluiten
        </button>
      </span>
    </div>

    <!-- Done state: AI filled at least one answer -->
    <div v-else-if="isDone" class="ai-mode-done" role="status">
      <span class="ai-mode-done__icon" aria-hidden="true">✓</span>
      <span class="ai-mode-done__text">
        <span class="ai-mode-done__count">{{ doneFilledCount }} ingevuld</span>
        <template v-if="doneSkippedCount > 0"><span class="ai-mode-done__skipped">{{ doneSkippedCount }} zonder antwoord</span></template>
      </span>
      <button
        type="button"
        class="ai-mode-done__close"
        aria-label="Sluiten"
        title="Sluiten"
        @click="$emit('dismiss', formId)"
      >
        ×
      </button>
    </div>

    <!-- Active / scanning state -->
    <div v-else-if="isActive" class="ai-mode-active" role="status" aria-live="polite">
      <span class="ai-mode-active__spinner" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 2 22.5 22" width="16" height="16" aria-hidden="true">
          <defs>
            <linearGradient id="ai-spin-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#0f2d5c"/>
              <stop offset="50%" stop-color="#5b21b6"/>
              <stop offset="100%" stop-color="#0ea5e9"/>
            </linearGradient>
          </defs>
          <path d="m 10.55,20.49 0.6,1.81 0.6,-1.81 c 1.04,-3.11 3.48,-5.55 6.59,-6.59 l 1.81,-0.6 -1.81,-0.6 C 15.23,11.66 12.79,9.22 11.75,6.11 L 11.15,4.3 10.55,6.11 C 9.51,9.22 7.07,11.66 3.96,12.7 l -1.81,0.6 1.81,0.6 c 3.11,1.04 5.55,3.48 6.59,6.59" fill="url(#ai-spin-grad)"/>
        </svg>
      </span>
      <span class="ai-mode-active__label">
        AI Modus<template v-if="progress"><span class="ai-mode-active__progress">{{ progress.filled }}/{{ progress.total }}</span></template>
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
      <span class="ai-mode-btn__icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 2 22.5 22" width="16" height="16" aria-hidden="true">
          <path d="m 10.55,20.49 0.6,1.81 0.6,-1.81 c 1.04,-3.11 3.48,-5.55 6.59,-6.59 l 1.81,-0.6 -1.81,-0.6 C 15.23,11.66 12.79,9.22 11.75,6.11 L 11.15,4.3 10.55,6.11 C 9.51,9.22 7.07,11.66 3.96,12.7 l -1.81,0.6 1.81,0.6 c 3.11,1.04 5.55,3.48 6.59,6.59" fill="white"/>
        </svg>
      </span>
      AI Modus
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  formId: string
  hasDocuments: boolean
  isActive: boolean
  isDone: boolean
  doneFilledCount: number
  doneTotalCount: number
  progress: { filled: number; total: number } | null
}>()

// Questions the AI attempted but left without an answer.
const doneSkippedCount = computed(() =>
  Math.max(0, props.doneTotalCount - props.doneFilledCount),
)

defineEmits<{
  activate: [formId: string]
  cancel: [formId: string]
  dismiss: [formId: string]
}>()
</script>

<style scoped>
.ai-mode-toggle {
  margin-block-start: var(--rvo-space-sm);
  width: 100%;
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
  display: inline-flex;
  align-items: center;
  animation: ai-star-pulse 3s ease-in-out infinite;
}

/* ── Active / scanning state ─────────────────────────────────────────────── */

.ai-mode-active {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rvo-space-2xs);
  padding: var(--rvo-space-2xs) var(--rvo-space-xs);
  background: linear-gradient(135deg, rgba(15, 45, 92, 0.08), rgba(91, 33, 182, 0.12));
  border: 1px solid rgba(91, 33, 182, 0.4);
  border-radius: 999px;
  font-size: var(--rvo-font-size-sm);
  width: 100%;
  box-sizing: border-box;
}

.ai-mode-active__spinner {
  display: inline-flex;
  align-items: center;
  animation: ai-spin 1.8s linear infinite;
  flex-shrink: 0;
  flex-grow: 0;
}

.ai-mode-active__label {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-2xs);
  font-weight: var(--rvo-font-weight-semibold);
  color: #0f2d5c;
  white-space: nowrap;
  flex-shrink: 1;
  flex-grow: 1;
  min-width: 0;
}

.ai-mode-active__progress {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  background: rgba(91, 33, 182, 0.12);
  border-radius: 999px;
  font-size: 0.8em;
  font-weight: var(--rvo-font-weight-bold);
  color: #5b21b6;
  letter-spacing: 0.02em;
}

.ai-mode-stop-btn {
  color: var(--rvo-color-rood) !important;
  flex-shrink: 0;
  flex-grow: 0;
  padding-inline: var(--rvo-space-xs) !important;
  min-inline-size: 0 !important;
}

/* ── Done state ──────────────────────────────────────────────────────────── */

.ai-mode-done {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-2xs);
  padding: var(--rvo-space-2xs) var(--rvo-space-xs) var(--rvo-space-2xs) var(--rvo-space-sm);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(15, 45, 92, 0.1));
  border: 1px solid rgba(14, 165, 233, 0.45);
  border-radius: var(--rvo-border-radius-md, 8px);
  font-size: var(--rvo-font-size-sm);
  width: 100%;
  box-sizing: border-box;
}

.ai-mode-done__icon {
  color: #0ea5e9;
  font-weight: bold;
  flex-shrink: 0;
  margin-block-start: 1px;
  align-self: flex-start;
}

.ai-mode-done__text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
  flex: 1 1 auto;
}

.ai-mode-done__count {
  font-weight: var(--rvo-font-weight-semibold);
  color: #0f2d5c;
}

.ai-mode-done__skipped {
  font-weight: var(--rvo-font-weight-normal);
  font-size: var(--rvo-font-size-xs);
  color: var(--invulhulp-color-text-subtle, #6b7280);
}

.ai-mode-done__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  inline-size: 22px;
  block-size: 22px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--invulhulp-color-text-subtle, #6b7280);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.ai-mode-done__close:hover {
  background: rgba(15, 45, 92, 0.1);
  color: #0f2d5c;
}

.ai-mode-done__close:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 1px;
}

/* ── Empty-result state ──────────────────────────────────────────────────── */

.ai-mode-empty {
  display: flex;
  align-items: flex-start;
  gap: var(--rvo-space-xs);
  padding: var(--rvo-space-xs) var(--rvo-space-sm);
  background: #fdf6ec;
  border: 1px solid #e0b561;
  border-radius: var(--rvo-border-radius-md, 8px);
  font-size: var(--rvo-font-size-sm);
  width: 100%;
  box-sizing: border-box;
}

.ai-mode-empty__icon {
  display: inline-flex;
  align-items: center;
  color: #b8860b;
  flex-shrink: 0;
  margin-block-start: 1px;
}

.ai-mode-empty__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex-grow: 1;
  min-width: 0;
}

.ai-mode-empty__title {
  font-weight: var(--rvo-font-weight-semibold);
  color: #7a5b06;
}

.ai-mode-empty__hint {
  color: #8a6d3b;
  font-size: var(--rvo-font-size-xs);
}

.ai-mode-empty__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--rvo-space-2xs);
  flex-shrink: 0;
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
