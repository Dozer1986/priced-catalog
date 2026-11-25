import type { MeasureFlight, MeasureSettings } from './measure';
export interface SettingsDoc {
  _id: 'settings';
  _rev?: string;
  updatedAt?: string; // ISO time of the last save; the later edit wins when offline edits collide
  type: 'settings';
  businessName: string;
  defaultRate: number; // e.g. 100 ($/hr)
  taxRate: number; // e.g. 0.07 (7%)
  taxLabel: string; // e.g. "Indiana sales tax"
  paymentTerms: string; // e.g. "Payment due on receipt. Cash, check, Venmo or Zelle."
}

export interface JobDoc {
  _id: `job:${string}`;
  _rev?: string;
  updatedAt?: string;
  type: 'job';
  customer: string;
  address: string;
  name: string;
  rate: number; // hourly rate, e.g. 100 ($/hr)
  status: 'open' | 'closed';
  createdAt: string; // ISO timestamp
}

export interface EntryDoc {
  _id: `entry:${string}`;
  _rev?: string;
  updatedAt?: string;
  type: 'entry';
  jobId: string; // references job._id
  date: string; // LOCAL date 'YYYY-MM-DD'
  task: string;
  minutes?: number; // unrounded or manual minutes
  start?: string; // ISO string
  end?: string; // ISO string
  invoiceId?: string; // references invoice._id if billed
}

export interface InvoiceLaborItem {
  entryId: string;
  date: string; // 'YYYY-MM-DD'
  task: string;
  hours: number; // billable hours
}

export interface InvoiceLineItem {
  kind: 'equipment' | 'materials';
  description: string;
  qty: number;
  unitPriceCents: number;
}

export interface InvoiceTotals {
  equipmentCents: number;
  materialsCents: number;
  laborHours: number;
  laborCents: number;
  subtotalCents: number;
  taxCents: number;
  dueCents: number;
}

export interface InvoiceDoc {
  _id: `invoice:${string}`;
  _rev?: string;
  updatedAt?: string;
  type: 'invoice';
  jobId: string;
  number: string; // e.g. 'INV-2026-002'
  date: string; // invoice date 'YYYY-MM-DD'
  completedDate: string; // work completed date 'YYYY-MM-DD'
  summary: string;
  notes?: string;
  businessName: string;
  customer: string;
  address: string;
  jobName: string;
  rateCents: number; // hourly rate in cents, e.g. 10000
  taxRate: number; // e.g. 0.07
  taxLabel: string;
  paymentTerms: string;
  labor: InvoiceLaborItem[];
  items: InvoiceLineItem[];
  totals: InvoiceTotals;
}

export interface ReceiptLine {
  item: string; // as printed on the receipt
  description: string; // plain English
  sku: string;
  qty: number; // negative for a return
  unitPriceCents: number;
  taxRate: number; // e.g. 0.07
  category: string;
  project: string;
  billable: boolean;
}

export interface ReceiptDoc {
  _id: `receipt:${string}`;
  _rev?: string;
  updatedAt?: string;
  type: 'receipt';
  status: 'confirmed';
  date: string; // 'YYYY-MM-DD'
  vendor: string;
  storeCity: string;
  storeState: string;
  paidWith: string;
  subtotalCents: number | null; // as printed on the receipt
  taxCents: number | null;
  totalCents: number | null;
  notes: string;
  lines: ReceiptLine[];
  createdAt: string;
  photoName?: string; // set by the ledger importer: where the photo was filed
  importedAt?: string; // set by the ledger importer: the lines are in the ledger
  ledgerRows?: number[];
  _attachments?: PouchDB.Core.Attachments; // the photo or PDF, as original.<ext>
}

/** Dropdown choices published from the ledger by the importer. */
export interface ListsDoc {
  _id: 'lists';
  _rev?: string;
  updatedAt?: string;
  type: 'lists';
  projects: string[];
  categories: string[];
  paidWith: string[];
}

/** A stair handrail site-measure job from the Measure page (handrail-measure.html). Lengths are tape text, e.g. "5-5/8". */
export interface MeasureDoc {
  _id: `measure:${string}`;
  _rev?: string;
  updatedAt?: string;
  type: 'measure';
  name: string;
  site: string;
  date: string; // 'YYYY-MM-DD'
  jobId: string; // references job._id, '' when not linked
  width: string;
  inset: string;
  notes: string;
  settings: MeasureSettings;
  // shortcut: flights merge as one field, so two devices editing different flights offline keep only the later save; split per flight if two people ever measure at once
  flights: MeasureFlight[];
  createdAt: string;
}

export type TrackerDoc = SettingsDoc | JobDoc | EntryDoc | InvoiceDoc | ReceiptDoc | ListsDoc | MeasureDoc;

export interface SyncCredentials {
  url: string;
  username: string;
  password: string;
}
