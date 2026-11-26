import type { QuoteDoc } from '../types';
import { formatMoney } from '../billing';

export function QuotesListScreen({ quotes }: { quotes: QuoteDoc[] }) {
  const sorted = [...quotes].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Quotes</h1>
        <a href="#/" className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 hover:text-ink">
          View jobs
        </a>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded border border-dashed border-rule p-8 text-center text-ink-2">
          <p>No quotes yet.</p>
          <p className="mt-1 text-xs text-ink-2/80">Open a job and tap &quot;New quote&quot;.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-rule bg-field">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-rule bg-paper text-xs uppercase tracking-wider text-ink-2">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Estimated Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {sorted.map((q) => (
                <tr key={q._id} className="hover:bg-paper/40 transition-colors">
                  <td className="px-4 py-3 font-semibold text-mark">
                    <a href={`#/quote/${q._id}`} className="hover:underline">
                      {q.number}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    <span className="font-medium">{q.customer}</span>
                    <span className="block text-xs text-ink-2 truncate max-w-xs">{q.jobName}</span>
                  </td>
                  <td className="fig px-4 py-3 whitespace-nowrap text-xs text-ink-2">{q.date}</td>
                  <td className="px-4 py-3 text-xs capitalize text-ink-2">{q.status}</td>
                  <td className="fig px-4 py-3 whitespace-nowrap text-right font-bold text-ink">
                    {formatMoney(q.totals.dueCents)}
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
