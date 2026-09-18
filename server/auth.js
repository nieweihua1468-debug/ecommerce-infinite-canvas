import { sessionSecret as signingSecret } from "./session-secret.js";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { readCollection } from './store.js';

const ISSUER = 'commerce-canvas-user';

function secret() {
  return createHash('sha256').update(`${signingSecret()}:user-session`).digest('hex');
}

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expected) {
  const actual = scryptSync(String(password), String(salt), 64);
  const target = Buffer.from(String(expected), 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function normalizedSessionVersion(value) {
  if (value === undefined || value === null) return 0;
  const version = Number(value);
  return Number.isSafeInteger(version) && version >= 0 ? version : null;
}

export function validateUserSession(payload, user) {
  if (
    !payload ||
    payload.role !== 'user' ||
    !payload.userId ||
    !user ||
    String(user.id) !== String(payload.userId)
  ) {
    return { valid: false, reason: 'user_not_found' };
  }
  if (String(user.status || 'active') !== 'active') {
    return { valid: false, reason: 'user_disabled' };
  }
  const tokenVersion = normalizedSessionVersion(payload.sessionVersion);
  const userVersion = normalizedSessionVersion(user.sessionVersion);
  if (
    tokenVersion === null ||
    userVersion === null ||
    tokenVersion !== userVersion
  ) {
    return { valid: false, reason: 'session_version_mismatch' };
  }
  return { valid: true, sessionVersion: userVersion };
}

export function issueUserToken(user) {
  return jwt.sign(
    {
      role: 'user',
      userId: user.id,
      name: user.name,
      sessionVersion: normalizedSessionVersion(user.sessionVersion) ?? 0,
    },
    secret(),
    { algorithm: 'HS256', expiresIn: '7d', issuer: ISSUER },
  );
}

export async function requireUser(req, _res, next) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return next(Object.assign(new Error('请先登录'), { status: 401 }));
  let payload;
  try {
    payload = jwt.verify(match[1], secret(), { algorithms: ['HS256'], issuer: ISSUER });
    if (payload.role !== 'user') throw new Error('invalid role');
  } catch {
    return next(Object.assign(new Error('登录已失效，请重新登录'), { status: 401 }));
  }

  try {
    const users = await readCollection('users', []);
    const user = users.find((item) => String(item.id) === String(payload.userId));
    const validation = validateUserSession(payload, user);
    if (!validation.valid) {
      return next(Object.assign(new Error('登录已失效，请重新登录'), { status: 401 }));
    }
    req.user = { ...payload, sessionVersion: validation.sessionVersion };
    return next();
  } catch (error) {
    return next(error);
  }
}

