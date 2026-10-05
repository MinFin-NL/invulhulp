import { describe, it, expect } from 'vitest'
import { parseHash, serialize, type AppLocation } from './useAppHistory'

const base: AppLocation = {
  admin: false,
  screen: 'dossierList',
  dossierId: null,
  formId: null,
  view: null,
  dossierView: null,
}

describe('useAppHistory locatie-encoding', () => {
  it('serialiseert elk scherm naar een hash en leest die weer terug', () => {
    const locations: AppLocation[] = [
      base,
      { ...base, admin: true },
      { ...base, screen: 'dossier', dossierId: 'd-1', dossierView: 'overzicht' },
      { ...base, screen: 'dossier', dossierId: 'd-1', dossierView: 'project' },
      { ...base, screen: 'dossier', dossierId: 'd-1', dossierView: 'formulieren' },
      { ...base, screen: 'dossier', dossierId: 'd-1', dossierView: 'bronnen' },
      { ...base, screen: 'dossier', dossierId: 'd-1', formId: 'intake', view: null },
      { ...base, screen: 'dossier', dossierId: 'd-1', formId: 'intake', view: 'summary' },
    ]
    for (const loc of locations) {
      expect(parseHash(serialize(loc))).toEqual(loc)
    }
  })

  it('codeert id’s die schuine strepen bevatten', () => {
    const loc: AppLocation = {
      ...base,
      screen: 'dossier',
      dossierId: 'd/1',
      formId: 'urn:nl/intake',
      view: 'deel a',
    }
    expect(parseHash(serialize(loc))).toEqual(loc)
  })

  it('houdt de kale dossierlink op het overzicht', () => {
    expect(serialize({ ...base, screen: 'dossier', dossierId: 'd-1', dossierView: 'overzicht' })).toBe('#/dossier/d-1')
    expect(parseHash('#/dossier/d-1')?.dossierView).toBe('overzicht')
    // Een onbekende weergave is geen reden om de link te weigeren.
    expect(parseHash('#/dossier/d-1/bestaat-niet')?.dossierView).toBe('overzicht')
  })

  it('geeft null bij een lege of onbekende hash', () => {
    expect(parseHash('')).toBeNull()
    expect(parseHash('#')).toBeNull()
    expect(parseHash('#/iets-anders')).toBeNull()
    // Een dossier-hash zonder id is onbruikbaar.
    expect(parseHash('#/dossier')).toBeNull()
  })
})
