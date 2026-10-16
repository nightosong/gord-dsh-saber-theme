import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root } from '../scripts/build.mjs';

test('native platform launchers install and restore a profile under a path with spaces', { skip: !['darwin', 'win32'].includes(process.platform) }, async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'Saber launcher '));
  try {
    const directory = path.join(home, 'profiles/web');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: [] } } }));
    const original = '# original\n[]\n';
    const patch = path.join(directory, 'cordis.patch.yml');
    await writeFile(patch, original);
    for (const action of ['Install Saber Theme', 'Restore Default Theme']) {
      if (process.platform === 'win32') {
        const script = path.join(root, 'windows', `${action}.cmd`);
        execSync(`call "${script}" --home "${home}" --profile web`, { input: '\r\n', timeout: 15000, windowsHide: true });
      } else {
        execFileSync('bash', [path.join(root, 'macos', `${action}.command`), '--home', home, '--profile', 'web'], { input: '\n', timeout: 15000 });
      }
      const current = await readFile(patch, 'utf8');
      if (action.startsWith('Install')) assert.match(current, /id: gord-dsh-saber-theme/);
      else assert.equal(current, original);
    }
  } finally { await rm(home, { recursive: true, force: true }); }
});
