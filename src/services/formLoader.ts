import type { FormConfig, CrossFormMapping, Question, Section } from '../models/Assessment'
import type { ApplicabilityRule } from '../utils/toepassingsscan'
import { useAuthStore } from '../stores/authStore'

const cache = new Map<string, FormConfig>()
let mappingsCache: CrossFormMapping[] | null = null

// The form registry and definitions live at stable URLs, so a browser that
// cached them before nginx sent Cache-Control keeps serving its own copy —
// new bundle, old form data, every form under "Niet ingedeeld". Server headers
// don't apply retroactively to an already-stored entry, so ask the fetch layer
// to revalidate: 'no-cache' still uses the cache, it just always checks with
// the server first (a cheap 304 when nothing changed).
const REVALIDATE: RequestInit = { cache: 'no-cache' }

export async function loadForm(id: string): Promise<FormConfig> {
  if (cache.has(id)) return cache.get(id)!
  const res = await fetch(`/forms/${id}.json`, REVALIDATE)
  if (!res.ok) throw new Error(`Form not found: ${id}`)
  const config = await res.json() as FormConfig
  cache.set(id, config)
  return config
}

/** Subject domain of a form. Orthogonal to `track` (which is the lifecycle
 *  phase): a form is shown under one track but can touch several domains. */
export type FormDomain = 'privacy' | 'beveiliging' | 'ai' | 'data' | 'project'

/**
 * Een aangekondigd formulier dat nog niet bestaat. `gepland` = komt er, staat op
 * de roadmap; `onzeker` = het is nog niet besloten of dit formulier er komt.
 * Zulke entries hebben geen JSON-bestand: ze zijn alleen een tegel op het
 * dossieroverzicht en tellen nergens in mee.
 */
export type FormPlaceholder = 'gepland' | 'onzeker'

export interface FormIndexEntry {
  id: string
  // Stable identifier of the form, in task-registry shape — see
  // src/utils/formUrn.ts. Placeholders carry one too (version 0.1) so an
  // announced instrument already has a name to refer to.
  urn?: string
  // The official MinBZK task-registry URN of the instrument this form
  // implements, when it exists there.
  registryUrn?: string
  title: string
  track?: string
  order?: number
  domains?: FormDomain[]
  shortDescription?: string
  placeholder?: FormPlaceholder
  // When this form applies to a dossier, expressed over the kenmerken the
  // toepassingsscan derives. Absent ⇒ the form always applies. See
  // src/utils/toepassingsscan.ts and docs/toepasselijkheid-van-formulieren.md.
  applicability?: ApplicabilityRule
  // The department or body this form is for: who assesses, approves or decides
  // on it. Only filled where the form's own source says so; 'TODO' marks an
  // owner nobody has confirmed yet (see OWNER_UNKNOWN).
  owner?: string
}

/** The placeholder for an owner that is not recorded in any source yet. */
export const OWNER_UNKNOWN = 'TODO'

/**
 * Een rol die het formulierenaanbod inperkt. De rol-id is de realm-rol in
 * Keycloak (zie APP_ROLES in backend/auth.py); `forms` is de lijst formulieren
 * die iemand met die rol te zien krijgt.
 *
 * Dit is bewust een expliciete lijst per rol en geen afgeleide van `domains`:
 * een projectleider loopt formulieren uit vijf domeinen door, dus het domein
 * is hier niet de juiste korrel. Zie docs/rollen-en-rechten-advies.md §7.
 */
export interface FormRole {
  id: string
  title: string
  description?: string
  forms: string[]
}

let rolesCache: FormRole[] | null = null

/** De rollen die het aanbod inperken, in registratievolgorde. */
export async function loadFormRoles(): Promise<FormRole[]> {
  if (!rolesCache) await fetchRegistry()
  return rolesCache ?? []
}

async function fetchRegistry(): Promise<FormIndexEntry[]> {
  const res = await fetch('/forms/index.json', REVALIDATE)
  if (!res.ok) throw new Error('Could not load form index')
  const raw = await res.json() as { forms: FormIndexEntry[]; roles?: FormRole[] }
  rolesCache = raw.roles ?? []
  return raw.forms.map((f) => ({ id: f.id, urn: f.urn, registryUrn: f.registryUrn, title: f.title ?? f.id, track: f.track, order: f.order, domains: f.domains, shortDescription: f.shortDescription, placeholder: f.placeholder, applicability: f.applicability, owner: f.owner }))
}

/**
 * Het aanbod voor iemand met deze realm-rollen.
 *
 * Heeft de gebruiker géén van de rollen die het aanbod inperken, dan ziet hij
 * alles — dat is de bestaande situatie en blijft de standaard. Heeft hij er wel
 * één (of meer), dan ziet hij de vereniging van die rollen: een rol geeft, hij
 * neemt niet af van een andere rol.
 *
 * Onbekende ids in `forms` worden genegeerd; dat is een typo in index.json en
 * mag geen leeg scherm opleveren.
 */
export function scopeFormsToRoles(
  entries: FormIndexEntry[],
  roles: FormRole[],
  userRoles: string[] | undefined,
): FormIndexEntry[] {
  const active = roles.filter((r) => userRoles?.includes(r.id))
  if (active.length === 0) return entries
  const allowed = new Set(active.flatMap((r) => r.forms))
  return entries.filter((f) => allowed.has(f.id))
}

/** The registry as it stands, placeholders included. Only the dossier overview
 *  wants these — everything that counts, opens or scans forms wants
 *  `loadAvailableForms()` instead.
 *
 *  Het resultaat is al ingeperkt op de rollen van de ingelogde gebruiker: dit
 *  is het enige punt waar het aanbod de app in komt, dus filteren we hier in
 *  plaats van in elk scherm apart. */
export async function loadFormRegistry(): Promise<FormIndexEntry[]> {
  const entries = await fetchRegistry()
  return scopeFormsToRoles(entries, rolesCache ?? [], useAuthStore().user?.roles)
}

/** The forms that actually exist and can be opened. Placeholders are left out:
 *  they have no JSON, so counting or fetching them would only produce holes. */
export async function loadAvailableForms(): Promise<FormIndexEntry[]> {
  return (await loadFormRegistry()).filter((f) => !f.placeholder)
}

export async function loadCrossFormMappings(): Promise<CrossFormMapping[]> {
  if (mappingsCache) return mappingsCache
  const res = await fetch('/forms/crossFormMappings.json', REVALIDATE)
  mappingsCache = res.ok ? (await res.json() as CrossFormMapping[]) : []
  return mappingsCache
}

export function getCachedForm(id: string): FormConfig | undefined {
  return cache.get(id)
}

export function flattenFormQuestions(form: FormConfig): Question[] {
  return form.sections.flatMap((s) => s.subsections.flatMap((ss) => ss.questions))
}

/** Whether AI Modus may write an answer here. Sections (and single questions)
 *  can opt out with `aiFill: false` — used for parts another party fills in,
 *  where generated text would be mistaken for that party's own judgement. */
export function isAiFillable(question: Question, section: Section): boolean {
  return section.aiFill !== false && question.aiFill !== false
}

/** The questions AI Modus is allowed to answer, in form order. */
export function aiFillableQuestions(form: FormConfig): Question[] {
  return form.sections.flatMap((s) =>
    s.subsections.flatMap((ss) => ss.questions.filter((q) => isAiFillable(q, s))),
  )
}
