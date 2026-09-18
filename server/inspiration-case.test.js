import assert from "node:assert/strict";
import test from "node:test";
import {
  createInspirationCatalogCache,
  inspirationCaseKind,
  inspirationListFields,
  inspirationThumbnailUrl,
  inspirationWorkflowMediaType,
  inspirationWorkflowSnapshot,
  materialTemplatePublicationPatch,
  normalizeInspirationCaseInput,
  normalizeVideoWorkflowPreset,
} from "./inspiration-case.js";

test("reuses a compiled inspiration catalog until either source changes", async () => {
  let builds = 0;
  const loadCatalog = createInspirationCatalogCache(
    async ({ manifestSource, settings }) => ({
      build: ++builds,
      manifestSource,
      settings,
    }),
  );
  const manifestSource = { version: 1 };
  const settings = { overrides: {} };
  const [first, concurrent] = await Promise.all([
    loadCatalog({ manifestSource, settings }),
    loadCatalog({ manifestSource, settings }),
  ]);
  assert.equal(first, concurrent);
  assert.equal(builds, 1);
  assert.equal(
    (await loadCatalog({ manifestSource, settings })).build,
    1,
  );
  assert.equal(
    (await loadCatalog({ manifestSource: { version: 2 }, settings })).build,
    2,
  );
  assert.equal(
    (
      await loadCatalog({
        manifestSource,
        settings: { overrides: { updated: true } },
      })
    ).build,
    3,
  );
});

test("normalizes inspiration publishing fields", () => {
  const result = normalizeInspirationCaseInput({
    title: "  夏日穿搭  ",
    workflowTemplateId: "template-1",
    coverMimeType: "image/png",
    coverImage: "YWJj",
    kind: "image",
    tags: "女装，夏日 女装",
  });
  assert.equal(result.title, "夏日穿搭");
  assert.deepEqual(result.tags, ["女装", "夏日"]);
  assert.equal(result.extension, "png");
  assert.equal(result.kind, "image");
  assert.equal(result.category, "详情页");
});

test("accepts material remake as the fourth publishing destination", () => {
  const result = normalizeInspirationCaseInput({
    title: "千川口播种草",
    workflowTemplateId: "template-1",
    coverMimeType: "image/png",
    coverImage: "YWJj",
    kind: "qianchuan",
  });
  assert.equal(result.kind, "qianchuan");
  assert.equal(result.category, "素材同款");
});

test("rejects unknown publishing destinations", () => {
  assert.throws(
    () =>
      normalizeInspirationCaseInput({
        title: "案例",
        workflowTemplateId: "template-1",
        coverMimeType: "image/png",
        coverImage: "YWJj",
        kind: "自定义",
      }),
    /有效的模版分类/,
  );
});

test("publishes a material workflow as a globally reusable template", () => {
  const patch = materialTemplatePublicationPatch(
    {
      title: "千川口播种草",
      description: "上传人物与商品后生成口播视频",
      tags: ["女装", "口播"],
    },
    {
      coverUrl: "/generated/material-cover.png",
      now: "2026-08-02T08:00:00.000Z",
      userId: "admin-1",
    },
  );
  assert.equal(patch.category, "素材模版");
  assert.equal(patch.workflowType, "oral-material");
  assert.equal(patch.experience, "qianchuan-speaking");
  assert.equal(patch.visibility, "global");
  assert.equal(patch.public, true);
  assert.equal(patch.approvalStatus, "approved");
  assert.equal(patch.coverUrl, "/generated/material-cover.png");
});

test("requires a saved workflow and cover", () => {
  assert.throws(
    () => normalizeInspirationCaseInput({ title: "案例" }),
    /保存并绑定工作流/,
  );
});

test("creates a stable workflow snapshot", () => {
  const snapshot = inspirationWorkflowSnapshot({
    id: "template-1",
    name: "穿搭流程",
    runMode: "frontend",
    nodes: [{ id: "input-1" }],
    edges: [],
  });
  assert.equal(snapshot.name, "穿搭流程");
  assert.equal(snapshot.runMode, "frontend");
  assert.equal(snapshot.revision, 1);
  assert.equal(snapshot.versionRef, "template-1@1");
  assert.equal(snapshot.manifest.schemaVersion, 1);
  assert.equal(snapshot.nodes.length, 1);
});

test("detects the final image or video output from workflow order", () => {
  const image = { id: "image", data: { kind: "image" } };
  const video = { id: "video", data: { kind: "video" } };
  assert.equal(
    inspirationWorkflowMediaType({
      nodes: [video, image],
      edges: [{ source: "image", target: "video" }],
    }),
    "video",
  );
  assert.equal(inspirationWorkflowMediaType({ nodes: [image], edges: [] }), "image");
});

test("classifies automatic outfit cases as a dedicated image workflow type", () => {
  assert.equal(inspirationCaseKind({ kind: "image", mediaType: "video" }), "image");
  assert.equal(
    inspirationCaseKind({ kind: "qianchuan", mediaType: "video" }),
    "qianchuan",
  );
  assert.equal(
    inspirationCaseKind({
      title: "自动搭配设计 · 三套方案",
      mediaType: "image",
    }),
    "outfit",
  );
  assert.equal(inspirationCaseKind({ mediaType: "image" }), "image");
  assert.equal(inspirationCaseKind({ mediaType: "video" }), "video");
});

test("preserves the single-node workflow supplied by the video template library", () => {
  assert.equal(
    normalizeVideoWorkflowPreset("single-node-outfit-video"),
    "single-node-outfit-video",
  );
  assert.equal(
    normalizeVideoWorkflowPreset("unknown", "direct-video"),
    "direct-video",
  );
});

test("derives a lightweight card thumbnail without replacing the original cover", () => {
  const item = {
    coverUrl: "/inspiration-assets/library/A01_002-cover.png",
  };
  assert.equal(
    inspirationThumbnailUrl(item),
    "/inspiration-assets/thumbnails/A01_002-cover.jpg",
  );
  assert.equal(item.coverUrl, "/inspiration-assets/library/A01_002-cover.png");
  assert.equal(
    inspirationThumbnailUrl({ coverUrl: "/generated/custom-cover.png" }),
    "",
  );
  assert.equal(
    inspirationThumbnailUrl({
      coverUrl: "/template-covers/outfit-generated/001.png",
    }),
    "/template-thumbnails/outfit-generated/001.jpg",
  );
  assert.equal(
    inspirationThumbnailUrl({ coverUrl: "/template-covers/source/001.png" }),
    "",
  );
});

test("keeps list cards lightweight while detail-only workflow data stays private", () => {
  const listItem = inspirationListFields({
    id: "library-A01_001",
    title: "A01_001",
    kind: "video",
    category: "A01",
    ratio: "9:16",
    coverUrl: "/inspiration-assets/library/A01_001-cover.jpg",
    mainImageUrl: "/inspiration-assets/library/A01_001-cover.jpg",
    promptText: "large prompt",
    audioUrl: "/inspiration-assets/library/A01_001-audio.mp3",
    workflowTemplate: { nodes: [{ id: "video" }] },
    generationConfig: { modelName: "kling-v3-omni" },
  });
  assert.equal(listItem.id, "library-A01_001");
  assert.equal(listItem.kind, "video");
  assert.equal(listItem.ratio, "9:16");
  assert.equal(
    listItem.thumbnailUrl,
    "/inspiration-assets/thumbnails/A01_001-cover.jpg",
  );
  assert.equal("promptText" in listItem, false);
  assert.equal("audioUrl" in listItem, false);
  assert.equal("workflowTemplate" in listItem, false);
  assert.equal("generationConfig" in listItem, false);
});

