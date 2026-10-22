import { test, expect } from '@playwright/test';
test('inspection, language, reference and history end to end', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/qa/overview.png', fullPage: true });
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Inspeção atual', exact: true })
    .click();
  await expect(page.getByText('8 / 11')).toBeVisible();
  await page.screenshot({ path: 'docs/qa/inspection.png', fullPage: true });
  await page.getByLabel('Idioma').selectOption('en');
  await expect(
    page.getByRole('heading', { name: 'Current inspection', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Inspection reference', exact: true }).click();
  await expect(page.getByText('Expected fields for selected PN')).toBeVisible();
  await page.getByRole('button', { name: 'Inspection History', exact: true }).click();
  await page.getByRole('button', { name: 'Open evidence 2026-054631' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
});
test('imported 3D, presets, labels, xray, cameras and language', async ({ page }) => {
  // Software WebGL in CI needs time for two captures and GPU resource cleanup.
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Digital Twin', exact: true })
    .click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.twin-loading')).not.toBeVisible({ timeout: 60000 });
  await page.getByTestId('preset-healthy').click();
  await expect(page.getByTestId('twin-condition')).toContainText('Normal');
  await page.getByTestId('preset-spindleBearing').click();
  await expect(page.getByTestId('twin-condition')).toContainText('Crítico');
  await page.getByTestId('xray').click();
  await expect(page.getByTestId('xray')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Bombas e agregados', exact: true }).click();
  await page.getByTestId('comp-bomba1').click();
  await page.getByTestId('preset-cavitation').click();
  await expect(page.getByTestId('param-tankLevel')).toHaveValue('8');
  await expect(page.getByTestId('label-bomba1')).toBeAttached();
  await page.screenshot({ path: 'docs/qa/twin-xray.png' });
  await page.getByLabel('Idioma').selectOption('en');
  await expect(page.getByRole('heading', { name: 'What-if scenarios' })).toBeVisible();
  await page.getByLabel('Language').selectOption('pt');
  await page.getByRole('button', { name: 'Máquina', exact: true }).click();
  await page.screenshot({ path: 'docs/qa/twin.png' });
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(
    true,
  );
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Visão geral', exact: true })
    .click();
  expect(errors).toEqual([]);
});

test('one-second data and current clock update together', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.live-status')).toContainText('Online');
  const clock = await page.getByLabel('Hora atual').textContent();
  const points = await page.locator('.chart polyline').first().getAttribute('points');
  await expect
    .poll(() => page.getByLabel('Hora atual').textContent(), { timeout: 5000 })
    .not.toBe(clock);
  await expect
    .poll(() => page.locator('.chart polyline').first().getAttribute('points'), { timeout: 5000 })
    .not.toBe(points);
  await expect(page.getByText('Demonstração • dados simulados')).toHaveCount(0);
});

test('global filters update all dashboards, reset on navigation and retain desktop menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  for (const [index, name] of [
    'Visão geral',
    'Qualidade dos dados',
    'Referências',
    'Condição dos ativos',
    'Investigações',
  ].entries()) {
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    await expect(page.getByLabel('Máquina', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Ativo', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Período', { exact: true })).toHaveValue('Últimas 8 horas');
    await page.getByLabel('Máquina', { exact: true }).selectOption('GROB G300 • 01');
    const healthy = await page.locator('.dashboard-page').innerText();
    const healthyCurve = await page.locator('.chart polyline').first().getAttribute('points');
    await page.getByLabel('Máquina', { exact: true }).selectOption('GROB G300 • 04');
    await expect(page.getByTestId('analytics-context')).toHaveClass(/critical/);
    expect(await page.locator('.dashboard-page').innerText()).not.toBe(healthy);
    expect(await page.locator('.chart polyline').first().getAttribute('points')).not.toBe(
      healthyCurve,
    );
    await page.getByLabel('Ativo', { exact: true }).selectOption('Bomba 2');
    const before = await page.locator('.chart polyline').first().getAttribute('points');
    await page.getByLabel('Período', { exact: true }).selectOption('Últimos 7 dias');
    expect(await page.locator('.chart polyline').first().getAttribute('points')).not.toBe(before);
    await page.screenshot({ path: `docs/qa/live-${index}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 1440, height: 600 });
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Digital Twin', exact: true }),
  ).toBeInViewport();
});

test('mobile Twin has accessible scenarios without scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Digital Twin', exact: true })
    .click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.locator('.twin-mobile-tabs').getByRole('button', { name: 'Cenários what-if' }).click();
  await page.getByTestId('comp-spindle').click();
  await expect(page.getByTestId('param-toolWear')).toBeInViewport();
  await page.getByTestId('comp-bomba2').click();
  await page.getByTestId('preset-b2bearing').click();
  await expect(page.getByTestId('twin-condition')).toContainText('Crítico');
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'docs/qa/twin-mobile-controls.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByTestId('param-bearingWear')).toBeInViewport();
  await expect(page.getByTestId('param-tankLevel')).toBeInViewport();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'docs/qa/twin-landscape-controls.png' });
});

test('mobile dashboards allow readable vertical scroll without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const name of [
    'Visão geral',
    'Qualidade dos dados',
    'Referências',
    'Condição dos ativos',
    'Investigações',
  ]) {
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    await expect(page.getByLabel('Máquina', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page
        .locator('.dashboard-page h2')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16);
  }
  await page
    .getByRole('button', { name: 'Registrar resultado', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('button', { name: 'Registrar resultado', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: 'docs/qa/live-mobile.png', fullPage: true });
});

test('mobile navigation remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Inspeção atual', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Inspeção atual', exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/qa/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('validates and activates an XLSX reference', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Referência de inspeção', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/reference.xlsx');
  await expect(page.getByText('Referência validada e ativada nesta sessão.')).toBeVisible();
  await expect(page.getByText('v13', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'docs/qa/reference.png', fullPage: true });
});
