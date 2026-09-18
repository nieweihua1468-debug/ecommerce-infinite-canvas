import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { sessionSecret, assertProductionConfiguration } from './session-secret.js';
import { verifyAdminToken } from './admin.js';

test('development signing key is stable in process and rejects the former public fallback', () => {
  const saved = { ...process.env };
  try {
    process.env.NODE_ENV = 'development';
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_PASSWORD;
    const secret = sessionSecret();
    assert.ok(secret.length >= 32);
    assert.equal(sessionSecret(), secret);
    const oldKey = createHash('sha256').update('not-configured:commerce-canvas-admin').digest('hex');
    const forged = jwt.sign({ role: 'admin', localDevelopment: true }, oldKey, { issuer: 'commerce-canvas-admin' });
    assert.throws(() => verifyAdminToken(forged));
  } finally { process.env = saved; }
});

test('production rejects missing, placeholder, and weak secrets even without the npm preflight', () => {
  const saved = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    for (const value of ['', 'short', 'replace_with_at_least_32_random_characters']) {
      process.env.ADMIN_SESSION_SECRET = value;
      assert.throws(() => assertProductionConfiguration(), /ADMIN_SESSION_SECRET/);
    }
    process.env.ADMIN_SESSION_SECRET = 'test-only-unique-secret-for-unit-tests-123456789';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'unit-test-password-only';
    process.env.PUBLIC_BASE_URL = 'http://localhost:8791';
    assert.throws(() => assertProductionConfiguration(), /HTTPS/);
    process.env.PUBLIC_BASE_URL = 'https://canvas.example.test';
    assert.doesNotThrow(() => assertProductionConfiguration());
  } finally { process.env = saved; }
});
