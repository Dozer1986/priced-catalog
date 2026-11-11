import type { InvoiceLineItem, InvoiceTotals } from './types';

export const PRIOR_ISSUED_INVOICE_NUMBERS: readonly string[] = ['INV-2026-001'];

/**
 * Rounds duration in minutes to billable hours (nearest 15 minutes = 0.25 h).
 */
export function billableHours(minutes: number): number {
  return Math.round(minutes / 15) / 4;
}

/**
 * Parses user input in decimal hours ("2.5") or colon format ("2:30", "0:45")
 * into total minutes. Returns null on invalid format, empty input, negatives,
 * or minutes >= 60 in colon format.
 */
export function parseHours(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('-')) return null;

  // Check colon format: H:MM or HH:MM
  const colonMatch = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch && colonMatch[1] !== undefined && colonMatch[2] !== undefined) {
    const hours = parseInt(colonMatch[1], 10);
    const mins = parseInt(colonMatch[2], 10);
    if (mins >= 60 || mins < 0 || hours < 0) return null;
    return hours * 60 + mins;
  }

  // Check decimal format: e.g. "2.5", "2", "0.75"
  const decimalMatch = trimmed.match(/^(\d+)(\.\d+)?$/);
  if (decimalMatch) {
    const val = parseFloat(trimmed);
    if (Number.isNaN(val) || val < 0) return null;
    return Math.round(val * 60);
  }

  return null;
}

/**
 * Parses a price typed as "45", "19.99" or "$1,200.00" into cents. Blank is $0; anything else is null.
 */
export function parsePriceCents(text: string): number | null {
  const clean = text.trim().replace(/^\$\s*/, '');
  if (!clean) return 0;
  // Commas only as thousands separators, so "12,50" is an error instead of $1,250.
  if (!/^(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/.test(clean)) return null;
  return Math.round(parseFloat(clean.replace(/,/g, '')) * 100);
}

/**
 * Calculates invoice financial totals in integer cents.
 * Labor is never taxed.
 */
export function invoiceTotals(
  laborHours: number[],
  rateCents: number,
  items: InvoiceLineItem[],
  taxRate: number
): InvoiceTotals {
  let equipmentCents = 0;
  let materialsCents = 0;

  for (const item of items) {
    const lineCents = Math.round(item.qty * item.unitPriceCents);
    if (item.kind === 'equipment') {
      equipmentCents += lineCents;
    } else if (item.kind === 'materials') {
      materialsCents += lineCents;
    }
  }

  const rawLaborHours = laborHours.reduce((sum, h) => sum + h, 0);
  const roundedLaborHours = Math.round(rawLaborHours * 100) / 100;
  const laborCents = Math.round(roundedLaborHours * rateCents);
  const subtotalCents = equipmentCents + materialsCents + laborCents;
  const taxCents = Math.round((equipmentCents + materialsCents) * taxRate);
  const dueCents = subtotalCents + taxCents;

  return {
    equipmentCents,
    materialsCents,
    laborHours: roundedLaborHours,
    laborCents,
    subtotalCents,
    taxCents,
    dueCents,
  };
}

/**
 * Generates the next sequential invoice number for a given year.
 * Format: INV-<year>-<3-digit seq>
 * Sequence starts after any prior issued invoices (e.g. INV-2026-001).
 */
export function nextInvoiceNumber(existingNumbers: string[], date: string | Date): string {
  let year: number;
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})/);
    year = match && match[1] !== undefined ? parseInt(match[1], 10) : new Date(date).getFullYear();
  } else {
    year = date.getFullYear();
  }

  const allNumbers = [...PRIOR_ISSUED_INVOICE_NUMBERS, ...existingNumbers];
  let maxSeq = 0;
  const prefix = `INV-${year}-`;
  for (const num of allNumbers) {
    if (num.startsWith(prefix)) {
      const seqPart = parseInt(num.slice(prefix.length), 10);
      if (!Number.isNaN(seqPart) && seqPart > maxSeq) {
        maxSeq = seqPart;
      }
    }
  }

  const nextSeq = maxSeq + 1;
  return `INV-${year}-${String(nextSeq).padStart(3, '0')}`;
}

/**
 * Formats an integer cent amount into standard USD currency format ($1,234.56).
 */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/** "1 hour", "2.5 hours". */
export function hoursLabel(hours: number): string {
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/**
 * Returns YYYY-MM-DD in local time.
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
