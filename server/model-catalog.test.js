import test from "node:test";
import assert from "node:assert/strict";
import { buildModelCatalog } from "./model-catalog.js";

test("keeps configured models available until a readiness check exists", () => {
  const models = buildModelCatalog({
    providerConfigured: { kling: true, vapeur: true },
  });
  assert.equal(models.find((model) => model.id === "kling-v3").configured, true);
  assert.equal(
    models.find((model) => model.id === "kling-v3").deploymentStatus,
    "UNKNOWN",
  );
  assert.equal(models.find((model) => model.id === "nano-banana").configured, false);
});

test("turns a failed provider model into an unavailable user option", () => {
  const models = buildModelCatalog({
    providerConfigured: { vapeur: true },
    readinessRecords: [
      {
        modelId: "vapeur-gpt-5.5",
        ready: false,
        authenticated: false,
        modelAvailable: false,
        checkedAt: "2026-08-04T00:00:00.000Z",
      },
    ],
  });
  const model = models.find((entry) => entry.id === "vapeur-gpt-5.5");
  assert.equal(model.configured, false);
  assert.equal(model.deploymentStatus, "UNAVAILABLE");
  assert.equal(model.badge, "暂不可用");
});

test("includes MiniMax-H3 in the deployed video model catalog", () => {
  const models = buildModelCatalog({ providerConfigured: { minimax: true } });
  const h3 = models.find((model) => model.id === "minimax-h3");
  assert.deepEqual(
    {
      provider: h3?.provider,
      kind: h3?.kind,
      configured: h3?.configured,
      deploymentStatus: h3?.deploymentStatus,
    },
    {
      provider: "minimax",
      kind: "video",
      configured: true,
      deploymentStatus: "UNKNOWN",
    },
  );
});

