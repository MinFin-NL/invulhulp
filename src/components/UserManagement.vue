<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm user-mgmt">
    <div class="rvo-layout-column rvo-layout-gap--lg">
      <div>
        <h1 class="utrecht-heading-1 user-mgmt__title">Gebruikersbeheer</h1>
        <p class="rvo-text user-mgmt__intro">
          Gebruikers worden aangemaakt in Keycloak en loggen in via SSO. Een nieuwe gebruiker
          krijgt een tijdelijk wachtwoord en moet dat bij de eerste keer inloggen wijzigen.
        </p>
      </div>

      <div v-if="error" class="rvo-alert rvo-alert--error rvo-alert--padding-md">
        <div class="rvo-alert__container">{{ error }}</div>
      </div>

      <!-- Eénmalig getoond tijdelijk wachtwoord -->
      <div v-if="tempPassword" class="rvo-alert rvo-alert--warning rvo-alert--padding-md">
        <div class="rvo-alert__container user-mgmt__temp-pw">
          <div>
            <strong>Tijdelijk wachtwoord voor {{ tempPassword.who }}:</strong>
            <code class="user-mgmt__pw-code">{{ tempPassword.value }}</code><br />
            Geef dit eenmalig door — het wordt niet nogmaals getoond. De gebruiker kiest bij de
            eerste login een eigen wachtwoord.
          </div>
          <div class="user-mgmt__temp-pw-actions">
            <button class="rvo-button rvo-button--secondary rvo-button--size-sm" @click="copyTempPassword">
              {{ copied ? 'Gekopieerd' : 'Kopieer' }}
            </button>
            <button class="rvo-button rvo-button--tertiary rvo-button--size-sm" @click="tempPassword = null">
              Sluiten
            </button>
          </div>
        </div>
      </div>

      <!-- Nieuwe gebruiker -->
      <section class="user-mgmt__panel">
        <h2 class="utrecht-heading-2 user-mgmt__panel-title">Nieuwe gebruiker</h2>
        <form class="user-mgmt__form" @submit.prevent="createUser">
          <div class="user-mgmt__form-fields">
            <label class="user-mgmt__field">
              <span class="rvo-label">Voornaam</span>
              <input v-model.trim="form.firstName" required class="utrecht-textbox user-mgmt__input" type="text" />
            </label>
            <label class="user-mgmt__field">
              <span class="rvo-label">Achternaam</span>
              <input v-model.trim="form.lastName" required class="utrecht-textbox user-mgmt__input" type="text" />
            </label>
            <label class="user-mgmt__field user-mgmt__field--wide">
              <span class="rvo-label">E-mailadres (wordt de gebruikersnaam)</span>
              <input v-model.trim="form.email" required class="utrecht-textbox user-mgmt__input" type="email" />
            </label>
          </div>
          <label class="rvo-checkbox rvo-checkbox--not-checked user-mgmt__admin-check">
            <input v-model="form.isAdmin" class="rvo-checkbox__input" type="checkbox" />
            Beheerder (mag gebruikers beheren)
          </label>
          <div>
            <button class="rvo-button rvo-button--primary" type="submit" :disabled="busy">
              {{ busy ? 'Bezig…' : 'Gebruiker aanmaken' }}
            </button>
          </div>
        </form>
      </section>

      <!-- Bestaande gebruikers -->
      <section class="user-mgmt__panel">
        <h2 class="utrecht-heading-2 user-mgmt__panel-title">Gebruikers ({{ users.length }})</h2>
        <p v-if="loading" class="rvo-text">Gebruikers laden…</p>
        <div v-else class="user-mgmt__table-wrap">
          <table class="rvo-table user-mgmt__table">
            <thead class="rvo-table-head">
              <tr class="rvo-table-row">
                <th class="rvo-table-header">Naam</th>
                <th class="rvo-table-header">E-mail</th>
                <th class="rvo-table-header">Rol</th>
                <th class="rvo-table-header">Status</th>
                <th class="rvo-table-header">Acties</th>
              </tr>
            </thead>
            <tbody class="rvo-table-body">
              <tr v-for="u in users" :key="u.id" class="rvo-table-row" :class="{ 'user-mgmt__row--disabled': !u.enabled }">
                <td class="rvo-table-cell">
                  {{ u.firstName }} {{ u.lastName }}
                  <span v-if="u.isSelf" class="user-mgmt__self">(jij)</span>
                </td>
                <td class="rvo-table-cell">{{ u.email ?? u.username }}</td>
                <td class="rvo-table-cell">
                  <span v-if="u.isAdmin" class="user-mgmt__badge user-mgmt__badge--admin">Beheerder</span>
                  <span v-else class="user-mgmt__badge">Gebruiker</span>
                </td>
                <td class="rvo-table-cell">
                  <span :class="['user-mgmt__badge', u.enabled ? 'user-mgmt__badge--active' : 'user-mgmt__badge--off']">
                    {{ u.enabled ? 'Actief' : 'Gedeactiveerd' }}
                  </span>
                </td>
                <td class="rvo-table-cell user-mgmt__actions">
                  <button
                    class="rvo-button rvo-button--tertiary rvo-button--size-sm"
                    :disabled="busy"
                    @click="resetPassword(u)"
                  >
                    Wachtwoord resetten
                  </button>
                  <button
                    class="rvo-button rvo-button--tertiary rvo-button--size-sm"
                    :disabled="busy || u.isSelf"
                    @click="toggleAdmin(u)"
                  >
                    {{ u.isAdmin ? 'Beheerder afnemen' : 'Beheerder maken' }}
                  </button>
                  <button
                    class="rvo-button rvo-button--tertiary rvo-button--size-sm"
                    :disabled="busy || u.isSelf"
                    @click="toggleEnabled(u)"
                  >
                    {{ u.enabled ? 'Deactiveren' : 'Activeren' }}
                  </button>
                  <button
                    class="rvo-button rvo-button--tertiary rvo-button--size-sm user-mgmt__danger"
                    :disabled="busy || u.isSelf"
                    @click="askDelete(u)"
                  >
                    Verwijderen
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>

  <ConfirmDialog
    ref="deleteDialog"
    title="Gebruiker verwijderen?"
    :message="`${pendingDelete?.firstName ?? ''} ${pendingDelete?.lastName ?? ''} (${pendingDelete?.email ?? ''}) wordt definitief uit Keycloak verwijderd.`"
    confirm-label="Verwijderen"
    cancel-label="Annuleren"
    variant="warning"
    @confirm="deleteUser"
  />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'

interface ManagedUser {
  id: string
  username: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  enabled: boolean
  isAdmin: boolean
  isSelf: boolean
}

const users = ref<ManagedUser[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
const tempPassword = ref<{ who: string; value: string } | null>(null)
const copied = ref(false)
const form = ref({ firstName: '', lastName: '', email: '', isAdmin: false })
const deleteDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const pendingDelete = ref<ManagedUser | null>(null)

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin/users${path}`, {
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) {
    let detail = 'Er ging iets mis'
    try {
      detail = (await res.json()).detail ?? detail
    } catch { /* geen JSON-body */ }
    throw new Error(detail)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

async function refresh() {
  loading.value = true
  try {
    users.value = await api<ManagedUser[]>('')
    error.value = null
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

async function run(fn: () => Promise<void>) {
  busy.value = true
  error.value = null
  try {
    await fn()
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

function createUser() {
  const { firstName, lastName, email, isAdmin } = form.value
  run(async () => {
    const res = await api<{ id: string; tempPassword: string }>('', {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName, email, isAdmin }),
    })
    tempPassword.value = { who: email, value: res.tempPassword }
    copied.value = false
    form.value = { firstName: '', lastName: '', email: '', isAdmin: false }
  })
}

function resetPassword(u: ManagedUser) {
  run(async () => {
    const res = await api<{ tempPassword: string }>(`/${u.id}/reset-password`, { method: 'POST' })
    tempPassword.value = { who: u.email ?? u.username ?? '', value: res.tempPassword }
    copied.value = false
  })
}

function toggleAdmin(u: ManagedUser) {
  run(() => api(`/${u.id}`, { method: 'PUT', body: JSON.stringify({ isAdmin: !u.isAdmin }) }))
}

function toggleEnabled(u: ManagedUser) {
  run(() => api(`/${u.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !u.enabled }) }))
}

function askDelete(u: ManagedUser) {
  pendingDelete.value = u
  deleteDialog.value?.open()
}

function deleteUser() {
  const u = pendingDelete.value
  if (!u) return
  run(() => api(`/${u.id}`, { method: 'DELETE' }))
}

async function copyTempPassword() {
  if (!tempPassword.value) return
  await navigator.clipboard.writeText(tempPassword.value.value)
  copied.value = true
}
</script>

<style scoped>
.user-mgmt {
  padding-block: var(--rvo-space-2xl) var(--rvo-space-3xl);
}

.user-mgmt__title {
  margin-block-end: var(--rvo-space-xs);
}

.user-mgmt__intro {
  color: var(--invulhulp-color-text-subtle);
  max-inline-size: 44rem;
}

.user-mgmt__panel {
  background: var(--rvo-color-wit);
  border: 1px solid var(--rvo-color-lichtblauw-300);
  border-radius: var(--rvo-border-radius-md);
  padding: var(--rvo-space-lg);
}

.user-mgmt__panel-title {
  margin-block: 0 var(--rvo-space-md);
  font-size: var(--rvo-font-size-lg);
}

.user-mgmt__form {
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-md);
}

.user-mgmt__form-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  gap: var(--rvo-space-md);
}

.user-mgmt__field {
  display: flex;
  flex-direction: column;
  gap: var(--rvo-space-2xs);
}

.user-mgmt__field--wide {
  grid-column: 1 / -1;
}

.user-mgmt__input {
  max-inline-size: 28rem;
}

.user-mgmt__admin-check {
  display: flex;
  align-items: center;
  gap: var(--rvo-space-xs);
}

.user-mgmt__table-wrap {
  overflow-x: auto;
}

.user-mgmt__table {
  inline-size: 100%;
}

.user-mgmt__row--disabled {
  opacity: 0.55;
}

.user-mgmt__self {
  color: var(--invulhulp-color-text-subtle);
  font-size: var(--rvo-font-size-sm);
}

.user-mgmt__badge {
  display: inline-block;
  padding: 1px 10px;
  border-radius: 999px;
  font-size: var(--rvo-font-size-xs);
  font-weight: var(--rvo-font-weight-semibold);
  background: var(--rvo-color-lichtblauw-150);
  color: var(--rvo-color-lintblauw);
  white-space: nowrap;
}

.user-mgmt__badge--admin {
  background: var(--rvo-color-lintblauw);
  color: var(--rvo-color-wit);
}

.user-mgmt__badge--active {
  background: var(--rvo-color-groen-150, #e1eddb);
  color: var(--rvo-color-groen, #39870c);
}

.user-mgmt__badge--off {
  background: var(--rvo-color-grijs-200, #e6e6e6);
  color: var(--rvo-color-grijs-700, #696969);
}

.user-mgmt__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rvo-space-2xs);
}

.user-mgmt__danger {
  color: var(--rvo-color-rood, #d52b1e) !important;
}

.user-mgmt__temp-pw {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rvo-space-md);
  flex-wrap: wrap;
}

.user-mgmt__temp-pw-actions {
  display: inline-flex;
  gap: var(--rvo-space-xs);
  flex-shrink: 0;
}

.user-mgmt__pw-code {
  display: inline-block;
  margin-inline-start: var(--rvo-space-xs);
  padding: 1px 8px;
  background: rgb(0 0 0 / 0.06);
  border-radius: var(--rvo-border-radius-sm);
  font-weight: var(--rvo-font-weight-bold);
  user-select: all;
}
</style>
