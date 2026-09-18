import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHotRankRemakeTemplate,
  normalizeHotRankRemakeConfig,
  publicHotRankRemakeConfig,
} from "./hot-rank-remake.js";

test("normalizes ranking remake node parameters at the API boundary", () => {
  const config = normalizeHotRankRemakeConfig({
    buttonLabel: "  立即复刻  ",
    input: { mediaMaxItems: 99 },
    nodes: {
      analysis: { model: "unknown", frameLimit: 200, maxTokens: 1 },
      prompt: { maxLength: 50 },
      video: {
        model: "not-a-video-model",
        duration: 99,
        aspectRatio: "5:7",
        cfgScale: 7,
      },
    },
  });
  assert.equal(config.buttonLabel, "立即复刻");
  assert.equal(config.schemaVersion, 2);
  assert.equal(config.workflow.revision, 1);
  assert.equal(config.workflow.nodes.length, 5);
  assert.equal(config.input.mediaMaxItems, 8);
  assert.equal(config.nodes.analysis.model, "vapeur-gemini-3.1-pro");
  assert.equal(config.nodes.analysis.frameLimit, 18);
  assert.equal(config.nodes.analysis.maxTokens, 600);
  assert.equal(config.nodes.analysis.failureMode, "continue");
  assert.equal(config.nodes.prompt.model, "local-prompt");
  assert.equal(config.nodes.prompt.maxLength, 500);
  assert.equal(
    config.workflow.nodes.find((node) => node.id === "prompt").apiPath,
    "internal://local-prompt",
  );
  assert.equal(config.nodes.video.model, "kling-v3-omni");
  assert.equal(config.nodes.video.duration, 15);
  assert.equal(config.nodes.video.aspectRatio, "9:16");
  assert.equal(config.nodes.video.cfgScale, 1);
  assert.deepEqual(
    config.workflow.nodes.map((node) => node.order),
    [10, 20, 30, 40, 50],
  );
});

test("keeps MiniMax-H3 ranking parameters and exposes its workflow inputs", () => {
  const config = normalizeHotRankRemakeConfig({
    nodes: {
      video: {
        model: "minimax-h3",
        duration: 2,
        aspectRatio: "21:9",
        resolution: "2k",
        ratioMode: "adaptive",
        aigcWatermark: true,
        multiShot: true,
        sound: true,
      },
    },
  });
  const video = config.nodes.video;
  assert.equal(video.model, "minimax-h3");
  assert.equal(video.duration, 4);
  assert.equal(video.aspectRatio, "21:9");
  assert.equal(video.resolution, "2K");
  assert.equal(video.ratioMode, "adaptive");
  assert.equal(video.aigcWatermark, true);
  assert.equal(video.multiShot, false);
  assert.equal(video.sound, false);

  const template = buildHotRankRemakeTemplate(
    { id: "minimax-rank", rank: 1 },
    config,
  );
  const videoNode = template.nodes.find(
    (node) => node.id === "hot-rank-video",
  );
  assert.equal(videoNode.data.model, "minimax-h3");
  assert.equal(videoNode.data.resolution, "2K");
  assert.ok(videoNode.data.inputs.some((input) => input.id === "last_frame"));
  assert.ok(
    videoNode.data.inputs.some((input) => input.id === "reference_audio"),
  );
  const publicConfig = publicHotRankRemakeConfig(config, {
    videoConfigured: true,
    videoProvider: "minimax",
  });
  assert.equal(publicConfig.output.resolution, "2K");
  assert.equal(publicConfig.output.ratioMode, "adaptive");
});

test("builds an executable ranking remake workflow with editable user inputs", () => {
  const template = buildHotRankRemakeTemplate({
    id: "2026-07-30:video-1",
    rank: 1,
    videoTitle: "夏季女装展示",
    productTitle: "轻薄防晒衫",
    primaryCategory: "女装",
  });
  assert.equal(template.remakeSource, "hot-rank");
  assert.equal(template.sourceInputNodeId, "hot-rank-source");
  assert.deepEqual(
    template.nodes.map((node) => node.data.kind),
    ["input", "input", "media-analysis", "text", "video", "output"],
  );
  assert.equal(
    template.nodes.find((node) => node.id === "hot-rank-source").data.remakeEditable,
    false,
  );
  assert.equal(
    template.nodes.find((node) => node.id === "hot-rank-product").data.remakeRequired,
    true,
  );
  assert.equal(
    template.nodes.find((node) => node.id === "hot-rank-prompt").data
      .remakeEditable,
    true,
  );
  assert.equal(
    template.nodes.find((node) => node.id === "hot-rank-prompt").data
      .backendPath,
    "internal://local-prompt",
  );
  assert.equal(
    template.nodes.find((node) => node.id === "hot-rank-prompt").data
      .systemPrompt,
    template.nodes.find((node) => node.id === "hot-rank-prompt").data.prompt,
  );
  assert.equal(
    template.nodes.find((node) => node.id === "hot-rank-video").data
      .combineUpstreamText,
    true,
  );
  assert.equal(
    template.nodes.find((node) => node.id === "hot-rank-video").data
      .appendConfiguredPrompt,
    true,
  );
  assert.ok(
    template.edges.some(
      (edge) =>
        edge.source === "hot-rank-visual-analysis" &&
        edge.target === "hot-rank-prompt",
    ),
  );
  assert.ok(
    template.edges.some(
      (edge) =>
        edge.source === "hot-rank-prompt" && edge.target === "hot-rank-video",
    ),
  );
  assert.equal(
    template.edges.some(
      (edge) =>
        edge.source === "hot-rank-visual-analysis" &&
        edge.target === "hot-rank-video",
    ),
    false,
  );
  assert.ok(
    template.edges.some(
      (edge) =>
        edge.source === "hot-rank-product" && edge.targetHandle === "image_1",
    ),
  );
});

test("keeps at least one analysis node enabled", () => {
  const config = normalizeHotRankRemakeConfig({
    workflow: {
      nodes: [
        { id: "visual-analysis", enabled: false },
        { id: "motion-analysis", enabled: false },
        { id: "director-analysis", enabled: false },
      ],
    },
  });
  assert.equal(
    config.workflow.nodes.filter(
      (node) => node.kind === "analysis" && node.enabled,
    ).length,
    1,
  );
});

test("uses the backend-configured node order, path and prompt version", () => {
  const config = normalizeHotRankRemakeConfig({
    workflow: {
      revision: 9,
      nodes: [
        { id: "prompt", order: 10, promptVersion: "remake-v2" },
        { id: "motion-analysis", enabled: true, order: 20 },
        { id: "visual-analysis", enabled: false, order: 30 },
        { id: "director-analysis", enabled: false, order: 40 },
        { id: "video", order: 1, apiPath: "/api/tasks/video" },
      ],
    },
  });
  const template = buildHotRankRemakeTemplate({ id: "rank-2", rank: 2 }, config);
  assert.equal(template.workflowSchemaVersion, 2);
  assert.equal(template.workflowConfigRevision, 9);
  assert.deepEqual(
    config.workflow.nodes.map((node) => node.id),
    ["prompt", "motion-analysis", "visual-analysis", "director-analysis", "video"],
  );
  assert.deepEqual(
    template.nodes.map((node) => node.data.kind),
    ["input", "input", "text", "media-analysis", "video", "output"],
  );
  assert.equal(
    template.nodes.find((node) => node.id === "hot-rank-prompt").data
      .promptVersion,
    "remake-v2",
  );
  assert.ok(
    template.edges.some(
      (edge) =>
        edge.source === "hot-rank-prompt" &&
        edge.target === "hot-rank-motion-analysis",
    ),
  );
  assert.deepEqual(publicHotRankRemakeConfig(config).flow, [
    "榜单原片",
    "复刻 Prompt 生成",
    "动作与运镜分析",
    "同款视频生成",
    "任务中心",
  ]);
});

test("reports provider readiness without exposing credentials", () => {
  const config = normalizeHotRankRemakeConfig({
    nodes: {
      analysis: { enabled: true, failureMode: "continue" },
      prompt: { model: "local-prompt" },
      video: { model: "kling-v3-omni" },
    },
  });
  const waiting = publicHotRankRemakeConfig(config, {
    analysisConfigured: false,
    textConfigured: false,
    videoConfigured: false,
    videoProvider: "kling",
  });
  assert.equal(waiting.readiness.analysis.fallback, true);
  assert.equal(waiting.readiness.prompt.configured, true);
  assert.equal(waiting.readiness.video.configured, false);
  assert.equal(waiting.readiness.runnable, false);
  assert.match(waiting.readiness.message, /Kling/);

  const ready = publicHotRankRemakeConfig(config, {
    videoConfigured: true,
    videoProvider: "kling",
  });
  assert.equal(ready.readiness.runnable, true);
});

