/**
 * The facts a dossier is explained in once, and the questions that ask them
 * again (docs/werkplan-kompas.md §5, docs/systeemprofiel-feitenbasis.md §7).
 *
 * Two kinds, each with its own source:
 *
 * - a **scan fact** is a kenmerk the toepassingsscan establishes. It is
 *   offered as an answer only to questions that ask exactly that fact, with
 *   options that say exactly yes or no.
 * - a **voorblad fact** (project name, directorate, …) is typed once and read
 *   from the first form in its chain that has it. Every form that asks it
 *   again gets that answer as a proposal.
 *
 * Only the same fact counts — "minder overtypen, niet minder nadenken". A
 * question that asks something related (which personal data, does the dataset
 * contain any, is the processing proportionate) is not on this list, however
 * often the word comes up: a proposal there would be an answer nobody gave.
 *
 * In code rather than in public/forms on purpose, like the scan questions:
 * facts.test.ts checks every form and question id against the real form JSON,
 * so a renamed question breaks the build instead of silently dropping out.
 */
import type { KenmerkId } from '../utils/toepassingsscan'

export type FeitId =
  | 'persoonsgegevens'
  | 'naam_project'
  | 'directie_afdeling'
  | 'opdrachtgever'
  | 'contactpersoon'
  | 'opsteller'

/** A question in a form. */
export interface VraagRef {
  formId: string
  questionId: string
}

export interface ScanFeit {
  soort: 'scan'
  id: FeitId
  label: string
  kenmerk: KenmerkId
  /** The questions that ask exactly this, with the option that means yes and no. */
  vragen: (VraagRef & { ja: string; nee: string })[]
}

export interface VoorbladFeit {
  soort: 'voorblad'
  id: FeitId
  label: string
  /**
   * Where the fact is read from, in order: the first that has an answer wins.
   * The first one is also where the dossier page writes it.
   */
  bronnen: VraagRef[]
  /** Every question that asks this fact, the sources included. */
  vragen: VraagRef[]
}

export type FeitDefinitie = ScanFeit | VoorbladFeit

const q = (formId: string, questionId: string): VraagRef => ({ formId, questionId })

export const FEITEN: readonly FeitDefinitie[] = [
  {
    soort: 'scan',
    id: 'persoonsgegevens',
    label: 'Persoonsgegevens',
    kenmerk: 'persoonsgegevens',
    // Both ask "worden er persoonsgegevens verwerkt?" with a plain Ja/Nee — the
    // scan question in other words. Left out on purpose: the prescan's
    // "gewone persoonsgegevens" (narrower) and the Algoritmeregister's question,
    // whose two kinds of "Ja" the scan cannot choose between.
    vragen: [
      { ...q('quickscan', 'qs_d.persoonsgegevens'), ja: 'Ja', nee: 'Nee' },
      { ...q('aiia', '5.2.2'), ja: 'Ja', nee: 'Nee' },
    ],
  },
  {
    soort: 'voorblad',
    id: 'naam_project',
    label: 'Naam project',
    bronnen: [q('aanbiedingsformulier', 'aa_a.naam_project'), q('ppm', 'ppm_0.naam_project'), q('ihhtoets', 'ihh_a.naam_project')],
    vragen: [q('aanbiedingsformulier', 'aa_a.naam_project'), q('ppm', 'ppm_0.naam_project'), q('ihhtoets', 'ihh_a.naam_project')],
  },
  {
    soort: 'voorblad',
    id: 'directie_afdeling',
    label: 'Directie / afdeling',
    bronnen: [q('intake', 'intake_a.directie_afdeling'), q('aanbiedingsformulier', 'aa_a.directie_afdeling'), q('modelcard', 'mc_a.afdeling')],
    vragen: [q('intake', 'intake_a.directie_afdeling'), q('aanbiedingsformulier', 'aa_a.directie_afdeling'), q('modelcard', 'mc_a.afdeling')],
  },
  {
    soort: 'voorblad',
    id: 'opdrachtgever',
    label: 'Opdrachtgever',
    bronnen: [q('intake', 'intake_a.naam_opdrachtgever'), q('aanbiedingsformulier', 'aa_a.naam_opdrachtgever'), q('ihhtoets', 'ihh_a.opdrachtgever')],
    vragen: [q('intake', 'intake_a.naam_opdrachtgever'), q('aanbiedingsformulier', 'aa_a.naam_opdrachtgever'), q('ihhtoets', 'ihh_a.opdrachtgever')],
  },
  {
    soort: 'voorblad',
    id: 'contactpersoon',
    label: 'Contactpersoon',
    bronnen: [q('intake', 'intake_a.contactpersoon'), q('aanbiedingsformulier', 'aa_a.contactpersoon')],
    vragen: [q('intake', 'intake_a.contactpersoon'), q('aanbiedingsformulier', 'aa_a.contactpersoon')],
  },
  {
    soort: 'voorblad',
    id: 'opsteller',
    label: 'Opsteller (naam en functie)',
    bronnen: [q('quickscan', 'qs_a.opsteller'), q('euaiact', 'eaa_a.opsteller')],
    vragen: [q('quickscan', 'qs_a.opsteller'), q('euaiact', 'eaa_a.opsteller')],
  },
]
