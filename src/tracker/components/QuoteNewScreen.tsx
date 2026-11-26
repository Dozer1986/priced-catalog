import { useState, useRef } from 'react';
import type { JobDoc, SettingsDoc, QuoteDoc } from '../types';
import { saveDoc } from '../db';
import {
  addDays,
  getLocalDateString,
  hasBadPrice,
  nextQuoteNumber,
  parseHours,
  PRICE_ERROR,
  quoteTotals,
  toLineItems,
  type EditableItem,
} from '../billing';
import { ItemsEditor, TotalsPreview } from './InvoiceParts';

interface QuoteNewScreenProps {
  jobId: string; // new quote for this job
  quoteId?: string; // or edit this draft
  jobs: JobDoc[];
  quotes: QuoteDoc[];
  settings: SettingsDoc;
}

interface EditableLabor {
  id: string;
  task: string;
  hoursStr: string;
}

interface Form {
  number: string;
  date: string;
  validUntil: string;
  summary: string;
  notes: string;
}

const parseEstimate = (text: string) => {
  const minutes = parseHours(text);
  return minutes === null ? null : Math.round((minutes / 60) * 100) / 100;
};

/** What the form would save, in the quote's own shape. */
function fields(form: Form, labor: EditableLabor[], items: EditableItem[]) {
  return {
    number: form.number.trim(),
    date: form.date,
    validUntil: form.validUntil,
    summary: form.summary.trim(),
    notes: form.notes.trim(),
    labor: labor
      .filter((row) => row.task.trim() || row.hoursStr.trim())
      .map((row) => ({ task: row.task.trim(), hours: parseEstimate(row.hoursStr) ?? 0 })),
    items: toLineItems(items),
  };
}

export function QuoteNewScreen({ jobId, quoteId, jobs, quotes, settings }: QuoteNewScreenProps) {
  const quote = quotes.find((q) => q._id === quoteId);
  const job = jobs.find((j) => j._id === (quote?.jobId ?? jobId));

  // The form as it opened, so an edit saves only the fields the user changed (see merge.ts)
  const [initial] = useState(() => {
    const today = getLocalDateString();
    return {
      form: quote
        ? { number: quote.number, date: quote.date, validUntil: quote.validUntil, summary: quote.summary, notes: quote.notes }
        : { number: nextQuoteNumber(quotes.map((q) => q.number), today), date: today, validUntil: addDays(today, 30), summary: '', notes: '' },
      labor: (quote?.labor ?? []).map((row) => ({ id: crypto.randomUUID(), task: row.task, hoursStr: String(row.hours) })),
      items: (quote?.items ?? []).map((item) => ({
        id: crypto.randomUUID(),
        kind: item.kind,
        description: item.description,
        qty: item.qty,
        unitPriceStr: (item.unitPriceCents / 100).toFixed(2),
      })),
    };
  });
  const [form, setForm] = useState<Form>(initial.form);
  const [labor, setLabor] = useState<EditableLabor[]>(initial.labor);
  const [items, setItems] = useState<EditableItem[]>(initial.items);
  const [error, setError] = useState('');
  const saving = useRef(false); // a second tap during the save must not make a second quote

  if (!job || (quoteId && !quote)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 text-center">
        <p className="text-ink-2">{job ? 'Quote' : 'Job'} not found.</p>
        <a href="#/" className="mt-4 inline-block text-mark hover:underline">
          Return to home
        </a>
      </div>
    );
  }

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setDate = (date: string) =>
    // the validity date follows the quote date until it is changed by hand
    set(form.validUntil === addDays(form.date, 30) ? { date, validUntil: addDays(date, 30) } : { date });
  const setRow = (id: string, patch: Partial<EditableLabor>) =>
    setLabor((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const rateCents = quote?.rateCents ?? Math.round(job.rate * 100);
  const taxRate = quote?.taxRate ?? settings.taxRate;
  const taxLabel = quote?.taxLabel ?? settings.taxLabel;
  const current = fields(form, labor, items);
  const totals = quoteTotals({ ...current, rateCents, taxRate });
  const backHref = quote ? `#/quote/${quote._id}` : `#/job/${job._id}`;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current.number) return setError('Quote number is required.');
    if (!current.summary) return setError('Describe the scope of work.');
    if (labor.some((row) => row.hoursStr.trim() && parseEstimate(row.hoursStr) === null)) {
      return setError('Enter each estimate in hours, like 2.5 or 2:30.');
    }
    if (hasBadPrice(items)) return setError(PRICE_ERROR);
    if (saving.current) return;
    saving.current = true;

    let id: QuoteDoc['_id'];
    if (quote) {
      id = quote._id;
      const before = fields(initial.form, initial.labor, initial.items);
      const changed = Object.fromEntries(
        Object.entries(current).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key as keyof typeof before])),
      );
      if (Object.keys(changed).length) {
        await saveDoc<QuoteDoc>(id, (q) => q && { ...q, ...changed });
      }
    } else {
      id = `quote:${crypto.randomUUID()}`;
      const doc: QuoteDoc = {
        _id: id,
        type: 'quote',
        jobId: job._id,
        ...current,
        status: 'draft',
        businessName: settings.businessName,
        customer: job.customer,
        address: job.address,
        jobName: job.name,
        rateCents,
        taxRate,
        taxLabel,
        createdAt: new Date().toISOString(),
      };
      await saveDoc(id, () => doc);
    }
    window.location.hash = `#/quote/${id}`;
  };

  const input = 'mt-1 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <a href={backHref} className="text-sm text-ink-2 hover:text-ink">
          ← Back
        </a>
        <h1 className="text-xl font-bold tracking-tight text-ink">{quote ? 'Edit Quote' : 'New Quote'}</h1>
      </div>

      <div className="mb-6 rounded border border-rule bg-field p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs uppercase tracking-wider text-ink-2 font-medium">{job.customer}</span>
            <h2 className="text-lg font-bold text-ink">{job.name}</h2>
          </div>
          <span className="fig text-sm font-semibold text-ink-2">Rate: ${rateCents / 100}/hr</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-500/50 bg-red-950/20 p-3 text-sm text-red-200">{error}</div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 rounded border border-rule bg-field p-4 sm:grid-cols-3">
          <div>
            <label htmlFor="quote-num" className="block text-xs font-medium text-ink">Quote Number</label>
            <input id="quote-num" type="text" required value={form.number} onChange={(e) => set({ number: e.target.value })} className={`fig font-semibold ${input}`} />
          </div>
          <div>
            <label htmlFor="quote-date" className="block text-xs font-medium text-ink">Quote Date</label>
            <input id="quote-date" type="date" required value={form.date} onChange={(e) => setDate(e.target.value)} className={`fig ${input}`} />
          </div>
          <div>
            <label htmlFor="quote-valid" className="block text-xs font-medium text-ink">Valid Through</label>
            <input id="quote-valid" type="date" required value={form.validUntil} onChange={(e) => set({ validUntil: e.target.value })} className={`fig ${input}`} />
          </div>
        </div>

        <div className="rounded border border-rule bg-field p-4">
          <label htmlFor="quote-summary" className="block text-xs font-medium text-ink">Scope of work</label>
          <textarea
            id="quote-summary"
            rows={3}
            placeholder="e.g. Replace the kitchen faucet and both supply lines."
            value={form.summary}
            onChange={(e) => set({ summary: e.target.value })}
            className={`${input} placeholder:text-ink-2/60 focus:border-mark focus:outline-none`}
          />
        </div>

        <div className="rounded border border-rule bg-field p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink">Estimated Labor</h3>
            <button
              type="button"
              onClick={() => setLabor((rows) => [...rows, { id: crypto.randomUUID(), task: '', hoursStr: '' }])}
              className="rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:border-ink-2"
            >
              + Add Labor
            </button>
          </div>
          {labor.length === 0 ? (
            <p className="text-xs text-ink-2 italic">No labor added yet.</p>
          ) : (
            <div className="space-y-3">
              {labor.map((row) => (
                <div key={row.id} className="flex items-center gap-2 rounded border border-rule bg-paper p-3">
                  <input
                    type="text"
                    aria-label="Labor task"
                    placeholder="Task"
                    value={row.task}
                    onChange={(e) => setRow(row.id, { task: e.target.value })}
                    className="min-w-0 flex-1 rounded border border-rule bg-field px-2.5 py-1 text-xs text-ink"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Estimated hours"
                    placeholder="Hours"
                    value={row.hoursStr}
                    onChange={(e) => setRow(row.id, { hoursStr: e.target.value })}
                    className="fig w-20 rounded border border-rule bg-field px-2 py-1 text-xs text-ink"
                  />
                  <button
                    type="button"
                    onClick={() => setLabor((rows) => rows.filter((r) => r.id !== row.id))}
                    className="text-red-400 hover:text-red-300 px-2 py-1 text-xs"
                    title="Remove row"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <ItemsEditor items={items} setItems={setItems} />

        <div className="rounded border border-rule bg-field p-4">
          <label htmlFor="quote-notes" className="block text-xs font-medium text-ink">Exclusions and conditions</label>
          <textarea
            id="quote-notes"
            rows={2}
            placeholder="e.g. Drywall repair not included."
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            className={`${input} placeholder:text-ink-2/60 focus:border-mark focus:outline-none`}
          />
        </div>

        <TotalsPreview totals={totals} taxLabel={taxLabel} taxRate={taxRate} dueLabel="Estimated total" />

        <div className="flex justify-end gap-3 pt-2">
          <a
            href={backHref}
            className="flex min-h-[44px] items-center justify-center rounded border border-rule px-4 py-2 text-sm text-ink-2 hover:text-ink"
          >
            Cancel
          </a>
          <button
            type="submit"
            className="flex min-h-[44px] items-center justify-center rounded bg-mark px-6 py-2 font-semibold text-on-mark hover:opacity-90"
          >
            Save quote
          </button>
        </div>
      </form>
    </div>
  );
}
