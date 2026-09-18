import test from "node:test";
import assert from "node:assert/strict";

import {
  canReviewTeamTemplate,
  canViewTeamTemplate,
  isApprovedTeamTemplate,
  isTeamAdmin,
  safeTeamSummary,
} from "./team-policy.js";

const team = {
  id: "team-1",
  name: "服饰创作组",
  ownerId: "owner-1",
  adminIds: ["admin-1"],
};

test("team owners and delegated administrators can approve team workflows", () => {
  const owner = { id: "owner-1", teamId: "team-1" };
  const admin = { id: "admin-1", teamId: "team-1" };
  const member = { id: "member-1", teamId: "team-1" };
  const template = {
    visibility: "team",
    teamId: "team-1",
    approvalStatus: "pending_publish",
  };
  assert.equal(isTeamAdmin(owner, team), true);
  assert.equal(isTeamAdmin(admin, team), true);
  assert.equal(isTeamAdmin(member, team), false);
  assert.equal(canReviewTeamTemplate(template, owner, team), true);
  assert.equal(canReviewTeamTemplate(template, member, team), false);
});

test("approved team workflows stay isolated to their team", () => {
  const template = {
    visibility: "team",
    teamId: "team-1",
    ownerId: "member-1",
    approvalStatus: "approved",
  };
  assert.equal(isApprovedTeamTemplate(template), true);
  assert.equal(
    canViewTeamTemplate(template, { id: "member-2", teamId: "team-1" }, team),
    true,
  );
  assert.equal(
    canViewTeamTemplate(template, { id: "outside", teamId: "team-2" }, team),
    false,
  );
});

test("pending team workflows are visible to the owner and team administrators", () => {
  const template = {
    visibility: "team",
    teamId: "team-1",
    ownerId: "member-1",
    approvalStatus: "pending_publish",
  };
  assert.equal(
    canViewTeamTemplate(template, { id: "member-1", teamId: "team-1" }, team),
    true,
  );
  assert.equal(
    canViewTeamTemplate(template, { id: "admin-1", teamId: "team-1" }, team),
    true,
  );
  assert.equal(
    canViewTeamTemplate(template, { id: "member-2", teamId: "team-1" }, team),
    false,
  );
  assert.deepEqual(safeTeamSummary(team, { id: "admin-1", teamId: "team-1" }), {
    id: "team-1",
    name: "服饰创作组",
    role: "admin",
    isAdmin: true,
  });
});

