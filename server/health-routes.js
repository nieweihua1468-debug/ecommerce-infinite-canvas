function jsonHandler(payload) {
  return (_req, res) => res.json(payload());
}

/** Registers the public liveness endpoint and the authenticated diagnostics. */
export function registerHealthRoutes(
  app,
  {
    requireUser,
    requireAdmin,
    publicHealth,
    capabilities,
    adminHealth,
  },
) {
  app.get('/api/health', jsonHandler(publicHealth));
  app.get('/api/capabilities', requireUser, jsonHandler(capabilities));
  app.get('/api/admin/health', requireAdmin, jsonHandler(adminHealth));
}

