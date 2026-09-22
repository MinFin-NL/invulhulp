<template>
  <ModalWindow ref="win" title="Dossier delen" width="640">
    <!-- Search -->
    <nldd-form-field label="Zoek op naam of e-mailadres">
      <nldd-search-field
        ref="searchEl"
        class="share-dialog__search"
        placeholder="bijv. Jansen of j.jansen@minfin.nl"
        autocomplete="off"
        :value="query"
        @input="query = $event.detail.value; onQueryInput()"
      />
    </nldd-form-field>

    <nldd-text size="sm" color="inherit" class="share-dialog__hint" v-if="searching">Zoeken…</nldd-text>
    <ul v-else-if="results.length" class="share-dialog__results">
      <li v-for="user in results" :key="user.id" class="share-dialog__row">
        <div class="share-dialog__who">
          <span class="share-dialog__name">{{ user.name || user.email }}</span>
          <span v-if="user.name && user.email" class="share-dialog__email">{{ user.email }}</span>
        </div>
        <nldd-dropdown
          class="share-dialog__role"
          size="sm"
          accessible-label="Rol"
          @change="pendingRoles[user.id] = $event.detail.value as DossierRole"
        >
          <select :value="pendingRoles[user.id]">
            <option v-for="(label, role) in roleLabels" :key="role" :value="role">{{ label }}</option>
          </select>
        </nldd-dropdown>
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
    <nldd-title size="4"><h4 class="share-dialog__subtitle">Personen met toegang</h4></nldd-title>
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
        <nldd-dropdown
          class="share-dialog__role"
          size="sm"
          accessible-label="Rol"
          :disabled="isLastOwner(grant)"
          @change="changeRole(grant, $event.detail.value as DossierRole)"
        >
          <select :value="grant.role">
            <option v-for="(label, role) in roleLabels" :key="role" :value="role">{{ label }}</option>
          </select>
        </nldd-dropdown>
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

    <template #footer>
      <nldd-button
        variant="secondary"
        text="Sluiten"
        @click="close"
      />
    </template>
  </ModalWindow>
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
import ModalWindow from './ModalWindow.vue'

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

const win = ref<InstanceType<typeof ModalWindow> | null>(null)
const searchEl = ref<HTMLElement | null>(null)

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
  win.value?.show()
  await nextTick()
  searchEl.value?.focus()
}

function close() {
  win.value?.hide()
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
.share-dialog__search {
  inline-size: 100%;
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
  /* nldd-dropdown stretches to fill its container by default; left unchecked
     it eats the whole flex row and collapses .share-dialog__who (flex-basis 0)
     to zero width, hiding the name/e-mail behind overflow: hidden. Size it to
     its content instead. */
  flex: 0 0 auto;
  inline-size: auto;
  min-inline-size: 8rem;
}

.share-dialog__hint {
  margin: 0;
  color: var(--invulhulp-color-text-muted);
}
</style>
