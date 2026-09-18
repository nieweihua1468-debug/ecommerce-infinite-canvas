export function isPublicTemplate(template) {
  const visibility = String(template?.visibility || template?.scope || "")
    .trim()
    .toLowerCase();
  if (visibility === "team") return false;
  const approvalStatus = String(template?.approvalStatus || "")
    .trim()
    .toLowerCase();
  if (["pending_publish", "rejected", "private"].includes(approvalStatus))
    return false;
  if (["approved", "pending_delete"].includes(approvalStatus)) return true;
  return (
    template?.public === true ||
    template?.isPublic === true ||
    template?.global === true ||
    ["global", "public", "shared"].includes(visibility)
  );
}

export function templateApprovalStatus(template) {
  const status = String(template?.approvalStatus || "").trim();
  if (
    [
      "private",
      "pending_publish",
      "approved",
      "pending_delete",
      "rejected",
    ].includes(status)
  )
    return status;
  return isPublicTemplate(template) ? "approved" : "private";
}

export function normalizeTemplateAccess(template) {
  const approvalStatus = templateApprovalStatus(template);
  const team =
    String(template?.visibility || template?.scope || "").toLowerCase() ===
    "team";
  if (team)
    return {
      visibility: "team",
      public: false,
      approvalStatus,
      requestedAt: template?.requestedAt || null,
      teamId: String(template?.teamId || ""),
    };
  if (["pending_publish", "rejected"].includes(approvalStatus))
    return {
      visibility: "global",
      public: false,
      approvalStatus,
      requestedAt: template?.requestedAt || null,
    };
  if (approvalStatus === "pending_delete")
    return {
      visibility: "global",
      public: true,
      approvalStatus,
      requestedAt: template?.requestedAt || null,
    };
  const global = isPublicTemplate(template);
  return {
    visibility: global ? "global" : "private",
    public: global,
    approvalStatus: global ? "approved" : "private",
    requestedAt: null,
  };
}

export function templateCreationAccess(visibility, now, teamId = "") {
  const team = visibility === "team";
  const global = visibility === "global";
  if (team)
    return {
      visibility: "team",
      public: false,
      approvalStatus: "pending_publish",
      requestedAt: now,
      teamId: String(teamId || ""),
    };
  return {
    visibility: global ? "global" : "private",
    public: false,
    approvalStatus: global ? "pending_publish" : "private",
    requestedAt: global ? now : null,
  };
}

export function shouldQueueTemplateDeletion(template) {
  return false;
}

