<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm user-mgmt">
    <div class="rvo-layout-column rvo-layout-gap--lg">
      <div>
        <h1 class="utrecht-heading-1 user-mgmt__title">Gebruikersbeheer</h1>
        <nldd-text color="inherit" class="user-mgmt__intro">
          Gebruikers worden aangemaakt in Keycloak en loggen in via SSO. Een nieuwe gebruiker
          krijgt een tijdelijk wachtwoord en moet dat bij de eerste keer inloggen wijzigen.
        </nldd-text>
      </div>

      <nldd-banner
        variant="critical"
        v-if="error"
        role="alert"
        :text="error"
      />

      <nldd-banner
        variant="success"
        v-if="notice"
        role="status"
        :text="notice"
      />

      <!-- Eénmalig getoond tijdelijk wachtwoord -->
            <nldd-banner
              variant="warning"
              class="user-mgmt__temp-pw"
              v-if="tempPassword"
            >
          <div>
            <strong>Tijdelijk wachtwoord voor {{ tempPassword.who }}:</strong>
            <code class="user-mgmt__pw-code">{{ tempPassword.value }}</code><br />
            Geef dit eenmalig door — het wordt niet nogmaals getoond. De gebruiker kiest bij de
            eerste login een eigen wachtwoord.
          </div>
          <div class="user-mgmt__temp-pw-actions">
            <nldd-button
              variant="secondary"
              size="sm"
              :text="copied ? 'Gekopieerd' : 'Kopieer'"
              @click="copyTempPassword"
            />
            <nldd-button
              variant="neutral-transparent"
              size="sm"
              text="Sluiten"
              @click="tempPassword = null"
            />
          </div>
      </nldd-banner>

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
          <fieldset v-if="scopeRoles.length" class="rvo-form-fieldset user-mgmt__roles-fieldset">
            <legend class="rvo-form-fieldset__legend">Formulierenset</legend>
            <p class="rvo-form-field__description">
              Zonder rol ziet de gebruiker alle formulieren. Met een rol alleen de formulieren
              die bij die rol horen.
            </p>
            <div class="rvo-checkbox__group">
              <label v-for="role in scopeRoles" :key="role.id" class="rvo-checkbox">
                <input
                  v-model="form.scopeRoles"
                  :value="role.id"
                  class="rvo-checkbox__input"
                  type="checkbox"
                />
                <span class="rvo-checkbox__label">
                  {{ role.title }} ({{ role.forms.length }} formulieren)
                </span>
              </label>
            </div>
          </fieldset>
          <div>
            <nldd-button
              type="submit"
              variant="primary"
              :text="busy ? 'Bezig…' : 'Gebruiker aanmaken'"
              :disabled="busy"
            />
          </div>
        </form>
      </section>

      <!-- Bestaande gebruikers -->
      <section class="user-mgmt__panel">
        <h2 class="utrecht-heading-2 user-mgmt__panel-title">Gebruikers ({{ users.length }})</h2>
        <nldd-text v-if="loading">Gebruikers laden…</nldd-text>
        <div v-else class="user-mgmt__table-wrap">
          <table class="rvo-table user-mgmt__table">
            <thead class="rvo-table-head">
              <tr class="rvo-table-row">
                <th class="rvo-table-header">Naam</th>
                <th class="rvo-table-header">E-mail</th>
                <th class="rvo-table-header">Rol</th>
                <th v-if="scopeRoles.length" class="rvo-table-header">Formulierenset</th>
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
                <td v-if="scopeRoles.length" class="rvo-table-cell">
                  <div class="rvo-checkbox__group user-mgmt__roles">
                    <label
                      v-for="role in scopeRoles"
                      :key="role.id"
                      class="rvo-checkbox user-mgmt__role-check"
                    >
                      <input
                        class="rvo-checkbox__input"
                        type="checkbox"
                        :checked="u.scopeRoles.includes(role.id)"
                        :disabled="busy"
                        :aria-label="`${role.title} voor ${userLabel(u)}`"
                        @change="toggleScopeRole(u, role.id)"
                      />
                      <span class="rvo-checkbox__label">{{ role.title }}</span>
                    </label>
                  </div>
                  <span v-if="u.scopeRoles.length === 0" class="user-mgmt__all-forms">
                    Ziet alle formulieren
                  </span>
                </td>
                <td class="rvo-table-cell">
                  <span :class="['user-mgmt__badge', u.enabled ? 'user-mgmt__badge--active' : 'user-mgmt__badge--off']">
                    {{ u.enabled ? 'Actief' : 'Gedeactiveerd' }}
                  </span>
                </td>
                <td class="rvo-table-cell user-mgmt__actions">
                  <nldd-button
                    variant="neutral-transparent"
                    size="sm"
                    text="Wachtwoord resetten"
                    :disabled="busy"
                    @click="resetPassword(u)"
                  />
                  <nldd-button
                    variant="neutral-transparent"
                    size="sm"
                    :text="u.isAdmin ? 'Beheerder afnemen' : 'Beheerder maken'"
                    :disabled="busy || u.isSelf"
                    @click="toggleAdmin(u)"
                  />
                  <nldd-button
                    variant="neutral-transparent"
                    size="sm"
                    :text="u.enabled ? 'Deactiveren' : 'Activeren'"
                    :disabled="busy || u.isSelf"
                    @click="toggleEnabled(u)"
                  />
                  <nldd-button
                    variant="neutral-transparent"
                    size="sm"
                    class="user-mgmt__danger"
                    text="Verwijderen"
                    :disabled="busy || u.isSelf"
                    @click="askDelete(u)"
                  />
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
    title="Gebruiker definitief verwijderen"
    :message="`${pendingDelete?.firstName ?? ''} ${pendingDelete?.lastName ?? ''} wordt uit Keycloak verwijderd en verliest direct toegang tot de applicatie.`"
    :confirm-phrase="pendingDelete?.email ?? pendingDelete?.username ?? undefined"
    confirm-label="Gebruiker verwijderen"
    cancel-label="Annuleren"
    variant="warning"
    @confirm="deleteUser"
  >
    <template #danger>
      <nldd-text v-if="impactLoading">Bezig met bepalen welke dossiers meegaan…</nldd-text>
      <ul v-else class="rvo-item-list">
        <li class="rvo-item-list__item">Het account zelf, inclusief inloggegevens en rollen.</li>
        <li class="rvo-item-list__item">
          <template v-if="impact?.dossiersToDelete.length">
            {{ impact.dossiersToDelete.length }}
            {{ impact.dossiersToDelete.length === 1 ? 'dossier waarvan deze gebruiker de enige eigenaar is' : 'dossiers waarvan deze gebruiker de enige eigenaar is' }},
            met alle brondocumenten en antwoorden:
            <strong>{{ impact.dossiersToDelete.join(', ') }}</strong>
          </template>
          <template v-else>
            Geen dossiers: deze gebruiker is nergens de enige eigenaar.
          </template>
        </li>
        <li v-if="impact?.dossiersToUnshare" class="rvo-item-list__item">
          {{ impact.dossiersToUnshare }}
          gedeeld{{ impact.dossiersToUnshare === 1 ? ' dossier blijft' : 'e dossiers blijven' }}
          bestaan; alleen de toegang van deze gebruiker vervalt.
        </li>
      </ul>
    </template>
  </ConfirmDialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { loadFormRoles, type FormRole } from '../services/formLoader'

interface ManagedUser {
  id: string
  username: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  enabled: boolean
  isAdmin: boolean
  /** Rollen die het formulierenaanbod inperken; leeg = ziet alles. */
  scopeRoles: string[]
  isSelf: boolean
}

/** De rollen die de backend kent (auth.SCOPE_ROLES), aangevuld met de titel en
 *  formulierenlijst uit public/forms/index.json. De backend is leidend: een rol
 *  die daar niet in staat kan niet toegekend worden, ook niet als index.json
 *  hem al noemt. */
const scopeRoles = ref<FormRole[]>([])

function userLabel(u: ManagedUser): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.username || 'gebruiker'
}

const users = ref<ManagedUser[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
const tempPassword = ref<{ who: string; value: string } | null>(null)
const copied = ref(false)
const form = ref({ firstName: '', lastName: '', email: '', isAdmin: false, scopeRoles: [] as string[] })
const deleteDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const pendingDelete = ref<ManagedUser | null>(null)

/** Welke dossiers een verwijdering meesleept — opgehaald vóór de bevestiging,
 *  zodat de beheerder weet wat er verdwijnt in plaats van het achteraf te
 *  ontdekken. */
interface DeleteImpact {
  dossiersToDelete: string[]
  dossiersToUnshare: number
}
const impact = ref<DeleteImpact | null>(null)
const impactLoading = ref(false)
const notice = ref<string | null>(null)

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

async function loadScopeRoles() {
  try {
    const known = await api<string[]>('/roles')
    const described = await loadFormRoles()
    scopeRoles.value = known.map(
      (id) => described.find((r) => r.id === id) ?? { id, title: id, forms: [] },
    )
  } catch {
    // Zonder rollenlijst blijft het scherm gewoon werken: de kolom verdwijnt en
    // gebruikersbeheer doet wat het altijd deed.
    scopeRoles.value = []
  }
}

onMounted(refresh)
onMounted(loadScopeRoles)

async function run(fn: () => Promise<void>) {
  busy.value = true
  error.value = null
  notice.value = null
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
  const { firstName, lastName, email, isAdmin, scopeRoles: roles } = form.value
  run(async () => {
    const res = await api<{ id: string; tempPassword: string }>('', {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName, email, isAdmin, scopeRoles: roles }),
    })
    tempPassword.value = { who: email, value: res.tempPassword }
    copied.value = false
    form.value = { firstName: '', lastName: '', email: '', isAdmin: false, scopeRoles: [] }
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

/** Rol aan- of uitzetten. De backend krijgt de volledige gewenste set, zodat er
 *  geen verschil kan ontstaan tussen wat het scherm toont en wat Keycloak weet. */
function toggleScopeRole(u: ManagedUser, roleId: string) {
  const wanted = u.scopeRoles.includes(roleId)
    ? u.scopeRoles.filter((r) => r !== roleId)
    : [...u.scopeRoles, roleId]
  run(async () => {
    await api(`/${u.id}`, { method: 'PUT', body: JSON.stringify({ scopeRoles: wanted }) })
    // De rollen zitten in de sessiecookie, dus de wijziging telt pas na een
    // nieuwe login — zeg dat, anders lijkt het scherm te liegen.
    notice.value = `Formulierenset van ${userLabel(u)} aangepast. De wijziging geldt zodra deze gebruiker opnieuw inlogt.`
  })
}

function toggleEnabled(u: ManagedUser) {
  run(() => api(`/${u.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !u.enabled }) }))
}

async function askDelete(u: ManagedUser) {
  pendingDelete.value = u
  impact.value = null
  impactLoading.value = true
  deleteDialog.value?.open()
  try {
    impact.value = await api<DeleteImpact>(`/${u.id}/impact`)
  } catch {
    // Onbekende impact mag de dialoog niet blokkeren; de opsomming valt terug
    // op "geen dossiers" noch een aantal — de bevestiging blijft verplicht.
    impact.value = { dossiersToDelete: [], dossiersToUnshare: 0 }
  } finally {
    impactLoading.value = false
  }
}

function deleteUser() {
  const u = pendingDelete.value
  if (!u) return
  run(async () => {
    const res = await api<{ deletedDossiers: number; revokedGrants: number }>(`/${u.id}`, {
      method: 'DELETE',
    })
    const naam = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'De gebruiker'
    notice.value = res?.deletedDossiers
      ? `${naam} is verwijderd, samen met ${res.deletedDossiers} ${res.deletedDossiers === 1 ? 'dossier' : 'dossiers'}.`
      : `${naam} is verwijderd.`
  })
}

async function copyTempPassword() {
  if (!tempPassword.value) return
  await navigator.clipboard.writeText(tempPassword.value.value)
  copied.value = true
}
</script>

<style scoped>
.user-mgmt {
  padding-block: var(--primitives-space-40) var(--primitives-space-48);
}

.user-mgmt__title {
  margin-block-end: var(--primitives-space-8);
}

.user-mgmt__intro {
  color: var(--invulhulp-color-text-subtle);
  max-inline-size: 44rem;
}

.user-mgmt__panel {
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  padding: var(--primitives-space-24);
}

.user-mgmt__panel-title {
  margin-block: 0 var(--primitives-space-16);
  font-size: var(--primitives-font-size-200);
}

.user-mgmt__form {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-16);
}

.user-mgmt__form-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  gap: var(--primitives-space-16);
}

.user-mgmt__field {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
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
  gap: var(--primitives-space-8);
}

/* Zelfde reden als in QuestionItem.vue: het RVO-vinkje komt uit een
   mask-image die het component-CSS niet meelevert, dus zonder deze regel is een
   aangevinkt vakje een wit blok. Statische url() — een runtime-binding wordt een
   wit vlak in de productiebuild. */
.user-mgmt .rvo-checkbox__input:checked::after {
  -webkit-mask-image: url('@nl-rvo/assets/icons/functioneel/vinkje.svg');
  mask-image: url('@nl-rvo/assets/icons/functioneel/vinkje.svg');
}

/* Zelfde ingreep als in QuestionItem.vue: rvo-form-fieldset brengt een grijze
   achtergrond en eigen padding mee. Die hoort bij een fieldset die een heel
   formulier omkadert, niet bij één keuzeveld tussen de andere velden — laat het
   blok anders als een misplaatst grijs vlak over de volle breedte staan. */
.user-mgmt__roles-fieldset {
  background: transparent;
  border: 0;
  margin: 0;
  padding: 0;
  min-inline-size: 0;
}

/* De legend is standaard 1,25rem/700 — een kop. Hier is het een veldlabel
   tussen "Voornaam" en "E-mailadres", dus dezelfde tokens als .rvo-label. */
.user-mgmt__roles-fieldset .rvo-form-fieldset__legend {
  padding: 0;
  margin: 0;
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-medium);
  line-height: var(--primitives-line-height-snug);
}

.user-mgmt__roles-fieldset .rvo-form-field__description {
  margin-block: var(--primitives-space-4) var(--primitives-space-8);
  color: var(--invulhulp-color-text-subtle);
}

.user-mgmt__roles {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
}

.user-mgmt__role-check {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-8);
  white-space: nowrap;
}

.user-mgmt__all-forms {
  display: block;
  margin-block-start: var(--primitives-space-4);
  font-size: var(--primitives-font-size-80);
  color: var(--invulhulp-color-text-subtle);
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
  font-size: var(--primitives-font-size-90);
}

.user-mgmt__badge {
  display: inline-block;
  padding: 1px 10px;
  border-radius: 999px;
  font-size: var(--primitives-font-size-80);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  background: var(--semantics-surfaces-tinted-background-color);
  color: var(--semantics-content-accent-color);
  white-space: nowrap;
}

.user-mgmt__badge--admin {
  background: var(--semantics-content-accent-color);
  color: var(--semantics-surfaces-base-background-color);
}

.user-mgmt__badge--active {
  background: var(--semantics-categories-success-tinted-background-color, #e1eddb);
  color: var(--semantics-content-success-color, #39870c);
}

.user-mgmt__badge--off {
  background: var(--semantics-dividers-color, #e6e6e6);
  color: var(--semantics-content-secondary-color, #696969);
}

.user-mgmt__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--primitives-space-4);
}

.user-mgmt__danger {
  color: var(--semantics-content-critical-color, #d52b1e) !important;
}

.user-mgmt__temp-pw {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--primitives-space-16);
  flex-wrap: wrap;
}

.user-mgmt__temp-pw-actions {
  display: inline-flex;
  gap: var(--primitives-space-8);
  flex-shrink: 0;
}

.user-mgmt__pw-code {
  display: inline-block;
  margin-inline-start: var(--primitives-space-8);
  padding: 1px 8px;
  background: rgb(0 0 0 / 0.06);
  border-radius: var(--primitives-corner-radius-sm);
  font-weight: var(--primitives-font-weight-body-bold);
  user-select: all;
}
</style>
