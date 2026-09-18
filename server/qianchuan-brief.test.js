import assert from "node:assert/strict";
import test from "node:test";
import {
  appendQianchuanBriefKeyword,
  clearQianchuanBriefKeywords,
  normalizeQianchuanBrief,
  qianchuanBriefLines,
  toggleQianchuanBriefKeyword,
} from "../shared/qianchuan-brief.js";

test("quick buttons append only the selected keyword", () => {
  const result = toggleQianchuanBriefKeyword(
    "XX 品牌｜冰感防晒衣｜轻薄透气",
    "限时优惠",
  );
  assert.deepEqual(qianchuanBriefLines(result), [
    "XX 品牌｜冰感防晒衣｜轻薄透气",
    "限时优惠",
  ]);
  assert.doesNotMatch(result, /营销机制|请补充/);
});

test("quick buttons toggle exact keywords without touching business copy", () => {
  assert.equal(
    toggleQianchuanBriefKeyword("XX 品牌\n限时优惠", "限时优惠"),
    "XX 品牌",
  );
  assert.equal(
    clearQianchuanBriefKeywords("XX 品牌\n限时优惠\n我的自定义词"),
    "XX 品牌\n我的自定义词",
  );
});

test("custom keywords are clean, bounded and deduplicated", () => {
  const result = appendQianchuanBriefKeyword("XX 品牌", "  夏季\n通勤  ");
  assert.equal(result, "XX 品牌\n夏季 通勤");
  assert.equal(appendQianchuanBriefKeyword(result, "夏季 通勤"), result);
});

test("legacy explanatory presets migrate to clean keywords", () => {
  assert.equal(
    normalizeQianchuanBrief(
      "营销机制：限时优惠（请补充具体时间与条件）\n口播语气：自然分享口吻",
    ),
    "限时优惠\n自然分享",
  );
});

