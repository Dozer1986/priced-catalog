import { describe, it, expect } from 'vitest';
import { defaultBillable, lineTotalCents, linesTotalCents, totalMismatchCents, newLine, dollarsToCents } from './receipt';
import { mergeEdits } from './merge';
import type { ReceiptDoc } from './types';

describe('defaultBillable', () => {
  it('is yes for ordinary work', () => {
    expect(defaultBillable('Materials', 'Smith kitchen')).toBe(true);
    expect(defaultBillable('', '')).toBe(true);
  });
  it('is no for Tools and personal categories', () => {
    expect(defaultBillable('Tools', 'Smith kitchen')).toBe(false);
    expect(defaultBillable('Personal (not business)', 'Smith kitchen')).toBe(false);
  });
  it('is no for Personal and "Home - " projects', () => {
    expect(defaultBillable('Materials', 'Personal')).toBe(false);
    expect(defaultBillable('Materials', 'Home - Garage')).toBe(false);
    expect(defaultBillable('Materials', 'Homeowner job')).toBe(true);
  });
  it('is applied to a new line', () => {
    expect(newLine({ category: 'Tools' }).billable).toBe(false);
    expect(newLine({ project: 'Home - Deck' }).billable).toBe(false);
    expect(newLine({ project: 'Smith', billable: false }).billable).toBe(false);
  });
});

describe('cents math', () => {
  it('adds tax per line and rounds to the cent', () => {
    expect(lineTotalCents({ qty: 3, unitPriceCents: 1299, taxRate: 0.07 })).toBe(4170); // 3897 * 1.07 = 4169.79
    expect(lineTotalCents({ qty: 1, unitPriceCents: 500, taxRate: 0 })).toBe(500);
  });
  it('makes a return the exact negative of the purchase, including half cents', () => {
    const buy = { qty: 1, unitPriceCents: 1050, taxRate: 0.07 }; // 1123.5
    expect(lineTotalCents(buy)).toBe(1124);
    expect(lineTotalCents({ ...buy, qty: -1 })).toBe(-1124);
  });
  it('handles a discount line and a decimal qty', () => {
    const lines = [
      newLine({ qty: 2.5, unitPriceCents: 400, taxRate: 0.07 }), // 1000 * 1.07
      newLine({ qty: 1, unitPriceCents: -500, taxRate: 0.07 }),
    ];
    expect(linesTotalCents(lines)).toBe(1070 - 535);
  });
  it('converts printed dollars without float drift', () => {
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(1.005)).toBe(101);
    expect(dollarsToCents(-4.1)).toBe(-410);
    expect(dollarsToCents(null)).toBeNull();
  });
});

describe('totalMismatchCents', () => {
  const lines = [newLine({ qty: 2, unitPriceCents: 1000, taxRate: 0.07 }), newLine({ qty: -1, unitPriceCents: 300, taxRate: 0 })]; // 2140 - 300
  it('is null when the lines agree within 2 cents', () => {
    expect(totalMismatchCents(lines, 1840)).toBeNull();
    expect(totalMismatchCents(lines, 1842)).toBeNull();
    expect(totalMismatchCents(lines, 1838)).toBeNull();
  });
  it('reports the difference beyond 2 cents', () => {
    expect(totalMismatchCents(lines, 1843)).toBe(-3);
    expect(totalMismatchCents(lines, 1800)).toBe(40);
  });
  it('does not warn when no total was read', () => {
    expect(totalMismatchCents(lines, null)).toBeNull();
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
    lines: [{ ...base.lines[0], category: 'Materials' }],
    updatedAt: '2026-11-11T08:00:00Z',
  };

  it('keeps a header change from one side and the lines from the other', () => {
    for (const [a, b] of [[phone, laptop], [laptop, phone]] as const) {
      expect(mergeEdits(base, a, b)).toMatchObject({ vendor: 'Menards #3305', lines: laptop.lines });
    }
  });
  it('takes the later save’s lines whole when both sides edited lines', () => {
    const other = { ...base, lines: [{ ...base.lines[0], project: 'Jones' }], updatedAt: '2026-11-11T10:00:00Z' };
    const merged = mergeEdits(base, laptop, other) as ReceiptDoc;
    expect(merged.lines).toEqual(other.lines);
  });
});
