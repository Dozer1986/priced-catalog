import PouchDB from 'pouchdb-browser';
import { useEffect, useState, useCallback } from 'react';
import type {
  TrackerDoc,
  SettingsDoc,
  JobDoc,
  EntryDoc,
  InvoiceDoc,
  SyncCredentials,
} from './types';
import { getLocalDateString } from './billing';

export const db = new PouchDB<TrackerDoc>('kamotec-time');

export const DEFAULT_SETTINGS: SettingsDoc = {
  _id: 'settings',
  type: 'settings',
  businessName: 'KAMOTec',
  defaultRate: 100,
  taxRate: 0.07,
  taxLabel: 'Indiana sales tax',
  paymentTerms: 'Payment due on receipt. Cash, check, Venmo or Zelle.',
};

const SYNC_STORAGE_KEY = 'kamotec_sync_creds';

export function getStoredSyncCredentials(): SyncCredentials | null {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.url === 'string' && typeof parsed.username === 'string' && typeof parsed.password === 'string') {
      return parsed;
    }
  } catch {
    // ignore json parse error
  }
  return null;
}

export function saveStoredSyncCredentials(creds: SyncCredentials): void {
  localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(creds));
  restartSync();
}

export function clearStoredSyncCredentials(): void {
  localStorage.removeItem(SYNC_STORAGE_KEY);
  restartSync();
}

let activeSync: PouchDB.Replication.Sync<TrackerDoc> | null = null;
let currentSyncStatus: string = getStoredSyncCredentials() ? 'Syncing…' : 'Sync not set up';
const syncListeners = new Set<(status: string) => void>();

function setSyncStatus(status: string) {
  currentSyncStatus = status;
  for (const listener of syncListeners) {
    listener(status);
  }
}

export function subscribeSyncStatus(listener: (status: string) => void): () => void {
  syncListeners.add(listener);
  listener(currentSyncStatus);
  return () => {
    syncListeners.delete(listener);
  };
}

export function restartSync(): void {
  if (activeSync) {
    activeSync.cancel();
    activeSync = null;
  }

  const creds = getStoredSyncCredentials();
  if (!creds || !creds.url.trim() || !creds.username.trim()) {
    setSyncStatus('Sync not set up');
    return;
  }

  setSyncStatus('Syncing…');

  try {
    const remote = new PouchDB<TrackerDoc>(creds.url, {
      auth: { username: creds.username, password: creds.password },
    });

    const sync = db.sync(remote, { live: true, retry: true });
    activeSync = sync;

    // Sync's own 'paused' event drops the error, so keep the pull side's to tell offline from
    // idle. Registered before sync.on('paused') so it runs first.
    let pullError: unknown = null;
    (sync as unknown as { pull: PouchDB.Replication.Replication<TrackerDoc> }).pull.on(
      'paused',
      (err) => {
        pullError = err;
      },
    );

    sync.on('active', () => {
      setSyncStatus('Syncing…');
    });

    sync.on('paused', () => {
      if (pullError) {
        setSyncStatus('Offline — saved on this device');
      } else {
        const timeStr = new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        setSyncStatus(`Synced ${timeStr}`);
      }
    });

    sync.on('denied', (err: { status?: number; message?: string }) => {
      if (err?.status === 401) {
        setSyncStatus('Sync error: login is wrong');
      } else {
        setSyncStatus(`Sync error: ${err?.message || 'access denied'}`);
      }
    });

    sync.on('error', (err: { status?: number; message?: string }) => {
      if (err?.status === 401) {
        setSyncStatus('Sync error: login is wrong');
      } else {
        setSyncStatus(`Sync error: ${err?.message || 'connection failed'}`);
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    setSyncStatus(`Sync error: ${msg}`);
  }
}

// Start sync if credentials exist on initial load
if (typeof window !== 'undefined' && getStoredSyncCredentials()) {
  restartSync();
}

// A phone app sits in the background for hours; sync as soon as it is opened again instead of
// waiting out PouchDB's retry back-off, which grows to 10 minutes.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && getStoredSyncCredentials()) restartSync();
});

/**
 * Writes `change(current)`. On a conflict (409: sync or another tap saved first) it reads the
 * doc again and re-applies `change`, so a save never overwrites a newer edit.
 * `change` returns undefined to skip the write (the doc is gone, or nothing to do).
 */
export async function saveDoc<T extends TrackerDoc>(
  id: string,
  change: (current: T | undefined) => T | undefined,
): Promise<void> {
  for (;;) {
    const current = await db.get(id).then(
      (doc) => doc as T,
      (err: { status?: number }) => {
        if (err.status === 404) return undefined;
        throw err;
      },
    );
    const next = change(current);
    if (!next) return;
    try {
      await db.put({ ...next, _rev: current?._rev } as TrackerDoc);
      return;
    } catch (err: unknown) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
}

/**
 * Deletes a document by ID.
 */
export async function removeDoc(id: string): Promise<void> {
  try {
    const doc = await db.get(id);
    await db.remove(doc);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 404) return;
    throw err;
  }
}

/**
 * Starts a timer on a job unless one is already running there; stops timers on other jobs.
 * Reads entries from the database, not from React state, so a quick second tap sees the first.
 */
export async function startJobTimer(jobId: string): Promise<void> {
  const { rows } = await db.allDocs({ include_docs: true, startkey: 'entry:', endkey: 'entry:\ufff0' });
  const running = rows.map((r) => r.doc as EntryDoc).filter((e) => e.start && !e.end);
  if (running.some((e) => e.jobId === jobId)) return;
  for (const e of running) await stopEntryTimer(e._id);
  const now = new Date();
  const entry: EntryDoc = {
    _id: `entry:${crypto.randomUUID()}`,
    type: 'entry',
    jobId,
    date: getLocalDateString(now),
    task: '',
    start: now.toISOString(),
  };
  await saveDoc(entry._id, () => entry);
}

/**
 * Stops a running timer. `task` is text typed on the timer card that may not be saved yet.
 */
export async function stopEntryTimer(id: string, task?: string): Promise<void> {
  const end = new Date();
  await saveDoc<EntryDoc>(id, (e) =>
    e?.start && !e.end
      ? {
          ...e,
          task: task ?? e.task,
          end: end.toISOString(),
          minutes: Math.max(0, (end.getTime() - Date.parse(e.start)) / 60000),
        }
      : undefined,
  );
}

/**
 * Hook to consume live database state and sync status.
 */
export function useTrackerData() {
  const [docs, setDocs] = useState<TrackerDoc[] | null>(null); // null until the first load
  const [syncStatus, setStatusState] = useState<string>(currentSyncStatus);

  const reload = useCallback(async () => {
    const res = await db.allDocs({ include_docs: true });
    const loaded: TrackerDoc[] = [];
    for (const row of res.rows) {
      if (row.doc && 'type' in row.doc) {
        loaded.push(row.doc as unknown as TrackerDoc);
      }
    }
    setDocs(loaded);
  }, []);

  useEffect(() => {
    reload();
    const changes = db.changes({ since: 'now', live: true }).on('change', () => {
      reload();
    });
    const unsub = subscribeSyncStatus(setStatusState);
    return () => {
      changes.cancel();
      unsub();
    };
  }, [reload]);

  const all = docs ?? [];
  const settingsDoc = (all.find((d) => d._id === 'settings' && d.type === 'settings') as SettingsDoc | undefined) ?? DEFAULT_SETTINGS;
  const jobs = all.filter((d): d is JobDoc => d.type === 'job');
  const entries = all.filter((d): d is EntryDoc => d.type === 'entry');
  const invoices = all.filter((d): d is InvoiceDoc => d.type === 'invoice');

  return {
    loaded: docs !== null,
    settings: settingsDoc,
    jobs,
    entries,
    invoices,
    syncStatus,
  };
}
