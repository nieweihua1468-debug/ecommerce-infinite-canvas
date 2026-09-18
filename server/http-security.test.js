import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTENT_SECURITY_POLICY,
  jsonBodyAuthScope,
  publicHealthPayload,
  PUBLIC_JSON_LIMIT,
  safeHttpErrorMessage,
  securityResponseHeaders,
} from './http-security.js';

test('CSP supports current first-party app media without allowing script eval or objects', () => {
  assert.match(CONTENT_SECURITY_POLICY, /default-src 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /img-src 'self' data: blob: https:/);
  assert.match(CONTENT_SECURITY_POLICY, /media-src 'self' data: blob: https:/);
  assert.match(CONTENT_SECURITY_POLICY, /style-src 'self' 'unsafe-inline'/);
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
  assert.equal(CONTENT_SECURITY_POLICY.includes("'unsafe-eval'"), false);
});

test('HSTS is emitted only for a secure production request', () => {
  assert.equal(securityResponseHeaders()['Strict-Transport-Security'], undefined);
  assert.equal(
    securityResponseHeaders({ secure: true, nodeEnv: 'production' })[
      'Strict-Transport-Security'
    ],
    'max-age=31536000; includeSubDomains',
  );
});

test('public health is minimal and does not expose providers, queues, or resources', () => {
  const payload = publicHealthPayload(
    { version: '1.2.0', build: 2026080401, label: 'private-label' },
    new Date('2026-08-04T08:00:00.000Z'),
  );
  assert.deepEqual(payload, {
    ok: true,
    release: { version: '1.2.0', build: 2026080401 },
    now: '2026-08-04T08:00:00.000Z',
  });
  assert.equal('queues' in payload, false);
  assert.equal('resources' in payload, false);
  assert.equal(Object.keys(payload).some((key) => /configured|provider/i.test(key)), false);
});

test('unexpected server errors are hidden while expected client errors remain actionable', () => {
  assert.equal(
    safeHttpErrorMessage(new Error('database path /secret failed'), 500),
    '服务器内部错误，请稍后重试。',
  );
  assert.equal(safeHttpErrorMessage(new Error('字段不合法'), 400), '字段不合法');
  assert.equal(
    safeHttpErrorMessage({ type: 'entity.too.large' }, 413),
    '上传素材超过 API 请求限制，请压缩后再提交。',
  );
});

test('JSON body parsing authenticates protected API requests before the large parser', () => {
  const json = 'application/json; charset=utf-8';
  assert.equal(PUBLIC_JSON_LIMIT, '256kb');
  assert.equal(
    jsonBodyAuthScope({ method: 'POST', path: '/api/auth/login', contentType: json }),
    'public',
  );
  assert.equal(
    jsonBodyAuthScope({
      method: 'POST',
      path: '/api/providers/volcengine/callback/task-1?token=secret',
      contentType: 'application/problem+json',
    }),
    'public',
  );
  assert.equal(
    jsonBodyAuthScope({
      method: 'PATCH',
      path: '/api/admin/users/user-1',
      contentType: json,
    }),
    'admin',
  );
  assert.equal(
    jsonBodyAuthScope({ method: 'POST', path: '/api/tasks/video', contentType: json }),
    'user',
  );
  assert.equal(
    jsonBodyAuthScope({ method: 'POST', path: '/mcp', contentType: json }),
    'none',
  );
  assert.equal(
    jsonBodyAuthScope({ method: 'GET', path: '/api/health', contentType: json }),
    'none',
  );
  assert.equal(
    jsonBodyAuthScope({ method: 'POST', path: '/api/tasks/video', contentType: 'text/plain' }),
    'none',
  );
});

