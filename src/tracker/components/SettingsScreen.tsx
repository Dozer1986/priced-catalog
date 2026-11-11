import { useState } from 'react';
import type { SettingsDoc, SyncCredentials } from '../types';
import {
  putWithRetry,
  getStoredSyncCredentials,
  saveStoredSyncCredentials,
  clearStoredSyncCredentials,
} from '../db';

interface SettingsScreenProps {
  settings: SettingsDoc;
  syncStatus: string;
}

const DEFAULT_SYNC_URL = 'https://docker.tail672bb7.ts.net:8443/kamotec-time';
const DEFAULT_SYNC_USER = 'kamotec';

export function SettingsScreen({ settings, syncStatus }: SettingsScreenProps) {
  // Settings Form State
  const [businessName, setBusinessName] = useState(settings.businessName || 'KAMOTec');
  const [defaultRate, setDefaultRate] = useState(settings.defaultRate || 100);
  const [taxPercent, setTaxPercent] = useState(
    settings.taxRate !== undefined ? (settings.taxRate * 100).toString() : '7'
  );
  const [taxLabel, setTaxLabel] = useState(settings.taxLabel || 'Indiana sales tax');
  const [paymentTerms, setPaymentTerms] = useState(
    settings.paymentTerms || 'Payment due on receipt. Cash, check, Venmo or Zelle.'
  );
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Sync Form State
  const storedCreds = getStoredSyncCredentials();
  const [syncUrl, setSyncUrl] = useState(storedCreds?.url || DEFAULT_SYNC_URL);
  const [syncUsername, setSyncUsername] = useState(storedCreds?.username || DEFAULT_SYNC_USER);
  const [syncPassword, setSyncPassword] = useState(storedCreds?.password || '');
  const [syncMsg, setSyncMsg] = useState('');

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedTax = (parseFloat(taxPercent) || 7) / 100;
    const updated: SettingsDoc = {
      ...settings,
      _id: 'settings',
      type: 'settings',
      businessName: businessName.trim(),
      defaultRate: Number(defaultRate) || 100,
      taxRate: parsedTax,
      taxLabel: taxLabel.trim(),
      paymentTerms: paymentTerms.trim(),
    };
    await putWithRetry(updated);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  };

  const handleSaveSync = (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncUrl.trim() || !syncUsername.trim()) {
      setSyncMsg('Server URL and username are required.');
      return;
    }
    const creds: SyncCredentials = {
      url: syncUrl.trim(),
      username: syncUsername.trim(),
      password: syncPassword,
    };
    saveStoredSyncCredentials(creds);
    setSyncMsg('Sync credentials saved. Reconnecting…');
    setTimeout(() => setSyncMsg(''), 4000);
  };

  const handleClearSync = () => {
    if (window.confirm('Disconnect sync on this device?')) {
      clearStoredSyncCredentials();
      setSyncPassword('');
      setSyncMsg('Sync disconnected.');
      setTimeout(() => setSyncMsg(''), 4000);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-2">
          Configure business defaults and database sync for KAMOTec Hours.
        </p>
      </div>

      {/* Business & Billing Settings */}
      <section className="rounded border border-rule bg-field p-5">
        <h2 className="text-base font-bold text-ink mb-4">Business & Billing Defaults</h2>

        {settingsSaved && (
          <div className="mb-4 rounded bg-mark/20 p-2.5 text-xs text-mark font-medium">
            Settings saved successfully.
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div>
            <label htmlFor="biz-name" className="block text-xs font-medium text-ink">
              Business Name
            </label>
            <input
              id="biz-name"
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-mark focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="def-rate" className="block text-xs font-medium text-ink">
                Default Hourly Rate ($/hr)
              </label>
              <input
                id="def-rate"
                type="number"
                min={0}
                step={1}
                required
                value={defaultRate}
                onChange={(e) => setDefaultRate(Number(e.target.value))}
                className="fig mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-mark focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="tax-pct" className="block text-xs font-medium text-ink">
                Sales Tax Rate (%)
              </label>
              <input
                id="tax-pct"
                type="number"
                min={0}
                max={100}
                step={0.1}
                required
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
                className="fig mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-mark focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="tax-lbl" className="block text-xs font-medium text-ink">
              Tax Label (e.g. &quot;Indiana sales tax&quot;)
            </label>
            <input
              id="tax-lbl"
              type="text"
              required
              value={taxLabel}
              onChange={(e) => setTaxLabel(e.target.value)}
              className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-mark focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="pay-terms" className="block text-xs font-medium text-ink">
              Payment Terms
            </label>
            <textarea
              id="pay-terms"
              rows={2}
              required
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-mark focus:outline-none"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="flex min-h-[44px] items-center justify-center rounded bg-mark px-5 py-2 text-sm font-semibold text-on-mark hover:opacity-90 transition-opacity"
            >
              Save business settings
            </button>
          </div>
        </form>
      </section>

      {/* Sync Settings */}
      <section className="rounded border border-rule bg-field p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-ink">CouchDB Sync</h2>
            <p className="mt-0.5 text-xs text-ink-2">
              Sync hours and invoices between devices using your CouchDB server.
            </p>
          </div>
          <span className="fig rounded bg-paper px-2.5 py-1 text-xs text-ink font-medium border border-rule">
            {syncStatus}
          </span>
        </div>

        {syncMsg && (
          <div className="mb-4 rounded bg-mark/20 p-2.5 text-xs text-mark font-medium">
            {syncMsg}
          </div>
        )}

        <form onSubmit={handleSaveSync} className="space-y-4">
          <div>
            <label htmlFor="sync-url" className="block text-xs font-medium text-ink">
              Server URL
            </label>
            <input
              id="sync-url"
              type="url"
              required
              value={syncUrl}
              onChange={(e) => setSyncUrl(e.target.value)}
              className="fig mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-mark focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sync-usr" className="block text-xs font-medium text-ink">
                Username
              </label>
              <input
                id="sync-usr"
                type="text"
                required
                value={syncUsername}
                onChange={(e) => setSyncUsername(e.target.value)}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-mark focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="sync-pwd" className="block text-xs font-medium text-ink">
                Password
              </label>
              <input
                id="sync-pwd"
                type="password"
                value={syncPassword}
                onChange={(e) => setSyncPassword(e.target.value)}
                placeholder={storedCreds ? '••••••••' : ''}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-mark focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded bg-paper/60 border border-rule p-3 text-xs text-ink-2 leading-relaxed">
            <p>
              Sync credentials are stored <strong>only in localStorage on this device</strong>:
              never in the database, never in the repo. Saving them immediately connects to sync.
            </p>
            <p className="mt-1">
              Be honest: hours that have not synced exist only on this device.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              className="flex min-h-[44px] items-center justify-center rounded bg-mark px-5 py-2 text-sm font-semibold text-on-mark hover:opacity-90 transition-opacity"
            >
              Save &amp; connect sync
            </button>
            {storedCreds && (
              <button
                type="button"
                onClick={handleClearSync}
                className="flex min-h-[44px] items-center justify-center rounded border border-rule px-4 py-2 text-sm text-ink-2 hover:text-ink hover:border-ink-2"
              >
                Disconnect sync
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
