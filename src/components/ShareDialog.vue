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

        <nldd-text size="sm" color="inherit" class="share-dialog__hint" v-if="searching">Zoeken…</nldd-text>
        <ul v-else-if="results.length" class="share-dialog__results">
          <li v-for="user in results" :key="user.id" class="share-dialog__row">
            <div class="share-dialog__who">
              <span class="share-dialog__name">{{ user.name || user.email }}</span>
              <span v-if="user.name && user.email" class="share-dialog__email">{{ user.email }}</span>
            </div>
            <select v-model="pendingRoles[user.id]" class="utrecht-select share-dialog__role" aria-label="Rol">
              <option v-for="(label, role) in roleLabels" :key="role" :value="role">{{ label }}</option>
            </select>
            <nldd-button
              variant="primary"
              text="Toevoegen"
              @click="addGrant(user)"
            />
          </li>
        </ul>
        <nldd-text size="sm" color="inherit" class="share-dialog__hint" v-else-if="query.trim().length >= 2 && searched">
          Geen gebruikers gevonden.
        </nldd-text>

        <!-- Current grants -->
        <h4 class="utrecht-heading-4 share-dialog__subtitle">Personen met toegang</h4>
        <nldd-text size="sm" color="inherit" class="share-dialog__hint" v-if="grants.length === 0">Nog niet gedeeld.</nldd-text>
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
            <nldd-button
              variant="secondary"
              text="Verwijderen"
              :disabled="isLastOwner(grant)"
              :title="isLastOwner(grant) ? 'Minimaal één eigenaar vereist' : undefined"
              @click="revoke(grant)"
            />
          </li>
        </ul>
        <nldd-text size="sm" color="inherit" class="share-dialog__hint" v-if="grants.some(isLastOwner)">
          Minimaal één eigenaar vereist.
        </nldd-text>

        <nldd-banner
          variant="critical"
          size="sm"
          v-if="error"
          :text="error"
        />
      </div>

      <div class="invulhulp-modal__actions">
        <nldd-button
          variant="secondary"
          text="Sluiten"
          @click="close"
        />
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

let searchTimer: ReturnType<typeof setTimeout> | null = null

async function open(currentGrants: Grant[]) {
  grants.value = [...currentGrants]
  query.value = ''
  results.value = []
  searched.value = false
  error.value = ''
  dialogEl.value?.showModal()
  await nextTick()
  searchEl.value?.focus()
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

.invulhulp-modal__divider {
  margin: 0;
}

.invulhulp-modal__body {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-12);
}

.invulhulp-modal__input {
  inline-size: 100%;
}

.invulhulp-modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--primitives-space-8);
  margin-block-start: var(--primitives-space-4);
}

.share-dialog__subtitle {
  margin: var(--primitives-space-8) 0 0;
  color: var(--semantics-content-accent-color);
}

.share-dialog__results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
}

.share-dialog__row {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-8);
  padding: var(--primitives-space-4) var(--primitives-space-8);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
}

.share-dialog__who {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
}

.share-dialog__name {
  font-weight: var(--primitives-font-weight-body-bold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-dialog__me {
  font-weight: var(--primitives-font-weight-body-regular);
  color: var(--invulhulp-color-text-muted);
}

.share-dialog__email {
  font-size: var(--primitives-font-size-90);
  color: var(--invulhulp-color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-dialog__role {
  /* .utrecht-select forces inline-size: 100%; left unchecked it eats the whole
     flex row and collapses .share-dialog__who (flex-basis 0) to zero width,
     hiding the name/e-mail behind overflow: hidden. Size it to its content. */
  flex: 0 0 auto;
  inline-size: auto;
  min-inline-size: 8rem;
}

.share-dialog__hint {
  margin: 0;
  color: var(--invulhulp-color-text-muted);
}
</style>
