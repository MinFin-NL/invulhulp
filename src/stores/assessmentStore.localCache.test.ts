/**
 * The browser cache (localStorage + IndexedDB) is per machine, not per user.
 * These tests pin down that another account never gets to see or push the
 * previous account's dossiers, and what survives a logout.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const saveDossier = vi.fn()
vi.mock('../services/dossierService', () => ({
  saveDossier: (...args: unknown[]) => saveDossier(...args),
  fetchDossiers: vi.fn().mockResolvedValue([]),
  deleteDossierOnServer: vi.fn().mockResolvedValue({}),
}))
vi.mock('../services/llmService', () => ({
  indexDocument: vi.fn(),
  deleteDocument: vi.fn(),
  deleteImage: vi.fn(),
  listDocuments: vi.fn().mockResolvedValue([]),
}))

import { useAssessmentStore } from './assessmentStore'

const alice = { sub: 'alice', email: 'Alice@example.nl' }
const bob = { sub: 'bob', email: 'bob@example.nl' }

function ownerView(id: string) {
  return { id, myRole: 'owner', ownerName: 'Alice', sharedWithMe: false }
}

describe('assessmentStore local cache', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    saveDossier.mockReset()
  })

  it('wipes the cache when a different account logs in', async () => {
    const s = useAssessmentStore()
    await s.adoptUser(alice)
    const id = s.createDossier('Geheim')
    await s.adoptUser(bob)
    expect(s.dossiers[id]).toBeUndefined()
    expect(s.dossierOrder).toEqual([])
    expect(s.cacheOwner).toEqual({ sub: 'bob', email: 'bob@example.nl' })
  })

  it('keeps the cache for the same person after a Keycloak reseed (new sub, same email)', async () => {
    const s = useAssessmentStore()
    await s.adoptUser(alice)
    const id = s.createDossier('Eigen')
    await s.adoptUser({ sub: 'alice-reseeded', email: 'alice@example.nl' })
    expect(s.dossiers[id]).toBeDefined()
  })

  it('adopts a cache that predates the owner binding', async () => {
    const s = useAssessmentStore()
    const id = s.createDossier('Oud')
    await s.adoptUser(bob)
    expect(s.dossiers[id]).toBeDefined()
  })

  it('records the role from the push response, so the dossier counts as synced', async () => {
    const s = useAssessmentStore()
    const id = s.createDossier('Nieuw')
    saveDossier.mockImplementation(async (p: { id: string }) => ownerView(p.id))
    expect(await s.flushPendingPushes()).toEqual([])
    expect(s.dossiers[id].myRole).toBe('owner')
  })

  it('on logout keeps only the dossiers that could not be saved', async () => {
    const s = useAssessmentStore()
    await s.adoptUser(alice)
    s.createDossier('Opgeslagen')
    const failed = s.createDossier('Offline')
    saveDossier.mockImplementation(async (p: { id: string }) => {
      if (p.id === failed) throw new TypeError('Failed to fetch')
      return ownerView(p.id)
    })
    const unsaved = await s.flushPendingPushes()
    expect(unsaved).toEqual([failed])
    await s.clearLocalData(unsaved)
    expect(Object.keys(s.dossiers)).toEqual([failed])
    // Still bound to Alice: Bob logging in next wipes it.
    expect(s.cacheOwner?.sub).toBe('alice')
    await s.adoptUser(bob)
    expect(s.dossiers[failed]).toBeUndefined()
  })

  it('retries a failed push at logout', async () => {
    const s = useAssessmentStore()
    const id = s.createDossier('Eerst mislukt')
    saveDossier.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await s.flushPendingPushes()
    saveDossier.mockImplementation(async (p: { id: string }) => ownerView(p.id))
    expect(await s.flushPendingPushes()).toEqual([])
    expect(saveDossier).toHaveBeenCalledTimes(2)
    expect(s.dossiers[id].myRole).toBe('owner')
  })
})
