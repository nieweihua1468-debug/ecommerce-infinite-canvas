import test from "node:test";
import assert from "node:assert/strict";
import {
  SOCIAL_DETAIL_BLUEPRINTS,
  SOCIAL_DETAIL_CATEGORY,
  SOCIAL_DETAIL_PAGE_TEMPLATE_COUNT,
  SOCIAL_DETAIL_PLATFORMS,
} from "./social-detail-page-templates.js";

test("热门详情页10个案例覆盖不同结构并使用无品牌占位封面", () => {
  assert.equal(SOCIAL_DETAIL_PAGE_TEMPLATE_COUNT, 10);
  assert.equal(SOCIAL_DETAIL_BLUEPRINTS.length, 10);
  assert.equal(SOCIAL_DETAIL_CATEGORY.children.length, 10);
  assert.deepEqual(
    [...SOCIAL_DETAIL_PLATFORMS].sort(),
    ["小红书", "抖音商城"].sort(),
  );
  assert.equal(
    new Set(SOCIAL_DETAIL_BLUEPRINTS.map((item) => item.secondaryCategoryId))
      .size,
    10,
  );
  assert.ok(
    SOCIAL_DETAIL_BLUEPRINTS.every(
      (item) =>
        item.ratio === "3:4" &&
        item.coverUrl.endsWith(".svg") &&
        !item.productReferenceUrl &&
        item.promptText.includes("用户填写的产品信息") &&
        item.promptText.includes("不得编造"),
    ),
  );
});

test("详情页快捷词只包含可直接写入产品信息框的词汇", () => {
  const groups = SOCIAL_DETAIL_BLUEPRINTS[0].remakeQuickWordGroups;
  const words = groups.flatMap((group) => group.options);
  assert.deepEqual(
    groups.map((group) => group.label),
    ["产品重点", "目标人群", "内容重点", "页面语气"],
  );
  assert.equal(words.length, 20);
  assert.ok(words.every((word) => !/[：:（）()]/.test(word)));
  assert.ok(words.includes("核心卖点"));
  assert.ok(words.includes("真实种草"));
});

