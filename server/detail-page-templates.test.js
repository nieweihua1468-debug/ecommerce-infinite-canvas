import test from "node:test";
import assert from "node:assert/strict";
import { createDetailPageTemplates, DETAIL_PAGE_CATEGORY_TREE, DETAIL_PAGE_TEMPLATE_COUNT, normalizeDetailPageTemplateOverride } from "./detail-page-templates.js";
import { customBrandInvocationForTemplate, composeCustomBrandLockedPrompt } from "./custom-brand-detail-page-templates.js";

test("public templates retain editable layouts without private products or brand claims", () => {
 const items = createDetailPageTemplates();
 assert.equal(items.length, 10);
 assert.equal(DETAIL_PAGE_TEMPLATE_COUNT, 10);
 assert.equal(DETAIL_PAGE_CATEGORY_TREE.length, 1);
 assert.equal(new Set(items.map(item => item.id)).size, 10);
 assert.ok(items.every(item => item.promptText && !item.productReferenceUrl && !item.defaultProductIncluded));
 assert.ok(items.every(item => !item.coverGenerated && !item.coverVerified));
 assert.equal(customBrandInvocationForTemplate("legacy-private-template"), null);
 assert.equal(composeCustomBrandLockedPrompt("用户提供的提示词", null), "用户提供的提示词");
});

test("后台模版覆盖仅保留可编辑字段", () => {
  assert.deepEqual(
    normalizeDetailPageTemplateOverride({
      title: " 新标题 ",
      promptText: " 新提示词 ",
      enabled: false,
      generationPath: " /api/tasks/image/custom ",
      tags: "女装, 主图, 商业",
      model: "vapeur-gpt-image-2",
      aspectRatio: "3:4",
      resolution: "4k",
      quality: "medium",
      count: 2,
      outputFormat: "webp",
      preserveSubject: false,
      useNegativePrompt: true,
      allowText: true,
      ignored: "discard",
    }),
    {
      title: "新标题",
      promptText: "新提示词",
      negativePrompt: "",
      enabled: false,
      generationPath: "/api/tasks/image/custom",
      tags: ["女装", "主图", "商业"],
      model: "vapeur-gpt-image-2",
      aspectRatio: "3:4",
      resolution: "4k",
      quality: "medium",
      count: 2,
      outputFormat: "webp",
      preserveSubject: false,
      useNegativePrompt: true,
      allowText: true,
    },
  );
});

