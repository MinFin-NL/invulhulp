/**
 * URN-conventie voor formulieren.
 *
 * Elk formulier draagt de URN van het instrument in het instrument-registry van
 * MinBZK (https://github.com/MinBZK/instrument-registry), de bron van de
 * vraaginhoud:
 *
 *     urn:nl:<organisatie>:ir:<instrument>:<versie>
 *
 * bijvoorbeeld `urn:nl:minfin:ir:quickscan:2.0` of `urn:nl:minbzk:ir:dpia:3.0`.
 * De organisatie is de eigenaar van het instrument, `ir` staat voor instrument
 * registry en de versie is het `version`-veld van het document. Het patroon is
 * een kopie van `instrument_registry/urn.py` upstream.
 *
 * De URN komt uit het registry, niet uit ons formulier-id: het instrument kan
 * daar anders heten (onze `prescandpia` is `urn:nl:minbzk:ir:prescan:2.0`). Bij
 * een registry-formulier zet `npm run forms:build` hem in de JSON; index.json
 * herhaalt hem en `formUrn.test.ts` bewaakt dat ze gelijk blijven.
 *
 * Aangekondigde formulieren die nog niet in het registry staan (placeholders in
 * index.json) krijgen alvast een naam in onze eigen organisatie, op versie 0.1.
 *
 * `registryUrn` is iets anders: de URN van het instrument in het
 * *task-registry* van het AI-validatieteam (urn:nl:aivt:tr:…), voor de
 * formulieren die daar een tegenhanger hebben.
 */

/** Vorm van een instrument-URN — identiek aan `PATTERN` in urn.py upstream. */
const FORM_URN_PATTERN =
  /^urn:nl:([a-z]+):ir:([a-z0-9]+(?:-[a-z0-9]+)*):(\d+(?:\.\d+){0,2})$/

/** De organisatie waarin wij placeholders een naam geven. */
export const FORM_URN_ORGANISATION = 'minfin'

/** Versiesegment voor aangekondigde formulieren die nog geen JSON hebben. */
export const PLACEHOLDER_URN_VERSION = '0.1'

export function isFormUrn(urn: string): boolean {
  return FORM_URN_PATTERN.test(urn)
}

/** Bouwt een instrument-URN. Gooit bij een segment dat niet in de conventie
 *  past, zodat een typo meteen opvalt in plaats van een stille ongeldige
 *  identifier op te leveren. */
export function buildFormUrn(organisation: string, instrument: string, version: string): string {
  const urn = `urn:nl:${organisation}:ir:${instrument}:${version}`
  if (!isFormUrn(urn)) {
    throw new Error(
      `Ongeldige instrument-URN "${urn}" — organisatie [a-z]+, instrument [a-z0-9-], versie <major>[.<minor>[.<patch>]]`,
    )
  }
  return urn
}

/** De onderdelen van een URN, of null als hij niet aan de conventie voldoet. */
export function parseFormUrn(
  urn: string,
): { organisation: string; instrument: string; version: string } | null {
  const m = FORM_URN_PATTERN.exec(urn)
  if (!m) return null
  return { organisation: m[1], instrument: m[2], version: m[3] }
}
