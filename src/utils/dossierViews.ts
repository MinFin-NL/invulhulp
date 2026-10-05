/**
 * The four views of an open dossier. Each answers one question, so the page
 * never has to mix "what applies" with document management and AI actions
 * (docs/werkplan-kompas.md §3).
 */
export type DossierView = 'overzicht' | 'project' | 'formulieren' | 'bronnen'

export interface DossierViewMeta {
  id: DossierView
  label: string
}

/** In tab order. The first one is where a dossier opens. */
export const DOSSIER_VIEWS: readonly DossierViewMeta[] = [
  { id: 'overzicht', label: 'Overzicht' },
  { id: 'project', label: 'Project' },
  { id: 'formulieren', label: 'Formulieren' },
  { id: 'bronnen', label: 'Bronnen' },
]

export const DEFAULT_DOSSIER_VIEW: DossierView = 'overzicht'

export function isDossierView(value: unknown): value is DossierView {
  return DOSSIER_VIEWS.some((v) => v.id === value)
}
