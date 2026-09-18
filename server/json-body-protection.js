import express from 'express';

import {
  jsonBodyAuthScope,
  PUBLIC_JSON_LIMIT,
} from './http-security.js';

const API_JSON_BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requestScope(req) {
  return jsonBodyAuthScope({
    method: req.method,
    path: req.path,
    contentType: req.headers['content-type'],
  });
}

/**
 * Installs body parsers so untrusted callers never reach the large API parser.
 * Public login/callback JSON is capped separately, while protected JSON is
 * authenticated before any large body is materialized in memory.
 */
export function installJsonBodyProtection(
  app,
  {
    requireUser,
    requireAdmin,
    publicLimit = PUBLIC_JSON_LIMIT,
    mcpLimit = '4mb',
    gridSplitLimit = '34mb',
    authenticatedLimit = '150mb',
  },
) {
  const publicParser = express.json({ limit: publicLimit });
  app.use((req, res, next) =>
    requestScope(req) === 'public' ? publicParser(req, res, next) : next(),
  );

  app.use('/mcp', express.json({ limit: mcpLimit }));

  app.use((req, res, next) => {
    const scope = requestScope(req);
    if (scope === 'admin') return requireAdmin(req, res, next);
    if (scope === 'user') return requireUser(req, res, next);
    return next();
  });

  const gridSplitParser = express.json({ limit: gridSplitLimit });
  app.use('/api/images/grid-split', (req, res, next) =>
    req.method === 'POST' ? gridSplitParser(req, res, next) : next(),
  );

  const authenticatedParser = express.json({ limit: authenticatedLimit });
  app.use('/api', (req, res, next) =>
    API_JSON_BODY_METHODS.has(req.method)
      ? authenticatedParser(req, res, next)
      : next(),
  );
}

