import { db, saveDoc, removeDoc, subscribeSyncStatus, mergeConflictRows } from '../tracker/db';
import type { JobDoc, MeasureDoc } from '../tracker/types';
import { start, update } from './ui.js';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Same worker as the tracker; this page needs its own scope to open with no signal.
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}tracker-sw.js`, { scope: `${import.meta.env.BASE_URL}handrail-measure.html` })
    .catch((err) => console.error('ServiceWorker registration failed: ', err));
}

window.addEventListener('unhandledrejection', (e) => {
  alert(`Something went wrong, so your last change may not be saved: ${e.reason?.message ?? e.reason}`);
});

async function reload() {
  const [measures, jobs] = await Promise.all(
    ['measure:', 'job:'].map((p) => db.allDocs({ include_docs: true, conflicts: true, startkey: p, endkey: `${p}￰` })),
  );
  mergeConflictRows([...measures!.rows, ...jobs!.rows]);
  update(
    measures!.rows.map((r) => r.doc as unknown as MeasureDoc),
    jobs!.rows.map((r) => r.doc as unknown as JobDoc),
  );
}

start({ save: (id, change) => saveDoc<MeasureDoc>(id, change), remove: removeDoc, onSyncStatus: subscribeSyncStatus, refresh: reload });
db.changes({ since: 'now', live: true }).on('change', reload);
reload();
