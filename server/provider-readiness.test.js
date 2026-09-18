import assert from "node:assert/strict";
import test from "node:test";
import { MODEL_DEPLOYMENTS } from "./model-catalog.js";
import {
  buildReadinessRecord,
  readinessStatus,
  runProviderReadinessChecks,
  sanitizeProviderError,
} from "./provider-readiness.js";

const ENV_NAMES = [
  "KLING_ACCESS_KEY",
  "KLING_SECRET_KEY",
  "KLING_BASE_URL",
  "IMAGE2_API_KEY",
  "IMAGE2_BASE_URL",
  "IMAGE2_MODEL",
  "IMAGE2_AUTH_TYPE",
  "IMAGE2_ENABLED",
  "VAPEUR_API_KEY",
  "VAPEUR_BASE_URL",
  "VAPEUR_TEXT_MODEL",
  "VAPEUR_IMAGE_MODEL",
  "VAPEUR_GEMINI_FAST_MODEL",
  "VAPEUR_GEMINI_PRO_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "MINIMAX_API_KEY",
  "MINIMIX_API_KEY",
  "MINIMAX_VIDEO_BASE_URL",
  "VOLCENGINE_ENDPOINT_ID",
  "VOLCENGINE_ARK_API_KEY",
  "VOLCENGINE_ACCESS_KEY_ID",
  "VOLCENGINE_SECRET_ACCESS_KEY",
];

async function withEnvironment(overrides, action) {
  const previous = new Map(ENV_NAMES.map((name) => [name, process.env[name]]));
  try {
    for (const name of ENV_NAMES) delete process.env[name];
    for (const [name, value] of Object.entries(overrides))
      process.env[name] = value;
    return await action();
  } finally {
    for (const name of ENV_NAMES) {
      const oldValue = previous.get(name);
      if (oldValue === undefined) delete process.env[name];
      else process.env[name] = oldValue;
    }
  }
}

test("sanitizes endpoints and credential-shaped values from provider errors", () => {
  const oldKey = process.env.PROVIDER_READINESS_TEST_API_KEY;
  process.env.PROVIDER_READINESS_TEST_API_KEY = "sk-super-secret-value";
  try {
    const result = sanitizeProviderError(
      "request https://gateway.example/v1 failed; Authorization: Bearer abc.def.ghi; api_key=sk-super-secret-value",
    );
    assert.equal(result.includes("gateway.example"), false);
    assert.equal(result.includes("sk-super-secret-value"), false);
    assert.equal(result.includes("abc.def.ghi"), false);
    assert.match(result, /\[ENDPOINT\]/);
    assert.match(result, /\[REDACTED\]/);
  } finally {
    if (oldKey === undefined) delete process.env.PROVIDER_READINESS_TEST_API_KEY;
    else process.env.PROVIDER_READINESS_TEST_API_KEY = oldKey;
  }
});

test("maps deployment health without turning unknown model visibility into healthy", () => {
  assert.equal(
    readinessStatus({
      configured: true,
      authenticated: true,
      modelAvailable: true,
      ready: true,
    }),
    "HEALTHY",
  );
  assert.equal(
    readinessStatus({
      configured: true,
      authenticated: true,
      modelAvailable: null,
      ready: true,
    }),
    "DEGRADED",
  );
  assert.equal(
    readinessStatus({
      configured: true,
      authenticated: true,
      modelAvailable: false,
      ready: false,
    }),
    "UNAVAILABLE",
  );

  const model = MODEL_DEPLOYMENTS.find((entry) => entry.id === "deepseek-v4-pro");
  const record = buildReadinessRecord(model, {
    configured: true,
    authenticated: true,
    ready: true,
    modelVisibility: "list",
    models: ["another-model"],
    checkedAt: "2026-08-04T00:00:00.000Z",
    latencyMs: 12,
  });
  assert.equal(record.modelAvailable, false);
  assert.equal(record.ready, false);
  assert.equal(record.status, "UNAVAILABLE");
  assert.equal(record.lastErrorCode, "MODEL_NOT_AVAILABLE");
});

test("returns one unavailable record per deployment without network calls when unconfigured", async () => {
  await withEnvironment({}, async () => {
    let calls = 0;
    const records = await runProviderReadinessChecks({
      fetchImpl: async () => {
        calls += 1;
        throw new Error("fetch should not run");
      },
      now: () => new Date("2026-08-04T00:00:00.000Z"),
    });

    assert.equal(calls, 0);
    assert.equal(records.length, MODEL_DEPLOYMENTS.length);
    assert.equal(records.every((record) => record.status === "UNAVAILABLE"), true);
    assert.equal(records.every((record) => record.checkedAt === "2026-08-04T00:00:00.000Z"), true);
  });
});

test("runs only read-only provider probes and expands provider results per deployed model", async () => {
  await withEnvironment(
    {
      KLING_ACCESS_KEY: "test-access-key",
      KLING_SECRET_KEY: "test-secret-key",
      KLING_BASE_URL: "https://kling.readiness.test",
      IMAGE2_API_KEY: "test-image-key",
      IMAGE2_BASE_URL: "https://image.readiness.test/v1",
      IMAGE2_MODEL: "gpt-image-2",
      IMAGE2_ENABLED: "true",
      VAPEUR_API_KEY: "test-vapeur-key",
      VAPEUR_BASE_URL: "https://vapeur.readiness.test/v1",
      VAPEUR_TEXT_MODEL: "gpt-5.5",
      VAPEUR_IMAGE_MODEL: "gpt-image-2",
      VAPEUR_GEMINI_FAST_MODEL: "gemini-3.5-flash",
      VAPEUR_GEMINI_PRO_MODEL: "gemini-3.1-pro-preview",
      DEEPSEEK_API_KEY: "test-deepseek-key",
      DEEPSEEK_BASE_URL: "https://deepseek.readiness.test/v1",
      DEEPSEEK_MODEL: "deepseek-v4-pro",
      MINIMAX_API_KEY: "test-minimax-key",
    },
    async () => {
      const calls = [];
      const fetchImpl = async (url, options = {}) => {
        calls.push({ url: String(url), method: options.method || "GET", body: options.body });
        if (String(url).includes("kling.readiness.test"))
          return new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 });
        if (String(url).includes("image.readiness.test"))
          return new Response(JSON.stringify({ data: [{ id: "gpt-image-2" }] }), {
            status: 200,
          });
        if (String(url).includes("vapeur.readiness.test"))
          return new Response(
            JSON.stringify({
              data: [
                { id: "gpt-image-2" },
                { id: "gpt-5.5" },
                { id: "gemini-3.5-flash" },
              ],
            }),
            { status: 200 },
          );
        if (String(url).includes("deepseek.readiness.test"))
          return new Response(JSON.stringify({ data: [{ id: "deepseek-v4-pro" }] }), {
            status: 200,
          });
        if (String(url).includes("api.minimaxi.com"))
          return String(url).includes("/v2/query/video_generation")
            ? new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
            : new Response(JSON.stringify({ base_resp: { status_code: 0 } }), {
                status: 200,
              });
        throw new Error("unexpected endpoint");
      };

      const records = await runProviderReadinessChecks({
        fetchImpl,
        now: () => new Date("2026-08-04T00:00:00.000Z"),
      });
      const byId = new Map(records.map((record) => [record.modelId, record]));

      assert.equal(calls.length, 6);
      assert.equal(
        calls.every(
          (call) =>
            call.method === "GET" ||
            !/video_generation|chat\/completions|t2a_v2|voice_clone/.test(call.url),
        ),
        true,
      );
      assert.equal(calls.find((call) => call.url.includes("kling"))?.method, "GET");
      assert.equal(calls.find((call) => call.url.includes("minimaxi"))?.method, "POST");
      assert.equal(
        calls.find((call) => call.url.includes("minimaxi"))?.body,
        JSON.stringify({ voice_type: "all" }),
      );
      assert.equal(byId.get("kling-v3")?.status, "DEGRADED");
      assert.equal(byId.get("kling-v3")?.modelAvailable, null);
      assert.equal(byId.get("gpt-image-2")?.status, "HEALTHY");
      assert.equal(byId.get("deepseek-v4-pro")?.status, "HEALTHY");
      assert.equal(byId.get("speech-2.8-hd")?.status, "DEGRADED");
      assert.equal(byId.get("minimax-h3")?.status, "DEGRADED");
      assert.equal(byId.get("minimax-h3")?.authenticated, true);
      assert.equal(byId.get("vapeur-gemini-3.1-pro")?.status, "UNAVAILABLE");
      assert.equal(
        byId.get("vapeur-gemini-3.1-pro")?.lastErrorCode,
        "MODEL_NOT_AVAILABLE",
      );

      for (const record of records) {
        assert.equal(Object.hasOwn(record, "endpoint"), false);
        assert.equal(JSON.stringify(record).includes("test-vapeur-key"), false);
      }
    },
  );
});

