import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { manage, renderPatch, splitPatch } from '../scripts/manage.mjs';

test('patch installation round trips original bytes, comments, [], CRLF and Unicode', () => {
  for (const original of ['', '# comment\n[]\n', '[]', '# 我的设置\r\n[]\r\n', '- id: ui-theme\n  config:\n    preference: dark', '- id: ui-theme\n  config:\n    preference: dark\n']) {
    const file = path.join(tmpdir(), 'Saber 主题', 'lib/index.js');
    const once = renderPatch(original, file);
    assert.equal(splitPatch(once).base, original);
    assert.equal(renderPatch(once, file), once);
    assert.equal((once.match(/- id: gord-dsh-saber-theme/g) || []).length, 1);
    assert.match(once, /file:\/\//);
  }
});
test('uninstall preserves content appended by other editors and rejects damaged markers', () => {
  const text = renderPatch('- id: original\n', path.resolve('lib/index.js'));
  assert.equal(splitPatch(text + '- id: later\n').base, '- id: original\n- id: later\n');
  const initiallyEmpty = renderPatch('[]\n', path.resolve('lib/index.js'));
  const appended = splitPatch(initiallyEmpty + '- id: later\n').base;
  assert.ok(appended.startsWith('# Original empty list:[]\n'));
  assert.ok(appended.endsWith('- id: later\n'));
  assert.throws(() => splitPatch(text.replace('# <<<', '# broken')), /damaged/);
  assert.throws(() => splitPatch(text + text), /damaged/);
  assert.throws(() => renderPatch('[{id: user}]', path.resolve('lib/index.js')), /block patch list/);
});
test('isolated profile install/update/uninstall preserves user settings and makes backups', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'saber 主题-'));
  try {
    const profile = path.join(home, 'profiles/web');
    await mkdir(profile, { recursive: true });
    await writeFile(path.join(profile, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: [] } } }));
    const patch = path.join(profile, 'cordis.patch.yml');
    const original = '# user settings\n[]\n';
    await writeFile(patch, original);
    const [installed] = await manage({ command: 'install', home });
    assert.equal(await readFile(installed.backup, 'utf8'), original);
    const text = await readFile(patch, 'utf8');
    const moduleURL = JSON.parse(/name: (.*)/.exec(text)[1]);
    const moduleFile = fileURLToPath(moduleURL);
    assert.match(await readFile(moduleFile, 'utf8'), /export function apply/);
    const [status] = await manage({ command: 'status', home });
    assert.equal(status.installed, true);
    await manage({ command: 'install', home });
    await manage({ command: 'uninstall', home });
    assert.equal(await readFile(patch, 'utf8'), original);
    assert.equal((await manage({ command: 'uninstall', home }))[0].unchanged, true);
  } finally { await rm(home, { recursive: true, force: true }); }
});
