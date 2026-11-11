import { useState, useEffect } from 'react';
import type { JobDoc, EntryDoc } from '../types';
import { startJobTimer, stopEntryTimer, putWithRetry } from '../db';

interface HomeScreenProps {
  jobs: JobDoc[];
  entries: EntryDoc[];
}

function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function HomeScreen({ jobs, entries }: HomeScreenProps) {
  const [now, setNow] = useState(() => new Date());

  // Running entries: start is set, end is not set
  const runningEntries = entries.filter((e) => e.start && !e.end);

  useEffect(() => {
    if (runningEntries.length === 0) return;
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [runningEntries.length]);

  const openJobs = jobs.filter((j) => j.status !== 'closed');
  const closedJobs = jobs.filter((j) => j.status === 'closed');
  const jobMap = new Map(jobs.map((j) => [j._id, j]));

  const handleUpdateTask = async (entry: EntryDoc, task: string) => {
    await putWithRetry({
      ...entry,
      task,
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Running timers section */}
      {runningEntries.length > 0 && (
        <section aria-label="Running timers" className="mb-8 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mark">
            Active Timers
          </h2>
          {runningEntries.map((entry) => {
            const job = jobMap.get(entry.jobId as JobDoc['_id']);
            const startMs = entry.start ? new Date(entry.start).getTime() : now.getTime();
            const elapsedSecs = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));

            return (
              <div
                key={entry._id}
                className="flex flex-col gap-4 rounded border-2 border-mark bg-field p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-mark animate-pulse" />
                    <span className="text-xs uppercase tracking-wider text-ink-2 font-medium">
                      {job ? job.customer : 'Unknown customer'}
                    </span>
                  </div>
                  <h3 className="truncate text-lg font-bold text-ink">
                    {job ? job.name : 'Unknown Job'}
                  </h3>

                  <div className="mt-2">
                    <label htmlFor={`task-${entry._id}`} className="sr-only">
                      What are you working on?
                    </label>
                    <input
                      id={`task-${entry._id}`}
                      type="text"
                      placeholder="What are you working on?"
                      value={entry.task}
                      onChange={(e) => handleUpdateTask(entry, e.target.value)}
                      className="w-full rounded border border-rule bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-ink-2/60 focus:border-mark focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <span className="fig text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                    {formatElapsed(elapsedSecs)}
                  </span>
                  <button
                    type="button"
                    onClick={() => stopEntryTimer(entry)}
                    className="flex min-h-[56px] min-w-[120px] items-center justify-center rounded bg-red-600 px-6 py-3 text-base font-bold text-white transition-colors hover:bg-red-700 active:bg-red-800"
                  >
                    Stop
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Open jobs section */}
      <section aria-label="Open jobs">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-ink">Open Jobs</h2>
          <a
            href="#/job/new"
            className="flex min-h-[44px] items-center justify-center rounded bg-mark px-4 py-2 text-sm font-semibold text-on-mark hover:opacity-90 transition-opacity"
          >
            + New job
          </a>
        </div>

        {openJobs.length === 0 ? (
          <div className="rounded border border-dashed border-rule p-8 text-center">
            <p className="text-ink-2">No open jobs right now.</p>
            <a
              href="#/job/new"
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded bg-mark px-5 py-2 text-sm font-semibold text-on-mark hover:opacity-90"
            >
              Create your first job
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {openJobs.map((job) => {
              const jobRunning = runningEntries.some((e) => e.jobId === job._id);

              return (
                <div
                  key={job._id}
                  data-job-card
                  className="flex flex-col justify-between gap-3 rounded border border-rule bg-field p-4 transition-colors sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">
                        {job.customer}
                      </span>
                      {jobRunning && (
                        <span className="inline-flex items-center gap-1 rounded bg-mark/20 px-2 py-0.5 text-xs font-medium text-mark">
                          <span className="h-1.5 w-1.5 rounded-full bg-mark animate-pulse" />
                          Running
                        </span>
                      )}
                    </div>
                    <a
                      href={`#/job/${job._id}`}
                      className="block truncate text-lg font-bold text-ink hover:text-mark transition-colors"
                    >
                      {job.name}
                    </a>
                    {job.address && (
                      <p className="truncate text-xs text-ink-2 whitespace-pre-line mt-0.5">
                        {job.address.split('\n')[0]}
                      </p>
                    )}
                    <p className="fig mt-1 text-xs text-ink-2">
                      ${job.rate}/hr
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2 sm:pt-0">
                    <a
                      href={`#/job/${job._id}`}
                      className="flex min-h-[44px] min-w-[70px] items-center justify-center rounded border border-rule bg-paper px-3 py-2 text-sm font-medium text-ink hover:border-ink-2"
                    >
                      View
                    </a>
                    <button
                      type="button"
                      onClick={() => startJobTimer(job._id, entries)}
                      className="flex min-h-[56px] min-w-[100px] flex-1 sm:flex-none items-center justify-center rounded bg-mark px-6 py-3 text-base font-bold text-on-mark hover:opacity-90 active:opacity-100 transition-opacity"
                    >
                      Start
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Closed jobs disclosure */}
      {closedJobs.length > 0 && (
        <details className="mt-8 border-t border-rule pt-4 text-ink-2">
          <summary className="cursor-pointer text-sm font-medium hover:text-ink">
            Closed jobs ({closedJobs.length})
          </summary>
          <div className="mt-3 space-y-2">
            {closedJobs.map((job) => (
              <div
                key={job._id}
                className="flex items-center justify-between rounded border border-rule bg-paper/50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-xs text-ink-2">{job.customer}</span>
                  <a
                    href={`#/job/${job._id}`}
                    className="block truncate text-sm font-medium text-ink hover:text-mark"
                  >
                    {job.name}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <span className="fig text-xs text-ink-2">${job.rate}/hr</span>
                  <a
                    href={`#/job/${job._id}`}
                    className="rounded border border-rule px-2.5 py-1 text-xs text-ink hover:border-ink-2"
                  >
                    View
                  </a>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
