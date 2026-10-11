import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import { installGlobalErrorHandlers } from './lib/observability';
import './index.css';

installGlobalErrorHandlers();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      if (import.meta.env.DEV) console.error('Offline app shell could not be registered.', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
