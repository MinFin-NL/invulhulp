/**
 * URN-conventie voor formulieren.
 *
 * Elk formulier draagt een stabiele identifier in dezelfde vorm die het
 * task-registry van MinBZK voor zijn instrumenten hanteert:
 *
 *     urn:nl:<authority>:<registry>:<instrument>:<major>.<minor>
 *
 * Upstream pint `schemas/schema_instruments.json` dat vast op
 * `^urn:nl:aivt:tr:[a-z]+:[0-9]+\.[0-9]+` — authority `aivt`, registry `tr`.
 * Deze tool mint in de authority van de uitgevende organisatie (`minfin`,
 * registry `tr`), zodat de identifiers dezelfde vorm hebben en naast elkaar
 * kunnen bestaan zonder in andermans naamruimte te schrijven:
 *
 *     urn:nl:minfin:tr:dpia:3.0
 *
 * Het instrument-segment is het formulier-id, het versiesegment de `version`
 * van het formulier. Formulieren die nog niet bestaan (placeholders in
 * index.json) staan op 0.1.
 *
 * Implementeert een formulier een instrument dat *wel* in het task-registry
 * staat, dan verwijst `registryUrn` daarnaartoe (bijv. urn:nl:aivt:tr:iama:1.0).
 * Herkomst blijft daarmee zichtbaar zonder de twee identiteiten te verwarren.
 *
 * Zie https://github.com/MinBZK/task-registry.
 */

/** Vorm van een URN in dit systeem — bewust identiek aan het upstream-patroon,
 *  alleen met vrije authority en registry. */
const FORM_URN_PATTERN = /^urn:nl:[a-z]+:[a-z]+:[a-z]+:[0-9]+\.[0-9]+$/

/** Onze eigen authority + registry. */
export const FORM_URN_AUTHORITY = 'minfin'
export const FORM_URN_REGISTRY = 'tr'

/** Versiesegment voor aangekondigde formulieren die nog geen JSON hebben. */
export const PLACEHOLDER_URN_VERSION = '0.1'

export function isFormUrn(urn: string): boolean {
  return FORM_URN_PATTERN.test(urn)
}

/** Bouwt de URN voor een formulier-id + versie. Gooit bij een id of versie die
 *  niet in de conventie past, zodat een typo bij het toevoegen van een
 *  formulier meteen opvalt in plaats van een stille lege identifier op te
 *  leveren. */
export function buildFormUrn(id: string, version: string): string {
  const urn = `urn:nl:${FORM_URN_AUTHORITY}:${FORM_URN_REGISTRY}:${id}:${version}`
  if (!isFormUrn(urn)) {
    throw new Error(
      `Ongeldige formulier-URN "${urn}" — id moet [a-z]+ zijn en versie <major>.<minor>`,
    )
  }
  return urn
}

/** De onderdelen van een URN, of null als hij niet aan de conventie voldoet. */
export function parseFormUrn(
  urn: string,
): { authority: string; registry: string; instrument: string; version: string } | null {
  if (!isFormUrn(urn)) return null
  const [, , authority, registry, instrument, version] = urn.split(':')
  return { authority, registry, instrument, version }
}
