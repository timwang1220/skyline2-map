import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptOnlineCity } from '../src/online-city-crypto.mjs';

globalThis.crypto ??= webcrypto;

const [input, city, mode, destination] = process.argv.slice(2);
if (!input || !city?.trim() || (mode !== undefined && (mode !== '--encrypt-only' || !destination))) {
  throw new Error('Usage: publish-online-city.mjs MAP.cs2map CITY [--encrypt-only OUTPUT]');
}
const repo = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(input);
const rel = relative(repo, source);
if (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)) throw new Error('Keep unencrypted maps outside the Git repository');

const data = await readFile(source);
if (data.length < 4 || data.readUInt32LE(0) !== 0x04034b50) throw new Error('Expected a valid CS2MapView ZIP export');
const encrypted = await encryptOnlineCity(Uint8Array.from(data).buffer, city);
const asset = 'public/online-city/map.cs2map.enc';
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true' };
const windowsSsh = 'C:/Windows/System32/OpenSSH/ssh.exe';
if (process.platform === 'win32' && !env.GIT_SSH_COMMAND && existsSync(windowsSsh)) {
  env.GIT_SSH_COMMAND = windowsSsh + ' -o BatchMode=yes -o ConnectTimeout=10';
}
function git(...args) {
  return execFileSync('git', args, { cwd: repo, env, encoding: 'utf8', timeout: 90_000 }).trim();
}
if (!mode) {
  if (git('branch', '--show-current') !== 'main' ||
    !/^git@github\.com:timwang1220\/skyline2-map(?:\.git)?$/.test(git('remote', 'get-url', '--push', 'origin'))) {
    throw new Error('Unexpected Git branch or publishing destination');
  }
  if (git('status', '--porcelain')) throw new Error('Publishing checkout has uncommitted changes');
  git('pull', '--rebase', 'origin', 'main');
}
const output = mode ? resolve(destination) : resolve(repo, asset);
const temporary = output + '.' + process.pid + '.tmp';
await mkdir(dirname(output), { recursive: true });
try {
  await writeFile(temporary, encrypted, { flag: 'wx' });
  await rename(temporary, output);
} finally {
  await rm(temporary, { force: true });
}
if (!mode) {
  git('add', '--', asset);
  git('commit', '-m', 'Update encrypted online city', '--', asset);
  git('push', 'origin', 'HEAD:refs/heads/main');
}
