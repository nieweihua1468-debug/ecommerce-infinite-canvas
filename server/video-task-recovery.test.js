import test from "node:test";
import assert from "node:assert/strict";
import {
  restoreVideoRecoveryInput,
  startupRecoveryAction,
  videoRecoveryAssets,
  videoRecoveryInput,
} from "./video-task-recovery.js";

test("video recovery separates large media from serializable parameters", () => {
  const item = {
    prompt: "人物自然向前走",
    duration: 15,
    image: "data:image/png;base64,cHJpbWFyeQ==",
    referenceImages: [
      {
        data: "data:image/jpeg;base64,cmVmZXJlbmNl",
        name: "服装图.jpg",
        mimeType: "image/jpeg",
      },
    ],
    videos: [
      {
        data: "data:video/mp4;base64,dmlkZW8=",
        name: "动作.mp4",
        mimeType: "video/mp4",
      },
    ],
  };
  const input = videoRecoveryInput(item);
  const assets = videoRecoveryAssets(item);
  assert.equal(input.prompt, item.prompt);
  assert.equal("image" in input, false);
  assert.equal("referenceImages" in input, false);
  assert.equal(assets["video-primary"][0].data, "cHJpbWFyeQ==");
  assert.equal(assets["video-images"][0].data, "cmVmZXJlbmNl");
  assert.equal(assets["video-references"][0].data, "dmlkZW8=");
});

test("video recovery restores provider input and stable port order", () => {
  const task = {
    recoveryInput: { prompt: "保持人物一致", duration: 15 },
  };
  const input = restoreVideoRecoveryInput(task, {
    "video-primary": [
      { data: "primary", name: "主图", mimeType: "image/png" },
    ],
    "video-images": [
      { data: "reference", name: "服装图", mimeType: "image/jpeg" },
    ],
    "video-audios": [
      { data: "voice", name: "口播", mimeType: "audio/mpeg" },
    ],
  });
  assert.equal(input.image, "primary");
  assert.equal(input.referenceImages[0].label, "image_2");
  assert.equal(input.audios[0].label, "voice_1");
  assert.equal(input.prompt, "保持人物一致");
});

test("startup recovery handles submitting and orphaned active tasks", () => {
  assert.equal(
    startupRecoveryAction({
      status: "submitting",
      submissionUncertain: true,
      recoveryInput: { prompt: "test" },
      recoveryAssets: {},
    }),
    "wait-callback",
  );
  assert.equal(
    startupRecoveryAction({
      status: "submitting",
      recoveryInput: { prompt: "test" },
      recoveryAssets: {},
    }),
    "resubmit",
  );
  assert.equal(startupRecoveryAction({ status: "submitting" }), "fail-refund");
  assert.equal(
    startupRecoveryAction({
      status: "processing",
      upstreamTaskId: "provider-task",
    }),
    "poll",
  );
  assert.equal(
    startupRecoveryAction({
      status: "processing",
      taskType: "image-generation",
      recoveryInput: { prompt: "recover" },
    }),
    "resume-image",
  );
  assert.equal(
    startupRecoveryAction({ status: "processing", taskType: "legacy" }),
    "fail-refund",
  );
});

