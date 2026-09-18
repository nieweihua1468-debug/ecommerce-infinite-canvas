import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  hashPassword,
  issueUserToken,
  validateUserSession,
  verifyPassword,
} from './auth.js';

test('hashes user passwords with a unique salt and verifies them', () => {
  const credentials = hashPassword('password-123');
  assert.notEqual(credentials.hash, 'password-123');
  assert.equal(verifyPassword('password-123', credentials.salt, credentials.hash), true);
  assert.equal(verifyPassword('wrong-password', credentials.salt, credentials.hash), false);
});

test('issues a seven day user token without password data', () => {
  process.env.ADMIN_SESSION_SECRET = 'test-user-session-secret-with-enough-length';
  const token = issueUserToken({ id: 'user-1', name: '测试用户' });
  const payload = jwt.decode(token);
  assert.equal(payload.userId, 'user-1');
  assert.equal(payload.role, 'user');
  assert.equal(payload.sessionVersion, 0);
  assert.equal(payload.password, undefined);
});

test('includes the current session version in newly issued tokens', () => {
  const token = issueUserToken({ id: 'user-2', name: '版本用户', sessionVersion: 3 });
  assert.equal(jwt.decode(token).sessionVersion, 3);
});

test('accepts legacy users and tokens as session version zero', () => {
  assert.deepEqual(
    validateUserSession(
      { role: 'user', userId: 'legacy-user' },
      { id: 'legacy-user', status: 'active' },
    ),
    { valid: true, sessionVersion: 0 },
  );
});

test('rejects deleted, disabled, and version-mismatched user sessions', () => {
  const payload = { role: 'user', userId: 'user-1', sessionVersion: 1 };
  assert.deepEqual(validateUserSession(payload, null), {
    valid: false,
    reason: 'user_not_found',
  });
  assert.deepEqual(
    validateUserSession(payload, {
      id: 'user-1',
      status: 'disabled',
      sessionVersion: 1,
    }),
    { valid: false, reason: 'user_disabled' },
  );
  assert.deepEqual(
    validateUserSession(payload, {
      id: 'user-1',
      status: 'active',
      sessionVersion: 2,
    }),
    { valid: false, reason: 'session_version_mismatch' },
  );
});

