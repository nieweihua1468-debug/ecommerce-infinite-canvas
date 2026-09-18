import assert from 'node:assert/strict';
import test from 'node:test';

import { registerHealthRoutes } from './health-routes.js';

test('health routes keep capability and operational details behind the right role', () => {
  const routes = [];
  const app = {
    get: (path, ...handlers) => routes.push({ path, handlers }),
  };
  const requireUser = () => {};
  const requireAdmin = () => {};
  registerHealthRoutes(app, {
    requireUser,
    requireAdmin,
    publicHealth: () => ({ ok: true }),
    capabilities: () => ({ klingConfigured: true }),
    adminHealth: () => ({ queues: {} }),
  });

  assert.deepEqual(
    routes.map((route) => route.path),
    ['/api/health', '/api/capabilities', '/api/admin/health'],
  );
  assert.equal(routes[0].handlers.length, 1);
  assert.equal(routes[1].handlers[0], requireUser);
  assert.equal(routes[2].handlers[0], requireAdmin);
});

test('registered health handlers produce the intended payloads', () => {
  const routes = [];
  const app = { get: (path, ...handlers) => routes.push({ path, handlers }) };
  registerHealthRoutes(app, {
    requireUser: () => {},
    requireAdmin: () => {},
    publicHealth: () => ({ ok: true, release: { version: '1.2.0' } }),
    capabilities: () => ({ minimaxVideoConfigured: true }),
    adminHealth: () => ({ queues: { workflow: { pending: 0 } } }),
  });

  const payloads = [];
  const res = { json: (payload) => payloads.push(payload) };
  for (const route of routes) route.handlers.at(-1)({}, res);
  assert.deepEqual(payloads, [
    { ok: true, release: { version: '1.2.0' } },
    { minimaxVideoConfigured: true },
    { queues: { workflow: { pending: 0 } } },
  ]);
});

