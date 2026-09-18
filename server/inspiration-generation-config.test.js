import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_INSPIRATION_GENERATION_CONFIG,
  normalizeInspirationGenerationConfig,
} from "./inspiration-generation-config.js";

test("一键同款生成配置默认使用支持多参考图的 Omni", () => {
  const config = normalizeInspirationGenerationConfig();
  assert.equal(config.modelName, "kling-v3-omni");
  assert.equal(config.duration, 15);
  assert.match(config.outfitPrompt, /完整服装与造型/);
  assert.equal(config.promptLabel, "提示词");
  assert.equal(config.generateButtonLabel, "生成");
  assert.equal(config.quickPromptPresets.length, 3);
  assert.equal(config.batchPromptLabel, "统一提示词");
  assert.match(config.batchPrompt, /模特自然自信/);
  assert.match(config.imagePromptPlaceholder, /电商时尚大片/);
  assert.match(config.audioTextPlaceholder, /新品大上新/);
  assert.match(config.analysisSeedanceFramework, /Seedance 2.0/);
  assert.match(config.analysisKlingFramework, /可灵 3.0/);
  assert.match(config.canvasVideoPrompt, /镜头先中景/);
});

test("一键同款生成配置限制模型、时长和提示词", () => {
  const config = normalizeInspirationGenerationConfig({
    modelName: "unknown-video-model",
    duration: 99,
    cfgScale: -2,
    outfitPrompt: "  ",
    promptLabel: " 视频提示 ",
    generateButtonLabel: " 开始制作 ",
    quickPromptPresets: [{ label: " 展示 ", prompt: " 旋转展示商品 " }],
    batchPrompt: " 批量商品展示 ",
    imagePromptPlaceholder: " 产品白底图 ",
    audioTextPlaceholder: " 新品开播 ",
    analysisPromptLabel: " 视频拆解 ",
    canvasDirectorPrompt: " 结构化输出 ",
  });
  assert.equal(
    config.modelName,
    DEFAULT_INSPIRATION_GENERATION_CONFIG.modelName,
  );
  assert.equal(config.duration, 15);
  assert.equal(config.cfgScale, 0);
  assert.equal(
    config.outfitPrompt,
    DEFAULT_INSPIRATION_GENERATION_CONFIG.outfitPrompt,
  );
  assert.equal(config.promptLabel, "视频提示");
  assert.equal(config.generateButtonLabel, "开始制作");
  assert.deepEqual(config.quickPromptPresets[0], {
    label: "展示",
    prompt: "旋转展示商品",
  });
  assert.equal(config.batchPrompt, "批量商品展示");
  assert.equal(config.imagePromptPlaceholder, "产品白底图");
  assert.equal(config.audioTextPlaceholder, "新品开播");
  assert.equal(config.analysisPromptLabel, "视频拆解");
  assert.equal(config.canvasDirectorPrompt, "结构化输出");
});

