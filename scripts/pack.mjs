import { execFileSync } from 'node:child_process';
import { mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { build, root } from './build.mjs';
import { verifyPackage } from './verify-package.mjs';

if (!process.env.npm_execpath) throw new Error('Run this builder with npm run package');
await build();
const destination = path.join(root, 'dist');
await mkdir(destination, { recursive: true });
// npm pack creates the standard package/ archive layout without publishing.
const result = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--ignore-scripts', '--json', '--pack-destination', destination], { cwd: root, encoding: 'utf8' }));
const packed = path.join(destination, result[0].filename);
const archive = path.join(destination, 'gord-dsh-saber-theme.tgz');
await unlink(archive).catch(error => { if (error.code !== 'ENOENT') throw error; });
await rename(packed, archive);
console.log({ archive, ...await verifyPackage(archive) });
