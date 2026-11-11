import type { InvoiceDoc, EntryDoc } from '../types';
import { removeDoc, saveDoc } from '../db';
import { formatMoney } from '../billing';
import '../invoice.css';

interface InvoiceViewScreenProps {
  invoiceId: string;
  invoices: InvoiceDoc[];
  entries: EntryDoc[];
}

export function InvoiceViewScreen({
  invoiceId,
  invoices,
  entries,
}: InvoiceViewScreenProps) {
  const invoice = invoices.find((inv) => inv._id === invoiceId);

  if (!invoice) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 text-center text-ink">
        <p className="text-ink-2">Invoice not found.</p>
        <a href="#/invoices" className="mt-4 inline-block text-mark hover:underline">
          View all invoices
        </a>
      </div>
    );
  }

  const equipmentItems = invoice.items.filter((item) => item.kind === 'equipment');
  const materialsItems = invoice.items.filter((item) => item.kind === 'materials');
  // Omit 0-hour labor rows
  const laborRows = invoice.labor.filter((row) => row.hours > 0);

  const handleDelete = async () => {
    if (
      window.confirm(
        `Delete invoice ${invoice.number}? The associated labor entries will be unlocked and un-billed.`
      )
    ) {
      // Find matching entries
      const associated = entries.filter((e) => e.invoiceId === invoice._id);
      for (const entry of associated) {
        await saveDoc<EntryDoc>(entry._id, (e) => e && { ...e, invoiceId: undefined });
      }
      await removeDoc(invoice._id);
      window.location.hash = '#/invoices';
    }
  };

  return (
    <div className="invoice-container py-6">
      {/* Action Toolbar (Hidden on print) */}
      <div className="no-print mx-auto mb-6 flex max-w-[760px] flex-wrap items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-3">
          <a
            href={`#/job/${invoice.jobId}`}
            className="text-sm text-ink-2 hover:text-ink transition-colors"
          >
            ← Back to job
          </a>
          <span className="text-rule">|</span>
          <a
            href="#/invoices"
            className="text-sm text-ink-2 hover:text-ink transition-colors"
          >
            All invoices
          </a>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDelete}
            className="rounded border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-950/20 transition-colors"
          >
            Delete invoice
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

      {/* Invoice Sheet */}
      <div className="invoice-sheet">
        <header className="masthead">
          <div className="eyebrow">Invoice &nbsp;·&nbsp; {invoice.number}</div>
          <h1>{invoice.jobName}</h1>
          <p className="subtitle">{invoice.summary}</p>
          <dl className="facts">
            <div className="fact">
              <dt>Billed to</dt>
              <dd>
                {invoice.customer}
                {invoice.address && <><br />{invoice.address}</>}
              </dd>
            </div>
            <div className="fact">
              <dt>From</dt>
              <dd>{invoice.businessName}</dd>
            </div>
            <div className="fact">
              <dt>Invoice date</dt>
              <dd className="num">{invoice.date}</dd>
            </div>
            <div className="fact">
              <dt>Work completed</dt>
              <dd className="num">{invoice.completedDate}</dd>
            </div>
          </dl>
        </header>

        {/* Section Equipment (omit if no equipment items) */}
        {equipmentItems.length > 0 && (
          <section className="group">
            <div className="group-head">
              <h2>Equipment</h2>
            </div>
            {equipmentItems.map((item, idx) => (
              <div key={idx} className="line">
                <div className="line-main">
                  <span className="line-name">{item.description}</span>
                  <span className="line-desc">
                    {item.qty} × {formatMoney(item.unitPriceCents)}
                  </span>
                </div>
                <span className="line-cost num">
                  {formatMoney(Math.round(item.qty * item.unitPriceCents))}
                </span>
              </div>
            ))}
            <div className="subtotal">
              <span>Equipment subtotal</span>
              <span className="num">{formatMoney(invoice.totals.equipmentCents)}</span>
            </div>
          </section>
        )}

        {/* Section Materials (omit if no materials items) */}
        {materialsItems.length > 0 && (
          <section className="group">
            <div className="group-head">
              <h2>Materials</h2>
            </div>
            {materialsItems.map((item, idx) => (
              <div key={idx} className="line">
                <div className="line-main">
                  <span className="line-name">{item.description}</span>
                  <span className="line-desc">
                    {item.qty} × {formatMoney(item.unitPriceCents)}
                  </span>
                </div>
                <span className="line-cost num">
                  {formatMoney(Math.round(item.qty * item.unitPriceCents))}
                </span>
              </div>
            ))}
            <div className="subtotal">
              <span>Materials subtotal</span>
              <span className="num">{formatMoney(invoice.totals.materialsCents)}</span>
            </div>
          </section>
        )}

        {/* Section Labor (omit 0-hour rows) */}
        <section className="group">
          <div className="group-head">
            <h2>Labor</h2>
          </div>
          <div className="hours">
            <table>
              <caption>Labor, {invoice.totals.laborHours} hours</caption>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Date</th>
                  <th className="hrs">Hours</th>
                </tr>
              </thead>
              <tbody>
                {laborRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-ink-soft italic">
                      No billed labor hours.
                    </td>
                  </tr>
                ) : (
                  laborRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.task || 'Labor'}</td>
                      <td className="num">{row.date}</td>
                      <td className="hrs num">{row.hours}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>
                    {invoice.totals.laborHours} hours @ {formatMoney(invoice.rateCents)}
                  </td>
                  <td className="hrs num">{formatMoney(invoice.totals.laborCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="subtotal">
            <span>Labor subtotal</span>
            <span className="num">{formatMoney(invoice.totals.laborCents)}</span>
          </div>
        </section>

        {/* Totals Section */}
        <section className="total">
          <div className="row">
            <span>Equipment</span>
            <span className="num">{formatMoney(invoice.totals.equipmentCents)}</span>
          </div>
          <div className="row">
            <span>Materials</span>
            <span className="num">{formatMoney(invoice.totals.materialsCents)}</span>
          </div>
          <div className="row">
            <span>Labor, {invoice.totals.laborHours} hours</span>
            <span className="num">{formatMoney(invoice.totals.laborCents)}</span>
          </div>
          <div className="row">
            <span>Subtotal</span>
            <span className="num">{formatMoney(invoice.totals.subtotalCents)}</span>
          </div>
          <div className="row">
            <span>
              {invoice.taxLabel}, {Math.round(invoice.taxRate * 10000) / 100}% on equipment and materials (labor not taxed)
            </span>
            <span className="num">{formatMoney(invoice.totals.taxCents)}</span>
          </div>
          <div className="row grand">
            <span>Amount due</span>
            <b className="num">{formatMoney(invoice.totals.dueCents)}</b>
          </div>
        </section>

        {/* Notes (if any) */}
        {invoice.notes && (
          <section>
            <div className="group-head" style={{ marginBottom: '12px' }}>
              <h2>Notes</h2>
            </div>
            <p style={{ whiteSpace: 'pre-line', color: 'var(--ink-soft)' }}>
              {invoice.notes}
            </p>
          </section>
        )}

        {/* Payment Terms & Footer */}
        <section className="terms">
          <p>
            <b>Payment due</b> {invoice.paymentTerms}
          </p>
          <p>
            <b>Thank you.</b> Questions about anything on this invoice or the system are welcome at any time.
          </p>
        </section>
      </div>
    </div>
  );
}
