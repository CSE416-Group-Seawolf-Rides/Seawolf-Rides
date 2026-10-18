const assert = require('node:assert/strict');
const test = require('node:test');
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
test('traffic launcher requires a private key, preserves existing environment, builds first and cleans owned config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'traffic-launcher-'));
  try {
    for (const path of ['scripts', 'functions', 'bin']) mkdirSync(join(dir, path));
    copyFileSync(
      join(__dirname, '../../scripts/start-local-demo.mjs'),
      join(dir, 'scripts/start-local-demo.mjs'),
    );
    const file = join(dir, 'functions/.env.local');
    const run = (key) =>
      spawnSync(
        process.execPath,
        [join(dir, 'scripts/start-local-demo.mjs'), '--traffic-eta'],
        {
          encoding: 'utf8',
          env: { ...process.env, PATH: join(dir, 'bin'), TOMTOM_API_KEY: key },
        },
      );
    assert.notEqual(run('').status, 0);
    assert.equal(existsSync(file), false);
    writeFileSync(file, 'KEEP_MY_LOCAL_CONFIG=true\n');
    assert.notEqual(run('fake_backend_only_key').status, 0);
    assert.equal(readFileSync(file, 'utf8'), 'KEEP_MY_LOCAL_CONFIG=true\n');
    rmSync(file);
    writeFileSync(join(dir, 'bin/npm'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    writeFileSync(join(dir, 'bin/npx'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    assert.notEqual(run('fake_backend_only_key').status, 0);
    assert.equal(existsSync(file), false);
    writeFileSync(join(dir, 'bin/npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    assert.equal(run('fake_backend_only_key').status, 0);
    assert.equal(existsSync(file), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
