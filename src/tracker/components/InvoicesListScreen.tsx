import type { InvoiceDoc } from '../types';
import { formatMoney } from '../billing';

interface InvoicesListScreenProps {
  invoices: InvoiceDoc[];
}

export function InvoicesListScreen({ invoices }: InvoicesListScreenProps) {
  const sortedInvoices = [...invoices].sort((a, b) => {
    return b.date.localeCompare(a.date) || b.number.localeCompare(a.number);
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Invoices</h1>
        <a
          href="#/"
          className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 hover:text-ink"
        >
          View jobs
        </a>
      </div>

      {sortedInvoices.length === 0 ? (
        <div className="rounded border border-dashed border-rule p-8 text-center text-ink-2">
          <p>No invoices created yet.</p>
          <p className="mt-1 text-xs text-ink-2/80">
            Open a job and tap &quot;Create invoice&quot; to generate an invoice from its time entries.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-rule bg-field">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-rule bg-paper text-xs uppercase tracking-wider text-ink-2">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Amount Due</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {sortedInvoices.map((inv) => (
                <tr key={inv._id} className="hover:bg-paper/40 transition-colors">
                  <td className="px-4 py-3 font-semibold text-mark">
                    <a href={`#/invoice/${inv._id}`} className="hover:underline">
                      {inv.number}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    <span className="font-medium">{inv.customer}</span>
                    <span className="block text-xs text-ink-2 truncate max-w-xs">
                      {inv.jobName}
                    </span>
                  </td>
                  <td className="fig px-4 py-3 whitespace-nowrap text-xs text-ink-2">
                    {inv.date}
                  </td>
                  <td className="fig px-4 py-3 whitespace-nowrap text-right font-bold text-ink">
                    {formatMoney(inv.totals.dueCents)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-xs">
                    <a
                      href={`#/invoice/${inv._id}`}
                      className="rounded border border-rule bg-paper px-3 py-1.5 font-medium text-ink hover:border-ink-2"
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
