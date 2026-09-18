import test from "node:test";
import assert from "node:assert/strict";
import { isTemplateLibraryVideoTemplate } from "./inspiration-import-policy.js";

test("只导入完整模版库本体，排除夹带的视频资产系统案例", () => {
  assert.equal(
    isTemplateLibraryVideoTemplate({
      type: "video-template",
      source: { platform: "桌面扁平无视频版" },
    }),
    true,
  );
  assert.equal(
    isTemplateLibraryVideoTemplate({
      type: "video-template",
      source: { platform: "AI资产系统视频模版" },
    }),
    false,
  );
});

