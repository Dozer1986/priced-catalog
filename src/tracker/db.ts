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

    sync.on('active', () => {
      setSyncStatus('Syncing…');
    });

    sync.on('paused', (err) => {
      if (err) {
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

/**
 * Puts a document with 1 retry on 409 revision conflict.
 */
export async function putWithRetry(doc: TrackerDoc): Promise<void> {
  try {
    await db.put(doc);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 409) {
      const fresh = await db.get(doc._id);
      await db.put({
        ...doc,
        _rev: fresh._rev,
      } as TrackerDoc);
    } else {
      throw err;
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
 * Stops all currently running entries.
 */
export async function stopRunningEntries(entries: EntryDoc[]): Promise<void> {
  const running = entries.filter((e) => e.start && !e.end);
  const now = new Date();
  for (const r of running) {
    const startMs = new Date(r.start!).getTime();
    const endMs = now.getTime();
    const minutes = Math.max(0, (endMs - startMs) / 60000);
    await putWithRetry({
      ...r,
      end: now.toISOString(),
      minutes,
    });
  }
}

/**
 * Starts a timer on a job, stopping any other running entries first.
 */
export async function startJobTimer(jobId: string, currentEntries: EntryDoc[]): Promise<void> {
  await stopRunningEntries(currentEntries);
  const now = new Date();
  const newEntry: EntryDoc = {
    _id: `entry:${crypto.randomUUID()}`,
    type: 'entry',
    jobId,
    date: getLocalDateString(now),
    task: '',
    start: now.toISOString(),
  };
  await putWithRetry(newEntry);
}

/**
 * Stops a specific running timer entry.
 */
export async function stopEntryTimer(entry: EntryDoc): Promise<void> {
  const now = new Date();
  const startMs = new Date(entry.start ?? now.toISOString()).getTime();
  const endMs = now.getTime();
  const minutes = Math.max(0, (endMs - startMs) / 60000);
  await putWithRetry({
    ...entry,
    end: now.toISOString(),
    minutes,
  });
}

/**
 * Hook to consume live database state and sync status.
 */
export function useTrackerData() {
  const [docs, setDocs] = useState<TrackerDoc[]>([]);
  const [syncStatus, setStatusState] = useState<string>(currentSyncStatus);

  const reload = useCallback(async () => {
    try {
      const res = await db.allDocs({ include_docs: true });
      const loaded: TrackerDoc[] = [];
      for (const row of res.rows) {
        if (row.doc && 'type' in row.doc) {
          loaded.push(row.doc as unknown as TrackerDoc);
        }
      }
      setDocs(loaded);
    } catch {
      // ignore
    }
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

  const settingsDoc = (docs.find((d) => d._id === 'settings' && d.type === 'settings') as SettingsDoc | undefined) ?? DEFAULT_SETTINGS;
  const jobs = docs.filter((d): d is JobDoc => d.type === 'job');
  const entries = docs.filter((d): d is EntryDoc => d.type === 'entry');
  const invoices = docs.filter((d): d is InvoiceDoc => d.type === 'invoice');

  return {
    docs,
    settings: settingsDoc,
    jobs,
    entries,
    invoices,
    syncStatus,
    reload,
  };
}
