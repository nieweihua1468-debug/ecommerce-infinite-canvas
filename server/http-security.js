const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: ws: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self' https:",
  "manifest-src 'self'",
];

export const PUBLIC_JSON_LIMIT = '256kb';

export const PUBLIC_JSON_PATHS = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/admin/login',
  '/api/dev/admin-session',
  '/api/dev/admin-console-session',
];

const PUBLIC_JSON_PREFIXES = ['/api/providers/volcengine/callback/'];
const JSON_BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isJsonContentType(value) {
  return /^(?:application\/json|application\/[a-z0-9!#$&^_.+-]+\+json)(?:\s*;|$)/i.test(
    String(value || '').trim(),
  );
}

/**
 * Decides whether a JSON request body may be parsed before authentication.
 * Public authentication/callback endpoints get a small parser. All other API
 * JSON bodies are authenticated before the larger application parser runs.
 */
export function jsonBodyAuthScope({ method, path: requestPath, contentType } = {}) {
  const methodName = String(method || '').toUpperCase();
  const pathname = String(requestPath || '').split('?')[0];
  if (!JSON_BODY_METHODS.has(methodName) || !isJsonContentType(contentType))
    return 'none';
  if (!pathname.startsWith('/api/')) return 'none';
  if (
    PUBLIC_JSON_PATHS.includes(pathname) ||
    PUBLIC_JSON_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
    return 'public';
  if (pathname.startsWith('/api/admin/')) return 'admin';
  return 'user';
}

export const CONTENT_SECURITY_POLICY = CSP_DIRECTIVES.join('; ');

export function securityResponseHeaders({ secure = false, nodeEnv = '' } = {}) {
  return {
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Origin-Agent-Cluster': '?1',
    'X-Permitted-Cross-Domain-Policies': 'none',
    ...(secure && nodeEnv === 'production'
      ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
      : {}),
  };
}

export function publicHealthPayload(release = {}, now = new Date()) {
  return {
    ok: true,
    release: {
      version: String(release.version || '0.0.0'),
      build: Number(release.build || 0),
    },
    now: (now instanceof Date ? now : new Date(now)).toISOString(),
  };
}

export function safeHttpErrorMessage(error, status) {
  if (error?.type === 'entity.too.large')
    return '上传素材超过 API 请求限制，请压缩后再提交。';
  if (Number(status) >= 500) return '服务器内部错误，请稍后重试。';
  return String(error?.message || '请求处理失败');
}

