import { execFileSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { readVersion } from './build.mjs';

export async function verifyPackage(archive) {
  const list = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/);
  const expected = ['package/package.json', 'package/cordis.patch.yml', 'package/lib/index.js', 'package/lib/client.js', 'package/README.md', 'package/LICENSE', 'package/NOTICE.md'];
  if (list.length !== expected.length || expected.some(file => !list.includes(file))) throw new Error('Unexpected plugin archive contents');
  const read = file => execFileSync('tar', ['-xOzf', archive, `package/${file}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const pkg = JSON.parse(read('package.json'));
  if (pkg.version !== await readVersion() || pkg.engines.dsh !== '0.2.0-rc.2') throw new Error('Archive version/DSH requirement mismatch');
  if (pkg.dsh.bundle.patch !== './cordis.patch.yml') throw new Error('Missing native bundle declaration');
  if (!read('cordis.patch.yml').includes(`name: ${pkg.name}`)) throw new Error('Bundle does not mount this package');
  if (pkg.scripts.prepare || pkg.scripts.install || pkg.scripts.postinstall) throw new Error('Prebuilt package must need no install scripts');
  let registration;
  runInNewContext(read('lib/client.js'), { window: { __ModuleLoader__: { load: row => { registration = row; } } } });
  if (registration?.id !== pkg.name || typeof registration.factory().apply !== 'function') throw new Error('Invalid client module registration');
  return { version: pkg.version, dsh: pkg.engines.dsh, files: list.length, bytes: (await stat(archive)).size };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(await verifyPackage(path.resolve(process.argv[2])));
