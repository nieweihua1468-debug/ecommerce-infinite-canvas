import test from "node:test";
import assert from "node:assert/strict";
import {
  hasTemplateAccess,
  recentFailureStats,
  isPlatformAdmin,
  normalizeLegacyAccountType,
  todayGenerationStats,
} from "./admin-visibility.js";

test("旧账户统一迁移为普通用户并移除隐藏标记", () => {
  const legacy = normalizeLegacyAccountType({
    name: "旧账户",
    accountType: "beta",
    adminHidden: true,
  });
  assert.equal(legacy.accountType, "creator");
  assert.equal(legacy.templateAccess, false);
  assert.equal("adminHidden" in legacy, false);
  assert.equal(normalizeLegacyAccountType({ name: "旧账户" }).accountType, "creator");
});

test("平台管理员保留显式账户类型", () => {
  const user = normalizeLegacyAccountType({ name: "管理员", accountType: "admin" });
  assert.equal(isPlatformAdmin(user), true);
  assert.equal(hasTemplateAccess(user), true);
});

test("模版权限兼容新旧账号字段", () => {
  assert.equal(hasTemplateAccess({ accountType: "creator" }), false);
  assert.equal(hasTemplateAccess({ accountType: "creator", templateAccess: true }), true);
  assert.equal(hasTemplateAccess({ accountType: "free", inspirationAccess: true }), true);
});

test("今日生成量按上海时区区分图片和视频", () => {
  const tasks = [
    { createdAt: "2026-07-16T16:01:00.000Z", outputType: "image" },
    { createdAt: "2026-07-17T08:00:00.000Z", taskType: "image2video" },
    { createdAt: "2026-07-16T15:59:00.000Z", outputType: "video" },
    { createdAt: "2026-07-17T09:00:00.000Z", taskType: "text-analysis" },
  ];

  assert.deepEqual(todayGenerationStats(tasks, "2026-07-17T10:00:00.000Z"), {
    total: 2,
    images: 1,
    videos: 1,
    date: "2026-07-17",
  });
});

test("近 24 小时失败按可操作原因分类", () => {
  const tasks = [
    { status: "failed", createdAt: "2026-07-17T09:00:00.000Z", failure: { category: "rate_limit" } },
    { status: "failed", createdAt: "2026-07-17T08:00:00.000Z", error: "内容未通过模型安全审核" },
    { status: "failed", createdAt: "2026-07-15T08:00:00.000Z", failure: { category: "timeout" } },
  ];

  assert.deepEqual(recentFailureStats(tasks, "2026-07-17T10:00:00.000Z"), {
    total: 2,
    categories: [
      { category: "policy", label: "内容审核", count: 1 },
      { category: "rate_limit", label: "请求限流", count: 1 },
    ],
  });
});

