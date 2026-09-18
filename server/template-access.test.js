import test from "node:test";
import assert from "node:assert/strict";

import {
  canExposeTemplateToUser,
  canExposeTemplateAsset,
  canManageTemplate,
  canCreateSharedTemplate,
  hasTemplateSurfaceAccess,
  isPrivateProjectTemplate,
  isTemplateSurfacePage,
  resolveStudioMode,
} from "../shared/template-access.js";

test("普通线上账户只保留创作者模式", () => {
  const user = { accountType: "creator", templateAccess: false };
  assert.equal(hasTemplateSurfaceAccess(user), false);
  assert.equal(resolveStudioMode("creative", user), "creator");
  assert.equal(canCreateSharedTemplate(user), false);
});

test("管理员升级模版权限后可以打开完整模版界面", () => {
  const upgraded = { accountType: "creator", templateAccess: true };
  const admin = { accountType: "admin" };
  assert.equal(resolveStudioMode("creative", upgraded), "creative");
  assert.equal(hasTemplateSurfaceAccess(admin), true);
  assert.equal(canCreateSharedTemplate(upgraded), true);
});

test("受限路由与个人项目严格分开", () => {
  assert.equal(isTemplateSurfacePage("inspiration"), true);
  assert.equal(isTemplateSurfacePage("workflow"), false);
  assert.equal(isPrivateProjectTemplate({ visibility: "private" }), true);
  assert.equal(isPrivateProjectTemplate({ visibility: "team" }), false);
  assert.equal(isPrivateProjectTemplate({ visibility: "global" }), false);
  assert.equal(isPrivateProjectTemplate({ public: true }), false);
});

test("未升级账户的 API 只能返回和维护自己的私有项目", () => {
  const creator = { accountType: "creator", templateAccess: false };
  const privateProject = { visibility: "private" };
  const teamTemplate = { visibility: "team" };
  assert.equal(
    canExposeTemplateToUser(creator, privateProject, { owned: true }),
    true,
  );
  assert.equal(
    canExposeTemplateToUser(creator, teamTemplate, {
      owned: false,
      sharedVisible: true,
    }),
    false,
  );
  assert.equal(
    canManageTemplate(creator, privateProject, { owned: true }),
    true,
  );
  assert.equal(
    canManageTemplate(creator, privateProject, {
      owned: true,
      requestedVisibility: "team",
    }),
    false,
  );
  assert.equal(
    canManageTemplate(creator, teamTemplate, { owned: true }),
    false,
  );
  assert.equal(canExposeTemplateAsset(creator, { kind: "person" }), true);
  assert.equal(
    canExposeTemplateAsset(creator, { kind: "template_original" }),
    false,
  );
});

