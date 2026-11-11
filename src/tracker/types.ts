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

export type TrackerDoc = SettingsDoc | JobDoc | EntryDoc | InvoiceDoc;

export interface SyncCredentials {
  url: string;
  username: string;
  password: string;
}
