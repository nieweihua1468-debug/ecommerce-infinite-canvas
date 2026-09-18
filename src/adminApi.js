const TOKEN_KEY = 'commerce-canvas_admin_token';
let lastExpiredAdminToken = '';

export const adminSession = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

async function request(path, options = {}) {
  const token = adminSession.get();
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) {
      adminSession.clear();
      if (lastExpiredAdminToken !== token) {
        lastExpiredAdminToken = token;
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function')
          window.dispatchEvent(new CustomEvent('commerce-canvas:admin-session-expired', {
            detail: {
              code: payload?.code || 'ADMIN_SESSION_EXPIRED',
              message: payload?.message || '管理员登录状态已失效，请重新登录',
            },
          }));
      }
    }
    const error = new Error(payload?.message || `请求失败（${response.status}）`);
    error.status = response.status;
    error.field = payload?.field || null;
    error.code = payload?.code || null;
    error.failure = payload?.failure || null;
    error.details = payload?.details || null;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export const adminApi = {
  status: () => request('/api/admin/status'),
  localAdminSession: () => request('/api/dev/admin-console-session', { method: 'POST' }),
  login: (body) => request('/api/admin/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/api/admin/me'),
  enterStudio: () => request('/api/admin/enter-studio', { method: 'POST' }),
  dashboard: () => request('/api/admin/dashboard'),
  modelDeployments: ({ windowDays = 7, page = 1, pageSize = 50 } = {}) => {
    const params = new URLSearchParams({
      windowDays: String(windowDays),
      page: String(page),
      pageSize: String(pageSize),
    });
    return request(`/api/admin/model-deployments?${params.toString()}`);
  },
  runModelReadinessChecks: ({ windowDays = 7 } = {}) => request('/api/admin/model-readiness-checks', {
    method: 'POST',
    body: JSON.stringify({ windowDays }),
  }),
  users: () => request('/api/admin/users'),
  user: (id) => request(`/api/admin/users/${id}`),
  createUser: (body) => request('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id, body) => request(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resetUserPassword: (id, password) => request(`/api/admin/users/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) }),
  deleteUser: (id) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),
  adjustPoints: (id, body) => request(`/api/admin/users/${id}/points`, { method: 'POST', body: JSON.stringify(body) }),
  points: () => request('/api/admin/points'),
  inspirationGenerationConfig: () => request('/api/admin/inspiration-generation-config'),
  saveInspirationGenerationConfig: (body) => request('/api/admin/inspiration-generation-config', { method: 'PATCH', body: JSON.stringify(body) }),
  hotRankRemakeConfig: () => request('/api/admin/hot-rank-remake-config'),
  saveHotRankRemakeConfig: (body) => request('/api/admin/hot-rank-remake-config', { method: 'PATCH', body: JSON.stringify(body) }),
  detailPageTemplates: ({ page = 1, pageSize = 48, query = '', kind = 'all', primaryCategory = 'all', secondaryCategory = 'all', platform = 'all' } = {}) => {
    const params = new URLSearchParams({
      view: 'summary',
      page: String(page),
      pageSize: String(pageSize),
      query: String(query || ''),
      kind: String(kind || 'all'),
      primaryCategory: String(primaryCategory || 'all'),
      secondaryCategory: String(secondaryCategory || 'all'),
      platform: String(platform || 'all'),
    });
    return request(`/api/admin/detail-page-templates?${params}`);
  },
  detailPageTemplate: (id) => request(`/api/admin/detail-page-templates/${encodeURIComponent(id)}`),
  saveDetailPageTemplate: (id, body) => request(`/api/admin/detail-page-templates/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  mcpAccess: () => request('/api/admin/mcp/access'),
  createMcpToken: (body) => request('/api/admin/mcp/tokens', { method: 'POST', body: JSON.stringify(body) }),
  revokeMcpToken: (id) => request(`/api/admin/mcp/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  mcpAudit: (limit = 100) => request(`/api/admin/mcp/audit?limit=${limit}`),
  templates: () => request('/api/admin/templates'),
  createTemplate: (body) => request('/api/admin/templates', { method: 'POST', body: JSON.stringify(body) }),
  updateTemplate: (id, body) => request(`/api/admin/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  reviewTemplate: (id, decision, note = '') => request(`/api/admin/templates/${id}/review`, { method: 'POST', body: JSON.stringify({ decision, note }) }),
  deleteTemplate: (id) => request(`/api/admin/templates/${id}`, { method: 'DELETE' }),
};

