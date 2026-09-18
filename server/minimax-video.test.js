import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMiniMaxVideoRequest,
  getMiniMaxVideoTask,
  isMiniMaxVideoConfigured,
  normalizeMiniMaxVideoTask,
  submitMiniMaxVideo,
} from "./minimax-video.js";

const env = {
  MINIMAX_API_KEY: "test-minimax-secret",
  MINIMAX_VIDEO_BASE_URL: "https://minimax.test",
};
const MB = 1024 * 1024;

test("builds a MiniMax-H3 text-to-video request", () => {
  assert.deepEqual(
    buildMiniMaxVideoRequest({
      prompt: "一个女生在街头展示风衣",
      resolution: "2k",
      duration: 8,
      ratio: "9:16",
      aigcWatermark: true,
    }),
    {
      model: "MiniMax-H3",
      content: [{ type: "text", text: "一个女生在街头展示风衣" }],
      resolution: "2K",
      duration: 8,
      ratio: "9:16",
      aigc_watermark: true,
    },
  );
});

test("normalizes first/last frame video to adaptive ratio", () => {
  const body = buildMiniMaxVideoRequest({
    prompt: "从首帧平滑过渡到尾帧",
    imageUrl: "https://cdn.test/first.png",
    imageTailUrl: "https://cdn.test/last.png",
    duration: 5,
    ratio: "16:9",
  });
  assert.equal(body.ratio, "adaptive");
  assert.deepEqual(body.content.slice(1).map((item) => item.role), [
    "first_frame",
    "last_frame",
  ]);
  assert.deepEqual(body.content[1].image_url, {
    url: "https://cdn.test/first.png",
  });
});

test("supports multimodal references and requires visual media with audio", () => {
  const body = buildMiniMaxVideoRequest({
    prompt: "参考穿搭和声音生成口播视频",
    referenceImages: ["https://cdn.test/person.webp"],
    referenceVideos: ["https://cdn.test/motion.mp4"],
    referenceAudios: ["https://cdn.test/voice.wav"],
    duration: 15,
  });
  assert.equal(body.ratio, "adaptive");
  assert.deepEqual(body.content.slice(1).map((item) => item.role), [
    "reference_image",
    "reference_video",
    "reference_audio",
  ]);
  assert.deepEqual(body.content[2].video_url, {
    url: "https://cdn.test/motion.mp4",
  });
  assert.deepEqual(body.content[3].audio_url, {
    url: "https://cdn.test/voice.wav",
  });
  assert.throws(
    () =>
      buildMiniMaxVideoRequest({
        prompt: "只有声音",
        referenceAudios: ["https://cdn.test/voice.mp3"],
      }),
    /不能只有音频/,
  );
});

test("validates supplied media metadata at exact boundaries and strips it upstream", () => {
  const body = buildMiniMaxVideoRequest({
    prompt: "使用已校验的多模态素材",
    referenceImages: [
      {
        url: "https://cdn.test/person.asset",
        metadata: {
          format: "JPEG",
          mimeType: "image/jpeg",
          sizeBytes: 30 * MB,
          width: 256,
          height: 640,
        },
      },
    ],
    referenceVideos: [
      {
        video_url: {
          url: "https://cdn.test/motion.asset",
          metadata: {
            format: ".MOV",
            mimeType: "video/quicktime",
            sizeBytes: 19 * MB,
            width: 5760,
            height: 2304,
            durationSeconds: 7.5,
            fps: 23.976,
          },
        },
      },
    ],
    referenceAudios: [
      {
        url: "https://cdn.test/voice.asset",
        metadata: {
          mimeType: "audio/mpeg",
          sizeBytes: 15 * MB,
          durationSeconds: 7.5,
        },
      },
    ],
  });

  assert.equal(body.content.length, 4);
  assert.equal(JSON.stringify(body).includes("metadata"), false);
  assert.equal(JSON.stringify(body).includes("sizeBytes"), false);
  assert.deepEqual(body.content.slice(1), [
    {
      type: "image_url",
      image_url: { url: "https://cdn.test/person.asset" },
      role: "reference_image",
    },
    {
      type: "video_url",
      video_url: { url: "https://cdn.test/motion.asset" },
      role: "reference_video",
    },
    {
      type: "audio_url",
      audio_url: { url: "https://cdn.test/voice.asset" },
      role: "reference_audio",
    },
  ]);
});

test("rejects declared media formats and per-file sizes outside MiniMax limits", () => {
  assert.throws(
    () =>
      buildMiniMaxVideoRequest({
        prompt: "图片格式",
        imageUrl: {
          url: "https://cdn.test/frame.asset",
          metadata: { format: "gif" },
        },
      }),
    /metadata\.format 不支持/,
  );
  assert.throws(
    () =>
      buildMiniMaxVideoRequest({
        prompt: "视频格式",
        referenceVideos: [
          {
            url: "https://cdn.test/video.asset",
            metadata: { mimeType: "video/webm" },
          },
        ],
      }),
    /metadata\.mimeType 不支持/,
  );
  assert.throws(
    () =>
      buildMiniMaxVideoRequest({
        prompt: "音频格式",
        referenceImages: ["https://cdn.test/ref.png"],
        referenceAudios: [
          {
            url: "https://cdn.test/audio.asset",
            metadata: { format: "aac" },
          },
        ],
      }),
    /metadata\.format 不支持/,
  );

  for (const [input, expectedLimit] of [
    [
      {
        prompt: "图片过大",
        imageUrl: {
          url: "https://cdn.test/frame.png",
          metadata: { sizeBytes: 30 * MB + 1 },
        },
      },
      "30MB",
    ],
    [
      {
        prompt: "视频过大",
        referenceVideos: [
          {
            url: "https://cdn.test/video.mp4",
            metadata: { sizeBytes: 50 * MB + 1 },
          },
        ],
      },
      "50MB",
    ],
    [
      {
        prompt: "音频过大",
        referenceImages: ["https://cdn.test/ref.png"],
        referenceAudios: [
          {
            url: "https://cdn.test/audio.wav",
            metadata: { sizeBytes: 15 * MB + 1 },
          },
        ],
      },
      "15MB",
    ],
  ]) {
    assert.throws(
      () => buildMiniMaxVideoRequest(input),
      (error) => {
        assert.equal(error.status, 413);
        assert.equal(error.code, "MINIMAX_MEDIA_TOO_LARGE");
        assert.match(error.message, new RegExp(expectedLimit));
        return true;
      },
    );
  }
});

test("rejects declared image and video geometry outside provider boundaries", () => {
  for (const [metadata, message] of [
    [{ width: 255 }, /width.*256–5760/],
    [{ height: 5761 }, /height.*256–5760/],
    [{ width: 256, height: 641 }, /宽高比/],
    [{ width: 641, height: 256 }, /宽高比/],
  ]) {
    assert.throws(
      () =>
        buildMiniMaxVideoRequest({
          prompt: "尺寸校验",
          imageUrl: { url: "https://cdn.test/frame.png", metadata },
        }),
      message,
    );
  }

  assert.throws(
    () =>
      buildMiniMaxVideoRequest({
        prompt: "视频尺寸校验",
        referenceVideos: [
          {
            url: "https://cdn.test/video.mp4",
            metadata: { width: 5761, height: 2304 },
          },
        ],
      }),
    /width.*256–5760/,
  );
});

test("rejects declared video and audio timing or frame-rate outside limits", () => {
  for (const [metadata, message] of [
    [{ durationSeconds: 1.999 }, /durationSeconds.*2–15/],
    [{ durationSeconds: 15.001 }, /durationSeconds.*2–15/],
    [{ fps: 23.975 }, /fps.*23\.976–60/],
    [{ fps: 60.001 }, /fps.*23\.976–60/],
  ]) {
    assert.throws(
      () =>
        buildMiniMaxVideoRequest({
          prompt: "视频参数校验",
          referenceVideos: [
            { url: "https://cdn.test/video.mp4", metadata },
          ],
        }),
      message,
    );
  }

  for (const durationSeconds of [1.999, 15.001]) {
    assert.throws(
      () =>
        buildMiniMaxVideoRequest({
          prompt: "音频时长校验",
          referenceImages: ["https://cdn.test/ref.png"],
          referenceAudios: [
            {
              url: "https://cdn.test/audio.mp3",
              metadata: { durationSeconds },
            },
          ],
        }),
      /durationSeconds.*2–15/,
    );
  }
});

test("rejects declared aggregate media size and reference duration limits", () => {
  assert.throws(
    () =>
      buildMiniMaxVideoRequest({
        prompt: "总素材大小",
        referenceImages: [
          {
            url: "https://cdn.test/ref.png",
            metadata: { sizeBytes: 30 * MB },
          },
        ],
        referenceVideos: [
          {
            url: "https://cdn.test/video.mp4",
            metadata: { sizeBytes: 20 * MB },
          },
        ],
        referenceAudios: [
          {
            url: "https://cdn.test/audio.mp3",
            metadata: { sizeBytes: 15 * MB },
          },
        ],
      }),
    (error) => {
      assert.equal(error.status, 413);
      assert.equal(error.code, "MINIMAX_PAYLOAD_TOO_LARGE");
      assert.match(error.message, /64MB/);
      return true;
    },
  );

  assert.throws(
    () =>
      buildMiniMaxVideoRequest({
        prompt: "参考视频总时长",
        referenceVideos: [
          {
            url: "https://cdn.test/one.mp4",
            metadata: { durationSeconds: 8 },
          },
          {
            url: "https://cdn.test/two.mov",
            metadata: { durationSeconds: 8 },
          },
        ],
      }),
    /参考视频已知总时长/,
  );
  assert.throws(
    () =>
      buildMiniMaxVideoRequest({
        prompt: "参考音频总时长",
        referenceImages: ["https://cdn.test/ref.png"],
        referenceAudios: [
          {
            url: "https://cdn.test/one.wav",
            metadata: { durationSeconds: 8 },
          },
          {
            url: "https://cdn.test/two.mp3",
            metadata: { durationSeconds: 8 },
          },
        ],
      }),
    /参考音频已知总时长/,
  );
});

test("keeps metadata optional without inferring unverifiable facts from URLs", () => {
  const body = buildMiniMaxVideoRequest({
    prompt: "不根据 URL 后缀伪造校验结果",
    referenceImages: [
      "https://cdn.test/reference.unknown",
      {
        url: "https://cdn.test/partial.asset",
        metadata: { width: 256 },
      },
    ],
  });
  assert.equal(body.content.length, 3);
  assert.throws(
    () =>
      buildMiniMaxVideoRequest({
        prompt: "错误元数据类型",
        imageUrl: {
          url: "https://cdn.test/frame.png",
          metadata: { sizeBytes: "1024" },
        },
      }),
    /sizeBytes 必须是有限数字/,
  );
  assert.throws(
    () =>
      buildMiniMaxVideoRequest({
        prompt: "元数据冲突",
        imageUrl: {
          url: "https://cdn.test/frame.asset",
          metadata: { format: "png", mimeType: "image/jpeg" },
        },
      }),
    /不一致/,
  );
});

test("invalid declared metadata prevents any MiniMax network request", async () => {
  let called = false;
  await assert.rejects(
    submitMiniMaxVideo(
      {
        prompt: "请求前拦截",
        referenceVideos: [
          {
            url: "https://cdn.test/video.mp4",
            metadata: { fps: 61 },
          },
        ],
      },
      {
        env,
        fetchImpl: async () => {
          called = true;
          return new Response(JSON.stringify({ task_id: "must_not_exist" }));
        },
      },
    ),
    /fps/,
  );
  assert.equal(called, false);
});

test("rejects invalid input combinations before network access", () => {
  assert.throws(
    () => buildMiniMaxVideoRequest({ prompt: "测试", duration: 3, ratio: "16:9" }),
    /4–15/,
  );
  assert.throws(
    () => buildMiniMaxVideoRequest({ prompt: "测试", ratio: "adaptive" }),
    /非 adaptive/,
  );
  assert.throws(
    () =>
      buildMiniMaxVideoRequest({
        prompt: "测试",
        imageUrl: "data:image/png;base64,AAAA",
      }),
    /Base64/,
  );
  assert.throws(
    () =>
      buildMiniMaxVideoRequest({
        content: [
          { type: "text", text: "测试" },
          { type: "image_url", image_url: "https://cdn.test/first.png", role: "first_frame" },
          { type: "image_url", image_url: "https://cdn.test/ref.png", role: "reference_image" },
        ],
      }),
    /不能混用/,
  );
  assert.throws(
    () => buildMiniMaxVideoRequest({ prompt: "x".repeat(7001), ratio: "16:9" }),
    /7000/,
  );
});

test("submits with Bearer auth and never leaks credentials in response", async () => {
  let call;
  const result = await submitMiniMaxVideo(
    { prompt: "测试", ratio: "16:9", duration: 5 },
    {
      env,
      fetchImpl: async (url, options) => {
        call = { url: String(url), options };
        return new Response(JSON.stringify({ task_id: "task_123" }), { status: 200 });
      },
    },
  );
  assert.equal(call.url, "https://minimax.test/v2/video_generation");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.headers.Authorization, "Bearer test-minimax-secret");
  assert.equal(JSON.parse(call.options.body).model, "MiniMax-H3");
  assert.deepEqual(result, {
    taskId: "task_123",
    taskType: "minimax-h3-video",
    payload: { task_id: "task_123" },
  });
  assert.equal(JSON.stringify(result).includes("test-minimax-secret"), false);
});

test("queries a task and maps terminal task output", async () => {
  let url;
  const payload = await getMiniMaxVideoTask("task_123", {
    env,
    fetchImpl: async (value) => {
      url = String(value);
      return new Response(
        JSON.stringify({
          task: {
            id: "task_123",
            status: "succeeded",
            content: { url: "https://cdn.test/result.mp4" },
            resolution: "2K",
            duration: 5,
            ratio: "16:9",
          },
        }),
        { status: 200 },
      );
    },
  });
  assert.equal(url, "https://minimax.test/v2/query/video_generation/task_123");
  assert.deepEqual(normalizeMiniMaxVideoTask(payload), {
    status: "succeeded",
    videoUrl: "https://cdn.test/result.mp4",
    coverUrl: null,
    error: null,
    rawStatus: "succeeded",
    usage: null,
    resolution: "2K",
    duration: 5,
    ratio: "16:9",
  });
});

for (const [status, code, message] of [
  [400, "MINIMAX_INVALID_REQUEST", "参数"],
  [401, "MINIMAX_UNAUTHORIZED", "凭证"],
  [402, "MINIMAX_BALANCE_EXHAUSTED", "余额"],
  [422, "MINIMAX_UNPROCESSABLE_INPUT", "素材"],
  [429, "MINIMAX_RATE_LIMITED", "频繁"],
  [503, "MINIMAX_UPSTREAM_UNAVAILABLE", "暂时不可用"],
]) {
  test(`maps and sanitizes MiniMax HTTP ${status}`, async () => {
    await assert.rejects(
      submitMiniMaxVideo(
        { prompt: "测试", ratio: "16:9" },
        {
          env,
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                code: "upstream_code",
                message: "Bearer test-minimax-secret https://private.test/file",
                request_id: "req_123",
              }),
              { status },
            ),
        },
      ),
      (error) => {
        assert.equal(error.code, code);
        assert.match(error.message, new RegExp(message));
        assert.deepEqual(error.payload, {
          provider: "minimax",
          httpStatus: status,
          upstreamCode: "upstream_code",
          requestId: "req_123",
        });
        assert.equal(JSON.stringify(error).includes("test-minimax-secret"), false);
        assert.equal(JSON.stringify(error).includes("private.test"), false);
        return true;
      },
    );
  });
}

test("reports provider configuration without exposing the key", () => {
  assert.equal(isMiniMaxVideoConfigured(env), true);
  assert.equal(isMiniMaxVideoConfigured({}), false);
});

test("maps network failures without leaking the endpoint or credential", async () => {
  await assert.rejects(
    getMiniMaxVideoTask("task_123", {
      env,
      fetchImpl: async () => {
        throw new Error(
          "fetch https://minimax.test failed with Bearer test-minimax-secret",
        );
      },
    }),
    (error) => {
      assert.equal(error.code, "MINIMAX_NETWORK_ERROR");
      assert.equal(error.status, 502);
      assert.equal(error.retryable, true);
      assert.equal(JSON.stringify(error).includes("minimax.test"), false);
      assert.equal(JSON.stringify(error).includes("test-minimax-secret"), false);
      return true;
    },
  );
});

