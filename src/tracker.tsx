import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { TrackerApp } from './tracker/TrackerApp';

// Register service worker only in production
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}tracker-sw.js`, {
        scope: `${import.meta.env.BASE_URL}tracker`,
      })
      .catch((err) => {
        console.error('ServiceWorker registration failed: ', err);
      });
  });
}

// Saves run from click handlers nobody awaits; say so when one fails instead of losing it quietly.
window.addEventListener('unhandledrejection', (e) => {
  alert(`Something went wrong, so your last change may not be saved: ${e.reason?.message ?? e.reason}`);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrackerApp />
  </StrictMode>
);
