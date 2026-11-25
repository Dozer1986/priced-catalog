import type { ReceiptLine } from './types';

/** Rounds half away from zero, so a return rounds to the negative of the purchase. */
const roundCents = (x: number) => Math.sign(x) * Math.round(Math.abs(Number(x.toFixed(6))));

/** One line's total with tax, in cents. Qty is negative for a return. */
export function lineTotalCents(line: Pick<ReceiptLine, 'qty' | 'unitPriceCents' | 'taxRate'>): number {
  return roundCents(line.qty * line.unitPriceCents * (1 + line.taxRate)) || 0;
}

export function linesTotalCents(lines: ReceiptLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotalCents(l), 0);
}

/** Cents the lines are off from the printed receipt total, or null when they agree (within $0.02) or no total was read. */
export function totalMismatchCents(lines: ReceiptLine[], totalCents: number | null): number | null {
  if (totalCents === null) return null;
  const diff = linesTotalCents(lines) - totalCents;
  return Math.abs(diff) > 2 ? diff : null;
}

/** Tools and personal spending are not billed to a customer; neither are Personal and "Home - " projects. */
export function defaultBillable(category: string, project: string): boolean {
  if (category === 'Tools' || category === 'Personal (not business)') return false;
  return !(project === 'Personal' || project.startsWith('Home - '));
}

/** What the reader service returns: dollars as printed, tax as a fraction. */
export interface ExtractedReceipt {
  date: string | null;
  vendor: string | null;
  storeCity: string | null;
  storeState: string | null;
  paidWith: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  notes: string | null;
  lines: {
    item: string;
    description: string;
    sku: string | null;
    qty: number;
    unitPrice: number;
    taxRate: number;
  }[];
}

export const dollarsToCents = (d: number | null): number | null => (d === null ? null : roundCents(d * 100));

/** Blank lines the user can fill in, with the billable default applied from category and project. */
export function newLine(partial: Partial<ReceiptLine> = {}): ReceiptLine {
  const line = {
    item: '',
    description: '',
    sku: '',
    qty: 1,
    unitPriceCents: 0,
    taxRate: 0,
    category: '',
    project: '',
    ...partial,
  };
  return { billable: defaultBillable(line.category, line.project), ...line };
}

/** Parses a typed amount like "-4.10" or "$1,200" into cents. Blank gives `blank`; junk gives undefined. */
export function parseSignedCents<B extends number | null>(text: string, blank: B): number | B | undefined {
  const clean = text.trim();
  if (!clean) return blank;
  const m = /^(-?)\s*\$?\s*(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/.exec(clean);
  if (!m) return undefined;
  const cents = dollarsToCents(parseFloat(m[2].replace(/,/g, '') + (m[4] ?? '')))!;
  return m[1] ? -cents : cents;
}
