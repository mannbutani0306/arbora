import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

loader.config({ monaco });
Object.assign(self, {
  MonacoEnvironment: {
    getWorker: () => new EditorWorker(),
  },
});
