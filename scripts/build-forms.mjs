#!/usr/bin/env node
/**
 * build-forms.mjs — regenerate public/forms/<id>.json from the vendored
 * MinBZK/instrument-registry release plus our overlays.
 *
 *   npm run forms:build              # every form in scripts/registry-map.json
 *   npm run forms:build -- dpia ppm  # only these
 *
 * Two routes, chosen per form in scripts/registry-map.json:
 *   merged    — registry YAML with references.invulhulp back-links (the MinFin
 *               instruments): scripts/lib/merge-form.mjs, lossless, our question
 *               ids and structure come from the overlay.
 *   generated — upstream instruments without back-links (dpia, iama,
 *               prescandpia): scripts/convert-form.mjs, which derives the
 *               structure from the YAML task tree.
 */
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { buildMergedForm } from './lib/merge-form.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/registry-map.json'), 'utf8'))

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(map.forms)
let failed = 0
for (const id of ids) {
  const file = map.forms[id]
  if (!file) {
    console.error(`[forms] ${id}: not in scripts/registry-map.json`)
    failed++
    continue
  }
  if (map.generated.includes(id)) {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/convert-form.mjs'), id], { stdio: 'inherit' })
    continue
  }
  try {
    const form = buildMergedForm(ROOT, id, file)
    fs.writeFileSync(path.join(ROOT, 'public/forms', `${id}.json`), JSON.stringify(form, null, 2) + '\n')
    console.log(`[forms] ${id} <- ${file}`)
  } catch (e) {
    console.error(`[forms] ${id}: ${e.message}`)
    failed++
  }
}
process.exit(failed ? 1 : 0)
