import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateAdmin,
  issueAdminToken,
  issueLocalAdminToken,
  verifyAdminToken,
} from './admin.js';

function restoreEnvironment(previous) {
  for (const [name, value] of Object.entries(previous)) {
    const key = name === 'username' ? 'ADMIN_USERNAME' : name === 'password' ? 'ADMIN_PASSWORD' : 'ADMIN_SESSION_SECRET';
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('authenticates the configured administrator without exposing credentials', () => {
  const previous = { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD, secret: process.env.ADMIN_SESSION_SECRET };
  process.env.ADMIN_USERNAME = 'admin-test';
  process.env.ADMIN_PASSWORD = 'strong-password';
  process.env.ADMIN_SESSION_SECRET = 'test-secret-with-more-than-thirty-two-characters';
  try {
    assert.equal(authenticateAdmin('admin-test', 'strong-password'), true);
    assert.equal(authenticateAdmin('admin-test', 'wrong-password'), false);
    assert.equal(authenticateAdmin('wrong-user', 'strong-password'), false);
  } finally {
    restoreEnvironment(previous);
  }
});

test('issues an eight-hour administrator token with a restricted role', () => {
  const previous = { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD, secret: process.env.ADMIN_SESSION_SECRET };
  process.env.ADMIN_USERNAME = 'admin-test';
  process.env.ADMIN_PASSWORD = 'strong-password';
  process.env.ADMIN_SESSION_SECRET = 'test-secret-with-more-than-thirty-two-characters';
  try {
    const payload = verifyAdminToken(issueAdminToken());
    assert.equal(payload.username, 'admin-test');
    assert.equal(payload.role, 'admin');
    assert.equal(payload.iss, 'commerce-canvas-admin');
    assert.ok(payload.exp - payload.iat <= 28_800);
  } finally {
    restoreEnvironment(previous);
  }
});

test('local administrator tokens are limited to development', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previous = {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
    secret: process.env.ADMIN_SESSION_SECRET,
  };
  process.env.NODE_ENV = 'development';
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
  process.env.ADMIN_SESSION_SECRET =
    'test-secret-with-more-than-thirty-two-characters';
  try {
    const token = issueLocalAdminToken();
    const payload = verifyAdminToken(token);
    assert.equal(payload.username, '本地管理员');
    assert.equal(payload.localDevelopment, true);

    process.env.NODE_ENV = 'production';
    assert.throws(() => verifyAdminToken(token), /管理员会话无效/);
    assert.throws(() => issueLocalAdminToken(), /接口不存在/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    restoreEnvironment(previous);
  }
});

