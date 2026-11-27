import type { InvoiceDoc, QuoteDoc } from '../types';
import { removeDoc, saveDoc } from '../db';
import { formatMoney, hoursLabel, quoteTotals } from '../billing';
import { SheetItemSections, SheetTotals } from './InvoiceParts';
import '../invoice.css';

const STATUSES = [
  ['sent', 'Mark sent'],
  ['accepted', 'Mark accepted'],
  ['declined', 'Mark declined'],
] as const;

export function QuoteViewScreen({ quoteId, quotes, invoices }: { quoteId: string; quotes: QuoteDoc[]; invoices: InvoiceDoc[] }) {
  const quote = quotes.find((q) => q._id === quoteId);

  if (!quote) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 text-center text-ink">
        <p className="text-ink-2">Quote not found.</p>
        <a href="#/quotes" className="mt-4 inline-block text-mark hover:underline">
          View all quotes
        </a>
      </div>
    );
  }

  const totals = quoteTotals(quote);
  const quoteInvoices = invoices.filter((invoice) => invoice.quoteId === quote._id);
  const laborRows = quote.labor.filter((row) => row.hours > 0);
  const setStatus = (status: QuoteDoc['status']) => saveDoc<QuoteDoc>(quote._id, (q) => q && { ...q, status });

  const handleDelete = async () => {
    if (window.confirm(`Delete quote ${quote.number}?`)) {
      await removeDoc(quote._id);
      window.location.hash = '#/quotes';
    }
  };

  return (
    <div className="invoice-container py-6">
      <div className="no-print mx-auto mb-6 flex max-w-[760px] flex-wrap items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-3">
          <a href={`#/job/${quote.jobId}`} className="text-sm text-ink-2 hover:text-ink transition-colors">
            ← Back to job
          </a>
          <span className="text-rule">|</span>
          <a href="#/quotes" className="text-sm text-ink-2 hover:text-ink transition-colors">
            All quotes
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">Status: {quote.status}</span>
          {STATUSES.filter(([status]) => status !== quote.status).map(([status, label]) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatus(status)}
              className="rounded border border-rule px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-ink-2"
            >
              {label}
            </button>
          ))}
          {quote.status === 'draft' && (
            <a
              href={`#/quote/${quote._id}/edit`}
              className="rounded border border-rule px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-ink-2"
            >
              Edit quote
            </a>
          )}
          {quoteInvoices.map((invoice) => (
            <a
              key={invoice._id}
              href={`#/invoice/${invoice._id}`}
              className="text-xs font-semibold text-mark hover:underline"
            >
              Invoiced as {invoice.number}
            </a>
          ))}
          {quote.status === 'accepted' && (
            <a
              href={`#/invoice/new?job=${quote.jobId}&quote=${quote._id}`}
              className="rounded border border-rule px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-ink-2"
            >
              {quoteInvoices.length > 0 ? 'Create another invoice' : 'Create invoice'}
            </a>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="rounded border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-950/20 transition-colors"
          >
            Delete quote
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex min-h-[38px] items-center justify-center rounded bg-mark px-4 py-1.5 text-xs font-bold text-on-mark hover:opacity-90 transition-opacity"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="invoice-sheet">
        <header className="masthead">
          <div className="eyebrow">Quote &nbsp;·&nbsp; {quote.number}</div>
          <h1>{quote.jobName}</h1>
          <p className="subtitle" style={{ whiteSpace: 'pre-line' }}>{quote.summary}</p>
          <dl className="facts">
            <div className="fact">
              <dt>Prepared for</dt>
              <dd>
                {quote.customer}
                {quote.address && <><br />{quote.address}</>}
              </dd>
            </div>
            <div className="fact">
              <dt>From</dt>
              <dd>{quote.businessName}</dd>
            </div>
            <div className="fact">
              <dt>Quote date</dt>
              <dd className="num">{quote.date}</dd>
            </div>
            <div className="fact">
              <dt>Pricing valid through</dt>
              <dd className="num">{quote.validUntil}</dd>
            </div>
          </dl>
        </header>

        <SheetItemSections items={quote.items} totals={totals} />

        {laborRows.length > 0 && (
          <section className="group">
            <div className="group-head">
              <h2>Labor</h2>
            </div>
            <div className="hours">
              <table>
                <caption>Estimated labor, {hoursLabel(totals.laborHours)}</caption>
                <thead>
                  <tr>
                    <th>Task</th>
                    <th className="hrs">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {laborRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.task || 'Labor'}</td>
                      <td className="hrs num">{row.hours}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>
                      {hoursLabel(totals.laborHours)} @ {formatMoney(quote.rateCents)}
                    </td>
                    <td className="hrs num">{formatMoney(totals.laborCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="subtotal">
              <span>Labor subtotal</span>
              <span className="num">{formatMoney(totals.laborCents)}</span>
            </div>
          </section>
        )}

        <SheetTotals totals={totals} taxLabel={quote.taxLabel} taxRate={quote.taxRate} dueLabel="Estimated total" />

        {quote.notes && (
          <section>
            <div className="group-head" style={{ marginBottom: '12px' }}>
              <h2>Exclusions and conditions</h2>
            </div>
            <p style={{ whiteSpace: 'pre-line', color: 'var(--ink-soft)' }}>{quote.notes}</p>
          </section>
        )}

        <section className="terms">
          <p>
            <b>This is an estimate.</b> Pricing is valid through {quote.validUntil}. Questions about anything on this quote are welcome at any time.
          </p>
        </section>
      </div>
    </div>
  );
}
