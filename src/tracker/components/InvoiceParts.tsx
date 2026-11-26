// Pieces shared by the invoice and quote screens, so a quote looks and adds up like the invoice it becomes.
import type { Dispatch, SetStateAction } from 'react';
import type { InvoiceLineItem, InvoiceTotals } from '../types';
import { formatMoney, hoursLabel, type EditableItem } from '../billing';

export function ItemsEditor({ items, setItems }: { items: EditableItem[]; setItems: Dispatch<SetStateAction<EditableItem[]>> }) {
  const addLineItem = (kind: 'equipment' | 'materials') => {
    setItems((prev) => [...prev, { id: crypto.randomUUID(), kind, description: '', qty: 1, unitPriceStr: '' }]);
  };
  const updateLineItem = (id: string, updates: Partial<EditableItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };
  const removeLineItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="rounded border border-rule bg-field p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink">
          Equipment & Materials
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => addLineItem('equipment')}
            className="rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:border-ink-2"
          >
            + Add Equipment
          </button>
          <button
            type="button"
            onClick={() => addLineItem('materials')}
            className="rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:border-ink-2"
          >
            + Add Materials
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-ink-2 italic">
          No equipment or materials added yet.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded border border-rule bg-paper p-3 sm:flex-row sm:items-center"
            >
              <select
                value={item.kind}
                onChange={(e) =>
                  updateLineItem(item.id, {
                    kind: e.target.value as 'equipment' | 'materials',
                  })
                }
                className="rounded border border-rule bg-field px-2 py-1 text-xs text-ink"
              >
                <option value="equipment">Equipment</option>
                <option value="materials">Materials</option>
              </select>

              <input
                type="text"
                placeholder="Description"
                value={item.description}
                onChange={(e) =>
                  updateLineItem(item.id, { description: e.target.value })
                }
                className="flex-1 rounded border border-rule bg-field px-2.5 py-1 text-xs text-ink"
              />

              <div className="flex items-center gap-2">
                <label className="text-xs text-ink-2">Qty</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={item.qty}
                  onChange={(e) =>
                    updateLineItem(item.id, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })
                  }
                  className="fig w-16 rounded border border-rule bg-field px-2 py-1 text-xs text-ink"
                />

                <label className="text-xs text-ink-2">Price ($)</label>
                <input
                  type="text"
                  placeholder="0.00"
                  value={item.unitPriceStr}
                  onChange={(e) =>
                    updateLineItem(item.id, { unitPriceStr: e.target.value })
                  }
                  className="fig w-24 rounded border border-rule bg-field px-2 py-1 text-xs text-ink"
                />

                <button
                  type="button"
                  onClick={() => removeLineItem(item.id)}
                  className="text-red-400 hover:text-red-300 px-2 py-1 text-xs"
                  title="Remove row"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TotalsProps {
  totals: InvoiceTotals;
  taxLabel: string;
  taxRate: number;
  dueLabel: string; // "Amount due" or "Estimated total"
}

const taxLine = (taxLabel: string, taxRate: number) =>
  `${taxLabel}, ${Math.round(taxRate * 10000) / 100}% on equipment and materials (labor not taxed)`;

/** The totals card on the new invoice / quote form. */
export function TotalsPreview({ totals, taxLabel, taxRate, dueLabel }: TotalsProps) {
  return (
    <div className="rounded border-2 border-rule bg-field p-5 space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2 mb-2">
        Totals Preview
      </h3>
      <div className="flex justify-between text-sm text-ink-2">
        <span>Equipment</span>
        <span className="fig">{formatMoney(totals.equipmentCents)}</span>
      </div>
      <div className="flex justify-between text-sm text-ink-2">
        <span>Materials</span>
        <span className="fig">{formatMoney(totals.materialsCents)}</span>
      </div>
      <div className="flex justify-between text-sm text-ink-2">
        <span>Labor, {hoursLabel(totals.laborHours)}</span>
        <span className="fig">{formatMoney(totals.laborCents)}</span>
      </div>
      <div className="flex justify-between text-sm border-t border-rule pt-2 font-medium text-ink">
        <span>Subtotal</span>
        <span className="fig">{formatMoney(totals.subtotalCents)}</span>
      </div>
      <div className="flex justify-between text-sm text-ink-2">
        <span>{taxLine(taxLabel, taxRate)}</span>
        <span className="fig">{formatMoney(totals.taxCents)}</span>
      </div>
      <div className="flex justify-between text-lg font-bold text-ink border-t border-rule pt-2">
        <span>{dueLabel}</span>
        <span className="fig text-mark">{formatMoney(totals.dueCents)}</span>
      </div>
    </div>
  );
}

/** The Equipment and Materials sections of the printed sheet; each is left out when empty. */
export function SheetItemSections({ items, totals }: { items: InvoiceLineItem[]; totals: InvoiceTotals }) {
  const sections = [
    { kind: 'equipment', title: 'Equipment', cents: totals.equipmentCents },
    { kind: 'materials', title: 'Materials', cents: totals.materialsCents },
  ] as const;
  return (
    <>
      {sections.map(({ kind, title, cents }) => {
        const rows = items.filter((item) => item.kind === kind);
        if (rows.length === 0) return null;
        return (
          <section key={kind} className="group">
            <div className="group-head">
              <h2>{title}</h2>
            </div>
            {rows.map((item, idx) => (
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
              <span>{title} subtotal</span>
              <span className="num">{formatMoney(cents)}</span>
            </div>
          </section>
        );
      })}
    </>
  );
}

/** The totals block of the printed sheet. */
export function SheetTotals({ totals, taxLabel, taxRate, dueLabel }: TotalsProps) {
  return (
    <section className="total">
      <div className="row">
        <span>Equipment</span>
        <span className="num">{formatMoney(totals.equipmentCents)}</span>
      </div>
      <div className="row">
        <span>Materials</span>
        <span className="num">{formatMoney(totals.materialsCents)}</span>
      </div>
      <div className="row">
        <span>Labor, {hoursLabel(totals.laborHours)}</span>
        <span className="num">{formatMoney(totals.laborCents)}</span>
      </div>
      <div className="row">
        <span>Subtotal</span>
        <span className="num">{formatMoney(totals.subtotalCents)}</span>
      </div>
      <div className="row">
        <span>{taxLine(taxLabel, taxRate)}</span>
        <span className="num">{formatMoney(totals.taxCents)}</span>
      </div>
      <div className="row grand">
        <span>{dueLabel}</span>
        <b className="num">{formatMoney(totals.dueCents)}</b>
      </div>
    </section>
  );
}
