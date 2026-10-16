#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { build, root } from './build.mjs';

const START = '# >>> gord-dsh-saber-theme';
const END = '# <<< gord-dsh-saber-theme';
const ID = 'gord-dsh-saber-theme';
const EMPTY = '# gord-saber-original-empty-list:';

export function resolveHome(value = process.env.DSH_HOME) {
  if (!value?.trim()) return path.join(homedir(), '.dsh');
  if (value === '~') return homedir();
  return path.resolve(value.replace(/^~[/\\]/, `${homedir()}${path.sep}`));
}

// Sentinels are at the end; removing the owned suffix restores the original
// bytes, including a missing final newline. Hand-edited/duplicate blocks fail
// closed so an unrelated part of the user's configuration is never deleted.
export function splitPatch(text) {
  const begin = text.indexOf(START);
  const end = text.indexOf(END);
  if (begin === -1 && end === -1) return { base: text, managed: false };
  if (begin === -1 || end === -1 || end < begin || text.indexOf(START, begin + START.length) !== -1 || text.indexOf(END, end + END.length) !== -1) {
    throw new Error('Theme configuration markers are damaged; restore the patch backup before retrying');
  }
  const block = text.slice(begin, end);
  const separator = /\r?\n$/.exec(text.slice(0, begin));
  if (!separator || !/^# >>> gord-dsh-saber-theme newline=(?:0|1)\r?\n/.test(block)) throw new Error('Theme configuration block was edited; review it manually');
  const tail = text.slice(end + END.length).replace(/^\r?\n/, '');
  const hadNewline = block.startsWith(`${START} newline=1`);
  const before = text.slice(0, hadNewline ? begin : begin - separator[0].length);
  // Other tools may append configuration after our block. Preserve it too.
  const hasAppendedEntries = tail.split(/\r?\n/).some(line => line.trim() && !line.trimStart().startsWith('#'));
  const restored = (before + tail).replace(/^# gord-saber-original-empty-list:(.*)$/gm, hasAppendedEntries ? '# Original empty list:$1' : '$1');
  return { base: restored, managed: true };
}

export function renderPatch(text, moduleFile) {
  let { base } = splitPatch(text);
  const content = base.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim() && !line.trimStart().startsWith('#'));
  if (content.length === 1 && /^\s*\[\]\s*(#.*)?$/.test(content[0])) {
    base = base.replace(/^([ \t]*\[\][^\r\n]*)$/m, `${EMPTY}$1`);
  } else if (content.length && !content[0].startsWith('- ')) {
    throw new Error('Expected a YAML block patch list or []. Convert flow lists/document markers to a block list before installing.');
  }
  const newline = base.includes('\r\n') ? '\r\n' : '\n';
  const hadNewline = /\n$/.test(base);
  // JSON double-quoted strings are YAML-compatible; file URLs also avoid
  // Windows drive letters/backslashes being misread by the DSH ESM loader.
  return base + (hadNewline ? '' : newline) + [
    `${START} newline=${hadNewline ? 1 : 0}`,
    '- insert:',
    `    - id: ${ID}`,
    `      name: ${JSON.stringify(pathToFileURL(moduleFile).href)}`,
    END, ''
  ].join(newline);
}

async function readOptional(file) {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

async function writeAtomic(file, text) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export async function manage({ command, home = resolveHome(), profile = 'all' }) {
  if (!['install', 'uninstall', 'status'].includes(command)) throw new Error('Usage: node scripts/manage.mjs install|uninstall|status [--profile desktop|web|all|NAME] [--home PATH]');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(profile)) throw new Error('Invalid profile name');
  const candidates = profile === 'all' ? ['desktop', 'web'] : [profile];
  const profiles = [];
  for (const candidate of candidates) {
    try {
      const manifest = JSON.parse(await readFile(path.join(home, 'profiles', candidate, 'package.json'), 'utf8'));
      if (!manifest.dsh?.profile) throw new Error(`Not a DSH profile: ${candidate}`);
      profiles.push(candidate);
    } catch (error) {
      if (error.code !== 'ENOENT' || profile !== 'all') throw new Error(`Cannot read DSH profile ${candidate}. Launch it once first. ${error.message}`);
    }
  }
  if (!profiles.length) throw new Error(`No initialized desktop/web profile under ${home}. Launch DSH once first or select --home/--profile.`);
  // Validate every selected patch before publishing any changes.
  for (const candidate of profiles) {
    const text = await readOptional(path.join(home, 'profiles', candidate, 'cordis.patch.yml'));
    if (command === 'install') renderPatch(text, path.join(root, 'lib/index.js'));
    else splitPatch(text);
  }
  let moduleFile;
  if (command === 'install') {
    const { version } = await build();
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    // A fresh immutable directory on every install avoids a partially copied
    // client bundle being observed by DSH's live configuration watcher.
    const destination = path.join(home, 'themes', ID, `${version}-${randomUUID()}`);
    await mkdir(path.join(destination, 'lib'), { recursive: true });
    for (const file of ['index.js', 'client.js']) await copyFile(path.join(root, 'lib', file), path.join(destination, 'lib', file));
    await writeFile(path.join(destination, 'package.json'), JSON.stringify({ name: pkg.name, version, type: 'module', exports: pkg.exports, dsh: pkg.dsh }, null, 2));
    moduleFile = path.join(destination, 'lib/index.js');
  }
  const result = [];
  for (const candidate of profiles) {
    const directory = path.join(home, 'profiles', candidate);
    const patch = path.join(directory, 'cordis.patch.yml');
    if (command === 'status') {
      const current = await readOptional(patch);
      result.push({ profile: candidate, installed: splitPatch(current).managed, patch });
      continue;
    }
    const lockFile = path.join(directory, '.gord-saber.lock');
    let lock;
    try {
      lock = await open(lockFile, 'wx', 0o600);
      const current = await readOptional(patch);
      const next = command === 'install' ? renderPatch(current, moduleFile) : splitPatch(current).base;
      if (current !== next) {
        const backup = `${patch}.saber-backup-${Date.now()}-${randomUUID()}`;
        await writeFile(backup, current, { mode: 0o600, flag: 'wx' });
        // Catch concurrent editors before publishing. DSH does not share our
        // lock, so users should close it during installation as documented.
        if (await readOptional(patch) !== current) throw new Error('DSH configuration changed during installation. Close DSH and retry.');
        await writeAtomic(patch, next);
        result.push({ profile: candidate, installed: command === 'install', backup });
      } else result.push({ profile: candidate, installed: command === 'install', unchanged: true });
    } finally {
      if (lock) { await lock.close(); await unlink(lockFile); }
    }
  }
  return result;
}

function parse(argv) {
  const options = { command: argv.shift() };
  while (argv.length) {
    const arg = argv.shift();
    if (!['--profile', '--home'].includes(arg) || !argv[0] || argv[0].startsWith('--')) throw new Error(`Unknown or incomplete option: ${arg}`);
    options[arg.slice(2)] = arg === '--home' ? resolveHome(argv.shift()) : argv.shift();
  }
  return options;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await manage(parse(process.argv.slice(2))), null, 2));
    console.log('Restart DeepSeek Harness / dsh web to apply the change.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
