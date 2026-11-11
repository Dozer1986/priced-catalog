import { useState, useEffect } from 'react';
import { useTrackerData } from './db';
import { Header } from './components/Header';
import { HomeScreen } from './components/HomeScreen';
import { JobScreen } from './components/JobScreen';
import { InvoiceNewScreen } from './components/InvoiceNewScreen';
import { InvoiceViewScreen } from './components/InvoiceViewScreen';
import { InvoicesListScreen } from './components/InvoicesListScreen';
import { SettingsScreen } from './components/SettingsScreen';

interface ParsedRoute {
  view:
    | 'home'
    | 'job-new'
    | 'job-detail'
    | 'invoice-new'
    | 'invoice-detail'
    | 'invoices'
    | 'settings';
  jobId?: string;
  invoiceId?: string;
}

function parseHash(hash: string): ParsedRoute {
  const clean = hash.replace(/^#/, '');
  if (!clean || clean === '/' || clean === '') {
    return { view: 'home' };
  }
  if (clean === '/job/new') {
    return { view: 'job-new' };
  }
  if (clean.startsWith('/job/')) {
    const id = clean.slice('/job/'.length).split('?')[0];
    return { view: 'job-detail', jobId: id };
  }
  if (clean.startsWith('/invoice/new')) {
    const search = clean.includes('?') ? clean.slice(clean.indexOf('?')) : '';
    const params = new URLSearchParams(search);
    return { view: 'invoice-new', jobId: params.get('job') || '' };
  }
  if (clean.startsWith('/invoice/')) {
    const id = clean.slice('/invoice/'.length).split('?')[0];
    return { view: 'invoice-detail', invoiceId: id };
  }
  if (clean === '/invoices') {
    return { view: 'invoices' };
  }
  if (clean === '/settings') {
    return { view: 'settings' };
  }
  return { view: 'home' };
}

export function TrackerApp() {
  const { settings, jobs, entries, invoices, syncStatus } = useTrackerData();
  const [hash, setHash] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash || '#/');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const route = parseHash(hash);

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col font-sans">
      <Header currentPath={hash} syncStatus={syncStatus} />

      <main className="flex-1">
        {route.view === 'home' && (
          <HomeScreen jobs={jobs} entries={entries} />
        )}

        {route.view === 'job-new' && (
          <JobScreen
            mode="new"
            jobs={jobs}
            entries={entries}
            invoices={invoices}
            settings={settings}
          />
        )}

        {route.view === 'job-detail' && (
          <JobScreen
            mode="detail"
            jobId={route.jobId}
            jobs={jobs}
            entries={entries}
            invoices={invoices}
            settings={settings}
          />
        )}

        {route.view === 'invoice-new' && (
          <InvoiceNewScreen
            jobId={route.jobId || ''}
            jobs={jobs}
            entries={entries}
            invoices={invoices}
            settings={settings}
          />
        )}

        {route.view === 'invoice-detail' && (
          <InvoiceViewScreen
            invoiceId={route.invoiceId || ''}
            invoices={invoices}
            entries={entries}
          />
        )}

        {route.view === 'invoices' && (
          <InvoicesListScreen invoices={invoices} />
        )}

        {route.view === 'settings' && (
          <SettingsScreen settings={settings} syncStatus={syncStatus} />
        )}
      </main>
    </div>
  );
}

export default TrackerApp;
