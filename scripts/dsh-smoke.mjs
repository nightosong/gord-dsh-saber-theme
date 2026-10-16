// Optional integration test against an installed DSH. Uses a temporary home,
// never the real user's profiles, credentials, sessions or running desktop.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { manage } from './manage.mjs';

const home = await mkdtemp(path.join(tmpdir(), 'saber-dsh-'));
const env = { ...process.env, DSH_HOME: home };
const command = process.env.DSH_BIN || 'dsh';
let child;
let browser;
try {
  execFileSync(command, ['web', '--dump-default-config'], { env, stdio: 'ignore' });
  await manage({ command: 'install', home, profile: 'web' });
  child = spawn(command, ['web', '--port', '0', '--no-open'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('DSH startup timed out')), 45000);
    let output = '';
    const read = chunk => {
      output += chunk.toString();
      const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`DSH exited: ${code}`)); });
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('body[data-dsh-saber="0.1.0"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  const continueButton = page.getByText('Continue', { exact: true });
  if (await continueButton.isVisible()) {
    await continueButton.click();
    await page.getByText('Preview Notice', { exact: true }).waitFor({ state: 'hidden' });
  }
  const configureLater = page.getByText('Configure later', { exact: true });
  try { await configureLater.waitFor({ timeout: 3000 }); }
  catch (error) { if (error.name !== 'TimeoutError') throw error; }
  if (await configureLater.isVisible()) await configureLater.click();
  await page.locator('[class*="_composerHero"]').waitFor();
  const center = page.locator('[class*="_frame"] > [class*="_centerCol"]');
  const background = await center.evaluate(node => getComputedStyle(node).backgroundImage);
  if (!background.includes('data:image/jpeg;base64')) throw new Error('DSH home background did not apply');
  await page.evaluate(async () => {
    const background = getComputedStyle(document.querySelector('[class*="_centerCol"]')).backgroundImage;
    const url = /url\("(.*?)"\)/.exec(background)?.[1];
    const image = new Image(); image.src = url; await image.decode();
  });
  const info = await page.evaluate(() => ({
    title: document.title,
    themed: document.body.dataset.dshSaber,
    center: [...document.querySelectorAll('[class*="_centerCol"]')].map(node => ({ class: node.className, background: getComputedStyle(node).backgroundImage.slice(0, 180) })),
    classes: [...document.querySelectorAll('[class]')].map(node => node.className).filter(name => typeof name === 'string' && /welcome|empty|brand|composer/i.test(name)),
    text: document.body.innerText.slice(0, 3000)
  }));
  if (!info.center.length) throw new Error('DSH layout selector no longer matches');
  const screenshot = process.env.SABER_SCREENSHOT || 'test-results/dsh-smoke.png';
  await mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'));
  const darkText = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--dsw-alias-label-primary').trim());
  if (darkText !== '#e5f1fc') throw new Error(`Unexpected native dark token: ${darkText}`);
  await page.keyboard.press('Escape');
  const darkScreenshot = screenshot.replace(/\.png$/, '-dark.png');
  await page.screenshot({ path: darkScreenshot });
  console.log(JSON.stringify({ ...info, nativeDarkMode: true, errors, screenshot, darkScreenshot }, null, 2));
  if (errors.length) throw new Error('DSH browser reported runtime errors');
} finally {
  await browser?.close();
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(home, { recursive: true, force: true });
}
