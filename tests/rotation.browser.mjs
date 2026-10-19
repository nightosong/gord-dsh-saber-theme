import { test, expect } from '@playwright/test';

const interval = 5 * 60_000;
async function setup(page) {
  await page.clock.install();
  await page.addInitScript(() => {
    Math.random = () => 0; // Deterministically visit all thirty real images.
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    window.resources = { live: new Set(), peak: 0, created: 0 };
    URL.createObjectURL = blob => {
      const url = create(blob);
      resources.live.add(url);
      resources.created++;
      resources.peak = Math.max(resources.peak, resources.live.size);
      return url;
    };
    URL.revokeObjectURL = url => { resources.live.delete(url); revoke(url); };
  });
  await page.goto('/');
}
async function chat(page) {
  await page.locator('.work').evaluate(node => node.classList.remove('fixture_composerHero'));
}
async function stats(page) {
  return page.evaluate(() => ({ live: resources.live.size, peak: resources.peak, created: resources.created, chunks: wallpaperChunks.size }));
}
async function background(page) {
  return page.locator('.fixture_centerCol').evaluate(node => {
    const value = getComputedStyle(node).backgroundImage;
    return value.includes('blob:') ? /blob:[^" )]+/.exec(value)[0] : 'initial';
  });
}
async function hidden(page, value) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'hidden', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}

test('home stays fixed; 100 real-image rotations stay bounded, then unload releases all URLs', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  await page.clock.runFor(interval * 3);
  expect(await stats(page)).toEqual({ live: 0, peak: 0, created: 0, chunks: 0 });
  await chat(page);
  let previous = 'initial';
  for (let i = 1; i <= 100; i++) {
    await page.clock.runFor(interval);
    await expect.poll(() => background(page)).not.toBe(previous);
    await expect.poll(() => stats(page)).toMatchObject({ created: i, live: 1 });
    const current = await background(page);
    expect(current).not.toBe(previous);
    previous = current;
  }
  expect(await stats(page)).toEqual({ live: 1, peak: 2, created: 100, chunks: 30 });
  await page.locator('.work').evaluate(node => node.classList.add('fixture_composerHero'));
  expect(await background(page)).toBe('initial');
  await page.setViewportSize({ width: 600, height: 800 });
  expect(await background(page)).toBe('initial');
  await page.clock.runFor(interval);
  expect((await stats(page)).created).toBe(100);
  await page.evaluate(() => window.disposeSaber());
  expect((await stats(page)).live).toBe(0);
  await page.clock.runFor(interval * 2);
  expect((await stats(page)).created).toBe(100);
});

test('hidden windows pause without catch-up, and pending loads cannot revive an unloaded theme', async ({ page }) => {
  await setup(page);
  await chat(page);
  await page.clock.runFor(interval);
  await expect.poll(() => background(page)).not.toBe('initial');
  await expect.poll(() => stats(page)).toMatchObject({ created: 1, live: 1 });
  await hidden(page, true);
  await page.clock.runFor(interval * 12);
  expect((await stats(page)).created).toBe(1);
  await hidden(page, false);
  await page.clock.runFor(interval - 1);
  expect((await stats(page)).created).toBe(1);
  await page.clock.runFor(1);
  await expect.poll(() => stats(page)).toMatchObject({ created: 2, live: 1 });
  await page.evaluate(() => {
    fixtureRequire.async = () => new Promise(resolve => { window.resolveLateChunk = resolve; });
  });
  await page.clock.runFor(interval);
  await page.waitForFunction(() => window.resolveLateChunk);
  await page.evaluate(() => {
    disposeSaber();
    resolveLateChunk({ createBlob() { throw new Error('Late resource was used after unload'); } });
  });
  await page.clock.runFor(interval);
  expect(await stats(page)).toMatchObject({ created: 2, live: 0 });
});

test('failed transport, corrupt images and timeout preserve the current image and allow retry', async ({ page }) => {
  await setup(page);
  await chat(page);
  await page.clock.runFor(interval);
  await expect.poll(() => background(page)).not.toBe('initial');
  await expect.poll(() => stats(page)).toMatchObject({ created: 1, live: 1 });
  const original = await background(page);
  await page.evaluate(() => {
    window.originalRequire = fixtureRequire.async;
    fixtureRequire.async = async () => { throw new Error('Offline'); };
  });
  await page.clock.runFor(interval);
  await page.waitForTimeout(1);
  expect(await background(page)).toBe(original);
  await page.evaluate(() => { fixtureRequire.async = async () => ({ createBlob: () => new Blob(['broken'], { type: 'image/webp' }) }); });
  await page.clock.runFor(interval);
  await expect.poll(() => stats(page)).toMatchObject({ created: 2, live: 1 });
  expect(await background(page)).toBe(original);
  await page.evaluate(() => { fixtureRequire.async = () => new Promise(resolve => { window.finishTimedOutChunk = resolve; }); });
  await page.clock.runFor(interval);
  await page.waitForFunction(() => window.finishTimedOutChunk);
  await page.clock.runFor(10_000);
  await page.evaluate(() => {
    finishTimedOutChunk({ createBlob() { throw new Error('Timed-out resource was used'); } });
    fixtureRequire.async = originalRequire;
  });
  await page.clock.runFor(interval);
  await expect.poll(() => stats(page)).toMatchObject({ created: 3, live: 1 });
  expect(await background(page)).not.toBe(original);
  await page.evaluate(() => disposeSaber());
  expect((await stats(page)).live).toBe(0);
});

test('hiding or unloading during image decode revokes candidates; reload keeps one scheduler', async ({ page }) => {
  await setup(page);
  await chat(page);
  await page.evaluate(() => {
    window.NativeImage = Image;
    window.Image = class {
      set src(value) { this.url = value; window.pendingImage = this; }
      removeAttribute() {}
    };
  });
  await page.clock.runFor(interval);
  await expect.poll(() => stats(page)).toMatchObject({ created: 1, live: 1 });
  await hidden(page, true);
  expect((await stats(page)).live).toBe(0);
  expect(await page.evaluate(() => pendingImage.onload)).toBeNull();
  await page.evaluate(() => { window.Image = NativeImage; });
  await hidden(page, false);
  await page.clock.runFor(interval);
  await expect.poll(() => stats(page)).toMatchObject({ created: 2, live: 1 });
  await page.evaluate(() => {
    for (let i = 0; i < 100; i++) { disposeSaber(); saberModule.apply(ctx); }
  });
  expect((await stats(page)).live).toBe(0);
  await page.clock.runFor(interval);
  await expect.poll(() => stats(page)).toMatchObject({ created: 3, live: 1 });
  await page.evaluate(() => disposeSaber());
  expect((await stats(page)).live).toBe(0);
  await page.clock.runFor(interval * 2);
  expect((await stats(page)).created).toBe(3);
});
