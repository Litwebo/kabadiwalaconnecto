import { expect, test } from '@playwright/test';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('Kabadiwala Connect Full 3-Role Marketplace E2E', () => {
  test('public landing, verified receipt, 7-step collector-recycler-payment flow, and admin analytics/disputes', async ({
    browser,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    const collectorCtx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    const collectorPage = await collectorCtx.newPage();
    collectorPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[collector] ${msg.text()}`);
    });
    collectorPage.on('pageerror', (err) => pageErrors.push(`[collector] ${err.message}`));

    // 1. Intro Splash Video -> Skip / Finish -> Public Landing + Compliance Disclaimer + Public Receipt Verification
    await collectorPage.goto('/', { waitUntil: 'domcontentloaded' });
    const introDialog = collectorPage.getByRole('dialog', { name: /introduction video/i });
    await expect(introDialog).toBeVisible();
    await expect(introDialog.locator('video')).toBeVisible();
    await collectorPage.getByRole('button', { name: 'Skip Intro' }).click();
    await expect(introDialog).toBeHidden();
    await expect(
      collectorPage.getByText('Not an EPR certificate under the E-Waste (Management) Rules, 2022.').first()
    ).toBeVisible();

    await collectorPage.goto('/r/KWC-2026-0001', { waitUntil: 'domcontentloaded' });
    await expect(collectorPage.getByText('KWC-2026-0001').first()).toBeVisible();
    await expect(collectorPage.getByText(/HMAC Signature Verified/i).first()).toBeVisible();
    await expect(collectorPage.getByText('+919845')).toHaveCount(0);

    // 2. Collector Login (Ramesh) & Language Switch to EN
    await collectorPage.goto('/', { waitUntil: 'domcontentloaded' });
    await collectorPage.getByRole('button', { name: 'Skip Intro' }).click();
    await collectorPage.getByRole('button', { name: 'Sign in' }).first().click();
    await collectorPage.getByRole('button', { name: /Demo Login/i }).click();

    await expect(collectorPage.locator('header')).toBeVisible();
    await collectorPage.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(collectorPage.getByRole('button', { name: 'Sell e-waste' })).toBeVisible();

    // 3. Step 1: Create Lot (Copper 10 kg + photo) -> Step 2 Estimate -> Step 3 Matching -> Step 4 Book
    await collectorPage.getByRole('button', { name: 'Sell e-waste' }).click();
    await collectorPage.getByRole('button', { name: /Copper Wires & Cables/i }).click();
    await collectorPage.locator('#kg-cat_copper').fill('10');

    const lotFileInput = collectorPage.locator('input[type="file"]').first();
    await lotFileInput.setInputFiles({
      name: 'copper-lot.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await expect(collectorPage.getByText('1/4').first()).toBeVisible();

    await collectorPage.getByRole('button', { name: 'Check Value Estimate' }).click();
    await expect(collectorPage.getByText(/Indicative Lot Value/i).first()).toBeVisible();

    await collectorPage.getByRole('button', { name: 'Publish & Find Recyclers' }).click();
    await expect(collectorPage.getByText(/Verified Recyclers Matched/i).first()).toBeVisible();
    await expect(collectorPage.getByText(/Best Net Payout/i).first()).toBeVisible();

    // Book GreenEarth E-Waste Recyclers (PICKUP supported)
    const greenEarthCard = collectorPage
      .locator('div')
      .filter({ hasText: 'GreenEarth E-Waste Recyclers Pvt Ltd' })
      .filter({ has: collectorPage.getByRole('button', { name: 'Select & Book Slot' }) })
      .last();
    await greenEarthCard.getByRole('button', { name: 'Select & Book Slot' }).click();
    await collectorPage.getByRole('button', { name: 'Confirm Booking Request' }).click();

    await expect(collectorPage.getByText(/Booking request bkg_.*sent/i).first()).toBeVisible();

    // Verify phone number is hidden while REQUESTED
    const latestBookingCard = collectorPage.locator('div').filter({ hasText: 'Waiting for recycler acceptance' }).first();
    await expect(latestBookingCard).toBeVisible();
    await expect(collectorPage.getByText('+919845111111')).toHaveCount(0);

    // 4. Recycler Context: Accept Booking -> Phone Unlocked -> Weigh-In Handover
    const recyclerCtx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    const recyclerPage = await recyclerCtx.newPage();
    recyclerPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[recycler] ${msg.text()}`);
    });
    recyclerPage.on('pageerror', (err) => pageErrors.push(`[recycler] ${err.message}`));

    await recyclerPage.goto('/', { waitUntil: 'domcontentloaded' });
    await recyclerPage.getByRole('button', { name: 'Skip Intro' }).click();
    await recyclerPage.getByRole('button', { name: 'Sign in' }).first().click();
    await recyclerPage.getByLabel('Demo account').selectOption('usr_rec_greenearth');
    await recyclerPage.getByRole('button', { name: /Demo Login/i }).click();

    await recyclerPage.getByRole('button', { name: /Requests/i }).first().click();
    const acceptBtn = recyclerPage.getByRole('button', { name: 'Accept Booking' }).first();
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    await expect(recyclerPage.getByText('+919845011111').first()).toBeVisible();

    // Collector reloads -> sees 4-digit handover code & recycler phone unlocked
    await collectorPage.reload({ waitUntil: 'domcontentloaded' });
    await collectorPage.getByRole('button', { name: 'My lots' }).first().click();
    await expect(collectorPage.getByText('+919845111111').first()).toBeVisible();
    const codeText = await collectorPage
      .locator('div')
      .filter({ hasText: '4-Digit Handover Code' })
      .locator('div.tracking-\\[0\\.25em\\]')
      .first()
      .innerText();
    const handoverCode = codeText.trim();
    expect(handoverCode).toMatch(/^\d{4}$/);

    // Recycler enters weighed kg (11.5), handover code, scale photo -> Submit Weigh-In
    await recyclerPage.locator('input[id^="w-"]').first().fill('11.5');
    await recyclerPage.locator('input[id^="code-"]').first().fill(handoverCode);
    await recyclerPage.locator('input[type="file"]').first().setInputFiles({
      name: 'scale.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await expect(recyclerPage.getByText('Photo Attached ✓').first()).toBeVisible();
    await recyclerPage.getByRole('button', { name: 'Submit Weigh-In' }).first().click();
    await expect(recyclerPage.getByText(/Weigh-in submitted/i).first()).toBeVisible();

    // 5. Collector Confirms Handover -> Verified Receipt + PDF
    await collectorPage.reload({ waitUntil: 'domcontentloaded' });
    await collectorPage.getByRole('button', { name: 'My lots' }).first().click();
    await collectorPage.getByRole('button', { name: /Confirm Handover & Issue Receipt/i }).first().click();
    await expect(collectorPage.getByText(/Handover confirmed! Receipt KWC-/i).first()).toBeVisible();

    // 6. Recycler Marks UPI Payment Sent -> Collector Confirms Received -> Ledger Updated
    await recyclerPage.reload({ waitUntil: 'domcontentloaded' });
    await recyclerPage.getByRole('button', { name: /Pickups/i }).first().click();
    await recyclerPage.locator('input[id^="utr-"]').first().fill('431987654321');
    await recyclerPage.getByRole('button', { name: 'Mark Payment Sent' }).first().click();
    await expect(recyclerPage.getByText(/Payment marked sent/i).first()).toBeVisible();

    // Verify recycler CSV export works
    const recCsvResp = await recyclerCtx.request.get('/api/recycler/history/csv');
    expect(recCsvResp.status()).toBe(200);
    expect(recCsvResp.headers()['content-type']).toContain('text/csv');

    await collectorPage.reload({ waitUntil: 'domcontentloaded' });
    await collectorPage.getByRole('button', { name: 'My lots' }).first().click();
    await collectorPage.getByRole('button', { name: 'Payment Received' }).first().click();
    await expect(collectorPage.getByText(/Transaction completed and added to your ledger/i).first()).toBeVisible();

    await collectorPage.getByRole('button', { name: 'Ledger' }).first().click();
    await expect(collectorPage.getByText('Monthly Net Earnings & Recycled Weight').first()).toBeVisible();
    await expect(collectorPage.getByRole('link', { name: /Export Ledger CSV/i }).first()).toBeVisible();

    const ledgerCsvResp = await collectorCtx.request.get('/api/ledger/csv');
    expect(ledgerCsvResp.status()).toBe(200);
    const ledgerCsvBody = await ledgerCsvResp.text();
    expect(ledgerCsvBody).toContain('KWC-2026-0006');

    // 7. Admin Context: Verify Queue + Disputes + Analytics + Mobile 360px Check
    const adminCtx = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const adminPage = await adminCtx.newPage();
    adminPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[admin] ${msg.text()}`);
    });
    adminPage.on('pageerror', (err) => pageErrors.push(`[admin] ${err.message}`));

    await adminPage.goto('/', { waitUntil: 'domcontentloaded' });
    await adminPage.getByRole('button', { name: 'Skip Intro' }).click();
    await adminPage.getByRole('button', { name: 'Sign in' }).first().click();
    await adminPage.getByLabel('Demo account').selectOption('usr_admin_kavitha');
    await adminPage.getByRole('button', { name: /Demo Login/i }).click();

    await expect(adminPage.getByText('Recycler Verification Queue').first()).toBeVisible();
    await adminPage.getByRole('button', { name: /Disputes/i }).first().click();
    await expect(adminPage.getByText('Payment & Weigh-In Dispute Queue').first()).toBeVisible();
    await adminPage.getByRole('button', { name: /Analytics/i }).first().click();
    await expect(adminPage.getByText('Platform Impact & Marketplace Analytics').first()).toBeVisible();
    await expect(adminPage.getByText('Recent Lots & Bookings Activity').first()).toBeVisible();

    const mobileOverflow = await adminPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(mobileOverflow).toBe(false);

    await collectorCtx.close();
    await recyclerCtx.close();
    await adminCtx.close();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
