import { describe, it, expect } from 'vitest';
import type { InvoiceDoc, InvoiceTotals, ReceiptDoc, ReceiptLine } from './types';
import {
  billableHours,
  parseHours,
  parsePriceCents,
  invoiceTotals,
  nextInvoiceNumber,
  nextQuoteNumber,
  addDays,
  formatMoney,
  unpaidCents,
  PRIOR_ISSUED_INVOICE_NUMBERS,
  toEditableItems,
  toLineItems,
  unbilledReceiptLines,
} from './billing';

const receiptLine = (billable = true): ReceiptLine => ({
  item: 'SCREWS',
  description: 'Screws',
  sku: '',
  qty: 2,
  unitPriceCents: 1250,
  taxRate: 0.07,
  category: '',
  project: '',
  billable,
});

const receipt = (id: string, jobId: string, lines: ReceiptLine[]): ReceiptDoc => ({
  _id: `receipt:${id}`,
  type: 'receipt',
  status: 'confirmed',
  jobId,
  date: '2026-06-01',
  vendor: 'Menards',
  storeCity: '',
  storeState: '',
  paidWith: '',
  subtotalCents: null,
  taxCents: null,
  totalCents: null,
  notes: '',
  lines,
  createdAt: '2026-06-01T10:00:00.000Z',
});

const invoiceWithReceiptLine = (receiptLineRef: string): InvoiceDoc => ({
  items: [{ kind: 'materials', description: 'Screws', qty: 2, unitPriceCents: 1250, receiptLine: receiptLineRef }],
} as InvoiceDoc);

describe('billing pure functions', () => {
  describe('toEditableItems', () => {
    it('turns saved lines into form rows that save back unchanged', () => {
      const items = [
        { kind: 'materials' as const, description: 'Breakers', qty: 2, unitPriceCents: 1250 },
        { kind: 'equipment' as const, description: 'Lift', qty: 1, unitPriceCents: 120000 },
      ];
      const rows = toEditableItems(items);
      expect(rows.map((r) => r.unitPriceStr)).toEqual(['12.50', '1200.00']);
      expect(toLineItems(rows)).toEqual(items);
    });

    it('keeps a receipt line reference through form conversion', () => {
      const items = [{ kind: 'materials' as const, description: 'Screws', qty: 2, unitPriceCents: 1250, receiptLine: 'receipt:abc#0' }];
      expect(toLineItems(toEditableItems(items))).toEqual(items);
    });
  });

  describe('unbilledReceiptLines', () => {
    const jobReceipt = receipt('one', 'job:one', [receiptLine(), receiptLine(false)]);
    const otherJobReceipt = receipt('two', 'job:two', [receiptLine()]);

    it('returns billable lines for the selected job', () => {
      expect(unbilledReceiptLines('job:one', [jobReceipt], []).map((line) => line.receiptLine)).toEqual(['receipt:one#0']);
    });

    it('ignores receipts assigned to another job', () => {
      expect(unbilledReceiptLines('job:one', [otherJobReceipt], [])).toEqual([]);
    });

    it('excludes a line referenced by an invoice', () => {
      expect(unbilledReceiptLines('job:one', [jobReceipt], [invoiceWithReceiptLine('receipt:one#0')])).toEqual([]);
    });

    it('offers the line again after the invoice is gone', () => {
      const invoices = [invoiceWithReceiptLine('receipt:one#0')];
      expect(unbilledReceiptLines('job:one', [jobReceipt], invoices)).toEqual([]);
      expect(unbilledReceiptLines('job:one', [jobReceipt], []).map((line) => line.receiptLine)).toEqual(['receipt:one#0']);
    });
  });

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

      expect(nextInvoiceNumber([], '2026-11-10')).toBe('INV-2026-004');
      expect(nextInvoiceNumber(['INV-2026-002', 'INV-2026-007'], '2026-11-10')).toBe('INV-2026-008');
      expect(nextInvoiceNumber([], '2027-01-03')).toBe('INV-2027-001');
    });
  });

  describe('nextQuoteNumber', () => {
    it('counts up per year from the quotes already written', () => {
      expect(nextQuoteNumber([], '2026-11-26')).toBe('Q-2026-001');
      expect(nextQuoteNumber(['Q-2026-002', 'Q-2026-009', 'Q-2025-040', 'INV-2026-050'], '2026-11-26')).toBe('Q-2026-010');
      expect(nextQuoteNumber(['Q-2026-009'], '2027-01-02')).toBe('Q-2027-001');
    });
  });

  describe('addDays', () => {
    it('crosses month and year ends', () => {
      expect(addDays('2026-11-26', 30)).toBe('2026-12-26');
      expect(addDays('2026-12-15', 30)).toBe('2027-01-14');
      expect(addDays('2028-02-01', 28)).toBe('2028-02-29');
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

  describe('unpaidCents', () => {
    it('sums the amount due on unpaid invoices only, in cents', () => {
      const inv = (dueCents: number, paidDate?: string) => ({ paidDate, totals: { dueCents } as InvoiceTotals });
      expect(unpaidCents([])).toBe(0);
      expect(unpaidCents([inv(26316), inv(10001), inv(50000, '2026-11-27')])).toBe(36317);
      expect(unpaidCents([inv(50000, '2026-11-27')])).toBe(0);
    });
  });
});
