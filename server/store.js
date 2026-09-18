import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data');
const mutationQueues = new Map();
const collectionCache = new Map();
const collectionLoads = new Map();
const collectionCacheTimers = new Map();
let dataDirReady;

// Digital assets contain original image base64 payloads. Keeping the complete
// collection resident permanently can consume several times the JSON file size
// after parsing and stringifying, which is unsafe on the production 2 GiB ECS.
// Keep the short read-deduplication window, then release the large object graph.
const COLLECTION_CACHE_TTL_MS = new Map([
  ['digital_assets', 15_000],
]);

function cacheCollection(name, value) {
  collectionCache.set(name, value);
  const existing = collectionCacheTimers.get(name);
  if (existing) clearTimeout(existing);
  const ttl = COLLECTION_CACHE_TTL_MS.get(name);
  if (!ttl) return value;
  const timer = setTimeout(() => {
    collectionCache.delete(name);
    collectionCacheTimers.delete(name);
  }, ttl);
  timer.unref?.();
  collectionCacheTimers.set(name, timer);
  return value;
}

async function ensureDataDir() {
  if (!dataDirReady) {
    dataDirReady = (async () => {
      await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
      await fs.chmod(dataDir, 0o700);
      const entries = await fs.readdir(dataDir, { withFileTypes: true });
      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) => fs.chmod(path.join(dataDir, entry.name), 0o600)),
      );
    })().catch((error) => {
      dataDirReady = undefined;
      throw error;
    });
  }
  await dataDirReady;
}

export async function readCollection(name, fallback = []) {
  if (collectionCache.has(name)) return collectionCache.get(name);
  if (collectionLoads.has(name)) return collectionLoads.get(name);

  const pending = (async () => {
    await ensureDataDir();
    const file = path.join(dataDir, `${name}.json`);
    try {
      await fs.chmod(file, 0o600);
      const value = JSON.parse(await fs.readFile(file, 'utf8'));
      return cacheCollection(name, value);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return cacheCollection(name, fallback);
      }
      throw error;
    }
  })();

  collectionLoads.set(name, pending);
  try {
    return await pending;
  } finally {
    if (collectionLoads.get(name) === pending) collectionLoads.delete(name);
  }
}

export async function writeCollection(name, value) {
  await ensureDataDir();
  const file = path.join(dataDir, `${name}.json`);
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await fs.chmod(temp, 0o600);
    await fs.rename(temp, file);
    await fs.chmod(file, 0o600);
    cacheCollection(name, value);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined);
  }
  return value;
}

export function mutateCollection(name, mutate, fallback = []) {
  const previous = mutationQueues.get(name) || Promise.resolve();
  const pending = previous.then(async () => {
    const current = await readCollection(name, fallback);
    const next = await mutate(current);
    if (next !== current) await writeCollection(name, next);
    return next;
  });
  const queued = pending.catch(() => undefined);
  mutationQueues.set(name, queued);
  void queued.finally(() => {
    if (mutationQueues.get(name) === queued) mutationQueues.delete(name);
  });
  return pending;
}

