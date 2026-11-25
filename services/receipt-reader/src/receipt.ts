import * as z from 'zod/v4';

/** Keep in step with ExtractedReceipt in src/tracker/receipt.ts: the app reads this JSON. */
export const ReceiptSchema = z.object({
  date: z.string().nullable().describe('Purchase date as YYYY-MM-DD, or null when it cannot be read or worked out'),
  vendor: z.string().nullable().describe('Store name, e.g. Menards, Lowe\'s, Home Depot, Amazon'),
  storeCity: z.string().nullable(),
  storeState: z.string().nullable().describe('Two-letter state code, e.g. IN or KY'),
  paidWith: z.string().nullable().describe('How it was paid as printed, e.g. "Visa 1234", "Cash"'),
  subtotal: z.number().nullable().describe('Subtotal in dollars exactly as printed, or null'),
  tax: z.number().nullable().describe('Total tax in dollars exactly as printed, or null'),
  total: z.number().nullable().describe('Receipt total in dollars exactly as printed, or null'),
  notes: z.string().nullable().describe('Anything the reader should know, e.g. how the date was worked out'),
  lines: z.array(
    z.object({
      item: z.string().describe('Item text exactly as printed'),
      description: z.string().describe('What the item is, in plain English'),
      sku: z.string().nullable(),
      qty: z.number().describe('Negative for a returned item'),
      unitPrice: z.number().describe('Dollars per unit; negative for a coupon or discount line'),
      taxRate: z.number().describe('Fraction: 0.06 for KY, 0.07 for IN, 0 for untaxed lines'),
    }),
  ),
});

export type Receipt = z.infer<typeof ReceiptSchema>;

export const PROMPT = `Read this store receipt into the JSON schema. It is a receipt from a small contractor's purchase (Menards, Lowe's, Home Depot, Amazon or similar).

Rules:
- One line per purchased item. "item" is the item text exactly as printed, abbreviations and all. "description" says in plain English what it is.
- Quantity times unit price is the line's amount before tax. If a line shows only an extended amount, use qty 1 and that amount.
- A return slip or returned item has a negative qty and a positive unit price.
- Each coupon, instant rebate or discount is its own line with qty 1 and a negative unit price.
- Tax rate per line, from the receipt: Kentucky stores 0.06, Indiana stores 0.07, and 0 for lines printed as untaxed (food and other tax-exempt lines).
- subtotal, tax and total are exactly as printed. Never invent or compute a value: use null when it is missing or unreadable. The same goes for every other field.
- Menards: the printed purchase date is often cut off. If it is, find the "return after" (or "returnable until") date, subtract 90 days, use that as the date, and put "Date worked out from the 'return after' date minus 90 days" in notes.
- Dates are YYYY-MM-DD.`;

const USUAL_TAX = [0, 0.06, 0.07];

/** Checks what the prompt asks for but the schema cannot enforce; doubts go in notes for the person checking. */
export function checkReceipt(r: Receipt): Receipt {
  const doubts: string[] = [];
  let date = r.date;
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    doubts.push(`Date read as "${date}"; check it.`);
    date = null;
  }
  const odd = r.lines.filter((l) => !USUAL_TAX.includes(l.taxRate));
  if (odd.length) doubts.push(`Unusual tax rate on ${odd.length} line(s); check them.`);
  const notes = [r.notes, ...doubts].filter(Boolean).join(' ') || null;
  return { ...r, date, notes };
}
