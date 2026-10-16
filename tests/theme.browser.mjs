import { test, expect } from '@playwright/test';

test('light/dark palettes, responsive layout and interaction survive theming', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-dsh-saber', '0.1.0');
  expect(await page.locator('.fixture_centerCol').evaluate(node => getComputedStyle(node).backgroundImage.includes('data:image/jpeg;base64'))).toBe(true);
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(29, 43, 58)');
  await page.getByRole('textbox').fill('Saber test');
  await page.locator('#send').click();
  await expect(page.locator('#message')).toHaveText('Saber test');
  await page.locator('#dark').click();
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(229, 241, 252)');
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.locator('.fixture_centerCol')).toHaveCSS('background-image', /data:image\/webp;base64/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('unload/reload leaves one style, removes all owned state and preserves input', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('Keep my draft');
  await page.evaluate(async () => {
    for (let i = 0; i < 100; i++) { window.disposeSaber(); window.saberModule.apply(window.ctx); }
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  await expect(page.locator('style[data-plugin="gord-dsh-saber-theme"]')).toHaveCount(1);
  await page.evaluate(() => window.disposeSaber());
  await expect(page.locator('body')).not.toHaveAttribute('data-dsh-saber');
  await expect(page.locator('style[data-plugin="gord-dsh-saber-theme"]')).toHaveCount(0);
  await expect(page.locator('[data-saber-welcome]')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveValue('Keep my draft');
  expect(await page.locator('body').evaluate(body => body.style.length)).toBe(0);
});

test('home/chat backgrounds follow layout changes and failed activation rolls back', async ({ page }) => {
  await page.goto('/');
  await page.locator('.fixture_composerHero').evaluate(node => node.classList.remove('fixture_composerHero'));
  await expect(page.locator('.fixture_centerCol')).toHaveCSS('background-image', /data:image\/webp;base64/);
  await page.evaluate(() => {
    window.disposeSaber();
    try { window.saberModule.apply({ theme: {overrideTokens() {throw new Error('test');}} }); } catch {}
  });
  await expect(page.locator('body')).not.toHaveAttribute('data-dsh-saber');
  await expect(page.locator('style[data-plugin="gord-dsh-saber-theme"]')).toHaveCount(0);
});
