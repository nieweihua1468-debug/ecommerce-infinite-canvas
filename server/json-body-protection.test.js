import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import express from 'express';

import { safeHttpErrorMessage } from './http-security.js';
import { installJsonBodyProtection } from './json-body-protection.js';

function send(server, { path, body = '', authorization = '' }) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port: address.port,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          ...(authorization ? { authorization } : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            payload: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

test('anonymous protected JSON is rejected before parsing and public JSON stays small', async () => {
  const app = express();
  let protectedHandlerReached = false;
  installJsonBodyProtection(app, {
    requireUser: (req, _res, next) =>
      req.headers.authorization === 'Bearer user'
        ? next()
        : next(Object.assign(new Error('请先登录'), { status: 401 })),
    requireAdmin: (_req, _res, next) => next(),
  });
  app.post('/api/auth/login', (req, res) => res.json({ parsed: Boolean(req.body) }));
  app.post('/api/tasks/video', (req, res) => {
    protectedHandlerReached = true;
    res.json({ length: req.body.data.length });
  });
  app.use((error, _req, res, _next) => {
    const status = Number(error.status) || 500;
    res.status(status).json({ message: safeHttpErrorMessage(error, status) });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const oversized = JSON.stringify({ data: 'x'.repeat(300 * 1024) });
    const anonymous = await send(server, {
      path: '/api/tasks/video',
      body: oversized,
    });
    assert.equal(anonymous.status, 401);
    assert.equal(protectedHandlerReached, false);

    const publicOversized = await send(server, {
      path: '/api/auth/login',
      body: oversized,
    });
    assert.equal(publicOversized.status, 413);

    const authenticated = await send(server, {
      path: '/api/tasks/video',
      body: oversized,
      authorization: 'Bearer user',
    });
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.payload.length, 300 * 1024);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

