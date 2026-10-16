import { mkdir, cp, copyFile, rm, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { build, root } from './build.mjs';

const platform = process.argv[2];
if (!['macos', 'windows'].includes(platform)) throw new Error('Usage: node scripts/release.mjs macos|windows');
const { version } = await build();
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`) throw new Error('Release tag does not match VERSION');
const name = `gord-dsh-saber-theme-v${version}-${platform}`;
const directory = path.join(root, 'dist', name);
await rm(directory, { recursive: true, force: true });
await mkdir(path.join(directory, 'scripts'), { recursive: true });
for (const entry of ['src', 'theme', 'lib', 'docs', platform]) await cp(path.join(root, entry), path.join(directory, entry), { recursive: true });
for (const entry of ['VERSION', 'package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE.md']) await copyFile(path.join(root, entry), path.join(directory, entry));
for (const entry of ['build.mjs', 'manage.mjs']) await copyFile(path.join(root, 'scripts', entry), path.join(directory, 'scripts', entry));
// Python is needed only by release builders, never to install/use the theme.
const python = process.platform === 'win32' ? 'python' : 'python3';
execFileSync(python, ['-c', 'import shutil,sys; shutil.make_archive(sys.argv[1], "zip", sys.argv[2], sys.argv[3])', path.join(root, 'dist', name), path.join(root, 'dist'), name]);
console.log(path.join(root, 'dist', `${name}.zip`));
