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
  await page.getByRole('button', { name: 'Save receipt' }).click();

  await expect(page.getByRole('heading', { name: 'Receipts' })).toBeVisible();
  await expect(page.getByText('Waiting for ledger')).toBeVisible();
  await page.getByText('Menards').click();
  await expect(page.getByLabel('Category').first()).toHaveValue('Tools');
  await expect(page.getByLabel('Qty').nth(1)).toHaveValue('-1');
});
