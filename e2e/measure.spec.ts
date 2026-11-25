import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, browserName }) => {
  // Playwright's Linux WebKit can't store a Blob in IndexedDB and PouchDB's startup probe for that never settles,
  // so every db call hangs. iOS Safari stores Blobs fine; make the probe fail fast so PouchDB uses base64 instead.
  if (browserName === 'webkit')
    await page.addInitScript(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        if (value instanceof Blob) throw new DOMException('no Blob support in this test browser', 'DataCloneError');
        return put.call(this, value, key);
      };
    });
});

test('measure: enter a flight on the phone, get checks and a cut list, survive a reload', async ({ page }) => {
  const answers = ['Cottage test', '12']; // job name, then timbers in the flight
  page.on('dialog', (d) => d.accept(answers.shift()));

  await page.goto('/priced-catalog/tracker.html');
  await page.getByRole('link', { name: 'Measure' }).click();
  await expect(page).toHaveTitle(/Handrail Measure/);
  await expect(page.getByText('No measure jobs yet')).toBeVisible();

  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: '2 Enter' }).click();
  await page.getByRole('button', { name: '+ Add flight' }).click();

  const rows = page.locator('table tr');
  await expect(rows).toHaveCount(13); // header + 12 timbers
  for (let i = 1; i <= 12; i++) {
    const inputs = rows.nth(i).locator('input:not([type=checkbox])');
    await inputs.nth(0).fill('5-5/8');
    await inputs.nth(0).press('Tab');
    if (i > 1) {
      await inputs.nth(1).fill('19-7/8');
      await inputs.nth(1).press('Tab');
    }
  }
  await expect(page.getByText(/Slope 15\.8°/)).toBeVisible();
  await expect(page.getByText('Rail height OK at every nosing')).toBeVisible();

  // A typo turns the box red and the flight waits for a real number
  const rise2 = rows.nth(2).locator('input').first();
  await rise2.fill('5 5/ 8');
  await rise2.press('Tab');
  await expect(rise2).toHaveClass(/badin/);
  await expect(page.getByText('Fill in every rise and run')).toBeVisible();
  await rise2.fill('5-5/8');
  await rise2.press('Tab');
  await expect(page.getByText(/Slope 15\.8°/)).toBeVisible();

  // Saved in the app's database, not just on screen
  await page.reload();
  await page.getByRole('button', { name: '2 Enter' }).click();
  await expect(page.locator('select#proj')).toContainText('Cottage test');
  await expect(page.getByText(/Slope 15\.8°/)).toBeVisible();
  await expect(page.getByLabel('KAMO Services job')).toContainText('Not linked');

  await page.getByRole('button', { name: '3 Shop cut list' }).click();
  await expect(page.getByRole('heading', { name: /rail cut/ })).toBeVisible();
  await expect(page.getByText('Lag screws + flat washers')).toBeVisible();

  // Nothing wider than the phone screen
  for (const t of ['1 What to measure', '2 Enter', '3 Shop cut list']) {
    await page.getByRole('button', { name: t }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), t).toBeLessThanOrEqual(0);
  }

  await page.getByRole('link', { name: /KAMO Services/ }).click();
  await expect(page).toHaveTitle('KAMO Services');
});

test('measure: a job saved by the old localStorage-only page shows up once', async ({ page }) => {
  await page.goto('/priced-catalog/handrail-measure.html');
  await expect(page.getByText('No measure jobs yet')).toBeVisible();
  // The format the page used before sync (PR #4): { cur, projects } under 'handrail-measure-v1'
  await page.evaluate(() => {
    const steps = [...Array(12)].map((_, i) => ({ rise: '5-5/8', run: i ? '19-7/8' : '', post: null, note: '' }));
    const project = { name: 'Old phone job', site: 'Lake lot', date: '2026-11-01', width: '', inset: '', notes: '',
      settings: { H: '36', lo: '34', hi: '38', span: '72', back: '2-3/4', tail: '2-3/4', railH: '1-1/2', plate: '3/8', bracket: false, stack: '', trim: '1/2' },
      flights: [{ name: 'Flight 1', steps, totRise: '', totRun: '', notes: '' }] };
    localStorage.setItem('handrail-measure-v1', JSON.stringify({ cur: 0, projects: [project] }));
  });

  await page.reload();
  await page.getByRole('button', { name: '2 Enter' }).click();
  await expect(page.locator('select#proj option')).toHaveText(['Old phone job']);
  await expect(page.getByText(/Slope 15\.8°/)).toBeVisible();

  await page.reload();
  await expect(page.locator('select#proj option')).toHaveText(['Old phone job']);
});
