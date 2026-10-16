import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build, root } from '../scripts/build.mjs';
import path from 'node:path';

test('release version agrees across metadata, docs and generated bundle', async () => {
  const { version, bytes } = await build();
  assert.ok(bytes < 4 * 1024 * 1024, 'Native theme bundle must remain under 4 MiB');
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json')));
  assert.equal(version, pkg.version);
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json')));
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  for (const file of ['CHANGELOG.md', 'README.md']) assert.ok((await readFile(path.join(root, file), 'utf8')).includes(version), `${file} must mention ${version}`);
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.engines.dsh, '0.2.0-rc.2');
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-client-ui-theme'], pkg.engines.dsh);
  assert.equal(pkg.peerDependenciesMeta['@deepseek-ai/dsh-client-ui-theme'].optional, true);
  const patch = await readFile(path.join(root, 'cordis.patch.yml'), 'utf8');
  assert.match(patch, /name: gord-dsh-saber-theme/);
  const screenshots = JSON.parse(await readFile(path.join(root, 'screenshots.json')));
  assert.ok(screenshots.length >= 1 && screenshots.length <= 8);
  for (const file of screenshots) {
    assert.ok(file.startsWith('docs/images/') && !file.includes('..'));
    assert.ok((await readFile(path.join(root, file))).length > 0);
  }
  const bundle = await readFile(path.join(root, 'lib/client.js'), 'utf8');
  assert.ok(bundle.includes(`const SABER_VERSION = "${version}"`));
  assert.ok(!/https?:\/\//.test(bundle), 'Theme must make no external requests');
});
