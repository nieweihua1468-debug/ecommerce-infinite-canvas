import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSystemVideoAnalysisProfiles,
  normalizeVideoAnalysisProfiles,
  stripSystemVideoAnalysisPresets,
} from "./video-analysis-profiles.js";

const fallback = {
  seedance: {
    framework: "旧默认",
    presets: [{ id: "old", label: "旧标签", framework: "旧内容" }],
  },
  kling: {
    framework: "可灵旧默认",
    presets: [],
  },
};

test("loads configured system video analysis prompts with fallback", () => {
  const defaults = normalizeSystemVideoAnalysisProfiles(
    {
      seedance: {
        framework: "文鸟 Seedance 框架",
        presets: [
          { id: "wen-video", label: "视频拆解", framework: "完整提示词" },
        ],
      },
    },
    fallback,
  );
  assert.equal(defaults.seedance.framework, "文鸟 Seedance 框架");
  assert.equal(defaults.seedance.presets[0].label, "视频拆解");
  assert.equal(defaults.kling.framework, "可灵旧默认");
});

test("merges immutable system presets with personal presets", () => {
  const defaults = normalizeSystemVideoAnalysisProfiles(
    {
      seedance: {
        framework: "系统框架",
        presets: [
          { id: "system-video", label: "视频拆解", framework: "系统提示词" },
        ],
      },
    },
    fallback,
  );
  const profiles = normalizeVideoAnalysisProfiles(
    {
      seedance: {
        framework: "个人框架",
        presets: [
          { id: "system-video", label: "视频拆解", framework: "篡改内容" },
          { id: "personal", label: "口播拆解", framework: "个人提示词" },
        ],
      },
    },
    defaults,
  );
  assert.equal(profiles.seedance.framework, "个人框架");
  assert.deepEqual(
    profiles.seedance.presets.map((preset) => [preset.id, preset.system]),
    [
      ["system-video", true],
      ["personal", undefined],
    ],
  );
  assert.deepEqual(
    stripSystemVideoAnalysisPresets(
      profiles.seedance.presets,
      defaults.seedance,
    ).map((preset) => preset.id),
    ["personal"],
  );
});

