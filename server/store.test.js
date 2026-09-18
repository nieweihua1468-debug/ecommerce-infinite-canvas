import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

test('deduplicates concurrent first reads of a large collection', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commerce-canvas-store-'));
  const serverDir = path.join(root, 'server');
  const dataDir = path.join(root, 'data');
  await fs.mkdir(serverDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.copyFile(path.join(here, 'store.js'), path.join(serverDir, 'store.js'));
  await fs.writeFile(
    path.join(dataDir, 'assets.json'),
    JSON.stringify([{ id: 'asset-1', payload: 'x'.repeat(2_000_000) }]),
  );

  try {
    const store = await import(`${pathToFileURL(path.join(serverDir, 'store.js')).href}?test=${Date.now()}`);
    const results = await Promise.all(Array.from({ length: 24 }, () => store.readCollection('assets', [])));
    assert.ok(results.every((value) => value === results[0]));
    assert.equal(results[0][0].id, 'asset-1');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('repairs existing data directory and JSON file permissions on read', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commerce-canvas-store-permissions-'));
  const serverDir = path.join(root, 'server');
  const dataDir = path.join(root, 'data');
  const collectionFile = path.join(dataDir, 'users.json');
  const otherFile = path.join(dataDir, 'legacy.json');
  await fs.mkdir(serverDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true, mode: 0o755 });
  await fs.chmod(dataDir, 0o755);
  await fs.copyFile(path.join(here, 'store.js'), path.join(serverDir, 'store.js'));
  await fs.writeFile(collectionFile, '[]', { mode: 0o644 });
  await fs.writeFile(otherFile, '[]', { mode: 0o644 });
  await fs.chmod(collectionFile, 0o644);
  await fs.chmod(otherFile, 0o644);

  try {
    const store = await import(`${pathToFileURL(path.join(serverDir, 'store.js')).href}?test=${Date.now()}`);
    await store.readCollection('users', []);
    assert.equal((await fs.stat(dataDir)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(collectionFile)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(otherFile)).mode & 0o777, 0o600);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('writes collection files and temporary files with private permissions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commerce-canvas-store-write-'));
  const serverDir = path.join(root, 'server');
  const dataDir = path.join(root, 'data');
  await fs.mkdir(serverDir, { recursive: true });
  await fs.copyFile(path.join(here, 'store.js'), path.join(serverDir, 'store.js'));

  try {
    const store = await import(`${pathToFileURL(path.join(serverDir, 'store.js')).href}?test=${Date.now()}`);
    await store.writeCollection('private', [{ id: 'record-1' }]);
    const collectionFile = path.join(dataDir, 'private.json');
    assert.equal((await fs.stat(dataDir)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(collectionFile)).mode & 0o777, 0o600);
    assert.deepEqual(await fs.readdir(dataDir), ['private.json']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

