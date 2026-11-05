import { basicSetup } from 'codemirror';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { json } from '@codemirror/lang-json';
import { EditorView, keymap } from '@codemirror/view';

interface JsonEditorOptions {
  parent: HTMLElement;
  source?: string;
  label: string;
  onChange: (source: string) => void;
  onRun: () => void;
}

export function createJsonEditor({ parent, source, label, onChange, onRun }: JsonEditorOptions) {
  return new EditorView({
    parent,
    doc: source ?? '',
    extensions: [
      keymap.of([{ key: 'Mod-Enter', run: () => { onRun(); return true; } }]),
      basicSetup,
      EditorView.theme({
        '&': { color: 'var(--foreground)', backgroundColor: 'var(--background)' },
        '.cm-scroller': { fontFamily: 'var(--site-mono)', fontSize: 'var(--site-text-code)', lineHeight: 'var(--site-leading-code)' },
        '.cm-content': { caretColor: 'var(--foreground)', fontVariantLigatures: 'none', wordBreak: 'normal', overflowWrap: 'normal' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
        '.cm-gutters': { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', borderRight: '1px solid var(--border)' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--foreground) 5%, transparent)' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--foreground) 15%, transparent)' },
        '.cm-panels, .cm-tooltip': { backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', borderColor: 'var(--border)' },
      }),
      json(),
      syntaxHighlighting(HighlightStyle.define([
        { tag: tags.propertyName, color: 'var(--code-key)' },
        { tag: tags.string, color: 'var(--code-string)' },
        { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-value)' },
      ])),
      EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) onChange(update.state.doc.toString());
      }),
    ],
  });
}
