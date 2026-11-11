import type { TrackerDoc } from './types';

type Fields = Record<string, unknown>;

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
// _rev, _revisions, _conflicts and the like describe one revision, not the data
const isData = (key: string) => key === '_id' || !key.startsWith('_');

/** True when two versions of a doc hold the same data. */
export function sameData(a: TrackerDoc, b: TrackerDoc): boolean {
  const [x, y] = [a, b] as unknown as [Fields, Fields];
  return [...new Set([...Object.keys(x), ...Object.keys(y)])]
    .filter(isData)
    .every((key) => same(x[key], y[key]));
}

/**
 * Merges two versions of a doc that were edited on different devices while offline. `base` is
 * the version both edits started from, when this device still has it. A field changed on one
 * side keeps that change; a field changed on both keeps the later save. A timer stopped on both
 * keeps the earlier stop, because the later one came from a device that still showed it running.
 */
export function mergeEdits(base: TrackerDoc | undefined, a: TrackerDoc, b: TrackerDoc): TrackerDoc {
  const [x, y, o] = [a, b, base ?? {}] as unknown as [Fields, Fields, Fields];
  const newer = (b.updatedAt ?? '') > (a.updatedAt ?? '') ? y : x;
  const merged: Fields = {};
  for (const key of new Set([...Object.keys(x), ...Object.keys(y), ...Object.keys(o)])) {
    if (!isData(key)) continue;
    let value: unknown;
    if (same(x[key], y[key])) value = x[key];
    else if (base && same(x[key], o[key])) value = y[key];
    else if (base && same(y[key], o[key])) value = x[key];
    else value = newer[key]; // changed on both sides, or no base to tell which side changed it
    if (value !== undefined) merged[key] = value;
  }
  if (typeof x.end === 'string' && typeof y.end === 'string' && x.end !== y.end) {
    const first = x.end <= y.end ? x : y;
    merged.end = first.end;
    merged.minutes = first.minutes;
  }
  return merged as unknown as TrackerDoc;
}
