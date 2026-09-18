import { sessionSecret } from "./session-secret.js";
import { createHash, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

const TOKEN_ISSUER = 'commerce-canvas-admin';
const TOKEN_TTL = '8h';

function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

function safeEqual(left, right) {
  return timingSafeEqual(digest(left), digest(right));
}


export function isAdminConfigured() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
}

export function authenticateAdmin(username, password) {
  if (!isAdminConfigured()) return false;
  return safeEqual(username, process.env.ADMIN_USERNAME) && safeEqual(password, process.env.ADMIN_PASSWORD);
}

export function issueAdminToken() {
  if (!isAdminConfigured()) throw Object.assign(new Error('管理员账号尚未配置'), { status: 503 });
  return jwt.sign(
    { role: 'admin', username: process.env.ADMIN_USERNAME },
    sessionSecret(),
    { algorithm: 'HS256', expiresIn: TOKEN_TTL, issuer: TOKEN_ISSUER },
  );
}

export function issueLocalAdminToken() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production')
    throw Object.assign(new Error('接口不存在'), { status: 404 });
  return jwt.sign(
    { role: 'admin', username: '本地管理员', localDevelopment: true },
    sessionSecret(),
    { algorithm: 'HS256', expiresIn: TOKEN_TTL, issuer: TOKEN_ISSUER },
  );
}

export function verifyAdminToken(token) {
  const payload = jwt.verify(token, sessionSecret(), { algorithms: ['HS256'], issuer: TOKEN_ISSUER });
  if (payload.role !== 'admin') throw new Error('管理员会话无效');
  if (payload.localDevelopment) {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production')
      throw new Error('管理员会话无效');
  } else if (!isAdminConfigured()) {
    throw new Error('管理员账号尚未配置');
  }
  return payload;
}

export function requireAdmin(req, _res, next) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return next(Object.assign(new Error('请先登录管理员后台'), { status: 401 }));
  try {
    req.admin = verifyAdminToken(match[1]);
    return next();
  } catch {
    return next(Object.assign(new Error('管理员会话已失效，请重新登录'), { status: 401 }));
  }
}

export const __test = { safeEqual };

