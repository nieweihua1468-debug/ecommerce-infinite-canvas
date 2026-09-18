export const DEFAULT_TEAM_ID = "commerce-canvas-team";

export function normalizeTeam(team = {}) {
  return {
    ...team,
    id: String(team.id || ""),
    name: String(team.name || "未命名团队").trim() || "未命名团队",
    ownerId: String(team.ownerId || ""),
    adminIds: [...new Set((team.adminIds || []).map(String).filter(Boolean))],
    status: team.status === "disabled" ? "disabled" : "active",
  };
}

export function isTeamAdmin(user, team) {
  if (!user || !team || String(user.teamId || "") !== String(team.id || ""))
    return false;
  const normalized = normalizeTeam(team);
  return (
    String(user.id || "") === normalized.ownerId ||
    normalized.adminIds.includes(String(user.id || "")) ||
    user.teamRole === "admin"
  );
}

export function safeTeamSummary(team, user) {
  if (!team) return null;
  const normalized = normalizeTeam(team);
  return {
    id: normalized.id,
    name: normalized.name,
    role: isTeamAdmin(user, normalized) ? "admin" : "member",
    isAdmin: isTeamAdmin(user, normalized),
  };
}

export function isTeamTemplate(template) {
  return String(template?.visibility || template?.scope || "") === "team";
}

export function isApprovedTeamTemplate(template) {
  return (
    isTeamTemplate(template) &&
    ["approved", "pending_delete"].includes(
      String(template?.approvalStatus || ""),
    )
  );
}

export function canViewTeamTemplate(template, user, team) {
  if (!isTeamTemplate(template) || !user || !team) return false;
  if (
    String(template.teamId || "") !== String(team.id || "") ||
    String(user.teamId || "") !== String(team.id || "")
  )
    return false;
  return (
    isApprovedTeamTemplate(template) ||
    String(template.ownerId || "") === String(user.id || "") ||
    isTeamAdmin(user, team)
  );
}

export function canReviewTeamTemplate(template, user, team) {
  return (
    isTeamAdmin(user, team) &&
    isTeamTemplate(template) &&
    String(template.teamId || "") === String(team.id || "") &&
    ["pending_publish", "pending_delete"].includes(
      String(template.approvalStatus || ""),
    )
  );
}

