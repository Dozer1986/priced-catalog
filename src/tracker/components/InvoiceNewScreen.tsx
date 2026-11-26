import { useState, useMemo, useRef } from 'react';
import type { JobDoc, EntryDoc, SettingsDoc, InvoiceDoc } from '../types';
import { saveDoc } from '../db';
import {
  billableHours,
  invoiceTotals,
  nextInvoiceNumber,
  formatMoney,
  getLocalDateString,
  hasBadPrice,
  PRICE_ERROR,
  toLineItems,
  type EditableItem,
} from '../billing';
import { ItemsEditor, TotalsPreview } from './InvoiceParts';

interface InvoiceNewScreenProps {
  jobId: string;
  jobs: JobDoc[];
  entries: EntryDoc[];
  invoices: InvoiceDoc[];
  settings: SettingsDoc;
}

export function InvoiceNewScreen({
  jobId,
  jobs,
  entries,
  invoices,
  settings,
}: InvoiceNewScreenProps) {
  const job = jobs.find((j) => j._id === jobId);
  const today = getLocalDateString();

  // Finished, un-invoiced entries for this job
  const finishedEntries = useMemo(() => {
    return entries.filter(
      (e) => e.jobId === jobId && !e.invoiceId && (!e.start || Boolean(e.end))
    );
  }, [entries, jobId]);

  // Checklist of entries (all checked by default)
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(
    () => new Set(finishedEntries.map((e) => e._id))
  );

  // Equipment & Materials lines
  const [lineItems, setLineItems] = useState<EditableItem[]>([]);

  // Invoice Number
  const existingNumbers = invoices.map((i) => i.number);
  const [invoiceNumber, setInvoiceNumber] = useState(() =>
    nextInvoiceNumber(existingNumbers, today)
  );

  // Dates
  const [invoiceDate, setInvoiceDate] = useState(today);

  // Latest entry date among finished entries
  const latestEntryDate = useMemo(() => {
    const dates = finishedEntries.map((e) => e.date).sort().reverse();
    return dates[0] || today;
  }, [finishedEntries, today]);

  const [completedDate, setCompletedDate] = useState(latestEntryDate);
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const saving = useRef(false); // a second tap during the save must not make a second invoice

  // Selected entries objects
  const selectedEntries = useMemo(() => {
    return finishedEntries.filter((e) => selectedEntryIds.has(e._id));
  }, [finishedEntries, selectedEntryIds]);

  // Calculate live totals
  const totals = useMemo(() => {
    const laborHours = selectedEntries.map((e) => billableHours(e.minutes ?? 0));
    const rateCents = Math.round((job?.rate ?? settings.defaultRate) * 100);
    const items = toLineItems(lineItems);

    return invoiceTotals(laborHours, rateCents, items, settings.taxRate);
  }, [selectedEntries, job?.rate, settings.defaultRate, settings.taxRate, lineItems]);

  if (!job) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 text-center">
        <p className="text-ink-2">Job not found.</p>
        <a href="#/" className="mt-4 inline-block text-mark hover:underline">
          Return to home
        </a>
      </div>
    );
  }

  const toggleEntry = (id: string) => {
    const next = new Set(selectedEntryIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedEntryIds(next);
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) {
      setError('Invoice number is required.');
      return;
    }
    if (!summary.trim()) {
      setError('A one-sentence summary is required.');
      return;
    }
    if (hasBadPrice(lineItems)) {
      setError(PRICE_ERROR);
      return;
    }

    if (saving.current) return;
    saving.current = true;
    const newInvoiceId = `invoice:${crypto.randomUUID()}` as const;
    const formattedItems = toLineItems(lineItems);

    const invoiceDoc: InvoiceDoc = {
      _id: newInvoiceId,
      type: 'invoice',
      jobId: job._id,
      number: invoiceNumber.trim(),
      date: invoiceDate,
      completedDate,
      summary: summary.trim(),
      notes: notes.trim() || undefined,
      businessName: settings.businessName,
      customer: job.customer,
      address: job.address,
      jobName: job.name,
      rateCents: Math.round(job.rate * 100),
      taxRate: settings.taxRate,
      taxLabel: settings.taxLabel,
      paymentTerms: settings.paymentTerms,
      labor: selectedEntries.map((entry) => ({
        entryId: entry._id,
        date: entry.date,
        task: entry.task,
        hours: billableHours(entry.minutes ?? 0),
      })),
      items: formattedItems,
      totals,
    };

    // Save invoice document
    await saveDoc(invoiceDoc._id, () => invoiceDoc);

    // Set invoiceId on included entries
    for (const entry of selectedEntries) {
      await saveDoc<EntryDoc>(entry._id, (e) => e && { ...e, invoiceId: invoiceDoc._id });
    }

    // Redirect to invoice view
    window.location.hash = `#/invoice/${invoiceDoc._id}`;
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <a href={`#/job/${job._id}`} className="text-sm text-ink-2 hover:text-ink">
          ← Back to job
        </a>
        <h1 className="text-xl font-bold tracking-tight text-ink">Create Invoice</h1>
      </div>

      <div className="mb-6 rounded border border-rule bg-field p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs uppercase tracking-wider text-ink-2 font-medium">
              {job.customer}
            </span>
            <h2 className="text-lg font-bold text-ink">{job.name}</h2>
          </div>
          <span className="fig text-sm font-semibold text-ink-2">
            Rate: ${job.rate}/hr
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-500/50 bg-red-950/20 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSaveInvoice} className="space-y-6">
        {/* Invoice Header Details */}
        <div className="grid grid-cols-1 gap-4 rounded border border-rule bg-field p-4 sm:grid-cols-3">
          <div>
            <label htmlFor="inv-num" className="block text-xs font-medium text-ink">
              Invoice Number
            </label>
            <input
              id="inv-num"
              type="text"
              required
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="fig mt-1 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink font-semibold"
            />
          </div>
          <div>
            <label htmlFor="inv-date" className="block text-xs font-medium text-ink">
              Invoice Date
            </label>
            <input
              id="inv-date"
              type="date"
              required
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="fig mt-1 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink"
            />
          </div>
          <div>
            <label htmlFor="comp-date" className="block text-xs font-medium text-ink">
              Work Completed Date
            </label>
            <input
              id="comp-date"
              type="date"
              required
              value={completedDate}
              onChange={(e) => setCompletedDate(e.target.value)}
              className="fig mt-1 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink"
            />
          </div>
        </div>

        {/* One-Sentence Summary */}
        <div className="rounded border border-rule bg-field p-4">
          <label htmlFor="summary" className="block text-xs font-medium text-ink">
            One-sentence summary
          </label>
          <input
            id="summary"
            type="text"
            required
            placeholder="e.g. Installed water filtration system and replaced shutoff valves."
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-2/60 focus:border-mark focus:outline-none"
          />
        </div>

        {/* Time Entries Checklist */}
        <div className="rounded border border-rule bg-field p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink">
              Include Labor Entries ({finishedEntries.length})
            </h3>
            <span className="fig text-xs text-ink-2">
              Selected: {totals.laborHours} hrs ({formatMoney(totals.laborCents)})
            </span>
          </div>

          {finishedEntries.length === 0 ? (
            <p className="text-xs text-ink-2 italic">
              No un-invoiced time entries available for this job.
            </p>
          ) : (
            <div className="space-y-2">
              {finishedEntries.map((entry) => {
                const hrs = billableHours(entry.minutes ?? 0);
                const isChecked = selectedEntryIds.has(entry._id);

                return (
                  <label
                    key={entry._id}
                    className={`flex items-center justify-between rounded border p-2.5 cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-mark/60 bg-paper'
                        : 'border-rule/50 bg-paper/40 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleEntry(entry._id)}
                        className="h-4 w-4 rounded border-rule text-mark focus:ring-mark"
                      />
                      <div className="truncate">
                        <span className="fig mr-2 text-xs text-ink-2">{entry.date}</span>
                        <span className="text-sm font-medium text-ink">
                          {entry.task || 'Labor'}
                        </span>
                      </div>
                    </div>
                    <span className="fig text-xs font-semibold text-ink shrink-0 ml-3">
                      {hrs} hrs
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <ItemsEditor items={lineItems} setItems={setLineItems} />

        {/* Optional Notes */}
        <div className="rounded border border-rule bg-field p-4">
          <label htmlFor="inv-notes" className="block text-xs font-medium text-ink">
            Optional Notes
          </label>
          <textarea
            id="inv-notes"
            rows={2}
            placeholder="Additional notes for the client..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-ink-2/60 focus:border-mark focus:outline-none"
          />
        </div>

        <TotalsPreview totals={totals} taxLabel={settings.taxLabel} taxRate={settings.taxRate} dueLabel="Amount due" />

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <a
            href={`#/job/${job._id}`}
            className="flex min-h-[44px] items-center justify-center rounded border border-rule px-4 py-2 text-sm text-ink-2 hover:text-ink"
          >
            Cancel
          </a>
          <button
            type="submit"
            className="flex min-h-[44px] items-center justify-center rounded bg-mark px-6 py-2 font-semibold text-on-mark hover:opacity-90"
          >
            Save invoice
          </button>
        </div>
      </form>
    </div>
  );
}
