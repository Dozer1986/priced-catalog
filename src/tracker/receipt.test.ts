import { describe, it, expect } from 'vitest';
import { defaultBillable, lineTotalCents, linesTotalCents, totalMismatchCents, newLine, dollarsToCents, fieldsFromExtract, changedFields, parseSignedCents } from './receipt';

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

describe('reading and saving', () => {
  const read = fieldsFromExtract({
    date: '2026-11-10', vendor: 'Menards', storeCity: 'Evansville', storeState: 'IN', paidWith: null,
    subtotal: 10.5, tax: 0.74, total: 11.24, notes: null,
    lines: [{ item: 'RETURN 2X4', description: 'Returned stud', sku: null, qty: -1, unitPrice: 10.5, taxRate: 0.07 }],
  });
  it('turns printed dollars into cents and keeps a return negative', () => {
    expect(read).toMatchObject({ paidWith: '', totalCents: 1124, lines: [{ qty: -1, unitPriceCents: 1050, sku: '', billable: true }] });
    expect(linesTotalCents(read.lines)).toBe(-1124);
  });
  it('books a sub-cent unit price as qty 1 at the printed line amount', () => {
    const line = (qty: number, unitPrice: number) => ({ item: 'X', description: 'X', sku: null, qty, unitPrice, taxRate: 0 });
    const { lines } = fieldsFromExtract({
      date: null, vendor: null, storeCity: null, storeState: null, paidWith: null,
      subtotal: null, tax: null, total: null, notes: null,
      lines: [line(100, 0.125), line(15.234, 3.499), line(3, 1.99)],
    });
    expect(lines.map(({ qty, unitPriceCents }) => [qty, unitPriceCents])).toEqual([[1, 1250], [1, 5330], [3, 199]]);
  });
  it('rejects a typed amount finer than a cent', () => {
    expect(parseSignedCents('0.125', null)).toBeUndefined();
    expect(parseSignedCents('-$1,200.5', null)).toBe(-120050);
  });
  it('saves only the fields the user changed', () => {
    const edited = { ...read, vendor: 'Menards #3305', lines: [{ ...read.lines[0]!, project: 'Smith' }] };
    expect(Object.keys(changedFields(read, edited)).sort()).toEqual(['lines', 'vendor']);
    expect(changedFields(read, { ...read })).toEqual({});
  });
});
