#!/usr/bin/env node
/**
 * Links the native addons the WDK worklet bundle needs into
 * react-native-bare-kit's Android addons folder — WITHOUT wiping it.
 *
 * Why this exists (found the hard way on device):
 *  - The WDK worklet bundle is packed `--linked`: every native addon must be
 *    compiled into the APK at the exact version the bundle names
 *    (`linked:libbare-fs.4.7.4.so`). A missing one aborts the worklet.
 *  - `wdk-worklet-bundler` leaves addon linking off for the hrpc transport,
 *    and QVAC's Expo plugin (during `expo prebuild`) WIPES the same folder
 *    and links only QVAC's addons.
 *
 * So run this after `expo prebuild` or a fresh `npm install`:
 *   npm run link:wdk
 * then rebuild the APK. Android arm64 only (what the app ships).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const bundle = path.join(root, '.wdk-bundle/wdk-worklet.bundle.js');
const outRoot = path.join(root, 'node_modules/react-native-bare-kit/android/src/main/addons');
const outDir = path.join(outRoot, 'arm64-v8a');

const text = fs.readFileSync(bundle, 'utf8');
const wanted = [...new Set([...text.matchAll(/linked:lib([A-Za-z0-9._+-]+?)\.(\d+\.\d+\.\d+)\.so/g)].map((m) => `${m[1]}@${m[2]}`))];
const have = new Set(fs.existsSync(outDir) ? fs.readdirSync(outDir) : []);

// name@version → package dir, searching nested node_modules too (several
// versions of the same addon can coexist).
const dirs = {};
(function walk(dir, depth) {
  if (depth > 6) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (e.name.startsWith('@')) { walk(p, depth); continue; }
    try {
      const { name, version } = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8'));
      const key = `${name.replace('@', '').replace('/', '__')}@${version}`;
      if (!dirs[key]) dirs[key] = p;
    } catch {}
    const nm = path.join(p, 'node_modules');
    if (fs.existsSync(nm)) walk(nm, depth + 1);
  }
})(path.join(root, 'node_modules'), 0);

const bareLink = path.join(root, 'node_modules/.bin', process.platform === 'win32' ? 'bare-link.cmd' : 'bare-link');
let linked = 0;
let skipped = 0;
for (const key of wanted) {
  const [name, version] = key.split('@');
  if (have.has(`lib${name}.${version}.so`)) continue;
  const dir = dirs[key];
  if (!dir) { console.warn(`! ${key}: not installed`); continue; }
  // Addons that fall back to JS on Android (e.g. bare-posix) ship no Android prebuild.
  if (!fs.existsSync(path.join(dir, 'prebuilds/android-arm64'))) { skipped++; continue; }
  execFileSync(bareLink, ['--host', 'android-arm64', '--out', outRoot, dir], { stdio: 'pipe', shell: process.platform === 'win32' });
  console.log(`+ ${key}`);
  linked++;
}
console.log(`WDK addons: ${wanted.length} referenced, ${linked} linked now, ${skipped} without an Android build (JS fallback).`);
