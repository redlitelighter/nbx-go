#!/usr/bin/env node
/**
 * scripts/bundle-wdk.js — `npm run bundle:wdk`
 *
 * Runs `wdk-worklet-bundler generate` with one Windows fix: the bundler
 * calls execFileSync('npx', …), which fails on Windows because npx is a
 * .cmd shim (spawnSync ENOENT). Here `npx` is routed through the shell, so
 * the bundler's whole pipeline (entry generation, bare-pack, ESM→CJS,
 * minify) runs unchanged on every platform.
 */
const cp = require('child_process');
const path = require('path');

const original = cp.execFileSync;
cp.execFileSync = function (file, args, options) {
  if (file === 'npx' && process.platform === 'win32') {
    const quoted = (args ?? []).map((a) => (/[\s"]/.test(a) ? `"${String(a).replace(/"/g, '\\"')}"` : a));
    return original.call(this, 'npx.cmd', quoted, { ...options, shell: true });
  }
  return original.call(this, file, args, options);
};

process.argv = [process.argv[0], 'wdk-worklet-bundler', 'generate', ...process.argv.slice(2)];
require(path.join(__dirname, '..', 'node_modules', '@tetherto', 'wdk-worklet-bundler', 'bin', 'wdk-worklet-bundler.js'));
