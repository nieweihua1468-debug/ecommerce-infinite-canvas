import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createKlingToken } from "../server/kling.js";
import {
  checkVolcengineConnection,
  getVolcengineStatus,
} from "../server/volcengine.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.local"), override: true, quiet: true });

const value = (name) => String(process.env[name] || "").trim();
const checkedAt = () => new Date().toISOString();
const debug = process.env.PROVIDER_DEBUG === "1";

async function httpProbe({
  name,
  configured,
  url,
  method = "GET",
  headers,
  body,
  targetModel,
  validate,
}) {
  if (!configured)
    return {
      name,
      configured: false,
      authenticated: false,
      ready: false,
      modelAvailable: false,
      status: "not_configured",
      checkedAt: checkedAt(),
    };
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => null);
    const authenticated = ![401, 403].includes(response.status);
    const validatorReady = validate ? validate(payload, response) : response.ok;
    const models = Array.isArray(payload?.data) ? payload.data : [];
    const availableModels = models
      .map((model) => String(model?.id || model?.model || ""))
      .filter(Boolean)
      .slice(0, 60);
    const modelAvailable = targetModel
      ? models.some((model) => String(model?.id || model?.model || "") === targetModel)
      : null;
    return {
      name,
      configured: true,
      authenticated,
      ready: response.ok && validatorReady && modelAvailable !== false,
      modelAvailable,
      httpStatus: response.status,
      status: response.ok && validatorReady ? "reachable" : "rejected",
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt: checkedAt(),
      ...(debug
        ? {
            availableModels,
            responseKeys:
              payload && typeof payload === "object"
                ? Object.keys(payload).slice(0, 20)
                : [],
            errorCode: String(payload?.error?.code || payload?.code || ""),
            errorType: String(payload?.error?.type || ""),
          }
        : {}),
    };
  } catch (error) {
    return {
      name,
      configured: true,
      authenticated: false,
      ready: false,
      modelAvailable: null,
      status: error?.name === "TimeoutError" ? "timeout" : "network_error",
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt: checkedAt(),
    };
  }
}

const klingConfigured = Boolean(value("KLING_ACCESS_KEY") && value("KLING_SECRET_KEY"));
const image2Configured = Boolean(value("IMAGE2_API_KEY") && value("IMAGE2_BASE_URL"));
const vapeurConfigured = Boolean(value("VAPEUR_API_KEY") && value("VAPEUR_BASE_URL"));
const deepSeekConfigured = Boolean(value("DEEPSEEK_API_KEY") && value("DEEPSEEK_BASE_URL"));
const miniMaxConfigured = Boolean(value("MINIMAX_API_KEY"));

const image2Base = value("IMAGE2_BASE_URL").replace(/\/$/, "");
const image2Azure =
  value("IMAGE2_AUTH_TYPE").toLowerCase() === "azure" ||
  /\.services\.ai\.azure\.com|\.openai\.azure\.com/i.test(image2Base);

const probes = await Promise.all([
  httpProbe({
    name: "Kling",
    configured: klingConfigured,
    url: `${value("KLING_BASE_URL").replace(/\/$/, "")}/v1/general/presets-voices?pageNum=1&pageSize=1`,
    headers: klingConfigured
      ? { Authorization: `Bearer ${createKlingToken()}` }
      : undefined,
    validate: (payload) => !payload?.code || String(payload.code) === "0",
  }),
  httpProbe({
    name: "Image2",
    configured: image2Configured,
    url: `${image2Base}/models`,
    headers: image2Azure
      ? { "api-key": value("IMAGE2_API_KEY") }
      : { Authorization: `Bearer ${value("IMAGE2_API_KEY")}` },
    targetModel: value("IMAGE2_MODEL"),
  }),
  httpProbe({
    name: "Vapeur",
    configured: vapeurConfigured,
    url: `${value("VAPEUR_BASE_URL").replace(/\/$/, "")}/models`,
    headers: { Authorization: `Bearer ${value("VAPEUR_API_KEY")}` },
  }),
  httpProbe({
    name: "DeepSeek",
    configured: deepSeekConfigured,
    url: `${value("DEEPSEEK_BASE_URL").replace(/\/$/, "")}/models`,
    headers: { Authorization: `Bearer ${value("DEEPSEEK_API_KEY")}` },
    targetModel: value("DEEPSEEK_MODEL"),
  }),
  httpProbe({
    name: "MiniMax",
    configured: miniMaxConfigured,
    url: "https://api.minimaxi.com/v1/get_voice",
    method: "POST",
    headers: {
      Authorization: `Bearer ${value("MINIMAX_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: { voice_type: "all" },
    validate: (payload, response) =>
      response.ok && Number(payload?.base_resp?.status_code || 0) === 0,
  }),
]);

await checkVolcengineConnection();
const volcengine = getVolcengineStatus();
probes.push({
  name: "Volcengine / Seedance",
  configured: Boolean(volcengine.configured),
  authenticated: Boolean(volcengine.ready),
  ready: Boolean(volcengine.ready),
  modelAvailable: Boolean(volcengine.ready),
  status: String(volcengine.status || "unknown"),
  checkedAt: volcengine.checkedAt || checkedAt(),
});

for (const probe of probes) {
  const detail = [
    `configured=${probe.configured}`,
    `authenticated=${probe.authenticated}`,
    `ready=${probe.ready}`,
    probe.modelAvailable == null ? null : `model=${probe.modelAvailable}`,
    probe.httpStatus ? `http=${probe.httpStatus}` : null,
    probe.latencyMs == null ? null : `latency=${probe.latencyMs}ms`,
    `status=${probe.status}`,
  ]
    .filter(Boolean)
    .join(" ");
  console.log(`${probe.ready ? "PASS" : "FAIL"}  ${probe.name}: ${detail}`);
  if (debug && probe.availableModels)
    console.log(
      `      models=${JSON.stringify(probe.availableModels)} keys=${JSON.stringify(probe.responseKeys || [])} errorCode=${probe.errorCode || "-"} errorType=${probe.errorType || "-"}`,
    );
}

console.log("\nPaid/generation/task calls: 0");
if (probes.some((probe) => !probe.ready)) process.exitCode = 1;

