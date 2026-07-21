<template>
  <dialog
    ref="dialogEl"
    class="invulhulp-modal share-dialog"
    :aria-labelledby="titleId"
    @click="onBackdropClick"
  >
    <div class="invulhulp-modal__container">
      <header class="invulhulp-modal__header">
        <h3 :id="titleId" class="utrecht-heading-3 invulhulp-modal__title">Dossier delen</h3>
        <button type="button" class="invulhulp-modal__close" aria-label="Sluiten" @click="close">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <hr class="rvo-hr invulhulp-modal__divider" />

      <div class="invulhulp-modal__body">
        <!-- TEMPORARY DEBUG BLOCK — remove after share-modal fix.
             Renders the component's raw state with plain inline styles so it
             does not depend on the .share-dialog__* CSS. Lets us see, without
             browser devtools, whether the grant/user objects actually carry
             name/email in the frontend or whether the styled list is hiding them. -->
        <div style="border: 2px solid red; padding: 8px; background: #fff; color: #000; font: 12px/1.4 monospace; white-space: pre-wrap; word-break: break-all;">
          <strong>DEBUG — mySub = [{{ mySub }}]</strong>
          <div>grants ({{ grants.length }}):</div>
          <div v-for="g in grants" :key="'dbg-' + g.sub" style="color: #0a0;">
            name=[{{ g.name }}] email=[{{ g.email }}] sub=[{{ g.sub }}] role=[{{ g.role }}]
          </div>
          <div>results ({{ results.length }}):</div>
          <div v-for="u in results" :key="'dbgu-' + u.id" style="color: #00a;">
            name=[{{ u.name }}] email=[{{ u.email }}] id=[{{ u.id }}]
          </div>
          <div>raw grants JSON: {{ JSON.stringify(grants) }}</div>
          <div style="margin-top: 6px; color: #a00;">MEASURE:
{{ debugMeasure }}</div>
        </div>
        <!-- /TEMPORARY DEBUG BLOCK -->

        <!-- Search -->
        <div class="rvo-form-field">
          <label class="rvo-form-field__label" :for="searchId">Zoek op naam of e-mailadres</label>
          <input
            :id="searchId"
            ref="searchEl"
            v-model="query"
            type="search"
            class="utrecht-textbox utrecht-textbox--md invulhulp-modal__input"
            placeholder="bijv. Jansen of j.jansen@minfin.nl"
            autocomplete="off"
            @input="onQueryInput"
          />
        </div>

        <p v-if="searching" class="rvo-text share-dialog__hint">Zoeken…</p>
        <ul v-else-if="results.length" class="share-dialog__results">
          <li v-for="user in results" :key="user.id" class="share-dialog__row">
            <div class="share-dialog__who">
              <span class="share-dialog__name">{{ user.name || user.email }}</span>
              <span v-if="user.name && user.email" class="share-dialog__email">{{ user.email }}</span>
            </div>
            <select v-model="pendingRoles[user.id]" class="utrecht-select share-dialog__role" aria-label="Rol">
              <option v-for="(label, role) in roleLabels" :key="role" :value="role">{{ label }}</option>
            </select>
            <button type="button" class="rvo-button rvo-button--primary rvo-button--sm" @click="addGrant(user)">
              Toevoegen
            </button>
          </li>
        </ul>
        <p v-else-if="query.trim().length >= 2 && searched" class="rvo-text share-dialog__hint">
          Geen gebruikers gevonden.
        </p>

        <!-- Current grants -->
        <h4 class="utrecht-heading-4 share-dialog__subtitle">Personen met toegang</h4>
        <p v-if="grants.length === 0" class="rvo-text share-dialog__hint">Nog niet gedeeld.</p>
        <ul v-else class="share-dialog__results">
          <li v-for="grant in grants" :key="grant.sub" class="share-dialog__row">
            <div class="share-dialog__who">
              <span class="share-dialog__name">
                {{ grant.name || grant.email || grant.sub }}
                <span v-if="grant.sub === mySub" class="share-dialog__me">(jij)</span>
              </span>
              <span v-if="grant.name && grant.email" class="share-dialog__email">{{ grant.email }}</span>
            </div>
            <select
              class="utrecht-select share-dialog__role"
              aria-label="Rol"
              :value="grant.role"
              :disabled="isLastOwner(grant)"
              @change="changeRole(grant, ($event.target as HTMLSelectElement).value as DossierRole)"
            >
              <option v-for="(label, role) in roleLabels" :key="role" :value="role">{{ label }}</option>
            </select>
            <button
              type="button"
              class="rvo-button rvo-button--warning-subtle rvo-button--sm"
              :disabled="isLastOwner(grant)"
              :title="isLastOwner(grant) ? 'Minimaal één eigenaar vereist' : undefined"
              @click="revoke(grant)"
            >
              Verwijderen
            </button>
          </li>
        </ul>
        <p v-if="grants.some(isLastOwner)" class="rvo-text share-dialog__hint">
          Minimaal één eigenaar vereist.
        </p>

        <div v-if="error" class="rvo-alert rvo-alert--error rvo-alert--padding-sm">
          <div class="rvo-alert__container">{{ error }}</div>
        </div>
      </div>

      <div class="invulhulp-modal__actions">
        <button type="button" class="rvo-button rvo-button--secondary" @click="close">Sluiten</button>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import {
  removeGrant,
  searchUsers,
  setGrant,
  type DossierRole,
  type Grant,
  type UserSearchResult,
} from '../services/dossierService'
import { useAuthStore } from '../stores/authStore'

const props = defineProps<{
  dossierId: string
}>()

const emit = defineEmits<{
  changed: [grants: Grant[]]
}>()

const roleLabels: Record<DossierRole, string> = {
  viewer: 'Lezen',
  editor: 'Bewerken',
  owner: 'Eigenaar',
}

const auth = useAuthStore()
const mySub = auth.user?.sub

const dialogEl = ref<HTMLDialogElement | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)
const uid = Math.random().toString(36).slice(2, 9)
const titleId = `share-dialog-title-${uid}`
const searchId = `share-dialog-search-${uid}`

const query = ref('')
const results = ref<UserSearchResult[]>([])
const searching = ref(false)
const searched = ref(false)
const pendingRoles = ref<Record<string, DossierRole>>({})
const grants = ref<Grant[]>([])
const error = ref('')
const debugMeasure = ref('') // TEMPORARY — remove after share-modal fix

let searchTimer: ReturnType<typeof setTimeout> | null = null

async function open(currentGrants: Grant[]) {
  grants.value = [...currentGrants]
  query.value = ''
  results.value = []
  searched.value = false
  error.value = ''
  dialogEl.value?.showModal()
  await nextTick()
  measureFirstName() // TEMPORARY
  searchEl.value?.focus()
}

// TEMPORARY — measure the real styled name element to find why it renders blank.
function measureFirstName() {
  const el = dialogEl.value?.querySelector(
    '.share-dialog__results .share-dialog__name',
  ) as HTMLElement | null
  if (!el) {
    debugMeasure.value = 'no .share-dialog__name element found in DOM'
    return
  }
  const cs = getComputedStyle(el)
  const who = el.closest('.share-dialog__who') as HTMLElement | null
  const row = el.closest('.share-dialog__row') as HTMLElement | null
  debugMeasure.value = [
    `name: w=${el.offsetWidth} h=${el.offsetHeight} color=${cs.color} bg=${cs.backgroundColor}`,
    `      display=${cs.display} visibility=${cs.visibility} opacity=${cs.opacity} overflow=${cs.overflow}`,
    `      whiteSpace=${cs.whiteSpace} text="${(el.textContent || '').trim()}"`,
    `who:  w=${who?.offsetWidth} h=${who?.offsetHeight}`,
    `row:  w=${row?.offsetWidth} h=${row?.offsetHeight}`,
  ].join('\n')
}

function close() {
  dialogEl.value?.close()
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialogEl.value) close()
}

function onQueryInput() {
  if (searchTimer) clearTimeout(searchTimer)
  const q = query.value.trim()
  if (q.length < 2) {
    results.value = []
    searched.value = false
    return
  }
  searchTimer = setTimeout(async () => {
    searching.value = true
    try {
      const found = await searchUsers(q)
      // People who already have access don't show up as addable again.
      results.value = found.filter((u) => !grants.value.some((g) => g.sub === u.id))
      for (const u of results.value) {
        if (!pendingRoles.value[u.id]) pendingRoles.value[u.id] = 'viewer'
      }
      searched.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      searching.value = false
    }
  }, 300)
}

function isLastOwner(grant: Grant): boolean {
  return grant.role === 'owner' && grants.value.filter((g) => g.role === 'owner').length <= 1
}

async function addGrant(user: UserSearchResult) {
  error.value = ''
  try {
    grants.value = await setGrant(props.dossierId, user.id, {
      role: pendingRoles.value[user.id] ?? 'viewer',
      email: user.email,
      name: user.name,
    })
    results.value = results.value.filter((u) => u.id !== user.id)
    emit('changed', grants.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function changeRole(grant: Grant, role: DossierRole) {
  error.value = ''
  try {
    grants.value = await setGrant(props.dossierId, grant.sub, { role })
    emit('changed', grants.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function revoke(grant: Grant) {
  error.value = ''
  try {
    grants.value = await removeGrant(props.dossierId, grant.sub)
    emit('changed', grants.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

defineExpose({ open })
</script>

<style scoped>
/* Reuses the .invulhulp-modal pattern from ConfirmDialog.vue. */

.invulhulp-modal {
  border: 0;
  padding: 0;
  background: transparent;
  max-inline-size: min(640px, 92vw);
  inline-size: 100%;
  margin-block-start: 5vh;
  color: inherit;
}

.invulhulp-modal::backdrop {
  background: rgb(0 0 0 / 50%);
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

.invulhulp-modal__divider {
  margin: 0;
}

.invulhulp-modal__body {
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-sm);
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

.share-dialog__subtitle {
  margin: var(--rvo-space-xs) 0 0;
  color: var(--rvo-color-lintblauw);
}

.share-dialog__results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-2xs);
}

.share-dialog__row {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-xs);
  padding: var(--rvo-space-2xs) var(--rvo-space-xs);
  border: 1px solid var(--rvo-color-grijs-200);
  border-radius: var(--rvo-border-radius-md);
}

.share-dialog__who {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
}

.share-dialog__name {
  font-weight: var(--rvo-font-weight-bold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-dialog__me {
  font-weight: var(--rvo-font-weight-normal);
  color: var(--invulhulp-color-text-muted);
}

.share-dialog__email {
  font-size: var(--rvo-font-size-sm);
  color: var(--invulhulp-color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-dialog__role {
  min-inline-size: 8rem;
}

.share-dialog__hint {
  margin: 0;
  font-size: var(--rvo-font-size-sm);
  color: var(--invulhulp-color-text-muted);
}
</style>
