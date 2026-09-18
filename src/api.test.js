import assert from "node:assert/strict";
import test from "node:test";

import {
  api,
  configuredImageGenerationModels,
  mediaAnalysisTaskMatches,
  selectImageGenerationModel,
} from "./api.js";
import { adminApi, adminSession } from "./adminApi.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

function installBrowserMocks() {
  const events = [];
  globalThis.localStorage = memoryStorage();
  globalThis.sessionStorage = memoryStorage();
  globalThis.window = {
    dispatchEvent: (event) => {
      events.push(event);
      return true;
    },
  };
  return events;
}

test("selects an available image provider and falls back from Azure to Vapeur", () => {
  const models = [
    {
      id: "gpt-image-2",
      name: "GPT Image 2 · Azure",
      kind: "image",
      configured: false,
    },
    {
      id: "vapeur-gpt-image-2",
      name: "GPT Image 2 · Vapeur",
      kind: "image",
      configured: true,
    },
  ];
  assert.deepEqual(
    configuredImageGenerationModels(models).map((model) => model.id),
    ["vapeur-gpt-image-2"],
  );
  assert.equal(
    selectImageGenerationModel(models, {}, "gpt-image-2")?.id,
    "vapeur-gpt-image-2",
  );
});

test("validates media-analysis identity before restoring a task", () => {
  const task = {
    id: "task-1",
    idempotencyKey: "request-1",
    inputFingerprint: "fingerprint-1",
    fileName: "video.mp4",
    model: "vapeur-gemini-3.1-pro",
    targetType: "image",
    frameLimit: 18,
  };
  assert.equal(mediaAnalysisTaskMatches(task, { ...task, taskId: task.id }), true);
  assert.equal(
    mediaAnalysisTaskMatches(task, {
      taskId: task.id,
      idempotencyKey: "another-request",
      inputFingerprint: task.inputFingerprint,
    }),
    true,
  );
  assert.equal(
    mediaAnalysisTaskMatches(task, {
      taskId: task.id,
      inputFingerprint: "another-video",
    }),
    false,
  );
});

test("capability discovery uses the user session while public health stays callable", async () => {
  installBrowserMocks();
  localStorage.setItem("commerce-canvas_user_token", "user-session-token");
  const requests = [];
  globalThis.fetch = async (path, options) => {
    requests.push({ path, options });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await api.capabilities();
  localStorage.removeItem("commerce-canvas_user_token");
  await api.health();

  assert.equal(requests[0].path, "/api/capabilities");
  assert.equal(
    requests[0].options.headers.Authorization,
    "Bearer user-session-token",
  );
  assert.equal(requests[1].path, "/api/health");
  assert.equal(requests[1].options.headers.Authorization, undefined);
});

test("inspiration requests forward cancellation to fetch", async () => {
  installBrowserMocks();
  localStorage.setItem("commerce-canvas_user_token", "user-session-token");
  const controller = new AbortController();
  let received;
  globalThis.fetch = async (path, options) => {
    received = { path, options };
    return new Response(JSON.stringify({ kind: "video", items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await api.inspirations({
    kind: "video",
    page: 1,
    pageSize: 16,
    signal: controller.signal,
  });

  assert.match(received.path, /kind=video/);
  assert.match(received.path, /pageSize=16/);
  assert.equal(received.options.signal, controller.signal);
});

test("bootstrap and activity refreshes request bounded record sets", async () => {
  installBrowserMocks();
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await api.bootstrap();
  await api.tasks();
  await api.workflowRuns({ ids: ["run-1", "run-2"] });
  await api.tasks({ all: true });

  assert.equal(
    paths[0],
    "/api/bootstrap?taskLimit=40&runLimit=30&view=summary",
  );
  assert.equal(paths[1], "/api/tasks?limit=80&view=summary");
  assert.match(paths[2], /^\/api\/workflow-runs\?limit=60&ids=run-1%2Crun-2$/);
  assert.equal(paths[3], "/api/tasks");
});

test("user API preserves failure details and emits one session-expired event", async () => {
  const events = installBrowserMocks();
  localStorage.setItem("commerce-canvas_user_token", "expired-user-token");
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        message: "登录已失效",
        code: "TOKEN_REVOKED",
        failure: { category: "auth", retryable: false },
      }),
      { status: 401, headers: { "content-type": "application/json" } },
    );

  await assert.rejects(api.bootstrap(), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.code, "TOKEN_REVOKED");
    assert.deepEqual(error.failure, { category: "auth", retryable: false });
    return true;
  });
  assert.equal(localStorage.getItem("commerce-canvas_user_token"), null);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "commerce-canvas:session-expired");

  await assert.rejects(api.tasks());
  assert.equal(events.length, 1);
});

test("admin API preserves failure details and clears an expired session", async () => {
  const events = installBrowserMocks();
  adminSession.set("expired-admin-token");
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        message: "管理员登录已失效",
        code: "ADMIN_TOKEN_REVOKED",
        failure: { category: "auth", retryable: false },
      }),
      { status: 401, headers: { "content-type": "application/json" } },
    );

  await assert.rejects(adminApi.me(), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.code, "ADMIN_TOKEN_REVOKED");
    assert.deepEqual(error.failure, { category: "auth", retryable: false });
    return true;
  });
  assert.equal(adminSession.get(), null);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "commerce-canvas:admin-session-expired");
});

