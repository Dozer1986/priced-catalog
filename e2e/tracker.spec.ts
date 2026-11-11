import { test, expect } from '@playwright/test';

test('tracker: Aaron tracks hours and creates an invoice', async ({ page }) => {
  const errors: string[] = [];
  const couchRequests: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  page.on('request', (req) => {
    const url = req.url();
    if (
      url.includes('5984') ||
      url.includes('8443') ||
      url.includes('couch') ||
      url.includes('tail672bb7')
    ) {
      couchRequests.push(url);
    }
  });

  // Open the tracker page
  await page.goto('/priced-catalog/tracker.html');
  await expect(page.getByText('KAMOTec Hours')).toBeVisible();
  await expect(page.getByText('Sync not set up')).toBeVisible();

  // Create job "Faucet swap" for "Pat Example"
  await page.getByRole('link', { name: '+ New job' }).click();
  await expect(page.getByRole('heading', { name: 'New Job' })).toBeVisible();

  await page.getByLabel('Customer name').fill('Pat Example');
  await page.getByLabel('Customer address').fill('12 Sample St\nWestfield, IN 46074');
  await page.getByLabel('Job name').fill('Faucet swap');
  await page.getByRole('button', { name: 'Create job' }).click();

  // Now on job page
  await expect(page.getByRole('heading', { name: 'Faucet swap' })).toBeVisible();
  await expect(page.getByText('Pat Example')).toBeVisible();

  // Start, wait ~1 s, Stop -> an entry appears
  await page.getByRole('button', { name: 'Start timer' }).click();
  await expect(page.getByRole('button', { name: 'Stop timer' })).toBeVisible();

  // Wait ~1.1 seconds so at least 1 second elapses
  await page.waitForTimeout(1100);

  await page.getByRole('button', { name: 'Stop timer' }).click();
  await expect(page.getByRole('button', { name: 'Start timer' })).toBeVisible();

  // An entry appears in the entries list
  const entriesSection = page.getByRole('region', { name: 'Time entries' });
  await expect(entriesSection).toBeVisible();
  await expect(entriesSection.getByRole('table')).toBeVisible();
  await expect(entriesSection.getByRole('table')).toContainText('0 hrs');

  // Add time 2:30 "Install filter"
  await page.getByLabel(/Hours/).fill('2:30');
  await page.getByLabel('Task description').fill('Install filter');
  await page.getByRole('button', { name: 'Add time' }).click();

  // Verify the new entry is in the table
  await expect(entriesSection.getByRole('table')).toContainText('Install filter');
  await expect(entriesSection.getByRole('table')).toContainText('2.5 hrs');

  // Create invoice
  await page.getByRole('link', { name: 'Create invoice' }).click();
  await expect(page.getByRole('heading', { name: 'Create Invoice' })).toBeVisible();

  // Add one Materials line 3 × 4.10
  await page.getByRole('button', { name: '+ Add Materials' }).click();
  await page.getByPlaceholder('Description').fill('Replacement supply lines');
  await page.locator('input[type="number"][min="1"]').fill('3');
  await page.getByPlaceholder('0.00').fill('4.10');

  // One-sentence summary
  await page.getByLabel('One-sentence summary').fill('Replaced kitchen faucet and supply lines.');

  // Save invoice
  await page.getByRole('button', { name: 'Save invoice' }).click();

  // On invoice view: assert Amount due $263.16
  await expect(page.getByRole('heading', { name: 'Faucet swap' })).toBeVisible();
  await expect(page.getByText('Amount due')).toBeVisible();
  await expect(page.getByText('$263.16')).toBeVisible();

  // Verify line item breakdowns
  const sheet = page.locator('.invoice-sheet');
  await expect(sheet).toContainText('$12.30'); // Materials subtotal
  await expect(sheet).toContainText('2.5 hours @ $100.00'); // Labor line
  await expect(sheet).toContainText('$250.00'); // Labor subtotal
  await expect(sheet).toContainText('$262.30'); // Subtotal
  await expect(sheet).toContainText('$0.86'); // Indiana sales tax (7% on materials)
  await expect(sheet).toContainText('$263.16'); // Amount due

  // 1-second entry rounded to 0h and must be omitted from labor table
  const laborTable = sheet.locator('table');
  await expect(laborTable).toContainText('Install filter');
  await expect(laborTable).not.toContainText('In progress');

  // Verify no console errors occurred
  expect(errors).toEqual([]);

  // Verify sync is not configured and no CouchDB requests were made
  expect(couchRequests).toEqual([]);
});

test('tracker: customer autofill, timer switching, and invoice deletion', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/priced-catalog/tracker.html');

  // Create Job 1 with customer "Jane Doe"
  await page.getByRole('link', { name: '+ New job' }).click();
  await page.getByLabel('Customer name').fill('Jane Doe');
  await page.getByLabel('Customer address').fill('456 Oak Avenue\nWestfield, IN');
  await page.getByLabel('Job name').fill('Deck repair');
  await page.getByRole('button', { name: 'Create job' }).click();
  await expect(page.getByRole('heading', { name: 'Deck repair' })).toBeVisible();

  // Create Job 2 with the same customer "Jane Doe" and verify address autofills
  await page.getByRole('link', { name: 'Jobs', exact: true }).click();
  await page.getByRole('link', { name: '+ New job' }).click();
  await page.getByLabel('Customer name').fill('Jane Doe');
  await expect(page.getByLabel('Customer address')).toHaveValue('456 Oak Avenue\nWestfield, IN');

  await page.getByLabel('Job name').fill('Door trim');
  await page.getByRole('button', { name: 'Create job' }).click();
  await expect(page.getByRole('heading', { name: 'Door trim' })).toBeVisible();

  // Test one-tap timer on home: starting timer on Job 2 stops timer on Job 1
  await page.getByRole('link', { name: 'Jobs', exact: true }).click();
  const deckCard = page.locator('[data-job-card]').filter({ hasText: 'Deck repair' });
  await deckCard.getByRole('button', { name: 'Start' }).click();

  // Active timer appears
  await expect(page.getByRole('region', { name: 'Running timers' })).toContainText('Deck repair');

  // Start timer on Door trim
  const doorCard = page.locator('[data-job-card]').filter({ hasText: 'Door trim' });
  await doorCard.getByRole('button', { name: 'Start' }).click();

  // Now Door trim is running, Deck repair is stopped
  const timers = page.getByRole('region', { name: 'Running timers' });
  await expect(timers).toContainText('Door trim');
  await expect(timers).not.toContainText('Deck repair');

  // Stop the running timer
  await timers.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('region', { name: 'Running timers' })).toHaveCount(0);

  // Navigate to invoices list
  await page.getByRole('link', { name: 'Invoices', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();

  expect(errors).toEqual([]);
});
