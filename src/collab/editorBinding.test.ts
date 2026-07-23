// @vitest-environment jsdom
/**
 * Proves the load-bearing behavior of the editor↔fragment binding: a Tiptap
 * editor created with the Collaboration extension bound to a Y.XmlFragment that
 * ALREADY has content renders that content on init. This is exactly what a fresh
 * collaborator's editor must do when it opens a form another user has filled in.
 * (UI navigation tests kept opening different forms; this is deterministic.)
 */
import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Collaboration } from '@tiptap/extension-collaboration'
import { getTextFragment, writeTextFragment } from './ydocCodec'

describe('editor binds to a pre-populated fragment', () => {
  it('renders existing fragment content on creation (fresh collaborator)', () => {
    // A shared doc whose answer fragment already holds content (as if synced
    // from the room / hydrated from IndexedDB before this editor mounted).
    const doc = new Y.Doc()
    const fragment = getTextFragment(doc, 'intake', 'q1')
    writeTextFragment(fragment, '<p>Al ingevuld door een collega</p>')
    expect(fragment.length).toBe(1) // sanity: fragment has content

    const editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ fragment }),
      ],
    })

    expect(editor.getText()).toContain('Al ingevuld door een collega')
    expect(editor.getHTML()).toContain('<p>Al ingevuld door een collega</p>')
    editor.destroy()
  })

  it('reflects a later fragment update into the editor (live sync)', () => {
    const doc = new Y.Doc()
    const fragment = getTextFragment(doc, 'intake', 'q2')
    const editor = new Editor({
      extensions: [StarterKit.configure({ undoRedo: false }), Collaboration.configure({ fragment })],
    })
    expect(editor.getText()).toBe('')

    // A remote edit arrives after the editor exists.
    writeTextFragment(fragment, '<p>Live toegevoegd</p>')
    expect(editor.getText()).toContain('Live toegevoegd')
    editor.destroy()
  })
})
