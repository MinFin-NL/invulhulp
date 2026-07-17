/**
 * Client for the server-side dossier store (/api/dossiers) and the user
 * search used by the share dialog (/api/users/search).
 *
 * Dossiers are pushed as a whole envelope (debounced from the store) and
 * pulled as a list on startup; grants (sharing rights) are managed with
 * dedicated calls and are never part of the PUT payload.
 */

import type { FormId, FormState } from '../stores/assessmentStore'

export type DossierRole = 'viewer' | 'editor' | 'owner'

export interface Grant {
  sub: string
  email: string | null
  name: string | null
  role: DossierRole
}

export interface ServerDossier {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  sessionId: string
  activeFormId: string | null
  forms: Record<FormId, FormState>
  ownerSub: string
  grants: Grant[]
  myRole: DossierRole
  ownerName: string | null
  sharedWithMe: boolean
}

export interface DossierPushPayload {
  id: string
  name: string
  createdAt: number
  updatedAt?: number
  sessionId: string
  activeFormId: string | null
  forms: Record<FormId, FormState>
}

export interface UserSearchResult {
  id: string
  name: string | null
  email: string | null
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
  } catch {
    // non-JSON error body
  }
  return `HTTP ${res.status}`
}

export async function fetchDossier(id: string): Promise<ServerDossier> {
  const res = await fetch(`/api/dossiers/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json() as Promise<ServerDossier>
}

export async function fetchDossiers(): Promise<ServerDossier[]> {
  const res = await fetch('/api/dossiers')
  if (!res.ok) throw new Error(await readErrorDetail(res))
  const data = (await res.json()) as { dossiers: ServerDossier[] }
  return data.dossiers
}

export async function saveDossier(payload: DossierPushPayload): Promise<ServerDossier> {
  const res = await fetch(`/api/dossiers/${encodeURIComponent(payload.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: payload.name,
      sessionId: payload.sessionId,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
      activeFormId: payload.activeFormId,
      forms: payload.forms,
    }),
  })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json() as Promise<ServerDossier>
}

export async function deleteDossierOnServer(id: string): Promise<void> {
  const res = await fetch(`/api/dossiers/${encodeURIComponent(id)}`, { method: 'DELETE' })
  // 404 = never synced to the server; nothing to clean up there.
  if (!res.ok && res.status !== 404) throw new Error(await readErrorDetail(res))
}

export async function setGrant(
  dossierId: string,
  sub: string,
  grant: { role: DossierRole; email?: string | null; name?: string | null },
): Promise<Grant[]> {
  const res = await fetch(
    `/api/dossiers/${encodeURIComponent(dossierId)}/grants/${encodeURIComponent(sub)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(grant),
    },
  )
  if (!res.ok) throw new Error(await readErrorDetail(res))
  const data = (await res.json()) as { grants: Grant[] }
  return data.grants
}

export async function removeGrant(dossierId: string, sub: string): Promise<Grant[]> {
  const res = await fetch(
    `/api/dossiers/${encodeURIComponent(dossierId)}/grants/${encodeURIComponent(sub)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) throw new Error(await readErrorDetail(res))
  const data = (await res.json()) as { grants: Grant[] }
  return data.grants
}

export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json() as Promise<UserSearchResult[]>
}
