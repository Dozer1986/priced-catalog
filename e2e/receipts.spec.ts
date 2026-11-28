import { test, expect } from '@playwright/test';

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const receipt = {
  date: '2026-11-14', vendor: 'Menards', storeCity: 'Carmel', storeState: 'IN', paidWith: 'Visa 6270',
  subtotal: 15, tax: 1.05, total: 16.05, notes: null,
  lines: [
    { item: 'SCREWS 50CT', description: 'Screws', sku: '2302134', qty: 2, unitPrice: 10, taxRate: 0.07 },
    { item: 'RTN SILL', description: 'Return: sill', sku: null, qty: -1, unitPrice: 5, taxRate: 0.07 },
  ],
};

test('receipts: read a photo, check the lines, save', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kamotec_sync_creds', JSON.stringify({ url: 'http://127.0.0.1:59999/kamotec-time', username: 'kamotec', password: 'pw' }));
  });
  let auth = '';
  await page.route('http://127.0.0.1:8446/extract', async (route) => {
    auth = route.request().headers()['authorization'] ?? '';
    await route.fulfill({ json: { receipt }, headers: { 'Access-Control-Allow-Origin': '*' } });
  });

  await page.goto('/priced-catalog/tracker.html#/receipts');
  await expect(page).toHaveTitle('KAMO Services');
  await page.getByRole('link', { name: '+ New receipt' }).click();
  await page.locator('input[type=file]:not([capture])').setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: PNG });

  await expect(page.getByRole('heading', { name: 'Check the receipt' })).toBeVisible();
  expect(auth).toBe(`Basic ${Buffer.from('kamotec:pw').toString('base64')}`);
  await expect(page.getByLabel('Vendor')).toHaveValue('Menards');
  await expect(page.getByText('Sum of lines')).toBeVisible();
  await expect(page.getByText(/over|under/)).toHaveCount(0); // 21.40 - 5.35 = 16.05

  // A third line throws the sum off the printed total: red warning, saving still allowed
  await page.getByRole('button', { name: '+ Add line' }).click();
  await page.getByLabel('Unit price ($)').nth(2).fill('1.00');
  await page.getByLabel('Tax (%)').nth(2).fill('0');
  await expect(page.getByText('The lines are $1.00 over the receipt total.')).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).nth(2).click();

  await page.getByLabel('Category').first().fill('Tools'); // free text: no lists doc yet
  await expect(page.getByLabel('Billable').first()).toHaveValue('No');
  await page.getByLabel('Project').first().fill('Smith');
  await page.getByRole('button', { name: 'Save receipt' }).dblclick();

  await expect(page.getByRole('heading', { name: 'Receipts' })).toBeVisible();
  await expect(page.getByText('Waiting for ledger')).toHaveCount(1); // the double click saved one receipt
  await page.getByText('Menards').click();
  await expect(page.getByLabel('Category').first()).toHaveValue('Tools');
  await expect(page.getByLabel('Qty').nth(1)).toHaveValue('-1');
});

test('receipts: type it in when the reader fails', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kamotec_sync_creds', JSON.stringify({ url: 'http://127.0.0.1:59999/kamotec-time', username: 'kamotec', password: 'pw' }));
  });
  await page.route('http://127.0.0.1:8446/extract', (route) =>
    route.fulfill({ status: 503, json: { error: 'The receipt reader has no Anthropic API key.' }, headers: { 'Access-Control-Allow-Origin': '*' } }),
  );

  await page.goto('/priced-catalog/tracker.html#/receipt/new');
  await page.locator('input[type=file]:not([capture])').setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Type it in' }).click();

  await expect(page.getByRole('heading', { name: 'Check the receipt' })).toBeVisible();
  await page.getByLabel('Date').fill('2026-11-15');
  await page.getByLabel('Vendor').fill('Lowes');
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Save receipt' }).click();
  await expect(page.getByText('Add at least one line.')).toBeVisible();

  await page.getByRole('button', { name: '+ Add line' }).click();
  await page.getByLabel('Unit price ($)').fill('3.50');
  await page.getByLabel('Tax (%)').fill('7');
  await page.getByRole('button', { name: 'Save receipt' }).click();

  await expect(page.getByRole('heading', { name: 'Receipts' })).toBeVisible();
  await expect(page.getByText('Lowes')).toBeVisible();
});

test('receipts: bill a job for its billable receipt lines once', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kamotec_sync_creds', JSON.stringify({ url: 'http://127.0.0.1:59999/kamotec-time', username: 'kamotec', password: 'pw' }));
  });
  await page.route('http://127.0.0.1:8446/extract', (route) =>
    route.fulfill({ status: 503, json: { error: 'Reader unavailable.' }, headers: { 'Access-Control-Allow-Origin': '*' } }),
  );
  await page.clock.install({ time: new Date('2026-06-01T10:00:00') });

  await page.goto('/priced-catalog/tracker.html#/job/new');
  await page.getByLabel('Customer name').fill('Pat Example');
  await page.getByLabel('Job name').fill('Porch repair');
  await page.getByRole('button', { name: 'Create job' }).click();

  await page.getByRole('link', { name: 'Receipts', exact: true }).click();
  await page.getByRole('link', { name: '+ New receipt' }).click();
  await page.locator('input[type=file]:not([capture])').setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Type it in' }).click();
  await page.getByLabel('Job').selectOption({ label: 'Pat Example - Porch repair' });
  await page.getByLabel('Date').fill('2026-06-01');
  await page.getByLabel('Vendor').fill('Menards');
  await page.getByLabel('Description').fill('Copper fittings');
  await page.getByLabel('Qty').fill('2');
  await page.getByLabel('Unit price ($)').fill('10.00');
  await page.getByLabel('Tax (%)').fill('7');
  await page.getByRole('button', { name: '+ Add line' }).click();
  await page.getByLabel('Description').nth(1).fill('Shop towels');
  await page.getByLabel('Unit price ($)').nth(1).fill('5.00');
  await page.getByLabel('Tax (%)').nth(1).fill('7');
  await page.getByLabel('Billable').nth(1).selectOption('No');
  await page.getByRole('button', { name: '+ Add line' }).click();
  await page.getByLabel('Description').nth(2).fill('Coupon');
  await page.getByLabel('Unit price ($)').nth(2).fill('-2.00');
  await page.getByLabel('Tax (%)').nth(2).fill('7');
  await page.getByRole('button', { name: 'Save receipt' }).click();

  await page.getByRole('link', { name: 'Jobs', exact: true }).click();
  await page.getByRole('link', { name: 'Porch repair' }).first().click();
  await page.getByRole('link', { name: 'Create invoice' }).click();
  await expect(page.getByRole('heading', { name: 'From receipts' })).toBeVisible();
  await expect(page.getByText('Copper fittings')).toBeVisible();
  await expect(page.getByText('Shop towels')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Include Copper fittings' }).check();
  // Savings stay with the owner unless he ticks the discount.
  const coupon = page.getByRole('checkbox', { name: 'Pass savings to customer: Coupon' });
  await expect(coupon).not.toBeChecked();
  await expect(page.getByText('Discount: tick to pass the savings to the customer')).toBeVisible();
  await coupon.check(); // a passed discount bills as qty -1 at $2.00, so the price stays valid
  await expect(page.locator('input[value="Coupon"]')).toHaveCount(1);
  await expect(page.locator('input[value="2.00"]')).toHaveCount(1);
  await coupon.uncheck();
  await page.getByLabel('One-sentence summary').fill('Repaired the porch.');
  await page.getByRole('button', { name: 'Save invoice' }).click();

  await expect(page.locator('.invoice-sheet')).toContainText('Copper fittings');
  await expect(page.locator('.invoice-sheet')).not.toContainText('Coupon');
  await expect(page.locator('.invoice-sheet .row.grand')).toContainText('$21.40'); // 2 x $10 + 7% tax, no coupon
  await page.getByRole('link', { name: '← Back to job' }).click();
  await page.getByRole('link', { name: 'Create invoice' }).click();
  await expect(page.getByRole('heading', { name: 'From receipts' })).toHaveCount(0);
  await expect(page.getByText('Copper fittings')).toHaveCount(0);
});
