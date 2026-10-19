// Exercise native chunk transport without creating sessions or calling models.
// The temporary instance's real home layout is made chat-shaped for this check.
export async function rotationSmoke(page, version) {
  await page.clock.install();
  try {
    await page.reload();
    await page.locator(`body[data-dsh-saber="${version}"]`).waitFor({ timeout: 30000 });
    await page.locator('[class*="_composerHero"]').waitFor();
    await page.evaluate(() => {
      const node = document.querySelector('[class*="_composerHero"]');
      window.smokeHero = { node, className: node.className };
      node.className = node.className.split(/\s+/).filter(name => !name.includes('_composerHero')).join(' ');
    });
    let previous = '';
    for (let i = 0; i < 2; i++) {
      await page.clock.runFor(5 * 60_000 + 1);
      // Use real runner time for asynchronous image and native IPC delivery.
      const deadline = Date.now() + 15000;
      let changed = false;
      while (Date.now() < deadline) {
        const current = await page.evaluate(() => {
          const css = getComputedStyle(document.querySelector('[class*="_centerCol"]')).backgroundImage;
          return /blob:[^" )]+/.exec(css)?.[0] || '';
        });
        if (current && current !== previous) { previous = current; changed = true; break; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!changed) throw new Error('Native wallpaper chunk did not load/rotate');
    }
    return { rotations: 2, nativeChunks: true, modelCalls: 0, clock: 'accelerated', layout: 'home with hero class temporarily removed' };
  } finally {
    await page.evaluate(() => { if (window.smokeHero) smokeHero.node.className = smokeHero.className; }).catch(() => {});
    await page.clock.resume();
  }
}
