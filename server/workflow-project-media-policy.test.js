import test from "node:test";
import assert from "node:assert/strict";
import { assertWorkflowProjectAssetFiles } from "./workflow-project-media-policy.js";

const asset = (name, bytes) => ({
  type: "image",
  name,
  data: Buffer.alloc(bytes).toString("base64"),
});

test("工作流项目素材不再按所有节点的总大小误判", () => {
  assert.doesNotThrow(() =>
    assertWorkflowProjectAssetFiles(
      { inputA: [asset("a.png", 4)], inputB: [asset("b.png", 4)] },
      { limits: { image: 5, video: 5, audio: 5 } },
    ),
  );
});

test("工作流仍拒绝超过单文件 API 限制的素材", () => {
  assert.throws(
    () =>
      assertWorkflowProjectAssetFiles(
        { inputA: [asset("oversized.png", 6)] },
        { limits: { image: 5, video: 5, audio: 5 } },
      ),
    (error) => error.status === 413 && error.message.includes("oversized.png"),
  );
});

test("已持久化素材使用 size 在入队前校验", () => {
  assert.throws(
    () =>
      assertWorkflowProjectAssetFiles(
        {
          inputA: [
            { type: "video", name: "large.mp4", blobId: "blob", size: 6 },
          ],
        },
        { limits: { image: 5, video: 5, audio: 5 } },
      ),
    (error) => error.status === 413 && error.message.includes("large.mp4"),
  );
});

test("仅服务器签名的热点榜原片可使用 60MB 分析上限", () => {
  const twentyOneMb = 21 * 1024 * 1024;
  assert.throws(
    () =>
      assertWorkflowProjectAssetFiles({
        inputA: [
          { type: "video", name: "user.mp4", blobId: "user", size: twentyOneMb },
        ],
      }),
    (error) => error.status === 413,
  );
  assert.doesNotThrow(() =>
    assertWorkflowProjectAssetFiles({
      inputA: [
        {
          type: "video",
          name: "rank.mp4",
          blobId: "rank",
          size: 30 * 1024 * 1024,
          source: "hot-rank",
        },
      ],
    }),
  );
});

