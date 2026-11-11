import { describe, it, expect } from 'vitest';
import {
  billableHours,
  parseHours,
  parsePriceCents,
  invoiceTotals,
  nextInvoiceNumber,
  formatMoney,
  PRIOR_ISSUED_INVOICE_NUMBERS,
} from './billing';

describe('billing pure functions', () => {
  describe('billableHours', () => {
    it('rounds minutes to the nearest 15 minutes as specified', () => {
      expect(billableHours(67)).toBe(1);
      expect(billableHours(68)).toBe(1.25);
      expect(billableHours(7)).toBe(0);
      expect(billableHours(8)).toBe(0.25);
      expect(billableHours(150)).toBe(2.5);
      expect(billableHours(0)).toBe(0);
    });
  });

  describe('parseHours', () => {
    it('parses valid decimal hours into minutes', () => {
      expect(parseHours('2.5')).toBe(150);
    });

    it('parses valid colon format into minutes', () => {
      expect(parseHours('2:30')).toBe(150);
      expect(parseHours('0:45')).toBe(45);
    });

    it('returns null on invalid, empty, negative, or invalid-minute inputs', () => {
      expect(parseHours('')).toBeNull();
      expect(parseHours('   ')).toBeNull();
      expect(parseHours('abc')).toBeNull();
      expect(parseHours('-1')).toBeNull();
      expect(parseHours('-2.5')).toBeNull();
      expect(parseHours('2:60')).toBeNull();
      expect(parseHours('1:75')).toBeNull();
    });
  });

  describe('invoiceTotals', () => {
    it('matches the exact specified financial calculation', () => {
      const result = invoiceTotals(
        [1.25, 2.5],
        10000,
        [
          { kind: 'equipment', description: 'Item 1', qty: 1, unitPriceCents: 24999 },
          { kind: 'materials', description: 'Item 2', qty: 3, unitPriceCents: 410 },
        ],
        0.07
      );

      expect(result).toEqual({
        equipmentCents: 24999,
        materialsCents: 1230,
        laborHours: 3.75,
        laborCents: 37500,
        subtotalCents: 63729,
        taxCents: 1836,
        dueCents: 65565,
      });
    });
  });

  describe('nextInvoiceNumber', () => {
    it('generates sequential numbers accounting for prior issued constant', () => {
      expect(PRIOR_ISSUED_INVOICE_NUMBERS).toContain('INV-2026-001');

      expect(nextInvoiceNumber([], '2026-11-10')).toBe('INV-2026-002');
      expect(nextInvoiceNumber(['INV-2026-002', 'INV-2026-007'], '2026-11-10')).toBe('INV-2026-008');
      expect(nextInvoiceNumber([], '2027-01-03')).toBe('INV-2027-001');
    });
  });

  describe('parsePriceCents', () => {
    it('reads plain, dollar-sign and comma prices', () => {
      expect(parsePriceCents('45')).toBe(4500);
      expect(parsePriceCents(' 19.99 ')).toBe(1999);
      expect(parsePriceCents('$1,200.00')).toBe(120000);
      expect(parsePriceCents('')).toBe(0);
    });

    it('rejects anything that is not a price', () => {
      expect(parsePriceCents('twelve hundred')).toBeNull();
      expect(parsePriceCents('-5')).toBeNull();
      expect(parsePriceCents('1.2.3')).toBeNull();
      expect(parsePriceCents('12,50')).toBeNull();
    });
  });

  describe('formatMoney', () => {
    it('formats cents into USD currency strings', () => {
      expect(formatMoney(123456)).toBe('$1,234.56');
      expect(formatMoney(26316)).toBe('$263.16');
      expect(formatMoney(0)).toBe('$0.00');
    });
  });
});
