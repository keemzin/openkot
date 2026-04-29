import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { indentOnInput, bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';

// Languages
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { cpp } from '@codemirror/lang-cpp';

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSave?: () => void;
  fileName: string;
  wordWrap?: boolean;
  jumpToLine?: number; // 0-indexed line to scroll to on mount
}

export interface CodeEditorRef {
  undo: () => void;
  redo: () => void;
}

const wrapCompartment = new Compartment();

// Highlight style using CSS variables — adapts to any theme
const themedHighlight = HighlightStyle.define([
  { tag: tags.keyword,              color: 'var(--accent)',  fontWeight: 'bold' },
  { tag: tags.operator,             color: 'var(--blue)' },
  { tag: tags.string,               color: 'var(--green)' },
  { tag: tags.number,               color: 'var(--orange)' },
  { tag: tags.bool,                 color: 'var(--orange)' },
  { tag: tags.null,                 color: 'var(--orange)' },
  { tag: tags.comment,              color: 'var(--text-4)', fontStyle: 'italic' },
  { tag: tags.lineComment,          color: 'var(--text-4)', fontStyle: 'italic' },
  { tag: tags.blockComment,         color: 'var(--text-4)', fontStyle: 'italic' },
  { tag: tags.function(tags.variableName), color: 'var(--blue)' },
  { tag: tags.function(tags.propertyName), color: 'var(--blue)' },
  { tag: tags.className,            color: 'var(--blue)' },
  { tag: tags.typeName,             color: 'var(--blue)' },
  { tag: tags.propertyName,         color: 'var(--text-2)' },
  { tag: tags.variableName,         color: 'var(--text-2)' },
  { tag: tags.attributeName,        color: 'var(--green)' },
  { tag: tags.attributeValue,       color: 'var(--green)' },
  { tag: tags.tagName,              color: 'var(--accent)' },
  { tag: tags.punctuation,          color: 'var(--text-3)' },
  { tag: tags.bracket,              color: 'var(--text-3)' },
  { tag: tags.regexp,               color: 'var(--red)' },
  { tag: tags.escape,               color: 'var(--red)' },
  { tag: tags.inserted,             color: 'var(--green)' },
  { tag: tags.deleted,              color: 'var(--red)' },
  { tag: tags.changed,              color: 'var(--orange)' },
  { tag: tags.meta,                 color: 'var(--text-4)' },
  { tag: tags.strong,               fontWeight: 'bold' },
  { tag: tags.emphasis,             fontStyle: 'italic' },
  { tag: tags.link,                 color: 'var(--blue)', textDecoration: 'underline' },
  { tag: tags.heading,              color: 'var(--text)', fontWeight: 'bold' },
]);

export const CodeEditor = forwardRef<CodeEditorRef, Props>(({ value, onChange, onSave, fileName, wordWrap = false, jumpToLine }, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useImperativeHandle(ref, () => ({
    undo: () => {
      if (viewRef.current) undo(viewRef.current);
    },
    redo: () => {
      if (viewRef.current) redo(viewRef.current);
    }
  }));

  const getLanguage = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js': case 'ts': case 'jsx': case 'tsx': return javascript();
      case 'py': return python();
      case 'rs': return rust();
      case 'md': return markdown();
      case 'json': return json();
      case 'html': return html();
      case 'cpp': case 'c': case 'h': case 'hpp': return cpp();
      default: return [];
    }
  };

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(themedHighlight, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab,
          {
            key: 'Mod-s',
            run: () => {
              onSave?.();
              return true;
            }
          }
        ]),
        getLanguage(fileName),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && viewRef.current) {
            const newContent = viewRef.current.state.doc.toString();
            console.log('CodeMirror update, new content length:', newContent.length);
            onChange(newContent);
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)' },
          '&.cm-focused': { outline: 'none' },
          '.cm-gutters': { 
            backgroundColor: 'var(--bg-2)', 
            color: 'var(--text-4)', 
            border: 'none',
            borderRight: '1px solid var(--bg-3)'
          },
          '.cm-activeLineGutter': { backgroundColor: 'var(--bg-3)', color: 'var(--text-2)' },
          '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.03)' },
          '.cm-cursor': { borderLeftColor: 'var(--accent)' },
          '.cm-selectionBackground, ::selection': { backgroundColor: 'rgba(237, 180, 73, 0.2) !important' },
        }, { dark: true })
      ]
    });

    const view = new EditorView({
      state,
      parent: editorRef.current
    });

    viewRef.current = view;

    // Jump to line if specified
    if (jumpToLine !== undefined && jumpToLine !== null) {
      setTimeout(() => {
        const v = viewRef.current;
        if (!v) return;
        const line = Math.min(jumpToLine + 1, v.state.doc.lines); // clamp
        const lineObj = v.state.doc.line(line);
        v.dispatch({ selection: { anchor: lineObj.from }, scrollIntoView: true });
        v.focus();
      }, 60);
    }

    return () => {
      view.destroy();
    };
  }, []);

  // Update line wrapping dynamically
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : [])
      });
    }
  }, [wordWrap]);

  // Update editor if value changes externally (not by user typing)
  useEffect(() => {
    if (viewRef.current && value !== viewRef.current.state.doc.toString()) {
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: value }
      });
    }
  }, [value]);

  return <div ref={editorRef} style={{ height: '100%', width: '100%' }} />;
});
