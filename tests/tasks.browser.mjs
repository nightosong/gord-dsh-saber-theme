import { test, expect } from '@playwright/test';

const trigger = page => page.locator('[data-saber-task-trigger]');
const panel = page => page.locator('#saber-task-panel');
async function mount(page) { await page.goto('/'); await page.evaluate(() => taskFixture.mount()); await expect(trigger(page)).toBeVisible(); }

test('task tray follows the turn index, shows counts and hover details in both themes, and hides when empty', async ({ page }) => {
  await mount(page);
  await expect(trigger(page).locator('.saber-task-total')).toHaveText('5');
  await expect(trigger(page).locator('.saber-task-badge')).toHaveText('3');
  expect(await page.locator('[data-saber-task-row]').count()).toBe(0);
  const rail = await page.locator('.fixture_turnIndex').boundingBox();
  const box = await trigger(page).boundingBox();
  expect(box.y).toBeCloseTo(rail.y + rail.height + 12, 0);
  await trigger(page).hover();
  await expect(panel(page)).toBeVisible();
  await expect(page.locator('[data-saber-task-row]')).toHaveCount(5);
  await expect(panel(page)).toContainText('已结束未查看');
  const composer = await page.locator('[data-composer-seat]').boundingBox();
  const expanded = await panel(page).boundingBox();
  expect(expanded.y + expanded.height).toBeLessThan(composer.y);
  await page.screenshot({ path: 'test-results/saber-tasks-light.png' });
  await page.locator('#dark').click(); await trigger(page).hover();
  await expect(panel(page)).toHaveCSS('background-color', 'rgb(16, 33, 49)');
  await page.screenshot({ path: 'test-results/saber-tasks-dark.png' });
  await page.evaluate(() => { document.documentElement.lang = 'en'; });
  await expect(panel(page)).toHaveAttribute('aria-label', 'Task attention');
  await page.evaluate(() => taskFixture.statuses.set(new Map()));
  await expect(trigger(page)).not.toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test('row navigation waits for actual selection, reports failure, and new activity reappears', async ({ page }) => {
  await mount(page); await trigger(page).hover();
  await page.evaluate(() => { taskFixture.navigate = () => { throw new Error('Writer unavailable'); }; });
  await page.locator('[data-saber-task-row="done"]').click();
  await expect(page.getByRole('alert')).toContainText('Writer unavailable');
  await expect(page.locator('[data-saber-task-row="done"]')).toBeVisible();
  await page.evaluate(() => { taskFixture.navigate = id => { window.selectedTask = id; }; });
  await page.locator('[data-saber-task-row="done"]').click();
  await expect.poll(() => page.evaluate(() => window.selectedTask)).toBe('done');
  await expect(page.locator('[data-saber-task-row="done"]')).toBeDisabled();
  await page.evaluate(() => taskFixture.current.set({ key: 'done' }));
  await expect(panel(page)).toHaveCount(0);
  await page.evaluate(() => taskFixture.current.set({ key: 'self' }));
  await trigger(page).hover();
  await expect(page.locator('[data-saber-task-row="done"]')).toHaveCount(0);
  await page.evaluate(() => taskFixture.update('done', { running: true, completionUnread: false }));
  await expect(page.locator('[data-saber-task-row="done"]')).toBeVisible();
});

test('dragging persists, narrow windows stay usable, reset restores the anchor, and Escape keeps keyboard focus', async ({ page }) => {
  await mount(page);
  const initial = await trigger(page).boundingBox();
  await page.mouse.move(initial.x + 18, initial.y + 18); await page.mouse.down();
  await page.mouse.move(initial.x - 100, initial.y - 60, { steps: 5 }); await page.mouse.up();
  const dragged = await trigger(page).boundingBox();
  expect(dragged.x).toBeLessThan(initial.x - 50);
  await page.reload(); await page.evaluate(() => taskFixture.mount());
  await expect.poll(async () => (await trigger(page).boundingBox()).x).toBeCloseTo(dragged.x, 0);
  await page.setViewportSize({ width: 600, height: 800 });
  await trigger(page).hover();
  const narrow = await panel(page).boundingBox();
  expect(narrow.x).toBeGreaterThanOrEqual(0); expect(narrow.x + narrow.width).toBeLessThanOrEqual(600);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '恢复索引下方的位置' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gord-dsh-saber-theme:task-position'))).toBeNull();
  await trigger(page).focus(); await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
});

test('existing worktree task tray takes precedence without losing the theme reminder', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => { const native = document.createElement('div'); native.dataset.taskMonitor = ''; document.body.append(native); });
  await expect(trigger(page)).not.toBeVisible();
  await page.evaluate(() => document.querySelector('[data-task-monitor]').remove());
  await expect(trigger(page)).toBeVisible();
  await expect(trigger(page).locator('.saber-task-total')).toHaveText('5');
});

test('hover closes after 200ms, navigation timeout keeps the reminder, and hidden windows close details', async ({ page }) => {
  await page.clock.install();
  await mount(page);
  await trigger(page).click();
  await expect(panel(page)).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.runFor(199);
  await expect(panel(page)).toBeVisible();
  await page.clock.runFor(1);
  await expect(panel(page)).toHaveCount(0);
  await trigger(page).hover();
  await page.evaluate(() => { taskFixture.navigate = () => {}; });
  await page.locator('[data-saber-task-row="done"]').click();
  await expect(page.locator('[data-saber-task-row="done"]')).toBeDisabled();
  await page.clock.runFor(5001);
  await expect(page.getByRole('alert')).toContainText('未能打开会话');
  await expect(page.locator('[data-saber-task-row="done"]')).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('[data-saber-task-row]')).toHaveCount(0);
});

test('closed panels create no rows; pagination caps each render at twenty', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const byId = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`task-${i}`, { title: `Task ${i}` }]));
    taskFixture.mount({ byId, statuses: Object.keys(byId).map(id => [id, { running: true }]) });
  });
  await expect(trigger(page)).toBeVisible();
  await expect(page.locator('[data-saber-task-row]')).toHaveCount(0);
  await trigger(page).hover();
  await expect(page.locator('[data-saber-task-row]')).toHaveCount(20);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(panel(page)).toContainText('2 / 4');
  await expect(page.locator('[data-saber-task-row]')).toHaveCount(20);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-saber-task-row]')).toHaveCount(0);
});

test('100 activations keep single subscriptions and dispose all task DOM and observers', async ({ page }) => {
  await page.addInitScript(() => {
    window.activeTaskObservers = new Set();
    for (const name of ['MutationObserver', 'ResizeObserver']) {
      const Original = window[name];
      window[name] = class extends Original {
        observe(...args) { activeTaskObservers.add(this); return super.observe(...args); }
        disconnect() { activeTaskObservers.delete(this); return super.disconnect(); }
      };
    }
  });
  await mount(page);
  await page.evaluate(() => { for (let i = 0; i < 100; i++) { disposeSaber(); saberModule.apply(ctx); } });
  await expect(page.locator('[data-saber-task-host]')).toHaveCount(1);
  expect(await page.evaluate(() => taskFixture.listeners())).toEqual([1, 1, 1, 1]);
  expect(await page.evaluate(() => activeTaskObservers.size)).toBe(3);
  await page.evaluate(() => disposeSaber());
  expect(await page.evaluate(() => taskFixture.listeners())).toEqual([0, 0, 0, 0]);
  expect(await page.evaluate(() => activeTaskObservers.size)).toBe(0);
  await expect(page.locator('[data-saber-task-host]')).toHaveCount(0);
  await page.evaluate(() => {
    const inject = ctx.inject;
    ctx.inject = (keys, apply) => inject(keys, scope => {
      if (keys.includes('uiSession')) scope.uiSession = { ...scope.uiSession, sessionStatus: undefined };
      apply(scope);
    });
    saberModule.apply(ctx);
  });
  await expect(page.locator('[data-saber-task-host]')).toHaveCount(0);
  await expect(page.locator('style[data-plugin="gord-dsh-saber-theme"]')).toHaveCount(1);
});
