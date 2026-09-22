// @vitest-environment jsdom
/**
 * The type-to-confirm gate on ConfirmDialog — the only thing standing between
 * a stray click and an irreversible delete (dossier or user account). Worth a
 * test on its own: a regression here is silent, and the damage is unrecoverable.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { createApp, nextTick } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'

// nldd-modal-dialog is niet geregistreerd in jsdom — de modal-mechanica is hier
// niet wat we testen, alleen de gate erbinnen. De stub volgt de echte API:
// show()/hide(), en `close` op de host zodra hij dicht is (ook na Esc).
beforeAll(() => {
  if (!customElements.get('nldd-modal-dialog')) {
    customElements.define('nldd-modal-dialog', class extends HTMLElement {
      show() { this.setAttribute('open', '') }
      hide() {
        this.removeAttribute('open')
        this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }))
      }
    })
  }
})

const mounted: (() => void)[] = []

function mount(props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(ConfirmDialog, props)
  const vm = app.mount(host) as unknown as { open: (initial?: string) => Promise<void> }
  mounted.push(() => {
    app.unmount()
    host.remove()
  })
  return { host, vm }
}

afterEach(() => {
  while (mounted.length) mounted.pop()!()
})

// The fields and buttons are NLDD custom elements. A value arrives as
// `$event.detail.value`. nldd-button is stubbed with a `disabled` property, as
// in the browser (where the real element is upgraded before mount), so Vue sets
// the property rather than a `disabled="false"` attribute.
beforeAll(() => {
  if (!customElements.get('nldd-button')) {
    customElements.define('nldd-button', class extends HTMLElement { disabled = false })
  }
})

async function type(host: HTMLElement, value: string) {
  const field = host.querySelector('nldd-banner nldd-text-field')!
  field.dispatchEvent(new CustomEvent('input', { detail: { value } }))
  await nextTick()
}

const confirmButton = (host: HTMLElement) =>
  host.querySelector<HTMLElement & { disabled: boolean }>('nldd-button[slot="actions"]')!

const modal = (host: HTMLElement) =>
  host.querySelector<HTMLElement & { hide(): void }>('nldd-modal-dialog')!

describe('ConfirmDialog met confirmPhrase', () => {
  it('houdt bevestigen geblokkeerd tot de naam exact is overgetypt', async () => {
    let confirmed = 0
    const { host, vm } = mount({
      title: 'Dossier verwijderen',
      confirmPhrase: 'Project Alfa',
      onConfirm: () => confirmed++,
    })
    await vm.open()

    expect(confirmButton(host).disabled).toBe(true)

    await type(host, 'Project')
    expect(confirmButton(host).disabled).toBe(true)

    await type(host, 'project alfa') // hoofdletters tellen mee
    expect(confirmButton(host).disabled).toBe(true)

    await type(host, '  Project Alfa  ') // randspaties niet
    expect(confirmButton(host).disabled).toBe(false)

    host.querySelector('form')!.dispatchEvent(new Event('submit'))
    expect(confirmed).toBe(1)
  })

  it('negeert een submit zolang de naam niet klopt', async () => {
    let confirmed = 0
    const { host, vm } = mount({
      title: 'Dossier verwijderen',
      confirmPhrase: 'Project Alfa',
      onConfirm: () => confirmed++,
    })
    await vm.open()
    await type(host, 'iets anders')

    // Enter in het tekstveld submit het formulier langs de :disabled-knop heen.
    host.querySelector('form')!.dispatchEvent(new Event('submit'))
    expect(confirmed).toBe(0)
  })

  it('reset het veld bij een volgende opening', async () => {
    const { host, vm } = mount({ title: 'Weg ermee', confirmPhrase: 'Project Alfa' })
    await vm.open()
    await type(host, 'Project Alfa')
    expect(confirmButton(host).disabled).toBe(false)

    modal(host).hide()
    await vm.open()
    expect(confirmButton(host).disabled).toBe(true)
  })

  it('laat een gewone bevestiging ongemoeid', async () => {
    let confirmed = 0
    const { host, vm } = mount({ title: 'Doorgaan?', onConfirm: () => confirmed++ })
    await vm.open()
    expect(confirmButton(host).disabled).toBe(false)
    confirmButton(host).click()
    expect(confirmed).toBe(1)
  })

  it('meldt Esc/backdrop als annuleren, maar een bevestiging niet', async () => {
    let confirmed = 0
    let cancelled = 0
    const { host, vm } = mount({
      title: 'Doorgaan?',
      onConfirm: () => confirmed++,
      onCancel: () => cancelled++,
    })
    await vm.open()
    modal(host).hide() // zoals Esc of een klik op de backdrop
    expect(cancelled).toBe(1)

    await vm.open()
    confirmButton(host).click()
    expect(confirmed).toBe(1)
    expect(cancelled).toBe(1)
  })
})
