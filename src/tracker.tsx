import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { TrackerApp } from './tracker/TrackerApp';
import { alertUnhandled } from './tracker/unhandled';

// Register service worker only in production
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // A scope is a URL prefix, so the measure page needs its own registration to open offline.
    for (const scope of ['tracker', 'handrail-measure.html']) {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}tracker-sw.js`, {
          scope: `${import.meta.env.BASE_URL}${scope}`,
        })
        .catch((err) => {
          console.error('ServiceWorker registration failed: ', err);
        });
    }
  });
}

window.addEventListener('unhandledrejection', alertUnhandled);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrackerApp />
  </StrictMode>
);
