import { useCallback, useEffect, useRef } from 'react';
import type { Monaco, OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { findNodeAtPosition } from '../../core/astUtils';
import type { ASTNode, ParseResult } from '../../types/ast';

export function useEditorBridge(
  parseResult: ParseResult | null,
  onNodeAtCursor: (node: ASTNode | null) => void
) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const mount: OnMount = useCallback((instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
    monaco.editor.defineTheme('arbora-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '059669', fontStyle: 'bold' },
        { token: 'type', foreground: '047857' },
        { token: 'string', foreground: '6366F1' },
        { token: 'number', foreground: '0284C7' },
        { token: 'comment', foreground: 'A8A29E', fontStyle: 'italic' },
        { token: 'delimiter', foreground: '78716C' },
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#1C1917',
        'editorLineNumber.foreground': '#A8A29E',
        'editorLineNumber.activeForeground': '#059669',
        'editor.selectionBackground': '#E7E5E4',
        'editor.inactiveSelectionBackground': '#F5F5F4',
        'editorCursor.foreground': '#059669',
      },
    });
    monaco.editor.setTheme('arbora-light');
  }, []);

  const jumpToLocation = useCallback((line: number, column: number) => {
    const instance = editorRef.current;
    if (!instance) return;
    const position = { lineNumber: Math.max(1, line), column: Math.max(1, column) };
    instance.revealPositionInCenter(position);
    instance.setPosition(position);
    instance.focus();
  }, []);

  const selectNode = useCallback((node: ASTNode | null) => {
    if (!node?.span) return;
    const instance = editorRef.current;
    if (!instance) return;
    const { startLine, startCol, endLine, endCol } = node.span;
    const range = new monacoRef.current!.Range(
      startLine, startCol, Math.max(startLine, endLine), Math.max(startCol + 1, endCol)
    );
    instance.revealRangeInCenter(range);
    instance.setSelection(range);
    instance.focus();
  }, []);

  useEffect(() => {
    const instance = editorRef.current;
    const monaco = monacoRef.current;
    const model = instance?.getModel();
    if (!instance || !monaco || !model) return;
    const errors = parseResult?.errors ?? [];
    const markers: editor.IMarkerData[] = errors.map((error) => ({
      severity: error.severity === 'warning'
        ? monaco.MarkerSeverity.Warning
        : error.severity === 'info' ? monaco.MarkerSeverity.Info : monaco.MarkerSeverity.Error,
      message: error.message,
      startLineNumber: Math.max(1, error.line || 1),
      startColumn: Math.max(1, error.column || 1),
      endLineNumber: Math.max(1, error.line || 1),
      endColumn: Math.max(1, error.column || 1) + Math.max(1, (error.found || '').length),
      source: 'MiniC',
    }));
    monaco.editor.setModelMarkers(model, 'minic-parser', markers);
  }, [parseResult]);

  useEffect(() => {
    const instance = editorRef.current;
    if (!instance || !parseResult?.ast) return;
    const subscription = instance.onDidChangeCursorPosition(({ position }) => {
      onNodeAtCursor(findNodeAtPosition(parseResult.ast, position.lineNumber, position.column));
    });
    return () => subscription.dispose();
  }, [parseResult, onNodeAtCursor]);

  return { editorRef, mount, jumpToLocation, selectNode };
}
