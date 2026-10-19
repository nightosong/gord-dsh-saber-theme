// Launch a second, isolated copy of the installed Desktop binary. Both DSH
// data and Electron userData are temporary. Never quit the user's existing app.
import { _electron } from '@playwright/test';
import { mkdtemp, rm, mkdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { manage } from './manage.mjs';
import { execFileSync } from 'node:child_process';
import { readVersion } from './build.mjs';
import { verifyPackage } from './verify-package.mjs';
import { rotationSmoke } from './rotation-smoke.mjs';

const executablePath = process.env.SABER_DESKTOP_APP || (process.platform === 'darwin'
  ? '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' : undefined);
if (!executablePath) throw new Error('Set SABER_DESKTOP_APP to the installed DeepSeek Harness executable');
const temporary = await mkdtemp(path.join(tmpdir(), 'saber-desktop-'));
const home = path.join(temporary, 'dsh');
const version = await readVersion();
const userData = path.join(temporary, 'chromium');
const env = { ...process.env, DSH_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let application;
let desktopLog = '';
async function stop() {
  if (!application) return;
  const child = application.process();
  // Closing during the installed app's first profile startup can leave its
  // quit coordinator waiting. Only this isolated test process may be killed.
  await Promise.race([application.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 5000).unref())]);
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000).unref())]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  application = undefined;
}
async function launch() {
  application = await _electron.launch({ executablePath, args: [`--user-data-dir=${userData}`], env, timeout: 20000 });
  for (const stream of [application.process().stdout, application.process().stderr]) stream?.on('data', chunk => { desktopLog = (desktopLog + chunk.toString()).slice(-8000); });
  const actual = await application.evaluate(({ app }) => app.getPath('userData'));
  if (await realpath(actual) !== await realpath(userData)) throw new Error('Desktop userData isolation failed');
  // Newer Desktop builds briefly create a bootstrap/welcome window before the
  // product window. Do not attach the smoke test to that disposable window.
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const product = application.windows().find(page => !page.isClosed() && page.url().startsWith('dsh-app://app/'));
    if (product) return product;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Desktop product window did not open');
}
try {
  // Same two bundle entries as the installed Desktop's generated profile.
  // Its default backend port is fixed; port 0 prevents collisions with the
  // user's existing Desktop while leaving that application's settings alone.
  const profile = path.join(home, 'profiles/desktop');
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-desktop', private: true, dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } }
  }));
  await writeFile(path.join(profile, 'cordis.patch.yml'), '- id: webserver\n  config:\n    host: 127.0.0.1\n    port: 0\n');
  console.log('Installing theme in isolated Desktop profile…');
  if (process.env.SABER_PACKAGE) {
    const archive = path.resolve(process.env.SABER_PACKAGE);
    await verifyPackage(archive);
    const installed = path.join(profile, 'node_modules/gord-dsh-saber-theme');
    await mkdir(installed, { recursive: true });
    execFileSync('tar', ['-xzf', archive, '-C', installed, '--strip-components=1']);
    await writeFile(path.join(profile, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop', private: true,
      dependencies: { 'gord-dsh-saber-theme': `file:${archive}` },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'gord-dsh-saber-theme'] } }
    }));
  } else await manage({ command: 'install', home, profile: 'desktop' });
  const page = await launch();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator(`body[data-dsh-saber="${version}"]`).waitFor({ timeout: 45000 });
  await page.locator('[data-saber-task-host][data-saber-task-state="ready"]').waitFor({ state: 'attached', timeout: 10000 });
  await page.waitForTimeout(1200);
  for (const text of ['Continue', 'Configure later']) {
    const button = page.getByText(text, { exact: true });
    if (await button.isVisible()) { await button.click(); await page.waitForTimeout(300); }
  }
  const info = await page.evaluate(() => ({
    url: location.href, theme: document.body.dataset.dshSaber,
    taskTrayReady: Boolean(document.querySelector('[data-saber-task-host]')),
    platform: document.documentElement.dataset.platform,
    hero: Boolean(document.querySelector('[class*="_composerHero"]')),
    background: getComputedStyle(document.querySelector('[class*="_centerCol"]')).backgroundImage.includes('data:image/'),
    styleCount: document.querySelectorAll('style[data-plugin="gord-dsh-saber-theme"]').length
  }));
  info.desktopVersion = await application.evaluate(({ app }) => app.getVersion());
  if (!info.background || info.styleCount !== 1) throw new Error('Native Desktop theme did not apply correctly');
  const screenshot = process.env.SABER_DESKTOP_SCREENSHOT || 'test-results/desktop-smoke.png';
  await mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot });
  const rotation = await rotationSmoke(page, version);
  console.log(JSON.stringify({ ...info, rotation, errors, screenshot }, null, 2));
  if (errors.length) throw new Error('Desktop renderer reported errors');
} catch (error) {
  if (application) {
    for (const page of application.windows()) console.error({ url: page.url(), errors: (await page.pageErrors().catch(() => [])).map(error => error.message), text: (await page.locator('body').innerText().catch(() => '')).slice(0, 2000) });
    await application.windows()[0]?.screenshot({ path: '/tmp/gord-dsh-desktop-failure.png' }).catch(() => {});
  }
  console.error(desktopLog.replace(/\?token=[\w-]+/g, '?token=[redacted]'));
  throw error;
} finally {
  await stop();
  await rm(temporary, { recursive: true, force: true });
}
