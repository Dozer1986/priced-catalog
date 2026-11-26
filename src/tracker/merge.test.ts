import { describe, it, expect } from 'vitest';
import { mergeEdits, sameData } from './merge';
import type { EntryDoc, QuoteDoc, ReceiptDoc } from './types';
import { newLine } from './receipt';
import { quoteTotals } from './billing';

const base: EntryDoc = {
  _id: 'entry:1',
  _rev: '2-base',
  type: 'entry',
  jobId: 'job:1',
  date: '2026-11-10',
  task: 'Wired the outlet',
  minutes: 60,
  invoiceId: 'invoice:1',
  updatedAt: '2026-11-10T12:00:00Z',
};
const edit = (changes: Partial<EntryDoc>, updatedAt: string): EntryDoc => ({ ...base, ...changes, updatedAt });

describe('mergeEdits', () => {
  it('keeps a change from each side when they touched different fields', () => {
    const phone = edit({ task: 'Wired the dryer outlet' }, '2026-11-11T09:00:00Z');
    const laptop = edit({ minutes: 90 }, '2026-11-11T08:00:00Z');
    for (const [a, b] of [[phone, laptop], [laptop, phone]] as const) {
      expect(mergeEdits(base, a, b)).toMatchObject({ task: 'Wired the dryer outlet', minutes: 90 });
    }
  });

  it('keeps the later save when both sides changed the same field', () => {
    const early = edit({ minutes: 75 }, '2026-11-11T08:00:00Z');
    const late = edit({ minutes: 120 }, '2026-11-11T09:00:00Z');
    expect(mergeEdits(base, early, late)).toMatchObject({ minutes: 120 });
    expect(mergeEdits(base, late, early)).toMatchObject({ minutes: 120 });
  });

  it('keeps the earlier stop of a timer stopped on both devices, and a task typed on the other', () => {
    const running = { ...base, minutes: undefined, invoiceId: undefined, start: '2026-11-11T13:00:00Z' };
    const phone = { ...running, end: '2026-11-11T14:30:00Z', minutes: 90, updatedAt: '2026-11-11T14:30:00Z' };
    const laptop = { ...running, task: 'Hung the cabinet', end: '2026-11-11T18:00:00Z', minutes: 300, updatedAt: '2026-11-11T18:00:00Z' };
    for (const [a, b] of [[phone, laptop], [laptop, phone]] as const) {
      expect(mergeEdits(running, a, b)).toMatchObject({ end: phone.end, minutes: 90, task: 'Hung the cabinet' });
    }
  });

  it('drops a field one side cleared', () => {
    const unbilled = edit({ invoiceId: undefined }, '2026-11-11T08:00:00Z');
    const renamed = edit({ task: 'Swapped the outlet' }, '2026-11-11T09:00:00Z');
    expect(mergeEdits(base, renamed, unbilled)).not.toHaveProperty('invoiceId');
  });

  it('keeps the later save whole without a base, also for a timer stopped before both edits', () => {
    const stopped = { ...base, start: '2026-11-11T13:00:00Z', end: '2026-11-11T14:30:25Z', minutes: 90.4 };
    const renamed = { ...stopped, task: 'Hung the upper cabinets', updatedAt: '2026-11-11T18:00:00Z' };
    const retimed = { ...stopped, minutes: 150, updatedAt: '2026-11-11T19:00:00Z' };
    expect(mergeEdits(undefined, renamed, retimed)).toMatchObject({ task: stopped.task, minutes: 150 });
  });

  it('keeps the later save whole when the version both started from is unknown', () => {
    const older = edit({ task: 'Old task' }, '2026-11-11T08:00:00Z');
    const newer = edit({ task: 'New task', invoiceId: undefined }, '2026-11-11T09:00:00Z');
    const merged = mergeEdits(undefined, older, newer);
    expect(merged).toMatchObject({ task: 'New task', _id: 'entry:1' });
    expect(merged).not.toHaveProperty('invoiceId');
    expect(merged).not.toHaveProperty('_rev');
  });
});

describe('sameData', () => {
  it('ignores revision fields and key order', () => {
    const reordered = { minutes: 60, ...base, _rev: '3-other', _conflicts: ['3-x'] } as EntryDoc;
    expect(sameData(base, reordered)).toBe(true);
    expect(sameData(base, { ...base, minutes: 61 })).toBe(false);
  });
});

describe('merge of two offline edits of one receipt', () => {
  const base: ReceiptDoc = {
    _id: 'receipt:1',
    type: 'receipt',
    status: 'confirmed',
    date: '2026-11-10',
    vendor: 'Menards',
    storeCity: 'Evansville',
    storeState: 'IN',
    paidWith: 'Visa',
    subtotalCents: 1000,
    taxCents: 70,
    totalCents: 1070,
    notes: '',
    lines: [newLine({ item: 'SCREWS', qty: 1, unitPriceCents: 1000, taxRate: 0.07, project: 'Smith' })],
    createdAt: '2026-11-10T10:00:00Z',
    updatedAt: '2026-11-10T10:00:00Z',
  };
  const phone = { ...base, vendor: 'Menards #3305', updatedAt: '2026-11-11T09:00:00Z' };
  const laptop = {
    ...base,
    lines: [{ ...base.lines[0]!, category: 'Materials' }],
    updatedAt: '2026-11-11T08:00:00Z',
  };

  it('keeps a header change from one side and the lines from the other', () => {
    for (const [a, b] of [[phone, laptop], [laptop, phone]] as const) {
      expect(mergeEdits(base, a, b)).toMatchObject({ vendor: 'Menards #3305', lines: laptop.lines });
    }
  });
  it('takes the later save’s lines whole when both sides edited lines', () => {
    const other = { ...base, lines: [{ ...base.lines[0]!, project: 'Jones' }], updatedAt: '2026-11-11T10:00:00Z' };
    const merged = mergeEdits(base, laptop, other) as ReceiptDoc;
    expect(merged.lines).toEqual(other.lines);
  });
});

describe('merge of two offline edits of one quote', () => {
  const base: QuoteDoc = {
    _id: 'quote:1',
    type: 'quote',
    jobId: 'job:1',
    number: 'Q-2026-001',
    date: '2026-11-26',
    validUntil: '2026-12-26',
    summary: 'Swap the panel',
    notes: '',
    status: 'draft',
    businessName: 'KAMOTec',
    customer: 'Pat',
    address: '',
    jobName: 'Panel',
    rateCents: 10000,
    taxRate: 0.07,
    taxLabel: 'Indiana sales tax',
    labor: [{ task: 'Swap', hours: 4 }],
    items: [],
    createdAt: '2026-11-26T10:00:00Z',
    updatedAt: '2026-11-26T10:00:00Z',
  };

  it('keeps the status set on one device and the scope edited on the other', () => {
    const phone = { ...base, status: 'sent' as const, updatedAt: '2026-11-27T09:00:00Z' };
    const laptop = { ...base, summary: 'Swap the panel and add two circuits', updatedAt: '2026-11-27T08:00:00Z' };
    for (const [a, b] of [[phone, laptop], [laptop, phone]] as const) {
      expect(mergeEdits(base, a, b)).toMatchObject({ status: 'sent', summary: laptop.summary, labor: base.labor });
    }
  });

  it('totals the merged quote from labor changed on one device and materials added on the other', () => {
    const phone = { ...base, labor: [{ task: 'Swap', hours: 6 }], updatedAt: '2026-11-27T09:00:00Z' };
    const laptop = {
      ...base,
      items: [{ kind: 'materials' as const, description: 'Breakers', qty: 1, unitPriceCents: 10000 }],
      updatedAt: '2026-11-27T08:00:00Z',
    };
    for (const [a, b] of [[phone, laptop], [laptop, phone]] as const) {
      // 6 h at $100 = $600 labor (untaxed), $100 materials + 7% tax = $107: $707 in all
      expect(quoteTotals(mergeEdits(base, a, b) as QuoteDoc)).toMatchObject({ laborCents: 60000, materialsCents: 10000, taxCents: 700, dueCents: 70700 });
    }
  });
});
