import { useState, useId } from 'react';
import type { JobDoc, EntryDoc, SettingsDoc, InvoiceDoc } from '../types';
import {
  putWithRetry,
  removeDoc,
  startJobTimer,
  stopEntryTimer,
} from '../db';
import {
  billableHours,
  parseHours,
  getLocalDateString,
} from '../billing';

interface JobScreenProps {
  mode: 'new' | 'detail';
  jobId?: string;
  jobs: JobDoc[];
  entries: EntryDoc[];
  invoices: InvoiceDoc[];
  settings: SettingsDoc;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) {
    const secs = Math.max(0, Math.round(minutes * 60));
    return `${secs}s`;
  }
  const totalMins = Math.round(minutes);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export function JobScreen({
  mode,
  jobId,
  jobs,
  entries,
  invoices,
  settings,
}: JobScreenProps) {
  const customerDatalistId = useId();

  // Find unique customer names from all jobs
  const customerNames = Array.from(new Set(jobs.map((j) => j.customer.trim()).filter(Boolean)));

  const existingJob = mode === 'detail' ? jobs.find((j) => j._id === jobId) : undefined;

  // New / Edit Job Form State
  const [customer, setCustomer] = useState(existingJob?.customer ?? '');
  const [address, setAddress] = useState(existingJob?.address ?? '');
  const [name, setName] = useState(existingJob?.name ?? '');
  const [rate, setRate] = useState<number>(existingJob?.rate ?? settings.defaultRate);
  const [status, setStatus] = useState<'open' | 'closed'>(existingJob?.status ?? 'open');
  const [isEditingJob, setIsEditingJob] = useState(false);
  const [jobFormError, setJobFormError] = useState('');

  // Add Time Form State
  const [timeDate, setTimeDate] = useState(() => getLocalDateString());
  const [timeHours, setTimeHours] = useState('');
  const [timeTask, setTimeTask] = useState('');
  const [timeError, setTimeError] = useState('');

  // Edit Entry State
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editHours, setEditHours] = useState('');
  const [editTask, setEditTask] = useState('');
  const [editError, setEditError] = useState('');

  // Auto-fill address when picking previously used customer
  const handleCustomerChange = (val: string) => {
    setCustomer(val);
    const trimmed = val.trim().toLowerCase();
    if (trimmed) {
      // Find the most recent job for this customer with an address
      const matching = [...jobs]
        .filter((j) => j.customer.trim().toLowerCase() === trimmed && j.address.trim())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (matching.length > 0 && matching[0]?.address) {
        setAddress(matching[0].address);
      }
    }
  };

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer.trim()) {
      setJobFormError('Customer name is required.');
      return;
    }
    if (!name.trim()) {
      setJobFormError('Job name is required.');
      return;
    }

    if (mode === 'new') {
      const newJobId = `job:${crypto.randomUUID()}` as const;
      const newJob: JobDoc = {
        _id: newJobId,
        type: 'job',
        customer: customer.trim(),
        address: address.trim(),
        name: name.trim(),
        rate: Number(rate) || settings.defaultRate,
        status,
        createdAt: new Date().toISOString(),
      };
      await putWithRetry(newJob);
      window.location.hash = `#/job/${newJob._id}`;
    } else if (existingJob) {
      await putWithRetry({
        ...existingJob,
        customer: customer.trim(),
        address: address.trim(),
        name: name.trim(),
        rate: Number(rate) || settings.defaultRate,
        status,
      });
      setIsEditingJob(false);
      setJobFormError('');
    }
  };

  const handleAddTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingJob) return;

    const parsedMins = parseHours(timeHours);
    if (parsedMins === null || parsedMins < 0) {
      setTimeError('Enter hours as 2.5 or 2:30 (minutes under 60)');
      return;
    }

    const newEntry: EntryDoc = {
      _id: `entry:${crypto.randomUUID()}`,
      type: 'entry',
      jobId: existingJob._id,
      date: timeDate || getLocalDateString(),
      task: timeTask.trim(),
      minutes: parsedMins,
    };

    await putWithRetry(newEntry);
    setTimeHours('');
    setTimeTask('');
    setTimeError('');
  };

  const handleStartEditEntry = (entry: EntryDoc) => {
    setEditingEntryId(entry._id);
    setEditDate(entry.date);
    const mins = entry.minutes ?? 0;
    const hrs = billableHours(mins);
    setEditHours(String(hrs));
    setEditTask(entry.task);
    setEditError('');
  };

  const handleSaveEditEntry = async (entry: EntryDoc) => {
    const parsedMins = parseHours(editHours);
    if (parsedMins === null || parsedMins < 0) {
      setEditError('Enter hours as 2.5 or 2:30');
      return;
    }

    await putWithRetry({
      ...entry,
      date: editDate || entry.date,
      task: editTask.trim(),
      minutes: parsedMins,
    });
    setEditingEntryId(null);
    setEditError('');
  };

  const handleDeleteEntry = async (entry: EntryDoc) => {
    if (entry.invoiceId) return;
    if (window.confirm('Delete this time entry?')) {
      await removeDoc(entry._id);
    }
  };

  // If in new mode or job not found
  if (mode === 'new') {
    return (
      <div className="mx-auto max-w-xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-ink">New Job</h1>
          <a href="#/" className="text-sm text-ink-2 hover:text-ink">
            Cancel
          </a>
        </div>

        {jobFormError && (
          <div className="mb-4 rounded border border-red-500/50 bg-red-950/20 p-3 text-sm text-red-200">
            {jobFormError}
          </div>
        )}

        <form onSubmit={handleSaveJob} className="space-y-4">
          <div>
            <label htmlFor="customer" className="block text-sm font-medium text-ink">
              Customer name
            </label>
            <input
              id="customer"
              type="text"
              required
              list={customerDatalistId}
              value={customer}
              onChange={(e) => handleCustomerChange(e.target.value)}
              placeholder="e.g. Pat Example"
              className="mt-1 w-full rounded border border-rule bg-field px-3 py-2 text-ink placeholder:text-ink-2/60 focus:border-mark focus:outline-none"
            />
            <datalist id={customerDatalistId}>
              {customerNames.map((cn) => (
                <option key={cn} value={cn} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-ink">
              Customer address (free text, multi-line)
            </label>
            <textarea
              id="address"
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="12 Sample St&#10;Westfield, IN 46074"
              className="mt-1 w-full rounded border border-rule bg-field px-3 py-2 text-ink placeholder:text-ink-2/60 focus:border-mark focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-ink">
              Job name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Faucet swap"
              className="mt-1 w-full rounded border border-rule bg-field px-3 py-2 text-ink placeholder:text-ink-2/60 focus:border-mark focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rate" className="block text-sm font-medium text-ink">
                Hourly rate ($)
              </label>
              <input
                id="rate"
                type="number"
                min={0}
                step={1}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="fig mt-1 w-full rounded border border-rule bg-field px-3 py-2 text-ink focus:border-mark focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="status" className="block text-sm font-medium text-ink">
                Status
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'open' | 'closed')}
                className="mt-1 w-full rounded border border-rule bg-field px-3 py-2 text-ink focus:border-mark focus:outline-none"
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="flex min-h-[44px] w-full items-center justify-center rounded bg-mark px-4 py-2 font-semibold text-on-mark hover:opacity-90 transition-opacity"
            >
              Create job
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (!existingJob) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 text-center">
        <p className="text-ink-2">Job not found.</p>
        <a href="#/" className="mt-4 inline-block text-mark hover:underline">
          Return to home
        </a>
      </div>
    );
  }

  // Job entries
  const jobEntries = entries
    .filter((e) => e.jobId === existingJob._id)
    .sort((a, b) => {
      // Sort running first, then newest date
      if (a.start && !a.end) return -1;
      if (b.start && !b.end) return 1;
      return b.date.localeCompare(a.date);
    });

  const runningEntry = jobEntries.find((e) => e.start && !e.end);
  const invoiceMap = new Map(invoices.map((inv) => [inv._id, inv]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Breadcrumb / Top actions */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <a href="#/" className="text-sm text-ink-2 hover:text-ink">
          ← Back to all jobs
        </a>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditingJob(!isEditingJob)}
            className="rounded border border-rule px-3 py-1.5 text-xs font-medium text-ink hover:border-ink-2"
          >
            {isEditingJob ? 'Cancel edit' : 'Edit job'}
          </button>
          <a
            href={`#/invoice/new?job=${existingJob._id}`}
            className="flex min-h-[36px] items-center justify-center rounded bg-mark px-3.5 py-1 text-xs font-semibold text-on-mark hover:opacity-90"
          >
            Create invoice
          </a>
        </div>
      </div>

      {/* Edit Job Form */}
      {isEditingJob && (
        <div className="mb-6 rounded border border-rule bg-field p-4">
          <h2 className="mb-3 text-base font-bold text-ink">Edit Job Details</h2>
          {jobFormError && (
            <div className="mb-3 text-xs text-red-400">{jobFormError}</div>
          )}
          <form onSubmit={handleSaveJob} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-customer" className="block text-xs font-medium text-ink">
                  Customer
                </label>
                <input
                  id="edit-customer"
                  type="text"
                  required
                  list={customerDatalistId}
                  value={customer}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="mt-1 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink"
                />
              </div>
              <div>
                <label htmlFor="edit-name" className="block text-xs font-medium text-ink">
                  Job name
                </label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink"
                />
              </div>
            </div>

            <div>
              <label htmlFor="edit-address" className="block text-xs font-medium text-ink">
                Address
              </label>
              <textarea
                id="edit-address"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-rate" className="block text-xs font-medium text-ink">
                  Rate ($/hr)
                </label>
                <input
                  id="edit-rate"
                  type="number"
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  className="fig mt-1 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink"
                />
              </div>
              <div>
                <label htmlFor="edit-status" className="block text-xs font-medium text-ink">
                  Status
                </label>
                <select
                  id="edit-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'open' | 'closed')}
                  className="mt-1 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink"
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditingJob(false)}
                className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-mark px-4 py-1.5 text-xs font-semibold text-on-mark"
              >
                Save changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Job Header Card */}
      <div className="rounded border border-rule bg-field p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">
                {existingJob.customer}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${
                  existingJob.status === 'open'
                    ? 'bg-mark/20 text-mark'
                    : 'bg-rule/40 text-ink-2'
                }`}
              >
                {existingJob.status}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">
              {existingJob.name}
            </h1>
            {existingJob.address && (
              <p className="mt-1 whitespace-pre-line text-sm text-ink-2">
                {existingJob.address}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <span className="fig text-lg font-bold text-ink">
              ${existingJob.rate}/hr
            </span>
            {runningEntry ? (
              <button
                type="button"
                onClick={() => stopEntryTimer(runningEntry)}
                className="flex min-h-[44px] items-center justify-center rounded bg-red-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-red-700"
              >
                Stop timer
              </button>
            ) : existingJob.status === 'open' ? (
              <button
                type="button"
                onClick={() => startJobTimer(existingJob._id, entries)}
                className="flex min-h-[44px] items-center justify-center rounded bg-mark px-4 py-1.5 text-sm font-bold text-on-mark hover:opacity-90"
              >
                Start timer
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Add time section */}
      <section aria-label="Add time" className="mt-6 rounded border border-rule bg-field p-4">
        <h2 className="mb-3 text-base font-bold text-ink">Add Time</h2>
        {timeError && <div className="mb-3 text-xs text-red-400">{timeError}</div>}
        <form onSubmit={handleAddTime} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor="time-date" className="block text-xs font-medium text-ink-2">
              Date
            </label>
            <input
              id="time-date"
              type="date"
              required
              value={timeDate}
              onChange={(e) => setTimeDate(e.target.value)}
              className="fig mt-1 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink focus:border-mark focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="time-hours" className="block text-xs font-medium text-ink-2">
              Hours (e.g. 2.5 or 2:30)
            </label>
            <input
              id="time-hours"
              type="text"
              required
              placeholder="2.5 or 2:30"
              value={timeHours}
              onChange={(e) => setTimeHours(e.target.value)}
              className="fig mt-1 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink focus:border-mark focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="time-task" className="block text-xs font-medium text-ink-2">
              Task description
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="time-task"
                type="text"
                placeholder="What did you do?"
                value={timeTask}
                onChange={(e) => setTimeTask(e.target.value)}
                className="w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink focus:border-mark focus:outline-none"
              />
              <button
                type="submit"
                className="flex min-h-[38px] shrink-0 items-center justify-center rounded bg-mark px-4 py-1.5 text-xs font-bold text-on-mark hover:opacity-90"
              >
                Add time
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Entries table */}
      <section aria-label="Time entries" className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Time Entries ({jobEntries.length})</h2>
          <span className="fig text-xs text-ink-2">
            Total billable:{' '}
            {jobEntries
              .filter((e) => !e.start || Boolean(e.end))
              .reduce((sum, e) => sum + billableHours(e.minutes ?? 0), 0)}{' '}
            hrs
          </span>
        </div>

        {jobEntries.length === 0 ? (
          <div className="rounded border border-dashed border-rule p-6 text-center text-sm text-ink-2">
            No time entries recorded for this job yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-rule bg-field">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-rule bg-paper text-xs uppercase tracking-wider text-ink-2">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Task</th>
                  <th className="px-4 py-2.5">Actual Duration</th>
                  <th className="px-4 py-2.5">Billable</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {jobEntries.map((entry) => {
                  const isRunning = Boolean(entry.start && !entry.end);
                  const isBilled = Boolean(entry.invoiceId);
                  const billedInvoice = entry.invoiceId ? invoiceMap.get(entry.invoiceId as InvoiceDoc['_id']) : undefined;
                  const isEditingThis = editingEntryId === entry._id;

                  if (isEditingThis) {
                    return (
                      <tr key={entry._id} className="bg-field">
                        <td className="px-4 py-2">
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="fig rounded border border-rule bg-paper px-2 py-1 text-xs text-ink"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editTask}
                            onChange={(e) => setEditTask(e.target.value)}
                            className="w-full rounded border border-rule bg-paper px-2 py-1 text-xs text-ink"
                          />
                        </td>
                        <td className="px-4 py-2" colSpan={2}>
                          <input
                            type="text"
                            placeholder="Hours e.g. 2.5"
                            value={editHours}
                            onChange={(e) => setEditHours(e.target.value)}
                            className="fig w-24 rounded border border-rule bg-paper px-2 py-1 text-xs text-ink"
                          />
                          {editError && <div className="text-[10px] text-red-400">{editError}</div>}
                        </td>
                        <td className="px-4 py-2" colSpan={2}>
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingEntryId(null)}
                              className="rounded border border-rule px-2 py-1 text-xs text-ink-2"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEditEntry(entry)}
                              className="rounded bg-mark px-2.5 py-1 text-xs font-semibold text-on-mark"
                            >
                              Save
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={entry._id} className="hover:bg-paper/40 transition-colors">
                      <td className="fig px-4 py-3 whitespace-nowrap text-xs text-ink-2">
                        {entry.date}
                      </td>
                      <td className="px-4 py-3 text-ink font-medium">
                        {entry.task || (isRunning ? 'In progress…' : '—')}
                      </td>
                      <td className="fig px-4 py-3 whitespace-nowrap text-xs text-ink-2">
                        {isRunning ? (
                          <span className="text-mark font-medium">Running</span>
                        ) : (
                          formatDuration(entry.minutes ?? 0)
                        )}
                      </td>
                      <td className="fig px-4 py-3 whitespace-nowrap text-xs font-medium text-ink">
                        {isRunning ? '—' : `${billableHours(entry.minutes ?? 0)} hrs`}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {isBilled ? (
                          <a
                            href={`#/invoice/${entry.invoiceId}`}
                            className="text-mark hover:underline"
                          >
                            On {billedInvoice ? billedInvoice.number : 'INV-…'}
                          </a>
                        ) : isRunning ? (
                          <span className="text-mark">Active</span>
                        ) : (
                          <span className="text-ink-2">Unbilled</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-xs">
                        {isBilled ? (
                          <span className="text-ink-2 italic">Locked</span>
                        ) : isRunning ? (
                          <button
                            type="button"
                            onClick={() => stopEntryTimer(entry)}
                            className="rounded bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700"
                          >
                            Stop
                          </button>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEditEntry(entry)}
                              className="text-ink-2 hover:text-ink"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(entry)}
                              className="text-red-400 hover:text-red-300"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
