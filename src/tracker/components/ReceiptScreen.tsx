import { useState } from 'react';
import type { JobDoc, ListsDoc, ReceiptDoc } from '../types';
import { saveDoc } from '../db';
import { formatMoney } from '../billing';
import { prepareFile, extractReceipt } from '../reader';
import {
  type ReceiptFields,
  changedFields,
  defaultBillable,
  fieldsFromExtract,
  lineTotalCents,
  linesTotalCents,
  parseSignedCents,
  totalMismatchCents,
} from '../receipt';

interface ReceiptScreenProps {
  receiptId?: string; // none: a new receipt
  receipts: ReceiptDoc[];
  jobs: JobDoc[];
  lists?: ListsDoc;
}

interface LineDraft {
  item: string;
  description: string;
  sku: string;
  qty: string;
  unitPrice: string;
  taxPct: string;
  category: string;
  project: string;
  billable: boolean;
}

interface Draft {
  date: string;
  vendor: string;
  storeCity: string;
  storeState: string;
  paidWith: string;
  subtotal: string;
  tax: string;
  total: string;
  notes: string;
  lines: LineDraft[];
}

const blankLine: LineDraft = { item: '', description: '', sku: '', qty: '1', unitPrice: '', taxPct: '', category: '', project: '', billable: true };

const blankDraft: Draft = { date: '', vendor: '', storeCity: '', storeState: '', paidWith: '', subtotal: '', tax: '', total: '', notes: '', lines: [blankLine] };

const money = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2));

function toDraft(f: ReceiptFields): Draft {
  return {
    ...f,
    subtotal: money(f.subtotalCents),
    tax: money(f.taxCents),
    total: money(f.totalCents),
    lines: f.lines.map((l) => ({
      ...l,
      qty: String(l.qty),
      unitPrice: money(l.unitPriceCents),
      taxPct: String(Math.round(l.taxRate * 10000) / 100),
    })),
  };
}

const parseNumber = (text: string) => (text.trim() === '' ? NaN : Number(text));

/** The draft as receipt fields, or a message naming the first field that does not parse. */
function fromDraft(d: Draft): ReceiptFields | string {
  const subtotalCents = parseSignedCents(d.subtotal, null);
  const taxCents = parseSignedCents(d.tax, null);
  const totalCents = parseSignedCents(d.total, null);
  if (subtotalCents === undefined || taxCents === undefined || totalCents === undefined) {
    return 'Subtotal, tax and total must be amounts like 12.34, or blank.';
  }
  if (d.lines.length === 0) return 'Add at least one line.';
  const lines = [];
  for (const [i, l] of d.lines.entries()) {
    const qty = parseNumber(l.qty);
    const unitPriceCents = parseSignedCents(l.unitPrice, null);
    const taxPct = parseNumber(l.taxPct);
    if (!Number.isFinite(qty) || qty === 0) return `Line ${i + 1}: enter a quantity (negative for a return).`;
    if (unitPriceCents === null || unitPriceCents === undefined) return `Line ${i + 1}: enter a unit price like 12.34.`;
    if (!(taxPct >= 0 && taxPct < 100)) return `Line ${i + 1}: enter a tax rate in percent, like 7.`;
    const { item, description, sku, category, project, billable } = l;
    lines.push({ item, description, sku, qty, unitPriceCents, taxRate: Math.round(taxPct * 100) / 10000, category, project, billable });
  }
  const { date, vendor, storeCity, storeState, paidWith, notes } = d;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter the receipt date.';
  return { date, vendor, storeCity, storeState, paidWith, subtotalCents, taxCents, totalCents, notes, lines };
}

const inputClass =
  'mt-1 w-full rounded border border-rule bg-field px-3 py-2 text-ink placeholder:text-ink-2/60 focus:border-mark focus:outline-none disabled:opacity-70';
const smallInputClass =
  'mt-0.5 w-full rounded border border-rule bg-paper px-2 py-1.5 text-sm text-ink focus:border-mark focus:outline-none disabled:opacity-70';

/** A dropdown from the ledger's lists, or free text when the importer has not published them yet. */
function Choice(props: { id: string; value: string; options?: string[]; onChange: (v: string) => void; className: string }) {
  const { id, value, options = [], onChange, className } = props;
  if (options.length === 0) {
    return <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} className={className} />;
  }
  // Keep a value that is not in the list (read off the receipt, or the list changed) instead of dropping it
  const all = ['', ...options, ...(value && !options.includes(value) ? [value] : [])];
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {all.map((o) => (
        <option key={o} value={o}>
          {o || '—'}
        </option>
      ))}
    </select>
  );
}

export function ReceiptScreen({ receiptId, receipts, jobs, lists }: ReceiptScreenProps) {
  const receipt = receiptId ? receipts.find((r) => r._id === receiptId) : undefined;
  // What the form started from; a save writes only the fields that differ from it
  const [saved, setSaved] = useState<ReceiptFields | null>(() => (receipt ? (fromDraft(toDraft(receipt)) as ReceiptFields) : null));
  const [draft, setDraft] = useState<Draft | null>(() => (saved ? toDraft(saved) : null));
  const [savedJobId, setSavedJobId] = useState(receipt?.jobId ?? '');
  const [jobId, setJobId] = useState(receipt?.jobId ?? '');
  // One id per new receipt, so a second tap on Save rewrites it instead of making a duplicate
  const [newId] = useState(() => `receipt:${crypto.randomUUID()}` as const);
  const [file, setFile] = useState<{ blob: Blob; ext: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (receiptId && !receipt) {
    return <div className="mx-auto max-w-3xl px-4 py-6 text-ink-2">Receipt not found.</div>;
  }
  const readOnly = !!receipt?.importedAt;

  const handleFile = async (picked: File | undefined) => {
    if (!picked) return;
    setError('');
    setFile(null);
    setReading(true);
    try {
      const prepared = await prepareFile(picked);
      setFile(prepared);
      setDraft(toDraft(fieldsFromExtract(await extractReceipt(prepared.blob))));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const fields = fromDraft(draft);
    if (typeof fields === 'string') {
      setError(fields);
      return;
    }
    setError('');
    if (!receipt) {
      if (!file) return;
      const doc: ReceiptDoc = {
        _id: newId,
        type: 'receipt',
        status: 'confirmed',
        createdAt: new Date().toISOString(),
        ...fields,
        ...(jobId && { jobId }),
        _attachments: { [`original.${file.ext}`]: { content_type: file.blob.type, data: file.blob } },
      };
      await saveDoc(doc._id, () => doc);
      window.location.hash = '#/receipts';
      return;
    }
    const changes = changedFields(saved!, fields);
    const jobChange = jobId === savedJobId ? {} : { jobId: jobId || undefined };
    let imported = false;
    await saveDoc<ReceiptDoc>(receipt._id, (cur) => {
      imported = !!cur?.importedAt;
      return cur && !imported ? { ...cur, ...changes, ...jobChange } : undefined;
    });
    if (imported) {
      setError('This receipt went into the ledger meanwhile, so the edit was not saved. Change it in the ledger.');
      return;
    }
    setSaved(fields);
    setSavedJobId(jobId);
    setNotice('Saved.');
  };

  const handleJobChange = async (nextJobId: string) => {
    setJobId(nextJobId);
    setNotice('');
    if (!readOnly || !receipt) return;
    const jobId = nextJobId || undefined;
    await saveDoc<ReceiptDoc>(receipt._id, (r) => r && { ...r, jobId });
    setSavedJobId(nextJobId);
    setNotice('Saved.');
  };

  const setHeader = (key: keyof Omit<Draft, 'lines'>, value: string) => {
    setNotice('');
    setDraft((d) => d && { ...d, [key]: value });
  };
  const setLine = (i: number, change: Partial<LineDraft>) => {
    setNotice('');
    setDraft((d) => {
      if (!d) return d;
      const lines = d.lines.map((l, j) => {
        if (j !== i) return l;
        const next = { ...l, ...change };
        if ('category' in change || 'project' in change) next.billable = defaultBillable(next.category, next.project);
        return next;
      });
      return { ...d, lines };
    });
  };
  const addLine = () => setDraft((d) => d && { ...d, lines: [...d.lines, blankLine] });
  const removeLine = (i: number) => setDraft((d) => d && { ...d, lines: d.lines.filter((_, j) => j !== i) });

  if (!draft) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-ink">New receipt</h1>
        {error && <div className="mb-4 rounded border border-red-500/50 bg-red-950/20 p-3 text-sm text-red-200">{error}</div>}
        {reading ? (
          <div className="flex items-center gap-3 rounded border border-rule bg-field p-6 text-ink-2" role="status">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-mark border-t-transparent" />
            Reading the receipt. This takes 10 to 40 seconds.
          </div>
        ) : (
          <div className="space-y-3">
            {/* capture opens the camera straight away, which on iPhone hides screenshots and PDFs: hence two buttons */}
            <label className="flex min-h-[56px] cursor-pointer items-center justify-center rounded bg-mark px-6 py-3 text-base font-bold text-on-mark hover:opacity-90">
              Take a photo
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="sr-only"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center rounded border border-rule bg-field px-4 py-2 text-sm font-medium text-ink hover:border-ink-2">
              Choose a screenshot or PDF
              <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
            </label>
            {file && (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setDraft(blankDraft);
                }}
                className="flex min-h-[44px] w-full items-center justify-center rounded border border-rule bg-field px-4 py-2 text-sm font-medium text-ink hover:border-ink-2"
              >
                Type it in
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const parsedLines = draft.lines.map((l) => ({
    qty: parseNumber(l.qty) || 0,
    unitPriceCents: parseSignedCents(l.unitPrice, 0) ?? 0,
    taxRate: (parseNumber(l.taxPct) || 0) / 100,
  }));
  const sumCents = linesTotalCents(parsedLines);
  const printedTotal = parseSignedCents(draft.total, null) ?? null;
  const mismatch = totalMismatchCents(parsedLines, printedTotal);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{receipt ? 'Receipt' : 'Check the receipt'}</h1>
        {readOnly && <span className="rounded bg-mark/20 px-2 py-1 text-xs font-medium text-mark">In ledger</span>}
      </div>
      {error && <div className="mb-4 rounded border border-red-500/50 bg-red-950/20 p-3 text-sm text-red-200">{error}</div>}

      <form onSubmit={handleSave}>
        <div className="mb-4">
          <label htmlFor="r-job" className="block text-sm font-medium text-ink">Job</label>
          <select id="r-job" value={jobId} onChange={(e) => void handleJobChange(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {jobs.filter((job) => job.status === 'open').map((job) => (
              <option key={job._id} value={job._id}>{job.customer} - {job.name}</option>
            ))}
          </select>
        </div>
        <fieldset disabled={readOnly} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="r-date" className="block text-sm font-medium text-ink">Date</label>
              <input id="r-date" type="date" value={draft.date} onChange={(e) => setHeader('date', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="r-vendor" className="block text-sm font-medium text-ink">Vendor</label>
              <input id="r-vendor" type="text" value={draft.vendor} onChange={(e) => setHeader('vendor', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="r-city" className="block text-sm font-medium text-ink">Store city</label>
              <input id="r-city" type="text" value={draft.storeCity} onChange={(e) => setHeader('storeCity', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="r-state" className="block text-sm font-medium text-ink">State</label>
              <input id="r-state" type="text" maxLength={2} value={draft.storeState} onChange={(e) => setHeader('storeState', e.target.value.toUpperCase())} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label htmlFor="r-paid" className="block text-sm font-medium text-ink">Paid with</label>
              <Choice id="r-paid" value={draft.paidWith} options={lists?.paidWith} onChange={(v) => setHeader('paidWith', v)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(['subtotal', 'tax', 'total'] as const).map((key) => (
              <div key={key}>
                <label htmlFor={`r-${key}`} className="block text-sm font-medium capitalize text-ink">{key} ($)</label>
                <input id={`r-${key}`} type="text" inputMode="decimal" value={draft[key]} onChange={(e) => setHeader(key, e.target.value)} className={`fig ${inputClass}`} />
              </div>
            ))}
          </div>

          <div>
            <label htmlFor="r-notes" className="block text-sm font-medium text-ink">Notes</label>
            <textarea id="r-notes" rows={2} value={draft.notes} onChange={(e) => setHeader('notes', e.target.value)} className={inputClass} />
          </div>

          <h2 className="pt-2 text-sm font-semibold uppercase tracking-wider text-ink-2">Lines</h2>
          {draft.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-6 gap-2 rounded border border-rule bg-field p-3 text-xs text-ink-2">
              <label className="col-span-6">
                Item as printed
                <input type="text" value={l.item} onChange={(e) => setLine(i, { item: e.target.value })} className={`fig ${smallInputClass}`} />
              </label>
              <label className="col-span-4">
                Description
                <input type="text" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} className={smallInputClass} />
              </label>
              <label className="col-span-2">
                SKU
                <input type="text" value={l.sku} onChange={(e) => setLine(i, { sku: e.target.value })} className={`fig ${smallInputClass}`} />
              </label>
              <label className="col-span-2">
                Qty
                <input type="text" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className={`fig ${smallInputClass}`} />
              </label>
              <label className="col-span-2">
                Unit price ($)
                <input type="text" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} className={`fig ${smallInputClass}`} />
              </label>
              <label className="col-span-2">
                Tax (%)
                <input type="text" inputMode="decimal" value={l.taxPct} onChange={(e) => setLine(i, { taxPct: e.target.value })} className={`fig ${smallInputClass}`} />
              </label>
              <label className="col-span-3">
                Category
                <Choice id={`r-cat-${i}`} value={l.category} options={lists?.categories} onChange={(v) => setLine(i, { category: v })} className={smallInputClass} />
              </label>
              <label className="col-span-3">
                Project
                <Choice id={`r-proj-${i}`} value={l.project} options={lists?.projects} onChange={(v) => setLine(i, { project: v })} className={smallInputClass} />
              </label>
              <label className="col-span-2">
                Billable
                <select value={l.billable ? 'Yes' : 'No'} onChange={(e) => setLine(i, { billable: e.target.value === 'Yes' })} className={smallInputClass}>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </label>
              <span className="fig col-span-2 self-end pb-2 text-right text-sm text-ink">{formatMoney(lineTotalCents(parsedLines[i]!))}</span>
              {!readOnly && (
                <button type="button" onClick={() => removeLine(i)} className="col-span-2 self-end rounded border border-rule px-2 py-1.5 text-ink-2 hover:text-red-400">
                  Delete
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button type="button" onClick={addLine} className="min-h-[44px] w-full rounded border border-dashed border-rule text-sm text-ink-2 hover:text-ink">
              + Add line
            </button>
          )}
        </fieldset>

        <div className="mt-4 rounded border border-rule bg-field p-3 text-sm">
          <div className="fig flex justify-between text-ink">
            <span>Sum of lines</span>
            <span>{formatMoney(sumCents)}</span>
          </div>
          <div className="fig flex justify-between text-ink-2">
            <span>Receipt total</span>
            <span>{printedTotal === null ? 'not read' : formatMoney(printedTotal)}</span>
          </div>
          {mismatch !== null && (
            <p className="mt-1 font-semibold text-red-500">The lines are {formatMoney(Math.abs(mismatch))} {mismatch > 0 ? 'over' : 'under'} the receipt total.</p>
          )}
        </div>

        {!readOnly && (
          <button type="submit" className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded bg-mark px-4 py-2 font-semibold text-on-mark hover:opacity-90">
            Save receipt
          </button>
        )}
        {notice && <p className="mt-2 text-center text-sm text-mark">{notice}</p>}
      </form>
    </div>
  );
}
