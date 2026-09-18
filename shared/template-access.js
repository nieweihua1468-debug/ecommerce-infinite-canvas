export const TEMPLATE_SURFACE_PAGES = Object.freeze([
  "inspiration",
  "qianchuan-material",
  "creative-assets",
]);

const TEMPLATE_SURFACE_PAGE_SET = new Set(TEMPLATE_SURFACE_PAGES);

export function hasTemplateSurfaceAccess(user) {
  return (
    user?.accountType === "admin" ||
    user?.platformAdmin === true ||
    user?.templateAccess === true ||
    user?.inspirationAccess === true
  );
}

export function isTemplateSurfacePage(page) {
  return TEMPLATE_SURFACE_PAGE_SET.has(String(page || ""));
}

export function resolveStudioMode(requestedMode, user) {
  return requestedMode === "creative" && hasTemplateSurfaceAccess(user)
    ? "creative"
    : "creator";
}

export function isPrivateProjectTemplate(template) {
  return (
    template?.public !== true &&
    !["team", "global"].includes(String(template?.visibility || "private"))
  );
}

export function canCreateSharedTemplate(user) {
  return hasTemplateSurfaceAccess(user);
}

export function canExposeTemplateToUser(
  user,
  template,
  { owned = false, sharedVisible = false } = {},
) {
  return hasTemplateSurfaceAccess(user)
    ? owned || sharedVisible
    : owned && isPrivateProjectTemplate(template);
}

export function canManageTemplate(
  user,
  template,
  { owned = false, requestedVisibility } = {},
) {
  if (!owned) return false;
  if (hasTemplateSurfaceAccess(user)) return true;
  const requestsSharedVisibility = ["team", "global"].includes(
    String(requestedVisibility || ""),
  );
  return isPrivateProjectTemplate(template) && !requestsSharedVisibility;
}

export function canExposeTemplateAsset(user, asset) {
  return asset?.kind !== "template_original" || hasTemplateSurfaceAccess(user);
}

