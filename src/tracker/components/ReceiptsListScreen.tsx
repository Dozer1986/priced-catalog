import type { ReceiptDoc } from '../types';
import { formatMoney } from '../billing';
import { linesTotalCents } from '../receipt';

interface ReceiptsListScreenProps {
  receipts: ReceiptDoc[];
}

export function ReceiptsListScreen({ receipts }: ReceiptsListScreenProps) {
  const sorted = [...receipts].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Receipts</h1>
        <a
          href="#/receipt/new"
          className="flex min-h-[44px] items-center justify-center rounded bg-mark px-4 py-2 text-sm font-semibold text-on-mark hover:opacity-90 transition-opacity"
        >
          + New receipt
        </a>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded border border-dashed border-rule p-8 text-center text-ink-2">
          <p>No receipts yet.</p>
          <p className="mt-1 text-xs text-ink-2/80">Tap &quot;New receipt&quot; and take a photo of a store receipt.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => (
            <a
              key={r._id}
              href={`#/receipt/${r._id}`}
              className="flex items-center justify-between gap-3 rounded border border-rule bg-field p-4 hover:border-ink-2"
            >
              <div className="min-w-0">
                <span className="fig text-xs text-ink-2">{r.date}</span>
                <span className="block truncate font-bold text-ink">{r.vendor || 'Unknown store'}</span>
                <span className="block truncate text-xs text-ink-2">
                  {[r.storeCity, r.storeState].filter(Boolean).join(', ')} · {r.lines.length} lines
                </span>
              </div>
              <div className="text-right">
                <span className="fig block font-bold text-ink">{formatMoney(r.totalCents ?? linesTotalCents(r.lines))}</span>
                <span className={`text-xs ${r.importedAt ? 'text-mark' : 'text-ink-2'}`}>
                  {r.importedAt ? 'In ledger' : 'Waiting for ledger'}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
