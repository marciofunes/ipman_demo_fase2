import { test, expect } from '@playwright/test';

test('metal workpiece texture loads and work area remains usable', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/');
  const texture = page.waitForResponse(response => response.url().endsWith('/img/abs-face-metal.png'));
  await page.getByRole('navigation').getByRole('button', { name: 'Digital Twin', exact: true }).click();
  expect((await texture).ok()).toBe(true);
  await expect(page.locator('.twin-loading')).not.toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Área de usinagem', exact: true }).click();
  await page.getByRole('button', { name: 'Rótulos', exact: true }).click();
  await page.waitForTimeout(2500); // Camera interpolation, for the saved visual review.
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
  await expect(page.getByRole('heading', { name: 'Electrical measurements' })).toBeVisible();
  await page.getByTestId('electrical-pf').click();
  await expect(page.getByRole('img', { name: 'Electrical trend · Power factor' })).toBeVisible();
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
