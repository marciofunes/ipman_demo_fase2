import { test, expect } from '@playwright/test';

test('aluminium block is drilled progressively and work area remains usable', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/');
  const oldTextures: string[] = [];
  page.on('request', request => { if (request.url().endsWith('/img/abs-face-metal.png')) oldTextures.push(request.url()); });
  await page.getByRole('navigation').getByRole('button', { name: 'Digital Twin', exact: true }).click();

  await expect(page.locator('.twin-loading')).not.toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Área de usinagem', exact: true }).click();
  await page.getByRole('button', { name: 'Rótulos', exact: true }).click();
  const cycle = page.getByTestId('machining-cycle');
  await expect(cycle).toHaveAttribute('data-total', '42');
  await expect.poll(async () => Number(await cycle.getAttribute('data-completed')), { timeout: 60000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.twin-loading')).toHaveCount(0);
  expect(oldTextures).toHaveLength(0);
  await page.screenshot({ path: 'docs/qa/twin-workpiece.png' });
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
});

test('electrical cards, units, filters, chart selection and translations', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.asset-bottom small').first()).toHaveText('mm/s²');
  await page.getByLabel('Máquina', { exact: true }).selectOption('GROB G300 • 01');
  const healthy = await page.getByTestId('electrical-current').textContent();
  await page.getByLabel('Máquina', { exact: true }).selectOption('GROB G300 • 04');
  expect(await page.getByTestId('electrical-current').textContent()).not.toBe(healthy);
  await page.getByLabel('Ativo', { exact: true }).selectOption('Bomba 2');
  await page.getByTestId('electrical-voltage').click();
  await expect(page.getByRole('img', { name: 'Tendência elétrica · Tensão entre fases' })).toBeVisible();
  const points = await page.locator('.electrical-panel polyline').getAttribute('points');
  await expect.poll(() => page.locator('.electrical-panel polyline').getAttribute('points')).not.toBe(points);
  await page.screenshot({ path: 'docs/qa/electrical.png', fullPage: true });
  await page.getByLabel('Idioma').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Three-phase Monitoring' })).toBeVisible();
  await page.getByTestId('electrical-pf').click();
  await expect(page.getByRole('img', { name: 'Electrical trend · Power factor' })).toBeVisible();
  await expect(page.getByText('real-time updates', { exact: true })).toBeVisible();
  for (const name of ['Data quality', 'Baselines', 'Asset condition', 'Investigations']) {
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.electrical-panel')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('dense history windows, sticky header, filters and older piece evidence', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Histórico de Inspeção', exact: true }).click();
  const list = page.getByRole('region', { name: 'Lista de inspeções' });
  await expect(list.locator('tbody tr')).toHaveCount(480);
  expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await list.locator('tbody tr').first().evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(50);
  await page.getByLabel('Janela do histórico').selectOption('1');
  const count = await list.locator('tbody tr').count();
  expect(count).toBeGreaterThan(50);
  expect(count).toBeLessThan(70);
  await page.getByLabel('Janela do histórico').selectOption('8');
  await list.evaluate(el => el.scrollTop = el.scrollHeight);
  expect(await list.locator('th').first().evaluate(el => getComputedStyle(el).position)).toBe('sticky');
  await list.locator('tbody tr').last().getByRole('button', { name: /Abrir evidência/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByLabel('Resultado', { exact: true }).selectOption('Reprovado');
  expect(await list.locator('tbody tr').count()).toBeGreaterThan(20);
  await page.getByLabel('Buscar identificador ou PN').fill('2026-054631');
  await expect(list.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Buscar identificador ou PN').fill('');
  await page.getByLabel('Resultado', { exact: true }).selectOption('Todos');
  await list.evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: 'docs/qa/history-dense.png', fullPage: true });
});


test('current inspection runs automatically without an action button', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Inspeção atual', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Executar nova inspeção' })).toHaveCount(0);
  await expect(page.getByText('Inspeção automática · a cada 5 segundos', { exact: true })).toBeVisible();
  const initial = await page.locator('.intro-action > div > span').textContent();
  await expect.poll(() => page.locator('.intro-action > div > span').textContent(), { timeout: 12000 }).not.toBe(initial);
  await page.getByLabel('Idioma').selectOption('en');
  await expect(page.getByText('Automatic inspection · every 5 seconds', { exact: true })).toBeVisible();
});
