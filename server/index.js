import { sessionSecret as signingSecret, assertProductionConfiguration } from "./session-secret.js";
import "dotenv/config";
import dotenv from "dotenv";
import express from "express";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  createAdvancedElement,
  createCustomVoice,
  getAdvancedElement,
  getVideoTask,
  isConfigured,
  listAdvancedElements,
  listCustomVoices,
  listPresetElements,
  listPresetVoices,
  normalizeKlingTask,
  submitMotionControl,
  submitOmniVideo,
  submitTurboImageToVideo,
  submitVideo,
} from "./kling.js";
import {
  DEFAULT_PROMPT_FRAMEWORK,
  generateWorkflowText,
  isDeepSeekConfigured,
} from "./deepseek.js";
import {
  generateImage2,
  getImage2Status,
  isImage2Configured,
  isVapeurImageConfigured,
  prepareKlingFrame,
  prepareSeedanceImage,
  readImageDimensions,
} from "./image2.js";
import { centeredCropForAspectRatio } from "./image-aspect.js";
import {
  generateVapeurWorkflowText,
  getVapeurStatus,
  isVapeurConfigured,
  refineVapeurPrompt,
} from "./vapeur.js";
import { analyzeWorkflowMedia } from "./media-analysis.js";
import {
  authenticateAdmin,
  isAdminConfigured,
  issueAdminToken,
  issueLocalAdminToken,
  requireAdmin,
} from "./admin.js";
import {
  hashPassword,
  issueUserToken,
  requireUser,
  verifyPassword,
} from "./auth.js";
import { readTraffic, recordTraffic, summarizeTraffic } from "./analytics.js";
import {
  checkVolcengineConnection,
  createAsset,
  createAssetGroup,
  getAsset,
  getAssetGroup,
  getSeedanceTask,
  getVolcengineStatus,
  hasVolcengineCredentials,
  normalizeSeedanceTask,
  submitSeedanceVideo,
  waitForAssetActive,
} from "./volcengine.js";
import {
  buildMiniMaxVideoRequest,
  getMiniMaxVideoTask,
  isMiniMaxVideoConfigured,
  normalizeMiniMaxVideoTask,
  submitMiniMaxVideo,
} from "./minimax-video.js";
import { mutateCollection, readCollection } from "./store.js";
import { apiNotFound } from "./api-not-found.js";
import {
  findHotRankMediaPath,
  getHotRankSnapshot,
  hotRankMediaUrl,
  hotRankPosterFileName,
  hotRankPreviewFileName,
  hotRankSource,
  readHotRankManifest,
  verifyHotRankMediaTicket,
} from "./hot-rank.js";
import {
  buildHotRankRemakeTemplate,
  normalizeHotRankRemakeConfig,
  publicHotRankRemakeConfig,
} from "./hot-rank-remake.js";
import {
  workflowQueueOptions,
  workflowUserConcurrency,
} from "./workflow-concurrency.js";
import {
  digitalAssetImageBuffer,
  persistDigitalAssetImages,
} from "./digital-asset-storage.js";
import {
  isDigitalAssetKind,
  isDigitalAssetImageCountValid,
  isKlingConvertibleDigitalAssetKind,
} from "./digital-asset-kind.js";
import {
  normalizeSystemVideoAnalysisProfiles,
  normalizeVideoAnalysisProfiles,
  stripSystemVideoAnalysisPresets,
} from "./video-analysis-profiles.js";
import {
  chargeUsagePoints,
  chargeVideoPoints,
  refundUsagePoints,
  refundVideoPoints,
  usagePointCost,
  videoPointCost,
} from "./points.js";
import {
  isPublicTemplate,
  normalizeTemplateAccess,
  templateApprovalStatus,
  templateCreationAccess,
} from "./template-policy.js";
import {
  canReviewTeamTemplate,
  canViewTeamTemplate,
  DEFAULT_TEAM_ID,
  isApprovedTeamTemplate,
  isTeamAdmin,
  isTeamTemplate,
  normalizeTeam,
  safeTeamSummary,
} from "./team-policy.js";
import {
  aggregateTemplateChanges,
  createTemplateRevisionEntry,
  templateRevision,
} from "./template-revisions.js";
import {
  buildTemplateManifest,
  normalizeTemplateManifest,
  templateVersionRef,
} from "../shared/template-manifest.js";
import {
  canExposeTemplateToUser,
  canExposeTemplateAsset,
  canManageTemplate,
  canCreateSharedTemplate,
} from "../shared/template-access.js";
import { QIANCHUAN_SPEAKING_TEMPLATE } from "./qianchuan-speaking-template.js";
import {
  downstreamWorkflowNodeIds,
  normalizeVideoAspectRatio,
  orderedIncomingEdges,
  orderedWorkflowNodes,
  reachableWorkflowNodes,
  reachableWorkflowExecutionNodes,
  terminalWorkflowExecutionNodeIds,
  workflowEdgeMaterialMetadata,
  WORKFLOW_STEP_KINDS,
} from "./workflow-graph.js";
import {
  canDeleteWorkflowRun,
  isWorkflowRunActive,
  normalizeDirectDigitalAssetIds,
  terminateWorkflowRunRecord,
} from "./workflow-run-policy.js";
import {
  loadWorkflowRuntimeAssets,
  materializeWorkflowRuntimeAssets,
  mergeWorkflowRuntimeAssets,
  persistWorkflowRuntimeAsset,
  persistWorkflowRuntimeAssetFile,
  persistWorkflowRuntimeAssets,
  publicWorkflowRuntimeAssets,
  workflowRuntimeAssetBuffer,
} from "./workflow-runtime-assets.js";
import {
  hasDirectSeedanceFaceConnection,
  includeRequiredTrustedPersonAssets,
  injectTrustedPersonAssetNodes,
  mergeTrustedPersonGroupIds,
  resolveWorkflowAssetUri,
  uniqueTrustedAssetUris,
} from "./trusted-person-workflow.js";
import {
  isVideoAudioSource,
  normalizeSeedanceAudio,
} from "./audio-normalize.js";
import { normalizeSeedanceVideo } from "./video-normalize.js";
import {
  restoreVideoRecoveryInput,
  startupRecoveryAction,
  videoRecoveryAssets,
  videoRecoveryInput,
} from "./video-task-recovery.js";
import { seedanceSubmissionImage } from "./seedance-person-policy.js";
import {
  canonicalSeedanceAssetId,
  isNoFaceAssetError,
  isSeedancePrivacyImageError,
  uniqueSeedanceAssets,
} from "./seedance-trusted-recovery.js";
import {
  generationErrorDetails,
  generationErrorMessage,
} from "./generation-error-message.js";
import {
  probeMediaDuration,
  splitMotionReference,
  stitchMotionResults,
} from "./motion-control-long.js";
import {
  redactExternalRequestFields,
  readExternalMedia,
  validateExternalCallbackUrl,
  validateExternalMediaUrl,
} from "./safe-external-media.js";
import {
  validatePasswordChangeInput,
  validateRegistrationInput,
} from "./register-validation.js";
import {
  createMediaAnalysisTaskRecord,
  failInterruptedMediaAnalysisTask,
  mediaAnalysisInputFingerprint,
  MEDIA_ANALYSIS_ACTIVE_STATUSES,
  patchMediaAnalysisTask,
  publicMediaAnalysisTask,
} from "./media-analysis-task.js";
import {
  hasValidGeneratedAccess,
  isTemplateCoverFile,
  signGeneratedUrls,
  signedGeneratedUrl,
} from "./generated-access.js";
import {
  hasTemplateAccess,
  isPlatformAdmin,
  normalizeLegacyAccountType,
  recentFailureStats,
  todayGenerationStats,
} from "./admin-visibility.js";
import { assertWorkflowProjectAssetFiles } from "./workflow-project-media-policy.js";
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
import {
  normalizeInspirationGenerationConfig,
} from "./inspiration-generation-config.js";
import {
  createDetailPageTemplates,
  DETAIL_PAGE_CATEGORY_TREE,
  DETAIL_PAGE_PLATFORMS,
  normalizeDetailPageTemplateOverride,
} from "./detail-page-templates.js";
import {
  customBrandInvocationForTemplate,
  composeCustomBrandLockedPrompt,
} from "./custom-brand-detail-page-templates.js";
import {
  createOutfitImageTemplates,
  OUTFIT_CATEGORY_TREE,
  OUTFIT_PLATFORMS,
} from "./outfit-image-templates.js";
import {
  assertWorkflowDigitalAssets,
  splitKlingOmniDigitalAssets,
  visibleDigitalAssets,
} from "./workflow-digital-assets.js";
import { createWorkQueue } from "./work-queue.js";
import { allowsLocalAdminSession } from "./local-development.js";
import {
  buildWorkflowRecoveryInput,
  findWorkflowVideoTask,
  oldestWorkflowRunsFirst,
  shouldReuseWorkflowStep,
} from "./restart-recovery.js";
import {
  summarizeGenerationTimes,
  timingPatch,
  withGenerationTiming,
  withWorkflowGenerationTiming,
} from "./generation-time.js";
import { MODEL_DEPLOYMENTS, buildModelCatalog } from "./model-catalog.js";
import {
  buildApiMetrics,
  buildModelDeployments,
} from "./model-deployments.js";
import {
  runProviderReadinessChecks,
  sanitizeProviderError,
} from "./provider-readiness.js";
import {
  ACCOUNT_RECORD_COLLECTIONS,
  anonymizeMcpAudit,
  anonymizePointLedger,
  generatedFileNames,
  removeAccountRecords,
  removeUnreferencedStoredFiles,
  storageBlobIds,
} from "./account-cascade.js";
import {
  publicHealthPayload,
  safeHttpErrorMessage,
  securityResponseHeaders,
} from "./http-security.js";
import { registerHealthRoutes } from "./health-routes.js";
import { installJsonBodyProtection } from "./json-body-protection.js";
import {
  bearerTokenFromRequest,
  createMcpService,
  isAllowedMcpOrigin,
  MCP_PROTOCOL_VERSIONS,
  mcpEndpointForRequest,
} from "./mcp.js";

import { GRID_SPLIT_LIMITS, splitImageGrid } from "./grid-split.js";
import {
  parseRecordIds,
  parseRecordLimit,
  selectRecentRecords,
} from "./recent-records.js";
import {
  summarizeTaskForList,
  summarizeWorkflowRunForList,
} from "./record-summary.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_INFO = await fs
  .readFile(path.join(here, "..", "release.json"), "utf8")
  .then((content) => JSON.parse(content))
  .catch(() => ({ version: "0.0.0", build: 0, label: "development" }));
const execFileAsync = promisify(execFile);
dotenv.config({
  path: path.join(here, "..", ".env.local"),
  override: true,
  quiet: true,
});

assertProductionConfiguration();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
process.umask(0o077);
app.use((req, res, next) => {
  res.set(
    securityResponseHeaders({
      secure: req.secure,
      nodeEnv: process.env.NODE_ENV,
    }),
  );
  next();
});
const port = Number(process.env.PORT || 8791);
const generatedDir = path.join(here, "..", "data", "generated");
const configuredPublicBaseUrl = () =>
  String(
    process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8791",
  ).replace(/\/+$/, "");
const digitalAssetBlobDir = path.join(
  here,
  "..",
  "data",
  "digital-assets",
  "blobs",
);
const workflowAssetBlobDir = path.join(
  here,
  "..",
  "data",
  "workflow-assets",
  "blobs",
);
const MINIMAX_TTS_MODELS = new Set([
  "speech-2.8-hd",
  "speech-2.8-turbo",
  "speech-2.6-hd",
  "speech-2.6-turbo",
  "speech-02-hd",
  "speech-02-turbo",
  "speech-01-hd",
  "speech-01-turbo",
]);
const SYSTEM_MINIMAX_VOICES = [
  { id: "male-qn-qingse", name: "青涩男声", source: "system" },
  { id: "female-shaonv", name: "少女音", source: "system" },
  { id: "female-yujie", name: "御姐音", source: "system" },
  { id: "male-qn-jingying", name: "精英男声", source: "system" },
];
const inspirationAssetsDir = path.join(
  here,
  "..",
  "data",
  "inspiration-assets",
);
const activePolls = new Set();
const workflowRunQueues = new Map();
const terminatedWorkflowRuns = new Set();
const trustedPersonAssetJobs = new Map();
const mediaAnalysisJobs = new Map();
const availableCpuCount =
  typeof os.availableParallelism === "function"
    ? os.availableParallelism()
    : os.cpus().length;
const deviceSafeConcurrency = Math.max(
  2,
  Math.min(
    4,
    availableCpuCount,
    Math.max(2, Math.floor(os.totalmem() / (768 * 1024 * 1024))),
  ),
);
const scheduleWorkflowWork = createWorkQueue(
  Number(process.env.WORKFLOW_GENERATION_CONCURRENCY || deviceSafeConcurrency),
);
const scheduleImageWork = createWorkQueue(
  Number(process.env.IMAGE_GENERATION_CONCURRENCY || deviceSafeConcurrency),
);
const seedanceCallbackSecret = () =>
  String(
    process.env.VOLCENGINE_CALLBACK_SECRET ||
      process.env.USER_AUTH_SECRET ||
      process.env.GENERATION_AUTH_SECRET ||
      "",
  );
const seedanceCallbackToken = (taskId) =>
  createHmac("sha256", seedanceCallbackSecret())
    .update(`seedance-callback:${taskId}`)
    .digest("hex");
const seedanceCallbackUrl = (taskId) => {
  if (!seedanceCallbackSecret()) return "";
  const baseUrl = String(
    process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8791",
  ).replace(/\/$/, "");
  return `${baseUrl}/api/providers/volcengine/callback/${encodeURIComponent(taskId)}?token=${seedanceCallbackToken(taskId)}`;
};
const SEEDANCE_SUBMISSION_RECONCILE_MS = Math.max(
  60_000,
  Number(process.env.VOLCENGINE_SUBMISSION_RECONCILE_MS || 15 * 60_000),
);
const SEEDANCE_UPLOAD_LIMITS = {
  image: 48 * 1024 * 1024,
  video: 60 * 1024 * 1024,
  audio: 30 * 1024 * 1024,
  audioVideo: 60 * 1024 * 1024,
  total: 96 * 1024 * 1024,
};
const decodedMediaBytes = (value) => {
  const payload = String(value || "").replace(/\s+/g, "");
  if (!payload) return 0;
  return Math.max(
    0,
    Math.floor((payload.length * 3) / 4) -
      (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0),
  );
};
const providerMediaUrlOptions = () => ({
  publicBaseUrl: configuredPublicBaseUrl(),
});
const validateProviderMediaUrls = async (values) => {
  const urls = [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];
  await Promise.all(
    urls.map((url) => validateExternalMediaUrl(url, providerMediaUrlOptions())),
  );
  return urls;
};
const safeProviderCallbackUrl = async (value) => {
  const input = String(value || "").trim();
  if (!input) return "";
  return (
    await validateExternalCallbackUrl(input, {
      publicBaseUrl: configuredPublicBaseUrl(),
    })
  ).href;
};
const miniMaxContentMediaUrls = (content) =>
  (Array.isArray(content) ? content : [])
    .filter((entry) =>
      ["image_url", "video_url", "audio_url"].includes(
        String(entry?.type || ""),
      ),
    )
    .map((entry) => {
      const media = entry?.[entry.type];
      return entry?.url ??
        (media && typeof media === "object" ? media.url : media);
    })
    .filter(Boolean);
const workflowAssetUploadToken = (userId, asset) =>
  createHmac(
    "sha256",
    `${signingSecret()}:workflow-asset-upload`,
  )
    .update(
      `${userId}:${asset.blobId}:${asset.size}:${asset.mimeType}:${asset.source || ""}`,
    )
    .digest("base64url");
const validWorkflowAssetUpload = (userId, asset) => {
  const expected = Buffer.from(workflowAssetUploadToken(userId, asset));
  const received = Buffer.from(String(asset?.uploadToken || ""));
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
};
const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)}MB`;
const mediaLimitError = (label, name, maxBytes) =>
  Object.assign(
    new Error(
      `${label}${name ? ` ${name}` : ""}超过 API 限制，请压缩到 ${mb(maxBytes)} 以内后再上传。`,
    ),
    { status: 413 },
  );
function assertBase64MediaLimit(
  value,
  { label = "素材", name = "", maxBytes },
) {
  if (decodedMediaBytes(value) > maxBytes)
    throw mediaLimitError(label, name, maxBytes);
}
function assertImageReferencesWithinApiLimit(
  referenceImages = [],
  maxBytes = 24 * 1024 * 1024,
) {
  for (const [index, image] of (Array.isArray(referenceImages)
    ? referenceImages
    : []
  ).entries())
    assertBase64MediaLimit(image?.data, {
      label: "参考图片",
      name: image?.name || String(index + 1),
      maxBytes,
    });
}
function workflowUsesSeedanceOnly(nodes = []) {
  const executable = nodes.filter((node) =>
    WORKFLOW_STEP_KINDS.has(node.data?.kind),
  );
  const generated = executable.filter((node) =>
    ["image", "audio-generation", "video", "media-analysis"].includes(
      node.data?.kind,
    ),
  );
  return (
    generated.length > 0 &&
    generated.every(
      (node) =>
        node.data?.kind === "video" &&
        SEEDANCE_MODELS.has(String(node.data?.model || "")),
    )
  );
}
const adminLoginAttempts = new Map();
const userLoginAttempts = new Map();
const LOGIN_ATTEMPT_LIMIT = 6;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60_000;

const loginAttemptKey = (req, principal = "") => {
  const identity = createHmac(
    "sha256",
    `${signingSecret()}:login-rate-limit`,
  )
    .update(String(principal || "anonymous").trim().toLowerCase())
    .digest("base64url")
    .slice(0, 20);
  return `${req.ip || "local"}:${identity}`;
};

const loginAttemptState = (attempts, key, now = Date.now()) => {
  const current = attempts.get(key) || {
    count: 0,
    resetAt: now + LOGIN_ATTEMPT_WINDOW_MS,
  };
  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + LOGIN_ATTEMPT_WINDOW_MS;
  }
  return current;
};

const assertLoginAllowed = (attempts, key) => {
  const current = loginAttemptState(attempts, key);
  if (current.count >= LOGIN_ATTEMPT_LIMIT)
    throw Object.assign(new Error("登录尝试过多，请 15 分钟后再试"), {
      status: 429,
    });
  return current;
};

const recordLoginFailure = (attempts, key, current) => {
  current.count += 1;
  attempts.set(key, current);
};

const SYSTEM_TEMPLATES = [];

const ensureQianchuanSpeakingTemplate = async () => {
  await mutateCollection("templates", (templates) => {
    if (
      !templates.some(
        (template) => template.id === QIANCHUAN_SPEAKING_TEMPLATE.id,
      )
    )
      return [structuredClone(QIANCHUAN_SPEAKING_TEMPLATE), ...templates];
    return templates.map((template) => {
      if (template.id !== QIANCHUAN_SPEAKING_TEMPLATE.id) return template;
      const defaultNodes = new Map(
        QIANCHUAN_SPEAKING_TEMPLATE.nodes.map((node) => [node.id, node]),
      );
      const existingNodeIds = new Set(
        (template.nodes || []).map((node) => node.id),
      );
      const existingEdgeIds = new Set(
        (template.edges || []).map((edge) => edge.id),
      );
      const legacyMaterialPositions = new Map([
        ["qc-brand-brief", { x: 20, y: 40 }],
        ["qc-person", { x: 20, y: 220 }],
        ["qc-clothing", { x: 20, y: 400 }],
        ["qc-product", { x: 20, y: 580 }],
        ["qc-voice", { x: 20, y: 760 }],
      ]);
      const hasLegacyMaterialStack = [...legacyMaterialPositions].every(
        ([nodeId, position]) => {
          const currentNode = (template.nodes || []).find(
            (node) => node.id === nodeId,
          );
          return (
            Number(currentNode?.position?.x) === position.x &&
            Number(currentNode?.position?.y) === position.y
          );
        },
      );
      const updated = {
        ...template,
        category:
          template.category === "千川素材"
            ? QIANCHUAN_SPEAKING_TEMPLATE.category
            : template.category,
        workflowType: "oral-material",
        revision: Math.max(
          Number(template.revision || 1),
          Number(QIANCHUAN_SPEAKING_TEMPLATE.revision || 1),
        ),
        nodes: [
          ...(template.nodes || []).map((node) => {
            const defaultNode = defaultNodes.get(node.id);
            const remakeGroup = defaultNode?.data?.remakeGroup;
            const migrationData = {
              ...(remakeGroup && !node.data?.remakeGroup
                ? { remakeGroup }
                : {}),
              ...(defaultNode?.data?.backendGenerationPath &&
              !node.data?.backendGenerationPath
                ? {
                    backendGenerationPath:
                      defaultNode.data.backendGenerationPath,
                  }
                : {}),
              ...(defaultNode?.data?.modelConfigPath &&
              !node.data?.modelConfigPath
                ? { modelConfigPath: defaultNode.data.modelConfigPath }
                : {}),
            };
            const migratedPosition =
              hasLegacyMaterialStack && legacyMaterialPositions.has(node.id)
                ? structuredClone(defaultNode?.position || node.position)
                : node.position;
            if (node.id === "qc-voice")
              return {
                ...node,
                position: migratedPosition,
                data: {
                  ...node.data,
                  remakeRequired: false,
                  ...migrationData,
                },
              };
            if (
              node.id === "qc-video" &&
              !String(node.data?.prompt || "").includes("没有参考声音")
            )
              return {
                ...node,
                position: migratedPosition,
                data: {
                  ...node.data,
                  ...migrationData,
                  prompt: `${node.data?.prompt || ""}\n没有参考声音时使用自然清晰的 AI 默认口播。`.trim(),
                },
              };
            if (Object.keys(migrationData).length)
              return {
                ...node,
                position: migratedPosition,
                data: { ...node.data, ...migrationData },
              };
            return migratedPosition === node.position
              ? node
              : { ...node, position: migratedPosition };
          }),
          ...QIANCHUAN_SPEAKING_TEMPLATE.nodes
            .filter((node) => !existingNodeIds.has(node.id))
            .map((node) => structuredClone(node)),
        ],
        edges: [
          ...(template.edges || []),
          ...QIANCHUAN_SPEAKING_TEMPLATE.edges
            .filter((edge) => !existingEdgeIds.has(edge.id))
            .map((edge) => structuredClone(edge)),
        ],
      };
      return {
        ...updated,
        manifest: buildTemplateManifest(updated),
        versionRef: templateVersionRef(updated),
      };
    });
  });
};
const DEFAULT_VIDEO_ANALYSIS_PROFILES = {
  seedance: {
    framework:
      "逐时间段分析完整视频，输出可直接用于 Seedance 2.0 的中文生成提示词。重点还原主体一致性、人物和服装、场景空间、动作时间线、镜头语言、光线色彩、节奏、对白与声音线索；明确每个镜头的时长与衔接，不要虚构不可见信息。",
    presets: [
      {
        id: "shot",
        label: "镜头拆解",
        framework:
          "按时间顺序分析视频，准确提取主体、场景、构图、景别、动作变化、运镜方式、光线、色彩、节奏和转场。保留人物、服装、商品与场景的一致性，输出一整段可直接复刻画面的中文生成提示词，不要解释分析过程。",
      },
      {
        id: "identity",
        label: "人物 / 服装一致性",
        framework:
          "重点分析同一人物的五官、发型、妆容、身材比例、服装颜色、版型、面料、长度、领口、袖口、口袋、配饰，以及这些细节在各镜头中的变化。再补充动作、镜头、场景与光线，输出能最大程度保持人物和服装一致性的完整生成提示词。",
      },
      {
        id: "product",
        label: "商品广告复刻",
        framework:
          "以商品广告复刻为目标，按时间顺序分析商品外观、颜色、结构、材质、Logo可见情况、使用动作、构图、布光、背景、镜头运动和节奏。不得虚构品牌、材质、价格或功效，输出可直接用于生成同类广告画面的完整中文提示词。",
      },
    ],
  },
  kling: {
    framework:
      "逐时间段分析完整视频，输出可直接用于可灵 3.0 / Omni 的中文生成提示词。重点还原主体和数字资产一致性、服装商品细节、分镜时长、人物动作、镜头运动、景别、场景、光线与声音；多镜头按时间顺序清晰描述，不要虚构不可见信息。",
    presets: [
      {
        id: "shot",
        label: "镜头拆解",
        framework:
          "按时间顺序分析视频，准确提取主体、场景、构图、景别、动作变化、运镜方式、光线、色彩、节奏和转场。保留人物、服装、商品与场景的一致性，输出一整段可直接复刻画面的中文生成提示词，不要解释分析过程。",
      },
      {
        id: "identity",
        label: "人物 / 服装一致性",
        framework:
          "重点分析同一人物的五官、发型、妆容、身材比例、服装颜色、版型、面料、长度、领口、袖口、口袋、配饰，以及这些细节在各镜头中的变化。再补充动作、镜头、场景与光线，输出能最大程度保持人物和服装一致性的完整生成提示词。",
      },
      {
        id: "product",
        label: "商品广告复刻",
        framework:
          "以商品广告复刻为目标，按时间顺序分析商品外观、颜色、结构、材质、Logo可见情况、使用动作、构图、布光、背景、镜头运动和节奏。不得虚构品牌、材质、价格或功效，输出可直接用于生成同类广告画面的完整中文提示词。",
      },
    ],
  },
};
const getSystemVideoAnalysisProfiles = async () => {
  const settings = await readCollection("system_settings", {});
  return normalizeSystemVideoAnalysisProfiles(
    settings.videoAnalysisProfiles,
    DEFAULT_VIDEO_ANALYSIS_PROFILES,
  );
};
const getInspirationGenerationConfig = async () => {
  const settings = await readCollection("system_settings", {});
  return normalizeInspirationGenerationConfig(
    settings.inspirationGenerationConfig,
  );
};
const getHotRankRemakeConfig = async () => {
  const settings = await readCollection("system_settings", {});
  return normalizeHotRankRemakeConfig(settings.hotRankRemakeConfig);
};
const hotRankRemakeRuntime = (config) => {
  const model = String(config?.nodes?.video?.model || "");
  const seedance = model.startsWith("doubao-seedance-");
  const miniMax = model === "minimax-h3";
  return {
    analysisConfigured: Boolean(String(process.env.VAPEUR_API_KEY || "").trim()),
    textConfigured: isDeepSeekConfigured(),
    videoConfigured: seedance
      ? Boolean(getVolcengineStatus().ready)
      : miniMax
        ? isMiniMaxVideoConfigured()
        : isConfigured(),
    videoProvider: seedance ? "volcengine" : miniMax ? "minimax" : "kling",
  };
};
const getDetailPageTemplateOverrides = async () => {
  const settings = await readCollection("system_settings", {});
  return settings.detailPageTemplateOverrides &&
    typeof settings.detailPageTemplateOverrides === "object"
    ? settings.detailPageTemplateOverrides
    : {};
};
const getDetailPageTemplateTypePaths = async () => {
  const settings = await readCollection("system_settings", {});
  return settings.detailPageTemplateTypePaths &&
    typeof settings.detailPageTemplateTypePaths === "object"
    ? settings.detailPageTemplateTypePaths
    : {};
};
const detailPageTemplateTypeKey = (item) =>
  [item.kind, item.primaryCategoryId, item.secondaryCategoryId]
    .filter(Boolean)
    .join(":");
const withDetailPageTemplateTypePaths = (items, typePaths) =>
  items.map((item) => ({
    ...item,
    typeConfigKey: detailPageTemplateTypeKey(item),
    typeConfigPath:
      typePaths[detailPageTemplateTypeKey(item)] ||
      (item.kind === "video"
        ? `models/${item.model || "kling-v3-omni"}/video/${item.secondaryCategoryId}`
        : `models/gpt-image-2/${item.kind}/${item.secondaryCategoryId}`),
  }));
const normalizeVideoTemplateOverride = (input = {}, current = {}) => {
  const text = (value, limit = 8_000) =>
    String(value ?? "").trim().slice(0, limit);
  const tagsInput = input.tags ?? current.tags;
  const tags = (Array.isArray(tagsInput)
    ? tagsInput
    : String(tagsInput || "").split(/[，,]/)
  )
    .map((item) => text(item, 32))
    .filter(Boolean)
    .slice(0, 12);
  const modelInput = text(input.model ?? current.model, 80);
  const model = [
    "kling-v3-omni",
    "kling-v3",
    "kling-v3-turbo",
    "doubao-seedance-2-0-260128",
    "doubao-seedance-2-0-fast-260128",
    "minimax-h3",
  ].includes(modelInput)
    ? modelInput
    : "kling-v3-omni";
  const isMiniMax = model === "minimax-h3";
  const ratioInput = text(input.aspectRatio ?? current.aspectRatio, 12);
  const modeInput = text(input.mode ?? current.mode, 12);
  const resolutionInput = text(
    input.resolution ?? current.resolution,
    12,
  ).toUpperCase();
  const ratioModeInput = text(
    input.ratioMode ?? current.ratioMode,
    12,
  );
  const workflowPresetInput = text(
    input.workflowPreset ?? current.workflowPreset,
    40,
  );
  const outfitModelInput = text(
    input.outfitModel ?? current.outfitModel,
    80,
  );
  const digitalAssetModeInput = text(
    input.digitalAssetMode ?? current.digitalAssetMode,
    20,
  );
  return {
    ...current,
    title: text(input.title ?? current.title, 120),
    promptText: text(input.promptText ?? current.promptText),
    negativePrompt: text(
      input.negativePrompt ?? current.negativePrompt,
      2_000,
    ),
    enabled:
      input.enabled === undefined ? current.enabled !== false : Boolean(input.enabled),
    tags,
    generationPath:
      text(input.generationPath ?? current.generationPath, 240) ||
      "/api/tasks/video",
    model,
    aspectRatio: ["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"].includes(
      ratioInput,
    )
      ? ratioInput
      : "9:16",
    duration: Math.min(
      15,
      Math.max(
        isMiniMax ? 4 : 3,
        Number(input.duration ?? current.duration) || 15,
      ),
    ),
    mode: ["std", "pro", "4k"].includes(modeInput) ? modeInput : "pro",
    resolution:
      isMiniMax && ["768P", "2K"].includes(resolutionInput)
        ? resolutionInput
        : isMiniMax
          ? "768P"
          : text(input.resolution ?? current.resolution, 12),
    ratioMode: ["fixed", "adaptive"].includes(ratioModeInput)
      ? ratioModeInput
      : "fixed",
    aigcWatermark:
      input.aigcWatermark === undefined
        ? Boolean(current.aigcWatermark)
        : Boolean(input.aigcWatermark),
    cfgScale: Math.min(
      1,
      Math.max(0, Number(input.cfgScale ?? current.cfgScale ?? 0.8)),
    ),
    multiShot:
      isMiniMax
        ? false
        : input.multiShot === undefined
          ? current.multiShot !== false
          : Boolean(input.multiShot),
    sound:
      isMiniMax
        ? false
        : input.sound === undefined
          ? Boolean(current.sound)
          : Boolean(input.sound),
    workflowPreset: normalizeVideoWorkflowPreset(workflowPresetInput),
    outfitModel: ["gpt-image-2", "vapeur-gpt-image-2"].includes(
      outfitModelInput,
    )
      ? outfitModelInput
      : "gpt-image-2",
    outfitGenerationPath:
      text(
        input.outfitGenerationPath ?? current.outfitGenerationPath,
        240,
      ) || "/api/tasks/image",
    outfitPrompt: text(input.outfitPrompt ?? current.outfitPrompt),
    outfitNegativePrompt: text(
      input.outfitNegativePrompt ?? current.outfitNegativePrompt,
      2_000,
    ),
    outfitResolution: ["1k", "2k", "4k"].includes(
      text(input.outfitResolution ?? current.outfitResolution, 8),
    )
      ? text(input.outfitResolution ?? current.outfitResolution, 8)
      : "2k",
    outfitQuality: ["standard", "high"].includes(
      text(input.outfitQuality ?? current.outfitQuality, 12),
    )
      ? text(input.outfitQuality ?? current.outfitQuality, 12)
      : "high",
    outfitConfigPath:
      text(input.outfitConfigPath ?? current.outfitConfigPath, 240) ||
      "models/gpt-image-2/image/outfit-change",
    workflowTemplateId: text(
      input.workflowTemplateId ?? current.workflowTemplateId,
      120,
    ),
    digitalAssetMode: isMiniMax
      ? "none"
      : ["none", "optional", "required"].includes(digitalAssetModeInput)
        ? digitalAssetModeInput
        : "optional",
  };
};
const videoTemplatesForManifest = async (manifest, context = {}) => {
  const [overrides, typePaths] = await Promise.all([
    context.overrides ?? getDetailPageTemplateOverrides(),
    context.typePaths ?? getDetailPageTemplateTypePaths(),
  ]);
  const items = (manifest?.items || [])
    .filter((item) => inspirationCaseKind(item) === "video")
    .map((item) => {
      const override = normalizeVideoTemplateOverride(overrides[item.id], {
        title: item.title,
        promptText: item.videoPrompt || item.promptText,
        negativePrompt: item.negativePrompt,
        enabled: item.enabled !== false,
        tags: item.tags,
        generationPath: "/api/tasks/video",
        model: "kling-v3-omni",
        aspectRatio: item.ratio || "9:16",
        duration: Number.parseInt(item.duration, 10) || 15,
        mode: "pro",
        cfgScale: 0.8,
        multiShot: true,
        sound: Boolean(item.audioUrl),
        workflowPreset: normalizeVideoWorkflowPreset(
          item.workflowPreset,
          "main-outfit-video",
        ),
        outfitModel: "gpt-image-2",
        outfitPrompt: "",
        outfitNegativePrompt: "",
        outfitResolution: "2k",
        outfitQuality: "high",
        outfitConfigPath: "models/gpt-image-2/image/outfit-change",
        outfitGenerationPath: "/api/tasks/image",
        digitalAssetMode: "optional",
        workflowTemplateId: "",
      });
      return {
        ...item,
        ...override,
        thumbnailUrl: inspirationThumbnailUrl(item),
        kind: "video",
        mediaType: "video",
        videoPrompt: override.promptText,
        ratio: override.aspectRatio,
        primaryCategory: item.category || "视频模版",
        primaryCategoryId: item.category || "video",
        secondaryCategory: item.category || "视频模版",
        secondaryCategoryId: item.category || "video",
        platform: item.source?.platform || "视频模版库",
        imageType: "视频模版",
        generationConfig: {
          modelName: override.model,
          duration: override.duration,
          aspectRatio: override.aspectRatio,
          mode: override.mode,
          resolution: override.resolution,
          ratioMode: override.ratioMode,
          aigcWatermark: override.aigcWatermark,
          cfgScale: override.cfgScale,
          multiShot: override.multiShot,
          sound: override.sound,
          workflowPreset: override.workflowPreset,
          outfitModel: override.outfitModel,
          outfitPrompt: override.outfitPrompt,
          outfitNegativePrompt: override.outfitNegativePrompt,
          outfitResolution: override.outfitResolution,
          outfitQuality: override.outfitQuality,
          outfitConfigPath: override.outfitConfigPath,
          outfitGenerationPath: override.outfitGenerationPath,
          workflowTemplateId: override.workflowTemplateId,
          digitalAssetMode:
            ["kling-v3-turbo", "minimax-h3"].includes(override.model)
              ? "none"
              : override.digitalAssetMode,
          connectionMode: isSeedanceModel(override.model)
            ? "seedance-trusted-person"
            : override.model === "minimax-h3"
              ? "minimax-multimodal"
            : override.model === "kling-v3-turbo"
              ? "turbo-first-frame"
              : override.model === "kling-v3"
                ? "kling-element"
                : "omni-multimodal",
        },
      };
    });
  return withDetailPageTemplateTypePaths(items, typePaths);
};

const materialTemplatesForManifest = async (manifest) => {
  const templates = await readCollection("templates", []);
  const template =
    templates.find(
      (item) => item.id === QIANCHUAN_SPEAKING_TEMPLATE.id,
    ) || QIANCHUAN_SPEAKING_TEMPLATE;
  const videoNode = (template.nodes || []).find(
    (node) => node.id === "qc-video" || node.data?.kind === "video",
  );
  const copyNode = (template.nodes || []).find(
    (node) => node.id === "qc-copy-director",
  );
  const coverItem = (manifest?.items || []).find(
    (item) =>
      inspirationCaseKind(item) === "video" &&
      (item.coverUrl || item.mainImageUrl),
  ) || (manifest?.items || []).find(
    (item) => item.coverUrl || item.mainImageUrl,
  );
  return [
    {
      id: template.id,
      kind: "material",
      mediaType: "video",
      title: template.name,
      description: template.description,
      coverUrl: coverItem?.coverUrl || coverItem?.mainImageUrl || "",
      mainImageUrl: coverItem?.mainImageUrl || coverItem?.coverUrl || "",
      enabled: template.enabled !== false,
      tags: Array.isArray(template.tags)
        ? template.tags
        : ["素材模版", "口播", "一键同款", "千川"],
      model: videoNode?.data?.model || "doubao-seedance-2-0-fast-260128",
      ratio: videoNode?.data?.aspectRatio || "9:16",
      aspectRatio: videoNode?.data?.aspectRatio || "9:16",
      duration: Number(videoNode?.data?.duration || 15),
      promptText: copyNode?.data?.prompt || "",
      negativePrompt: videoNode?.data?.negativePrompt || "",
      generationPath:
        videoNode?.data?.backendGenerationPath || "/api/workflow-runs",
      typeConfigPath: "workflows/qianchuan-speaking/oral-material",
      primaryCategory: "素材模版",
      primaryCategoryId: "material-template",
      secondaryCategory: "口播类视频",
      secondaryCategoryId: "oral-video",
      platform: "千川素材",
      imageType: "素材模版",
      workflowTemplateId: template.id,
      workflowType: template.workflowType || "oral-material",
      nodes: structuredClone(template.nodes || []),
      edges: structuredClone(template.edges || []),
      nodeLogic: [
        "一键同款参考",
        "音频输入",
        "图片识别",
        "文本词",
        "真人图片过白",
        "口播策划",
        "有声成片",
      ],
    },
  ];
};

const syncInspirationOverrideFromWorkflowTemplate = async (template) => {
  const inspirationId = String(template?.sourceInspirationConfigId || "").trim();
  if (!inspirationId || !Array.isArray(template?.nodes)) return;
  const manifest = normalizeInspirationManifest(
    await readCollection("inspirations", {}),
  );
  const sourceItem = (manifest.items || []).find(
    (item) => item.id === inspirationId && inspirationCaseKind(item) === "video",
  );
  if (!sourceItem) return;
  const currentOverrides = await getDetailPageTemplateOverrides();
  const currentTypePaths = await getDetailPageTemplateTypePaths();
  const videoNode = template.nodes.find((node) => node.data?.kind === "video");
  const outfitNode = template.nodes.find((node) => node.data?.kind === "image");
  const assetNode = template.nodes.find((node) => node.data?.kind === "asset");
  if (!videoNode) return;
  const video = videoNode.data || {};
  const outfit = outfitNode?.data || {};
  const current = normalizeVideoTemplateOverride(currentOverrides[inspirationId], {
    title: sourceItem.title,
    promptText: sourceItem.videoPrompt || sourceItem.promptText,
    negativePrompt: sourceItem.negativePrompt,
    enabled: sourceItem.enabled !== false,
    tags: sourceItem.tags,
    generationPath: "/api/tasks/video",
    model: "kling-v3-omni",
    aspectRatio: sourceItem.ratio || "9:16",
    duration: Number.parseInt(sourceItem.duration, 10) || 15,
    mode: "pro",
    cfgScale: 0.8,
    multiShot: true,
    sound: Boolean(sourceItem.audioUrl),
    workflowPreset: normalizeVideoWorkflowPreset(
      sourceItem.workflowPreset,
      "main-outfit-video",
    ),
    outfitModel: "gpt-image-2",
    outfitGenerationPath: "/api/tasks/image",
    digitalAssetMode: "optional",
  });
  const override = normalizeVideoTemplateOverride(
    {
      ...current,
      promptText: video.prompt,
      negativePrompt: video.negativePrompt,
      generationPath: video.backendGenerationPath,
      model: video.model,
      aspectRatio: video.aspectRatio,
      duration: video.duration,
      mode: video.mode,
      resolution: video.resolution,
      ratioMode: video.ratioMode,
      aigcWatermark: video.aigcWatermark,
      cfgScale: video.cfgScale,
      multiShot: video.multiShot,
      sound: video.sound,
      workflowPreset: outfitNode
        ? "main-outfit-video"
        : normalizeVideoWorkflowPreset(
            sourceItem.workflowPreset,
            "direct-video",
          ),
      outfitModel: outfit.model,
      outfitPrompt: outfit.prompt,
      outfitNegativePrompt: outfit.negativePrompt,
      outfitResolution: outfit.resolution,
      outfitQuality: outfit.quality,
      outfitConfigPath: outfit.modelConfigPath,
      outfitGenerationPath: outfit.backendGenerationPath,
      digitalAssetMode: assetNode
        ? assetNode.data?.remakeRequired
          ? "required"
          : "optional"
        : "none",
      workflowTemplateId: template.id,
    },
    current,
  );
  const typeKey = detailPageTemplateTypeKey({
    kind: "video",
    primaryCategoryId: sourceItem.category || "video",
    secondaryCategoryId: sourceItem.category || "video",
  });
  const typeConfigPath = String(
    video.modelConfigPath || currentTypePaths[typeKey] || "",
  ).trim().slice(0, 240);
  await mutateCollection(
    "system_settings",
    (settings) => ({
      ...(settings || {}),
      detailPageTemplateOverrides: {
        ...((settings || {}).detailPageTemplateOverrides || {}),
        [inspirationId]: override,
      },
      detailPageTemplateTypePaths: {
        ...((settings || {}).detailPageTemplateTypePaths || {}),
        [typeKey]: typeConfigPath,
      },
    }),
    {},
  );
};
const detailPageTemplatesForManifest = async (manifest, context = {}) => {
  const coverUrls = (manifest?.items || [])
    .map((item) => item.coverUrl || item.mainImageUrl)
    .filter(Boolean);
  const [overrides, typePaths] = await Promise.all([
    context.overrides ?? getDetailPageTemplateOverrides(),
    context.typePaths ?? getDetailPageTemplateTypePaths(),
  ]);
  return withDetailPageTemplateTypePaths(createDetailPageTemplates({
    coverUrls,
    overrides,
  }), typePaths);
};
const outfitImageTemplatesForManifest = async (manifest, context = {}) => {
  const coverUrls = (manifest?.items || [])
    .map((item) => item.coverUrl || item.mainImageUrl)
    .filter(Boolean);
  const [overrides, typePaths] = await Promise.all([
    context.overrides ?? getDetailPageTemplateOverrides(),
    context.typePaths ?? getDetailPageTemplateTypePaths(),
  ]);
  return withDetailPageTemplateTypePaths(createOutfitImageTemplates({
    coverUrls,
    overrides,
  }), typePaths);
};

installJsonBodyProtection(app, { requireUser, requireAdmin });
app.use(
  "/generated",
  (req, res, next) => {
    const fileName = path.basename(req.path);
    if (!fileName || req.path !== `/${fileName}`)
      return res.status(404).json({ message: "生成文件不存在" });
    if (
      isTemplateCoverFile(fileName) ||
      hasValidGeneratedAccess(fileName, req.query.exp, req.query.sig)
    )
      return next();
    return res.status(403).json({ message: "生成文件访问凭证无效或已过期" });
  },
  express.static(generatedDir, { maxAge: "30d", immutable: true }),
);
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Commerce-Canvas-Version", RELEASE_INFO.version);
  res.setHeader("X-Commerce-Canvas-Build", String(RELEASE_INFO.build));
  const startedAt = performance.now();
  res.on("finish", () => {
    void recordTraffic({
      method: req.method,
      route: req.route?.path
        ? `${req.baseUrl || ""}${req.route.path}`
        : req.path,
      status: res.statusCode,
      durationMs: performance.now() - startedAt,
    });
  });
  next();
});

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

async function mapWithConcurrency(items, limit, mapper) {
  const source = Array.isArray(items) ? items : [];
  const results = new Array(source.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < source.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(source[index], index);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, Number(limit) || 1), source.length) },
      worker,
    ),
  );
  return results;
}

const safeTask = ({
  upstreamPayload: _upstreamPayload,
  recoveryInput: _recoveryInput,
  recoveryAssets: _recoveryAssets,
  ...task
}) =>
  signGeneratedUrls(
    withGenerationTiming(redactExternalRequestFields(task)),
  );
const analysisPointCost = (input = {}) => {
  const images = (Array.isArray(input.images) ? input.images : []).slice(0, 9);
  const videos = (Array.isArray(input.videos) ? input.videos : []).slice(0, 3);
  const requestedFrames = Math.max(
    6,
    Math.min(18, Number(input.frameLimit) || 18),
  );
  if (!videos.length)
    return usagePointCost("analysis", Math.max(1, images.length));
  const frameBudget = Math.max(
    1,
    Math.floor((24 - images.length) / videos.length),
  );
  return usagePointCost(
    "analysis",
    Math.max(
      1,
      images.length + videos.length * Math.min(requestedFrames, frameBudget),
    ),
  );
};
const runMeteredUsage = async ({
  ownerId,
  kind,
  quantity,
  taskId,
  reason,
  refundReason,
  action,
}) => {
  await chargeUsagePoints({
    userId: ownerId,
    kind,
    quantity,
    taskId,
    reason,
  });
  try {
    return await action();
  } catch (error) {
    await refundUsagePoints({
      userId: ownerId,
      kind,
      quantity,
      taskId,
      reason: refundReason || `${reason || "模型调用"}失败退款`,
    }).catch((refundError) =>
      console.error(`Point refund ${taskId} failed:`, refundError.message),
    );
    throw error;
  }
};
const safeWorkflowRun = ({ recoveryInput: _recoveryInput, ...run }) =>
  signGeneratedUrls(
    withWorkflowGenerationTiming({
      ...run,
      runtimeAssets: publicWorkflowRuntimeAssets(run.id, run.runtimeAssets),
    }),
  );
const minimaxApiKey = () =>
  String(
    process.env.MINIMAX_API_KEY || process.env.MINIMIX_API_KEY || "",
  ).trim();
const modelProviderConfiguration = () => ({
  kling: isConfigured(),
  volcengine: hasVolcengineCredentials(),
  image2: isImage2Configured(),
  vapeur: isVapeurConfigured() || isVapeurImageConfigured(),
  deepseek: isDeepSeekConfigured(),
  minimax: Boolean(minimaxApiKey()),
  unconfigured: false,
});
const modelDeploymentCatalog = () => {
  const configured = modelProviderConfiguration();
  return MODEL_DEPLOYMENTS.map((model) => ({
    ...model,
    configured:
      !model.permanentlyDisabled && configured[model.provider] === true,
    enabled: model.permanentlyDisabled !== true,
  }));
};
let modelReadinessCheckPromise = null;
const runSharedModelReadinessCheck = () => {
  if (!modelReadinessCheckPromise) {
    modelReadinessCheckPromise = runProviderReadinessChecks()
      .then(async (records) => {
        await mutateCollection("model_readiness", () => records, []);
        return records;
      })
      .finally(() => {
        modelReadinessCheckPromise = null;
      });
  }
  return modelReadinessCheckPromise;
};
const requireMiniMaxApiKey = () => {
  const key = minimaxApiKey();
  if (!key)
    throw Object.assign(new Error("MiniMax API Key 未配置"), { status: 503 });
  return key;
};
const safeVoiceId = (value = "") =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/^[^a-zA-Z]+/, "V")
    .replace(/[-_]+$/, "")
    .slice(0, 80);
const readRawBody = async (req, maxBytes = 20 * 1024 * 1024) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes)
      throw Object.assign(new Error("音频文件不能超过 20MB"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};
const minimaxJson = async (url, payload) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireMiniMaxApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120000),
  }).catch((error) => {
    if (error?.name === "TimeoutError")
      throw Object.assign(new Error("MiniMax 响应超时，请稍后重试"), {
        status: 504,
        code: "MINIMAX_TIMEOUT",
      });
    throw Object.assign(new Error(`MiniMax 连接失败：${error.message}`), {
      status: 502,
      code: "MINIMAX_NETWORK_ERROR",
    });
  });
  const data = await response.json().catch(() => ({}));
  const statusCode = Number(data?.base_resp?.status_code || 0);
  if (!response.ok || statusCode !== 0) {
    throw Object.assign(
      new Error(
        data?.base_resp?.status_msg || data?.message || "MiniMax 请求失败",
      ),
      { status: response.status || 502, upstream: data },
    );
  }
  return data;
};
const generateMiniMaxSpeechFile = async ({
  payload,
  fileStem,
  format = "mp3",
}) => {
  const upstream = await minimaxJson(
    "https://api.minimaxi.com/v1/t2a_v2",
    payload,
  );
  const audioHex = upstream?.data?.audio;
  if (!audioHex || !/^[0-9a-f]+$/i.test(audioHex))
    throw Object.assign(new Error("MiniMax 未返回有效音频数据"), {
      status: 502,
    });
  const audioBuffer = Buffer.from(audioHex, "hex");
  await fs.mkdir(generatedDir, { recursive: true });
  const fileName = `${safeVoiceId(fileStem) || randomUUID()}.${format}`;
  await fs.writeFile(path.join(generatedDir, fileName), audioBuffer);
  return { upstream, fileName };
};
const uploadMiniMaxAudioFile = async ({ buffer, name, mimeType, purpose }) => {
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new Blob([buffer], { type: mimeType }), name);
  const response = await fetch("https://api.minimaxi.com/v1/files/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${requireMiniMaxApiKey()}` },
    body: form,
    signal: AbortSignal.timeout(120000),
  }).catch((error) => {
    if (error?.name === "TimeoutError")
      throw Object.assign(new Error("MiniMax 音频上传超时，请稍后重试"), {
        status: 504,
        code: "MINIMAX_UPLOAD_TIMEOUT",
      });
    throw Object.assign(new Error(`MiniMax 音频上传失败：${error.message}`), {
      status: 502,
      code: "MINIMAX_UPLOAD_NETWORK_ERROR",
    });
  });
  const data = await response.json().catch(() => ({}));
  const fileId = data?.file?.file_id;
  if (!response.ok || !fileId) {
    throw Object.assign(
      new Error(
        data?.base_resp?.status_msg || data?.message || "MiniMax 音频上传失败",
      ),
      { status: response.status || 502, upstream: data },
    );
  }
  return { fileId, raw: data };
};
let miniMaxSystemVoiceCache = {
  expiresAt: 0,
  value: null,
  pending: null,
};
const miniMaxSystemVoices = async () => {
  const now = Date.now();
  if (
    Array.isArray(miniMaxSystemVoiceCache.value) &&
    miniMaxSystemVoiceCache.expiresAt > now
  )
    return miniMaxSystemVoiceCache.value;
  if (miniMaxSystemVoiceCache.pending) return miniMaxSystemVoiceCache.pending;
  const pending = minimaxJson("https://api.minimaxi.com/v1/get_voice", {
    voice_type: "all",
  })
    .then((providerVoices) => {
      const value = Array.isArray(providerVoices?.system_voice)
        ? providerVoices.system_voice.map((voice) => ({
            id: voice.voice_id,
            name: voice.voice_name || voice.description || voice.voice_id,
            source: "system",
          }))
        : SYSTEM_MINIMAX_VOICES;
      miniMaxSystemVoiceCache = {
        value,
        expiresAt: Date.now() + 5 * 60_000,
        pending: null,
      };
      return value;
    })
    .catch(() => {
      miniMaxSystemVoiceCache = {
        value: SYSTEM_MINIMAX_VOICES,
        expiresAt: Date.now() + 60_000,
        pending: null,
      };
      return SYSTEM_MINIMAX_VOICES;
    });
  miniMaxSystemVoiceCache = {
    ...miniMaxSystemVoiceCache,
    pending,
  };
  return pending;
};
const userMiniMaxVoices = async (userId) => {
  const [voices, systemVoices] = await Promise.all([
    readCollection("minimax_voices", []),
    miniMaxSystemVoices(),
  ]);
  return [
    ...systemVoices,
    ...voices.filter(
      (voice) => String(voice.ownerId || "") === String(userId || ""),
    ),
  ];
};
const shanghaiDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const pointUsageSummary = (
  ledger = [],
  userId = "",
  date = shanghaiDateKey(),
) => {
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))
    ? String(date)
    : shanghaiDateKey();
  const consumedEntries = (ledger || []).filter(
    (entry) =>
      String(entry.userId || "") === String(userId || "") &&
      Number(entry.amount || 0) < 0,
  );
  const totalConsumed = consumedEntries.reduce(
    (sum, entry) => sum + Math.abs(Number(entry.amount || 0)),
    0,
  );
  const dateConsumed = consumedEntries
    .filter((entry) => shanghaiDateKey(entry.createdAt) === selectedDate)
    .reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0);
  return { totalConsumed, dateConsumed, selectedDate };
};
const safeUserAccount = (userRecord, pointUsage = null, team = null) => {
  const hasPassword = Boolean(
    userRecord?.passwordHash && userRecord?.passwordSalt,
  );
  const {
    passwordHash: _passwordHash,
    passwordSalt: _passwordSalt,
    adminHidden: _legacyAdminHidden,
    ...user
  } = userRecord;
  const teamSummary = safeTeamSummary(team, user);
  return {
    ...user,
    hasPassword,
    accountType: user.accountType === "admin" ? "admin" : "creator",
    platformAdmin: isPlatformAdmin(user),
    templateAccess: hasTemplateAccess(user),
    inspirationAccess: hasTemplateAccess(user),
    teamId: teamSummary?.id || String(user.teamId || ""),
    teamRole: teamSummary?.role || String(user.teamRole || ""),
    team: teamSummary,
    isTeamAdmin: Boolean(teamSummary?.isAdmin),
    pointsUsage: pointUsage || {
      totalConsumed: 0,
      dateConsumed: 0,
      selectedDate: shanghaiDateKey(),
    },
  };
};
const updateMediaAnalysisTask = async (taskId, patch) => {
  let updated = null;
  await mutateCollection("media_analysis_tasks", (tasks) =>
    tasks.map((task) => {
      if (task.id !== taskId) return task;
      updated = patchMediaAnalysisTask(task, patch);
      return updated;
    }),
  );
  return updated;
};
const processMediaAnalysisTask = async (taskId, input) => {
  await updateMediaAnalysisTask(taskId, {
    status: "processing",
    startedAt: new Date().toISOString(),
    error: "",
  });
  try {
    const result = await analyzeWorkflowMedia(input);
    await updateMediaAnalysisTask(taskId, {
      status: "succeeded",
      content: String(result?.content || ""),
      videoDurationSeconds: Array.isArray(result?.videoDurationSeconds)
        ? result.videoDurationSeconds
        : [],
      frameCount: Number(result?.frameCount) || 0,
      exactEndFrameCount: Number(result?.exactEndFrameCount) || 0,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    await updateMediaAnalysisTask(taskId, {
      status: "failed",
      error: generationErrorMessage(error, "视频分析失败，请稍后重试。"),
      completedAt: new Date().toISOString(),
    });
    const tasks = await readCollection("media_analysis_tasks", []);
    const task = tasks.find((item) => item.id === taskId);
    if (task?.ownerId && task?.pointsCost)
      await refundUsagePoints({
        userId: task.ownerId,
        kind: "analysis",
        quantity: task.pointsCost,
        taskId,
        reason: "视频分析失败退款",
      }).catch((refundError) =>
        console.error(
          `Analysis point refund ${taskId} failed:`,
          refundError.message,
        ),
      );
  } finally {
    mediaAnalysisJobs.delete(taskId);
  }
};
const effectiveOwnerId = (item) =>
  String(item?.ownerId || process.env.LEGACY_OWNER_USER_ID || "");
const ownedBy = (item, userId) =>
  effectiveOwnerId(item) === String(userId || "");
const teamForUser = (teams, user) =>
  (teams || []).find(
    (team) =>
      team.status !== "disabled" &&
      String(team.id || "") === String(user?.teamId || ""),
  ) || null;
const teamForTemplate = (teams, template) =>
  (teams || []).find(
    (team) => String(team.id || "") === String(template?.teamId || ""),
  ) || null;
const sharedTemplateVisibleToUser = (template, user, teams) =>
  isPublicTemplate(template) ||
  canViewTeamTemplate(template, user, teamForTemplate(teams, template));
const generationQueuePriority = async (ownerId) => {
  const users = await readCollection("users", []);
  const user = users.find((item) => String(item.id) === String(ownerId || ""));
  return user && isPlatformAdmin(user) ? 100 : 0;
};
const withTemplateApproval = (template) => {
  const { pendingPublicBase: _pendingPublicBase, ...visibleTemplate } =
    template;
  return {
    ...visibleTemplate,
    ...normalizeTemplateAccess(template),
    revision: templateRevision(template),
    manifest: normalizeTemplateManifest(template),
    versionRef: templateVersionRef(template),
  };
};
const templateRevisionAtTime = (template, timestamp) => {
  const target = new Date(timestamp || 0).getTime();
  if (!Number.isFinite(target) || target <= 0) return 1;
  return (template.revisionHistory || []).reduce(
    (revision, entry) =>
      new Date(entry?.updatedAt || 0).getTime() <= target
        ? Math.max(revision, Number(entry?.revision) || 1)
        : revision,
    1,
  );
};
const templateUpdateNoticesForUser = ({ templates, usages, runs, userId }) => {
  const usageByTemplate = new Map(
    (usages || [])
      .filter((usage) => usage.userId === userId)
      .map((usage) => [usage.templateId, usage]),
  );
  const inferredUseAt = new Map();
  for (const run of runs || []) {
    if (!ownedBy(run, userId) || !run.templateId || run.templateId === "draft")
      continue;
    const current = inferredUseAt.get(run.templateId);
    if (!current || new Date(run.createdAt) < new Date(current))
      inferredUseAt.set(run.templateId, run.createdAt);
  }
  for (const template of templates || []) {
    if (!ownedBy(template, userId)) continue;
    const sourceId = String(
      template.sourceTemplateId || template.forkedFromTemplateId || "",
    );
    if (!sourceId) continue;
    const current = inferredUseAt.get(sourceId);
    const usedAt = template.createdAt || template.updatedAt;
    if (!current || new Date(usedAt) < new Date(current))
      inferredUseAt.set(sourceId, usedAt);
  }

  return (templates || []).flatMap((template) => {
    if (
      (!isPublicTemplate(template) && !isApprovedTeamTemplate(template)) ||
      ownedBy(template, userId)
    )
      return [];
    const usage = usageByTemplate.get(template.id);
    const legacyUsedAt = inferredUseAt.get(template.id);
    if (!usage && !legacyUsedAt) return [];
    const acknowledgedRevision = usage
      ? Number(usage.acknowledgedRevision || usage.firstUsedRevision || 1)
      : templateRevisionAtTime(template, legacyUsedAt);
    const revision = templateRevision(template);
    if (acknowledgedRevision >= revision) return [];
    const changes = aggregateTemplateChanges(
      template.revisionHistory,
      acknowledgedRevision,
    );
    if (!changes.length) return [];
    return [
      {
        templateId: template.id,
        templateName: template.name,
        revision,
        acknowledgedRevision,
        updatedAt:
          template.lastTemplateRevision?.updatedAt || template.updatedAt,
        changes,
      },
    ];
  });
};
const recordTemplateUsage = async ({
  template,
  userId,
  usedAt = new Date().toISOString(),
  firstUsedAt = usedAt,
  firstUsedRevision = templateRevision(template),
}) => {
  if (
    !template ||
    (!isPublicTemplate(template) && !isApprovedTeamTemplate(template)) ||
    ownedBy(template, userId)
  )
    return null;
  let result;
  await mutateCollection("template_usages", (usages) => {
    const existing = usages.find(
      (usage) => usage.userId === userId && usage.templateId === template.id,
    );
    if (existing) {
      result = { ...existing, lastUsedAt: usedAt };
      return usages.map((usage) => (usage === existing ? result : usage));
    }
    result = {
      id: `${userId}:${template.id}`,
      userId,
      templateId: template.id,
      firstUsedRevision,
      acknowledgedRevision: firstUsedRevision,
      firstUsedAt,
      lastUsedAt: usedAt,
    };
    return [result, ...usages];
  });
  return result;
};
const reviewTemplateSubmission = async (templateId, decision, reviewer) => {
  if (!["approve", "reject"].includes(decision))
    throw Object.assign(new Error("审批决定不合法"), { status: 400 });
  let result = null;
  await mutateCollection("templates", (templates) =>
    templates.flatMap((template) => {
      if (template.id !== templateId) return [template];
      const status = templateApprovalStatus(template);
      if (!["pending_publish", "pending_delete"].includes(status)) {
        result = { invalidStatus: true };
        return [template];
      }
      if (status === "pending_delete" && decision === "approve") {
        result = { deleted: true, id: template.id };
        return [];
      }
      const approved = decision === "approve" || status === "pending_delete";
      const teamScoped = isTeamTemplate(template);
      const pendingRevision = template.pendingTemplateRevision;
      const publishesRevision =
        approved &&
        status === "pending_publish" &&
        Array.isArray(pendingRevision?.changes) &&
        pendingRevision.changes.length > 0;
      const revisionHistory = publishesRevision
        ? [...(template.revisionHistory || []), pendingRevision].slice(-20)
        : template.revisionHistory || [];
      const updated = {
        ...template,
        visibility: teamScoped ? "team" : "global",
        public: teamScoped ? false : approved,
        approvalStatus: approved ? "approved" : "rejected",
        requestedAt: null,
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewer,
        updatedAt: new Date().toISOString(),
        revision: publishesRevision
          ? Number(pendingRevision.revision)
          : templateRevision(template),
        revisionHistory,
        ...(publishesRevision ? { lastTemplateRevision: pendingRevision } : {}),
        ...(approved
          ? {
              pendingTemplateRevision: undefined,
              pendingPublicBase: undefined,
              pendingPublicUpdate: undefined,
            }
          : {}),
      };
      result = updated;
      return [updated];
    }),
  );
  if (!result) throw Object.assign(new Error("模板不存在"), { status: 404 });
  if (result.invalidStatus)
    throw Object.assign(new Error("该模板当前不需要审批"), { status: 400 });
  return result;
};
const isVapeurTextModel = (model) => String(model || "") === "vapeur-gpt-5.5";
const SEEDANCE_MODELS = new Set([
  "doubao-seedance-2-0-fast",
  "doubao-seedance-2-0-260128",
  "doubao-seedance-2-0-fast-260128",
]);
const isSeedanceModel = (model) => SEEDANCE_MODELS.has(String(model || ""));
const generateTextForModel = (input) =>
  isVapeurTextModel(input?.model)
    ? generateVapeurWorkflowText(input)
    : generateWorkflowText(input);

app.get(
  "/api/teams/joinable",
  asyncRoute(async (_req, res) => {
    const teams = await readCollection("teams", []);
    res.json(
      teams
        .filter((team) => team.status !== "disabled")
        .map((team) => ({ id: String(team.id), name: String(team.name) })),
    );
  }),
);

app.post(
  "/api/auth/register",
  asyncRoute(async (req, res) => {
    const validation = validateRegistrationInput(req.body);
    if (!validation.valid)
      return res.status(400).json({
        message: validation.firstError,
        field: validation.firstField,
        code: "INVALID_REGISTRATION_FIELD",
        errors: validation.errors,
      });
    const { name, contact, password } = validation.values;
    const requestedTeamId = String(req.body.teamId || "").trim();
    const [users, teams] = await Promise.all([
      readCollection("users", []),
      readCollection("teams", []),
    ]);
    const selectedTeam = requestedTeamId
      ? teams.find(
          (team) => team.id === requestedTeamId && team.status !== "disabled",
        )
      : null;
    if (requestedTeamId && !selectedTeam)
      return res.status(400).json({
        message: "所选团队不存在或已停止加入",
        field: "teamId",
        code: "TEAM_NOT_JOINABLE",
      });
    if (
      users.some((user) => String(user.contact || "").toLowerCase() === contact)
    )
      return res.status(409).json({
        message: "该邮箱或手机号已注册，请直接登录或更换账号",
        field: "contact",
        code: "CONTACT_ALREADY_REGISTERED",
      });
    const credentials = hashPassword(password);
    const now = new Date().toISOString();
    const user = {
      id: randomUUID(),
      name,
      contact,
      passwordHash: credentials.hash,
      passwordSalt: credentials.salt,
      accountType: "creator",
      teamId: selectedTeam?.id || "",
      teamRole: selectedTeam ? "member" : "",
      templateAccess: false,
      inspirationAccess: false,
      plan: "免费版",
      status: "active",
      sessionVersion: 0,
      pointsBalance: 0,
      totalGenerated: 0,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await mutateCollection("users", (items) => [user, ...items]);
    res
      .status(201)
      .json({
        token: issueUserToken(user),
        user: safeUserAccount(user, null, selectedTeam),
      });
  }),
);

app.post(
  "/api/auth/login",
  asyncRoute(async (req, res) => {
    const contact = String(req.body.contact || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const attemptKey = loginAttemptKey(req, contact);
    const attempt = assertLoginAllowed(userLoginAttempts, attemptKey);
    const [users, teams] = await Promise.all([
      readCollection("users", []),
      readCollection("teams", []),
    ]);
    const user = users.find(
      (item) => String(item.contact || "").toLowerCase() === contact,
    );
    if (
      !user?.passwordHash ||
      !verifyPassword(password, user.passwordSalt, user.passwordHash)
    ) {
      recordLoginFailure(userLoginAttempts, attemptKey, attempt);
      return res.status(401).json({ message: "账号或密码错误" });
    }
    if (user.status !== "active")
      return res.status(403).json({ message: "账号已被停用" });
    userLoginAttempts.delete(attemptKey);
    await mutateCollection("users", (items) =>
      items.map((item) =>
        item.id === user.id
          ? { ...item, lastActiveAt: new Date().toISOString() }
          : item,
      ),
    );
    const ledger = await readCollection("point_ledger", []);
    res.json({
      token: issueUserToken(user),
      user: safeUserAccount(
        user,
        pointUsageSummary(ledger, user.id),
        teamForUser(teams, user),
      ),
    });
  }),
);

app.get(
  "/api/auth/me",
  requireUser,
  asyncRoute(async (req, res) => {
    const [users, teams] = await Promise.all([
      readCollection("users", []),
      readCollection("teams", []),
    ]);
    const user = users.find((item) => item.id === req.user.userId);
    if (!user || user.status !== "active")
      return res.status(401).json({ message: "账号不存在或已停用" });
    const ledger = await readCollection("point_ledger", []);
    res.json(
      safeUserAccount(
        user,
        pointUsageSummary(ledger, user.id),
        teamForUser(teams, user),
      ),
    );
  }),
);

app.get(
  "/api/account/points-usage",
  requireUser,
  asyncRoute(async (req, res) => {
    const users = await readCollection("users", []);
    const user = users.find((item) => item.id === req.user.userId);
    if (!user || user.status !== "active")
      return res.status(401).json({ message: "账号不存在或已停用" });
    const ledger = await readCollection("point_ledger", []);
    res.json(pointUsageSummary(ledger, user.id, req.query.date));
  }),
);

app.get(
  "/api/account/points-history",
  requireUser,
  asyncRoute(async (req, res) => {
    const ledger = await readCollection("point_ledger", []);
    res.json(
      ledger
        .filter((entry) => String(entry.userId || "") === req.user.userId)
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
        .slice(0, 100)
        .map((entry) => ({
          id: entry.id,
          amount: Number(entry.amount || 0),
          kind: String(entry.kind || ""),
          reason: String(entry.reason || "积分变动"),
          taskId: String(entry.taskId || ""),
          balanceAfter: Number(entry.balanceAfter || 0),
          createdAt: entry.createdAt,
        })),
    );
  }),
);

app.patch(
  "/api/account/profile",
  requireUser,
  asyncRoute(async (req, res) => {
    const [users, teams, ledger] = await Promise.all([
      readCollection("users", []),
      readCollection("teams", []),
      readCollection("point_ledger", []),
    ]);
    const user = users.find((item) => item.id === req.user.userId);
    if (!user || user.status !== "active")
      return res.status(401).json({ message: "账号不存在或已停用" });
    const validation = validateRegistrationInput({
      name: req.body.name ?? user.name,
      contact: req.body.contact ?? user.contact,
      password: "Profile123",
    });
    if (validation.errors.name || validation.errors.contact) {
      const field = validation.errors.name ? "name" : "contact";
      return res.status(400).json({
        message: validation.errors[field],
        field,
        errors: validation.errors,
      });
    }
    if (
      users.some(
        (item) =>
          item.id !== user.id &&
          String(item.contact || "").toLowerCase() === validation.values.contact,
      )
    )
      return res.status(409).json({
        message: "该邮箱或手机号已被其他账号使用",
        field: "contact",
      });
    const clean = (value, limit) => String(value || "").trim().slice(0, limit);
    const updated = {
      ...user,
      name: validation.values.name,
      contact: validation.values.contact,
      company: clean(req.body.company ?? user.company, 80),
      jobTitle: clean(req.body.jobTitle ?? user.jobTitle, 60),
      city: clean(req.body.city ?? user.city, 40),
      bio: clean(req.body.bio ?? user.bio, 300),
      updatedAt: new Date().toISOString(),
    };
    await mutateCollection("users", (items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
    res.json(
      safeUserAccount(
        updated,
        pointUsageSummary(ledger, updated.id),
        teamForUser(teams, updated),
      ),
    );
  }),
);

app.post(
  "/api/account/password",
  requireUser,
  asyncRoute(async (req, res) => {
    const users = await readCollection("users", []);
    const user = users.find((item) => item.id === req.user.userId);
    if (!user || user.status !== "active")
      return res.status(401).json({ message: "账号不存在或已停用" });

    const hasPassword = Boolean(user.passwordHash && user.passwordSalt);
    const validation = validatePasswordChangeInput({
      ...req.body,
      requireCurrent: hasPassword,
    });
    if (!validation.valid)
      return res.status(400).json({
        message: validation.firstError,
        field: validation.firstField,
        errors: validation.errors,
      });
    if (
      hasPassword &&
      !verifyPassword(
        validation.values.currentPassword,
        user.passwordSalt,
        user.passwordHash,
      )
    )
      return res.status(401).json({
        message: "当前密码不正确",
        field: "currentPassword",
        code: "CURRENT_PASSWORD_INCORRECT",
      });

    const credentials = hashPassword(validation.values.newPassword);
    const changedAt = new Date().toISOString();
    await mutateCollection("users", (items) =>
      items.map((item) =>
        item.id === user.id
          ? {
              ...item,
              passwordHash: credentials.hash,
              passwordSalt: credentials.salt,
              passwordChangedAt: changedAt,
              sessionVersion: Number(item.sessionVersion || 0) + 1,
              updatedAt: changedAt,
            }
          : item,
      ),
    );
    res.json({ changedAt, hasPassword: true });
  }),
);

app.put(
  "/api/account/team",
  requireUser,
  asyncRoute(async (req, res) => {
    const teamId = String(req.body.teamId || "").trim();
    const [users, teams, ledger] = await Promise.all([
      readCollection("users", []),
      readCollection("teams", []),
      readCollection("point_ledger", []),
    ]);
    const user = users.find((item) => item.id === req.user.userId);
    const team = teams.find(
      (item) => item.id === teamId && item.status !== "disabled",
    );
    if (!user || user.status !== "active")
      return res.status(401).json({ message: "账号不存在或已停用" });
    if (!team) return res.status(404).json({ message: "团队不存在或已停止加入" });
    if (user.teamId && user.teamId !== team.id)
      return res.status(409).json({ message: "请先退出当前团队，再加入新团队" });
    const updated = {
      ...user,
      teamId: team.id,
      teamRole: isTeamAdmin({ ...user, teamId: team.id }, team)
        ? "admin"
        : "member",
      updatedAt: new Date().toISOString(),
    };
    await mutateCollection("users", (items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
    res.json(
      safeUserAccount(
        updated,
        pointUsageSummary(ledger, updated.id),
        team,
      ),
    );
  }),
);

app.delete(
  "/api/account/team",
  requireUser,
  asyncRoute(async (req, res) => {
    const [users, teams, ledger] = await Promise.all([
      readCollection("users", []),
      readCollection("teams", []),
      readCollection("point_ledger", []),
    ]);
    const user = users.find((item) => item.id === req.user.userId);
    if (!user || user.status !== "active")
      return res.status(401).json({ message: "账号不存在或已停用" });
    const team = teamForUser(teams, user);
    if (team && isTeamAdmin(user, team)) {
      const otherAdmins = (team.adminIds || []).filter(
        (id) => String(id) !== String(user.id),
      );
      if (String(team.ownerId || "") === String(user.id) || !otherAdmins.length)
        return res.status(409).json({
          message: "团队唯一管理员不能退出，请先指定其他团队管理员",
        });
    }
    const updated = {
      ...user,
      teamId: "",
      teamRole: "",
      updatedAt: new Date().toISOString(),
    };
    await mutateCollection("users", (items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
    res.json(
      safeUserAccount(updated, pointUsageSummary(ledger, updated.id), null),
    );
  }),
);

app.get(
  "/api/audio/status",
  requireUser,
  asyncRoute(async (_req, res) => {
    res.json({
      configured: Boolean(minimaxApiKey()),
      models: [...MINIMAX_TTS_MODELS],
    });
  }),
);

app.get(
  "/api/audio/voices",
  requireUser,
  asyncRoute(async (req, res) => {
    res.json({ voices: await userMiniMaxVoices(req.user.userId) });
  }),
);

app.post(
  "/api/audio/files",
  requireUser,
  asyncRoute(async (req, res) => {
    const purpose = String(
      req.header("X-Commerce-Canvas-Audio-Purpose") || "voice_clone",
    );
    if (!["voice_clone", "prompt_audio"].includes(purpose))
      return res.status(400).json({ message: "声音文件用途不合法" });
    const name = decodeURIComponent(
      String(req.header("X-Commerce-Canvas-Audio-Name") || "voice.mp3"),
    );
    const mimeType = decodeURIComponent(
      String(req.header("X-Commerce-Canvas-Audio-Mime") || "application/octet-stream"),
    );
    if (!/\.(mp3|m4a|wav)$/i.test(name))
      return res.status(400).json({ message: "仅支持 mp3、m4a、wav 声音文件" });
    const buffer = await readRawBody(req);
    if (!buffer.length)
      return res.status(400).json({ message: "声音文件为空" });
    const result = await uploadMiniMaxAudioFile({
      buffer,
      name,
      mimeType,
      purpose,
    });
    res.status(201).json({ fileId: result.fileId, purpose, name });
  }),
);

app.post(
  "/api/audio/voice-clone",
  requireUser,
  asyncRoute(async (req, res) => {
    const fileId = Number(req.body.fileId);
    const promptFileId = req.body.promptFileId
      ? Number(req.body.promptFileId)
      : null;
    const displayName = String(req.body.name || "克隆音色")
      .trim()
      .slice(0, 40);
    const requestedVoiceId = safeVoiceId(
      req.body.voiceId || `LF_${req.user.userId.slice(0, 8)}_${Date.now()}`,
    );
    if (!fileId) return res.status(400).json({ message: "请先上传复刻音频" });
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{6,254}[a-zA-Z0-9]$/.test(requestedVoiceId))
      return res
        .status(400)
        .json({
          message: "voice_id 需以字母开头，8 位以上，仅支持字母、数字、-、_",
        });
    const model = MINIMAX_TTS_MODELS.has(String(req.body.model || ""))
      ? String(req.body.model)
      : "speech-2.8-hd";
    const payload = {
      file_id: fileId,
      voice_id: requestedVoiceId,
      text: String(
        req.body.previewText || "你好，这是Commerce Canvas声音克隆试听。",
      ).slice(0, 1000),
      model,
      text_validation:
        String(req.body.textValidation || "").slice(0, 200) || undefined,
      accuracy: Math.max(0, Math.min(1, Number(req.body.accuracy ?? 0.7))),
      need_noise_reduction: Boolean(req.body.noiseReduction),
      need_volume_normalization: Boolean(req.body.volumeNormalization),
      aigc_watermark: false,
      ...(promptFileId
        ? {
            clone_prompt: {
              prompt_audio: promptFileId,
              prompt_text:
                String(req.body.promptText || "").slice(0, 200) ||
                "这是一段参考音频。",
            },
          }
        : {}),
    };
    const upstream = await minimaxJson(
      "https://api.minimaxi.com/v1/voice_clone",
      payload,
    );
    const now = new Date().toISOString();
    const voice = {
      id: requestedVoiceId,
      name: displayName || requestedVoiceId,
      source: "clone",
      ownerId: req.user.userId,
      model,
      createdAt: now,
      updatedAt: now,
    };
    await mutateCollection("minimax_voices", (voices) =>
      [
        voice,
        ...voices.filter(
          (item) =>
            !(item.ownerId === req.user.userId && item.id === requestedVoiceId),
        ),
      ].slice(0, 500),
    );
    res
      .status(201)
      .json({
        voice,
        demoAudio: upstream.demo_audio || "",
        extraInfo: upstream.extra_info || null,
      });
  }),
);

app.post(
  "/api/audio/tts",
  requireUser,
  asyncRoute(async (req, res) => {
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ message: "请填写要生成的文本" });
    if (text.length > 10000)
      return res.status(400).json({ message: "文本不能超过 10000 字" });
    const voices = await userMiniMaxVoices(req.user.userId);
    const voiceId = String(req.body.voiceId || "male-qn-qingse");
    if (!voices.some((voice) => voice.id === voiceId))
      return res.status(400).json({ message: "请选择可用声音" });
    const model = MINIMAX_TTS_MODELS.has(String(req.body.model || ""))
      ? String(req.body.model)
      : "speech-2.8-hd";
    const format = ["mp3", "wav", "flac"].includes(
      String(req.body.format || "mp3"),
    )
      ? String(req.body.format || "mp3")
      : "mp3";
    const payload = {
      model,
      text,
      stream: false,
      output_format: "hex",
      voice_setting: {
        voice_id: voiceId,
        speed: Math.max(0.5, Math.min(2, Number(req.body.speed || 1))),
        vol: Math.max(0.1, Math.min(10, Number(req.body.volume || 1))),
        pitch: Math.max(-12, Math.min(12, Number(req.body.pitch || 0))),
        emotion: String(req.body.emotion || "auto"),
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format,
        channel: 1,
      },
      language_boost: String(req.body.languageBoost || "auto"),
      subtitle_enable: false,
      aigc_watermark: false,
    };
    const usageId = `audio-generate-${randomUUID()}`;
    const result = await runMeteredUsage({
      ownerId: req.user.userId,
      kind: "audio",
      quantity: 1,
      taskId: usageId,
      reason: "音频生成 1 次",
      refundReason: "音频生成失败退款",
      action: async () => {
        return generateMiniMaxSpeechFile({
          payload,
          fileStem: usageId,
          format,
        });
      },
    });
    res.status(201).json({
      audioUrl: signedGeneratedUrl(`/generated/${result.fileName}`),
      fileName: result.fileName,
      voiceId,
      model,
      pointsCost: 1,
      extraInfo: result.upstream.extra_info || null,
      traceId: result.upstream.trace_id || "",
    });
  }),
);

app.delete(
  "/api/audio/voices/:id",
  requireUser,
  asyncRoute(async (req, res) => {
    const voiceId = String(req.params.id || "");
    const voices = await readCollection("minimax_voices", []);
    const ownedVoice = voices.find(
      (voice) => voice.ownerId === req.user.userId && voice.id === voiceId,
    );
    if (!ownedVoice)
      return res.status(404).json({ message: "声音不存在或不可删除" });
    await minimaxJson("https://api.minimaxi.com/v1/delete_voice", {
      voice_type: "voice_cloning",
      voice_id: voiceId,
    });
    let removed = false;
    await mutateCollection("minimax_voices", (voices) =>
      voices.filter((voice) => {
        const remove =
          voice.ownerId === req.user.userId && voice.id === voiceId;
        removed = removed || remove;
        return !remove;
      }),
    );
    if (!removed)
      return res.status(404).json({ message: "声音不存在或不可删除" });
    res.status(204).end();
  }),
);

app.get(
  "/api/account/prompt-framework",
  requireUser,
  asyncRoute(async (req, res) => {
    const users = await readCollection("users", []);
    const user = users.find((item) => item.id === req.user.userId);
    if (!user) return res.status(404).json({ message: "账号不存在" });
    res.json({
      framework: user.preferences?.promptFramework || DEFAULT_PROMPT_FRAMEWORK,
      customized: Boolean(user.preferences?.promptFramework),
    });
  }),
);

app.put(
  "/api/account/prompt-framework",
  requireUser,
  asyncRoute(async (req, res) => {
    const framework = String(req.body.framework || "").trim();
    if (!framework)
      return res.status(400).json({ message: "优化框架不能为空" });
    if (framework.length > 4000)
      return res.status(400).json({ message: "优化框架不能超过 4000 字" });
    let updated = false;
    await mutateCollection("users", (users) =>
      users.map((user) => {
        if (user.id !== req.user.userId) return user;
        updated = true;
        return {
          ...user,
          preferences: {
            ...(user.preferences || {}),
            promptFramework: framework,
          },
          updatedAt: new Date().toISOString(),
        };
      }),
    );
    if (!updated) return res.status(404).json({ message: "账号不存在" });
    res.json({ framework, customized: true });
  }),
);

app.get(
  "/api/account/video-analysis-profiles",
  requireUser,
  asyncRoute(async (req, res) => {
    const users = await readCollection("users", []);
    const user = users.find((item) => item.id === req.user.userId);
    if (!user) return res.status(404).json({ message: "账号不存在" });
    const systemProfiles = await getSystemVideoAnalysisProfiles();
    res.json({
      profiles: normalizeVideoAnalysisProfiles(
        user.preferences?.videoAnalysisProfiles,
        systemProfiles,
      ),
    });
  }),
);

app.put(
  "/api/account/video-analysis-profiles/:targetModel",
  requireUser,
  asyncRoute(async (req, res) => {
    const targetModel = String(req.params.targetModel || "");
    if (!Object.hasOwn(DEFAULT_VIDEO_ANALYSIS_PROFILES, targetModel))
      return res
        .status(400)
        .json({ message: "仅支持 Seedance 2.0 或可灵分析框架" });
    const framework = String(req.body.framework || "").trim();
    if (!framework)
      return res.status(400).json({ message: "分析框架不能为空" });
    if (framework.length > 4000)
      return res.status(400).json({ message: "分析框架不能超过 4000 字" });
    const systemProfiles = await getSystemVideoAnalysisProfiles();
    const presets = stripSystemVideoAnalysisPresets(
      req.body.presets,
      systemProfiles[targetModel],
    );
    let savedProfiles;
    let updated = false;
    await mutateCollection("users", (users) =>
      users.map((user) => {
        if (user.id !== req.user.userId) return user;
        updated = true;
        const personalProfiles = {
          ...(user.preferences?.videoAnalysisProfiles || {}),
          [targetModel]: { framework, presets },
        };
        savedProfiles = normalizeVideoAnalysisProfiles(
          personalProfiles,
          systemProfiles,
        );
        return {
          ...user,
          preferences: {
            ...(user.preferences || {}),
            videoAnalysisProfiles: personalProfiles,
          },
          updatedAt: new Date().toISOString(),
        };
      }),
    );
    if (!updated) return res.status(404).json({ message: "账号不存在" });
    res.json({
      targetModel,
      profile: savedProfiles[targetModel],
      profiles: savedProfiles,
    });
  }),
);

function cleanUserPatch(input, creating = false) {
  const patch = {};
  if (creating || input.name !== undefined) {
    patch.name = String(input.name || "")
      .trim()
      .slice(0, 60);
    if (!patch.name)
      throw Object.assign(new Error("用户名称不能为空"), { status: 400 });
  }
  if (creating || input.contact !== undefined)
    patch.contact = String(input.contact || "")
      .trim()
      .slice(0, 120);
  if (creating || input.plan !== undefined)
    patch.plan = String(input.plan || "基础版")
      .trim()
      .slice(0, 30);
  if (input.status !== undefined) {
    patch.status = String(input.status);
    if (!["active", "disabled"].includes(patch.status))
      throw Object.assign(new Error("用户状态不合法"), { status: 400 });
  }
  if (input.accountType !== undefined) {
    patch.accountType = String(input.accountType);
    if (!["creator", "free", "admin"].includes(patch.accountType))
      throw Object.assign(new Error("用户类型不合法"), { status: 400 });
    if (patch.accountType === "free") patch.accountType = "creator";
  }
  if (input.templateAccess !== undefined || input.inspirationAccess !== undefined) {
    const enabled =
      input.templateAccess !== undefined
        ? input.templateAccess === true
        : input.inspirationAccess === true;
    patch.templateAccess = enabled;
    patch.inspirationAccess = enabled;
  }
  return patch;
}

async function updateTask(id, patch) {
  let changed;
  await mutateCollection("tasks", (tasks) =>
    tasks.map((task) => {
      if (task.id !== id) return task;
      const now = new Date();
      changed = {
        ...task,
        ...timingPatch(task, patch, now),
        updatedAt: now.toISOString(),
      };
      return changed;
    }),
  );
  return changed;
}

async function persistGeneratedImages(
  images,
  taskId,
  outputFormat = "png",
  aspectRatio = "",
) {
  await fs.mkdir(generatedDir, { recursive: true });
  const extension = ["png", "jpeg", "jpg", "webp"].includes(
    String(outputFormat).toLowerCase(),
  )
    ? String(outputFormat).toLowerCase().replace("jpeg", "jpg")
    : "png";
  return Promise.all(
    (images || []).map(async (image, index) => {
      const fileName = `${taskId}-${index + 1}.${extension}`;
      const filePath = path.join(generatedDir, fileName);
      let buffer;
      if (image.base64) {
        buffer = Buffer.from(
          String(image.base64).replace(
            /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
            "",
          ),
          "base64",
        );
      } else if (image.url) {
        ({ buffer } = await readExternalMedia(image.url, {
          ...providerMediaUrlOptions(),
          timeoutMs: 30_000,
          maxBytes: 30 * 1024 * 1024,
        }));
      } else {
        throw Object.assign(new Error("图片模型未返回可保存的结果"), {
          status: 502,
        });
      }
      await fs.writeFile(filePath, buffer);
      const dimensions = readImageDimensions(buffer);
      const crop = dimensions
        ? centeredCropForAspectRatio(
            dimensions.width,
            dimensions.height,
            aspectRatio,
          )
        : null;
      if (crop?.changed) {
        const croppedPath = `${filePath}.cropped.${extension}`;
        try {
          await execFileAsync(
            process.env.FFMPEG_PATH || "ffmpeg",
            [
              "-hide_banner",
              "-loglevel",
              "error",
              "-y",
              "-i",
              filePath,
              "-vf",
              `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,
              "-frames:v",
              "1",
              croppedPath,
            ],
            { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
          );
          await fs.rename(croppedPath, filePath);
          buffer = await fs.readFile(filePath);
        } finally {
          await fs.rm(croppedPath, { force: true });
        }
      }
      return {
        ...image,
        url: `/generated/${fileName}`,
        base64: buffer.toString("base64"),
        aspectRatio: aspectRatio || undefined,
        dimensions: crop
          ? { width: crop.width, height: crop.height }
          : dimensions || undefined,
      };
    }),
  );
}

async function persistTemplateCover(
  templateId,
  coverImage,
  mimeType = "image/png",
) {
  const clean = String(coverImage || "").replace(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
    "",
  );
  const buffer = Buffer.from(clean, "base64");
  if (!buffer.length)
    throw Object.assign(new Error("模板主图内容为空"), { status: 400 });
  if (buffer.length > 24 * 1024 * 1024)
    throw Object.assign(new Error("模板主图不能超过 24MB"), { status: 400 });
  const extension = String(mimeType).includes("webp")
    ? "webp"
    : String(mimeType).includes("png")
      ? "png"
      : "jpg";
  await fs.mkdir(generatedDir, { recursive: true });
  const fileName = `template-cover-${templateId}-${randomUUID()}.${extension}`;
  await fs.writeFile(path.join(generatedDir, fileName), buffer);
  return `/generated/${fileName}`;
}

async function persistTrustedPersonSource(image, runId, nodeId) {
  const sourceMimeType = String(image?.mimeType || "").toLowerCase();
  if (sourceMimeType.startsWith("video/")) {
    if (!["video/mp4", "video/quicktime"].includes(sourceMimeType))
      throw Object.assign(new Error("真人人物视频仅支持 MP4 或 MOV"), {
        status: 400,
      });
    const buffer = Buffer.from(
      String(image?.data || "").replace(
        /^data:video\/[a-zA-Z0-9.+-]+;base64,/,
        "",
      ),
      "base64",
    );
    if (!buffer.length)
      throw Object.assign(new Error("真人人物视频内容为空"), { status: 400 });
    if (buffer.length > 50 * 1024 * 1024)
      throw Object.assign(new Error("真人人物视频不能超过 50MB"), {
        status: 413,
      });
    await fs.mkdir(generatedDir, { recursive: true });
    const stem = `trusted-person-${runId}-${nodeId}-${randomUUID()}`;
    const inputPath = path.join(
      generatedDir,
      `${stem}.${sourceMimeType === "video/quicktime" ? "mov" : "mp4"}`,
    );
    const outputPath = path.join(generatedDir, `${stem}-normalized.mp4`);
    await fs.writeFile(inputPath, buffer);
    try {
      const normalized = await normalizeSeedanceVideo({
        inputPath,
        outputPath,
        mimeType: sourceMimeType,
        maxDuration: 15,
        maxBytes: 48 * 1024 * 1024,
        forceTranscode: true,
        maxLongEdge: 960,
      });
      if (normalized.duration < 2)
        throw Object.assign(new Error("真人人物视频时长必须为 2–15 秒"), {
          status: 400,
        });
      const filePath = normalized.filePath;
      if (filePath !== inputPath)
        await fs.unlink(inputPath).catch(() => undefined);
      const publicBaseUrl = String(
        process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8791",
      ).replace(/\/$/, "");
      return {
        filePath,
        url: signedGeneratedUrl(
          `${publicBaseUrl}/generated/${path.basename(filePath)}`,
          { ttlMs: 24 * 60 * 60_000 },
        ),
        assetType: "Video",
        durationSeconds: normalized.duration,
      };
    } catch (error) {
      await Promise.all([
        fs.unlink(inputPath).catch(() => undefined),
        fs.unlink(outputPath).catch(() => undefined),
      ]);
      throw error;
    }
  }
  const prepared = await prepareSeedanceImage(image);
  const mimeType = String(prepared.mimeType || "image/png").toLowerCase();
  if (!/^image\/(jpeg|jpg|png|webp)$/.test(mimeType))
    throw Object.assign(new Error("真人资产图片仅支持 JPG、PNG 或 WebP"), {
      status: 400,
    });
  const extension = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
      ? "webp"
      : "jpg";
  const fileName = `trusted-person-${runId}-${nodeId}-${randomUUID()}.${extension}`;
  const filePath = path.join(generatedDir, fileName);
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(filePath, prepared.buffer);
  const publicBaseUrl = String(
    process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8791",
  ).replace(/\/$/, "");
  return {
    filePath,
    url: signedGeneratedUrl(`${publicBaseUrl}/generated/${fileName}`, {
      ttlMs: 24 * 60 * 60_000,
    }),
    assetType: "Image",
  };
}

function trustedPersonFingerprint(image) {
  const payload = Buffer.from(
    String(image?.data || "").replace(
      /^data:(?:image|video)\/[a-zA-Z0-9.+-]+;base64,/,
      "",
    ),
    "base64",
  );
  if (!payload.length)
    throw Object.assign(new Error("真人素材内容为空"), { status: 400 });
  return createHmac(
    "sha256",
    signingSecret(),
  )
    .update(payload)
    .digest("hex");
}

function automaticAssetGroupName(fingerprint) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  return `Commerce Canvas真人-${timestamp}-${fingerprint.slice(0, 8)}`;
}

async function createAutomaticAssetGroup(fingerprint) {
  const created = await createAssetGroup({
    name: automaticAssetGroupName(fingerprint),
    description: "Commerce Canvas auto-created trusted person asset group",
    groupType: "AIGC",
  });
  const groupId = String(created?.Id || created?.GroupId || "").trim();
  if (!groupId) throw new Error("火山 Assets API 创建资产组后未返回 Group ID");
  return groupId;
}

async function persistTrustedPersonBinding(binding) {
  await mutateCollection("trusted_person_assets", (items) =>
    [
      binding,
      ...items.filter(
        (item) =>
          !(
            item.ownerId === binding.ownerId &&
            item.fingerprint === binding.fingerprint
          ),
      ),
    ].slice(0, 2000),
  );
}

async function uploadTrustedPersonAssetOnce({
  image,
  groupId,
  runId,
  nodeId,
  title,
  ownerId,
  templateId,
  fingerprint,
}) {
  const explicitGroupId = String(groupId || "").trim();
  const bindings = await readCollection("trusted_person_assets", []);
  const cached = bindings.find(
    (item) => item.ownerId === ownerId && item.fingerprint === fingerprint,
  );

  if (
    cached?.assetId &&
    (!explicitGroupId || cached.groupId === explicitGroupId)
  ) {
    try {
      const asset = await getAsset(cached.assetId);
      if (String(asset?.Status || "").toLowerCase() === "active") {
        return {
          type: "asset",
          uri: asset.Id || cached.assetId,
          name: image?.name || title,
          groupId: cached.groupId,
          status: asset.Status || "Active",
          assetType:
            cached.assetType ||
            (String(image?.mimeType || "").startsWith("video/")
              ? "Video"
              : "Image"),
          reused: true,
        };
      }
    } catch {
      // The cached asset may have been removed in Volcengine. Recreate it below.
    }
  }

  let normalizedGroupId =
    explicitGroupId || String(cached?.groupId || "").trim();
  if (normalizedGroupId) {
    try {
      const group = await getAssetGroup(normalizedGroupId);
      if (group?.GroupType !== "AIGC")
        throw new Error(
          `资产组类型为 ${group?.GroupType || "未知"}，不能用于 AIGC 真人资产`,
        );
    } catch (error) {
      if (explicitGroupId) throw error;
      normalizedGroupId = "";
    }
  }
  let createdAutomatically = false;
  if (!normalizedGroupId) {
    normalizedGroupId = await createAutomaticAssetGroup(fingerprint);
    createdAutomatically = true;
  }

  const source = await persistTrustedPersonSource(image, runId, nodeId);
  const uploadToGroup = async (targetGroupId) => {
    const created = await createAsset({
      groupId: targetGroupId,
      sourceUrl: source.url,
      assetType: source.assetType,
      name: String(image?.name || title).slice(0, 64),
    });
    const assetId = created?.Id || created?.AssetId;
    if (!assetId) throw new Error("火山 Assets API 未返回资产 ID");
    const active = await waitForAssetActive(assetId);
    return { active, assetId, groupId: targetGroupId };
  };

  try {
    let uploaded;
    try {
      uploaded = await uploadToGroup(normalizedGroupId);
    } catch (error) {
      if (
        explicitGroupId ||
        createdAutomatically ||
        error.code !== "FaceMismatch"
      )
        throw error;
      normalizedGroupId = await createAutomaticAssetGroup(fingerprint);
      uploaded = await uploadToGroup(normalizedGroupId);
    }
    const assetId = uploaded.active?.Id || uploaded.assetId;
    const now = new Date().toISOString();
    await persistTrustedPersonBinding({
      ownerId,
      fingerprint,
      groupId: uploaded.groupId,
      assetId,
      assetStatus: uploaded.active?.Status || "Active",
      assetType: source.assetType,
      templateId: String(templateId || ""),
      sourceNodeId: String(image?.sourceNodeId || ""),
      createdAt: cached?.createdAt || now,
      updatedAt: now,
    });
    return {
      type: "asset",
      uri: assetId,
      name: image?.name || title,
      groupId: uploaded.groupId,
      status: uploaded.active?.Status || "Active",
      assetType: source.assetType,
      reused: false,
    };
  } finally {
    await fs.unlink(source.filePath).catch(() => undefined);
  }
}

async function uploadTrustedPersonAsset(input) {
  const ownerId = String(input.ownerId || "workspace-owner");
  const fingerprint = trustedPersonFingerprint(input.image);
  const jobKey = `${ownerId}:${String(input.groupId || "auto")}:${fingerprint}`;
  if (trustedPersonAssetJobs.has(jobKey))
    return trustedPersonAssetJobs.get(jobKey);
  const job = uploadTrustedPersonAssetOnce({ ...input, ownerId, fingerprint });
  trustedPersonAssetJobs.set(jobKey, job);
  try {
    return await job;
  } finally {
    trustedPersonAssetJobs.delete(jobKey);
  }
}

async function recoverSeedanceTrustedImages({
  ownerId,
  taskId,
  templateId,
  assetUris,
  primaryImage,
  primaryName,
  primaryMimeType,
  referenceImages,
}) {
  const bindings = await readCollection("trusted_person_assets", []);
  const authorizedAssetIds = new Set(
    (assetUris || [])
      .map((asset) => canonicalSeedanceAssetId(asset?.uri))
      .filter(Boolean),
  );
  const groupIds = [
    ...new Set(
      bindings
        .filter(
          (binding) =>
            binding.ownerId === ownerId &&
            authorizedAssetIds.has(canonicalSeedanceAssetId(binding.assetId)),
        )
        .map((binding) => String(binding.groupId || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!groupIds.length) return null;

  const candidates = [
    ...(primaryImage
      ? [
          {
            slot: "primary",
            data: primaryImage,
            name: primaryName || "主图",
            mimeType: primaryMimeType || "image/png",
          },
        ]
      : []),
    ...(referenceImages || []).map((image, index) => ({
      slot: `reference-${index}`,
      ...image,
    })),
  ];
  if (!candidates.length) return null;

  const converted = [];
  const ordinary = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const image = candidates[index];
    let uploaded = null;
    let mismatch = null;
    let noFace = false;
    for (const groupId of groupIds) {
      try {
        uploaded = await uploadTrustedPersonAsset({
          image: {
            data: image.data,
            name: image.name,
            mimeType: image.mimeType,
            sourceNodeId: `privacy-recovery-${image.slot}`,
          },
          groupId,
          runId: taskId,
          nodeId: `privacy-recovery-${index + 1}`,
          title: `真人参考自动入库 ${index + 1}`,
          ownerId,
          templateId,
        });
        break;
      } catch (error) {
        if (isNoFaceAssetError(error)) {
          noFace = true;
          break;
        }
        if (String(error?.code || "") === "FaceMismatch") {
          mismatch = error;
          continue;
        }
        throw error;
      }
    }
    if (uploaded)
      converted.push({
        image,
        asset: { label: "reference_image", uri: uploaded.uri },
      });
    else if (noFace) ordinary.push(image);
    else if (mismatch)
      throw Object.assign(
        new Error(
          `「${image.name}」中的人物与已认证真人不一致，请把该人物也通过“真人人脸输入”授权后再生成。`,
        ),
        { status: 400, code: "FaceMismatch" },
      );
    else ordinary.push(image);
  }

  if (!converted.length) return null;
  return {
    assetUris: uniqueSeedanceAssets([
      ...(assetUris || []),
      ...converted.map((item) => item.asset),
    ]),
    primary: ordinary.find((image) => image.slot === "primary") || null,
    references: ordinary
      .filter((image) => image.slot !== "primary")
      .map(({ slot: _slot, ...image }) => image),
    convertedNames: converted.map((item) => item.image.name),
  };
}

async function persistReferenceVideo(video) {
  await fs.mkdir(generatedDir, { recursive: true });
  const extension = video.mimeType === "video/quicktime" ? "mov" : "mp4";
  const fileName = `reference-${randomUUID()}.${extension}`;
  const filePath = path.join(generatedDir, fileName);
  await fs.writeFile(filePath, Buffer.from(String(video.data || ""), "base64"));
  const publicBaseUrl = String(
    process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8791",
  ).replace(/\/$/, "");
  return {
    url: signedGeneratedUrl(`${publicBaseUrl}/generated/${fileName}`, {
      ttlMs: 24 * 60 * 60_000,
    }),
    path: filePath,
    durationSeconds: await probeMediaDuration(filePath),
    referType: "feature",
    keepOriginalSound: "no",
  };
}

async function persistSeedanceReferenceMedia(
  media,
  kind,
  { maxDuration } = {},
) {
  await fs.mkdir(generatedDir, { recursive: true });
  const originalMimeType = String(media.mimeType || "").toLowerCase();
  const extension =
    kind === "video"
      ? media.mimeType === "video/quicktime"
        ? "mov"
        : media.mimeType === "video/webm"
          ? "webm"
          : "mp4"
      : {
          "audio/mpeg": "mp3",
          "audio/mp3": "mp3",
          "audio/mp4": "m4a",
          "audio/x-m4a": "m4a",
          "audio/wav": "wav",
          "audio/x-wav": "wav",
          "audio/aac": "aac",
          "audio/ogg": "ogg",
          "video/mp4": "mp4",
          "video/quicktime": "mov",
          "video/webm": "webm",
          "video/x-m4v": "m4v",
        }[media.mimeType] || "mp3";
  const stem = `seedance-reference-${randomUUID()}`;
  let fileName = `${stem}.${extension}`;
  const inputPath = path.join(generatedDir, fileName);
  await fs.writeFile(
    inputPath,
    Buffer.from(String(media.data || ""), "base64"),
  );
  let durationSeconds;
  let originalDurationSeconds;
  let trimmed = false;
  let compressed = false;
  let transcoded = false;
  let bytes = Buffer.byteLength(String(media.data || ""), "base64");
  let originalBytes = bytes;
  if (kind === "video") {
    const normalizedFileName = `${stem}-video.mp4`;
    const normalized = await normalizeSeedanceVideo({
      inputPath,
      outputPath: path.join(generatedDir, normalizedFileName),
      mimeType: originalMimeType,
      maxDuration,
    });
    durationSeconds = normalized.duration;
    originalDurationSeconds = normalized.originalDuration;
    trimmed = normalized.trimmed;
    compressed = normalized.compressed;
    transcoded = normalized.transcoded;
    bytes = normalized.bytes;
    originalBytes = normalized.originalBytes;
    if (transcoded) {
      await fs.unlink(inputPath).catch(() => undefined);
      fileName = normalizedFileName;
    }
  } else if (kind === "audio") {
    const normalizedFileName = `${stem}-audio.mp3`;
    const extractedFromVideo = isVideoAudioSource(originalMimeType);
    const normalized = await normalizeSeedanceAudio({
      inputPath,
      outputPath: path.join(generatedDir, normalizedFileName),
      videoDuration: maxDuration,
      forceTranscode: extractedFromVideo,
    });
    durationSeconds = normalized.duration;
    originalDurationSeconds = normalized.originalDuration;
    trimmed = normalized.trimmed;
    transcoded = normalized.transcoded;
    if (transcoded) {
      await fs.unlink(inputPath).catch(() => undefined);
      fileName = normalizedFileName;
      bytes = (await fs.stat(path.join(generatedDir, normalizedFileName))).size;
      compressed = bytes < originalBytes;
    }
  }
  const publicBaseUrl = String(
    process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8791",
  ).replace(/\/$/, "");
  return {
    ...media,
    data: undefined,
    ...(transcoded
      ? {
          mimeType: kind === "video" ? "video/mp4" : "audio/mpeg",
          sourceMimeType: originalMimeType,
        }
      : {}),
    url: signedGeneratedUrl(`${publicBaseUrl}/generated/${fileName}`, {
      ttlMs: 24 * 60 * 60_000,
    }),
    durationSeconds,
    originalDurationSeconds,
    bytes,
    originalBytes,
    trimmed,
    compressed,
    transcoded,
    extractedFromVideo:
      kind === "audio" && isVideoAudioSource(originalMimeType),
  };
}

async function persistMiniMaxImage(media, label = "MiniMax 参考图") {
  const prepared = await prepareSeedanceImage({
    data: String(media?.data || ""),
    mimeType: String(media?.mimeType || "image/png").toLowerCase(),
    name: String(media?.name || label),
  });
  const dimensions = prepared.dimensions || readImageDimensions(prepared.buffer);
  if (
    !dimensions ||
    dimensions.width < 256 ||
    dimensions.height < 256 ||
    dimensions.width > 5760 ||
    dimensions.height > 5760
  )
    throw Object.assign(
      new Error(`${label}宽高必须在 256–5760 像素之间`),
      { status: 400 },
    );
  const ratio = dimensions.width / dimensions.height;
  if (ratio < 0.4 || ratio > 2.5)
    throw Object.assign(new Error(`${label}宽高比必须在 0.4–2.5 之间`), {
      status: 400,
    });
  const mimeType = String(prepared.mimeType || "image/png").toLowerCase();
  const extension = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
      ? "webp"
      : "jpg";
  const fileName = `minimax-reference-${randomUUID()}.${extension}`;
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(path.join(generatedDir, fileName), prepared.buffer);
  const publicBaseUrl = String(
    process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8791",
  ).replace(/\/$/, "");
  return {
    name: String(media?.name || label),
    mimeType,
    url: signedGeneratedUrl(`${publicBaseUrl}/generated/${fileName}`, {
      ttlMs: 24 * 60 * 60_000,
    }),
    dimensions,
    bytes: prepared.buffer.length,
    originalBytes: prepared.originalBytes,
    resized: Boolean(prepared.resized),
    compressed: Boolean(prepared.compressed),
  };
}

async function processImageTask(task, input) {
  try {
    await updateTask(task.id, { status: "processing" });
    const result = await generateImage2(input);
    const images = await persistGeneratedImages(
      result.images,
      task.id,
      input.outputFormat,
      input.aspectRatio,
    );
    await updateTask(task.id, {
      status: "succeeded",
      imageUrl: images[0]?.url || null,
      imageUrls: images.map((image) => image.url),
      coverUrl: images[0]?.url || null,
      resultCount: images.length,
      usage: result.usage || null,
      imageInputs: Array.isArray(result.inputOptimizations)
        ? result.inputOptimizations
        : task.imageInputs || [],
      optimizedInputCount: Array.isArray(result.inputOptimizations)
        ? result.inputOptimizations.filter(
            (item) =>
              item.normalized ||
              item.resized ||
              item.compressed ||
              item.converted,
          ).length
        : 0,
    });
    await mutateCollection("users", (users) =>
      users.map((user) =>
        user.id === task.ownerId
          ? {
              ...user,
              totalGenerated: Number(user.totalGenerated || 0) + images.length,
              updatedAt: new Date().toISOString(),
            }
          : user,
      ),
    );
  } catch (error) {
    const failure = generationErrorDetails(
      error,
      "图片生成失败，请调整素材或稍后重试。",
    );
    await updateTask(task.id, {
      status: "failed",
      error: failure.message,
      failure,
    });
    await refundTaskPoints(task.id, "图片生成失败退款");
    console.error(`Image task ${task.id} failed:`, error.message);
  }
}

async function recoverImageTaskInput(task) {
  if (!task?.recoveryInput) return null;
  const restored = task.recoveryAssets
    ? await loadWorkflowRuntimeAssets(task.recoveryAssets)
    : {};
  return {
    ...task.recoveryInput,
    referenceImages: (restored["image-references"] || []).map((image) => ({
      data: image.data,
      name: image.name,
      mimeType: image.mimeType,
    })),
  };
}

async function refundTaskPoints(id, reason = "视频生成失败退款") {
  const tasks = await readCollection("tasks", []);
  const task = tasks.find((item) => item.id === id);
  if (!task?.pointsCost || !task.ownerId) return null;
  const kind = task.pointsKind || "video";
  const refund = await refundUsagePoints({
    userId: task.ownerId,
    kind,
    quantity: task.pointsCost,
    taskId: task.id,
    reason,
  });
  if (refund.refunded)
    await updateTask(id, { pointsRefundedAt: new Date().toISOString() });
  return refund;
}

function scheduleSeedanceSubmissionExpiry(taskId, deadlineValue) {
  const deadline = Number(deadlineValue || 0);
  const delay = Math.max(0, deadline - Date.now());
  const timer = setTimeout(
    async () => {
      try {
        const tasks = await readCollection("tasks", []);
        const task = tasks.find((item) => item.id === taskId);
        if (
          !task ||
          task.status !== "submitting" ||
          !task.submissionUncertain ||
          task.upstreamTaskId
        )
          return;
        await updateTask(taskId, {
          status: "failed",
          submissionUncertain: false,
          error:
            "Seedance 提交后长时间未返回任务 ID，且未收到上游回调；本次积分已退回，请重新提交。",
        });
        await refundTaskPoints(taskId, "Seedance 提交对账超时退款");
      } catch (error) {
        console.error(
          `Seedance task ${taskId} reconciliation failed:`,
          error.message,
        );
      }
    },
    Math.min(delay, 2_147_000_000),
  );
  timer.unref?.();
}

async function pollTask(
  id,
  upstreamTaskId,
  taskType = "image2video",
  provider = "kling",
) {
  if (activePolls.has(id)) return;
  activePolls.add(id);
  try {
    let statusSyncFailures = 0;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      try {
        const payload =
          provider === "volcengine"
            ? await getSeedanceTask(upstreamTaskId)
            : provider === "minimax"
              ? await getMiniMaxVideoTask(upstreamTaskId)
              : await getVideoTask(upstreamTaskId, taskType);
        const normalized =
          provider === "volcengine"
            ? normalizeSeedanceTask(payload)
            : provider === "minimax"
              ? normalizeMiniMaxVideoTask(payload)
              : normalizeKlingTask(payload);
        await validateProviderMediaUrls([
          normalized.videoUrl,
          normalized.coverUrl,
          ...(Array.isArray(normalized.videoUrls)
            ? normalized.videoUrls
            : []),
          ...(Array.isArray(normalized.imageUrls)
            ? normalized.imageUrls
            : []),
        ]);
        const failure =
          normalized.status === "failed"
            ? generationErrorDetails(
                { message: normalized.error, payload },
                normalized.error,
              )
            : null;
        statusSyncFailures = 0;
        await updateTask(id, {
          ...normalized,
          ...(failure ? { failure } : {}),
          upstreamPayload: payload,
          statusSyncFailures: 0,
          statusSyncWarning: null,
          lastStatusSyncAt: new Date().toISOString(),
        });
        if (normalized.status === "failed") {
          await refundTaskPoints(id);
          return;
        }
        if (normalized.status === "succeeded") return;
      } catch (error) {
        if (error?.code === "EXTERNAL_MEDIA_URL_REJECTED") {
          await updateTask(id, {
            status: "failed",
            error: "供应商返回的媒体地址未通过安全校验。",
            failure: generationErrorDetails(
              error,
              "供应商返回的媒体地址未通过安全校验。",
            ),
          });
          await refundTaskPoints(id, "供应商媒体地址安全校验失败退款");
          return;
        }
        statusSyncFailures += 1;
        await updateTask(id, {
          statusSyncFailures,
          statusSyncWarning: `模型状态暂时无法同步，后台正在自动重试（${statusSyncFailures}）`,
          lastStatusSyncErrorAt: new Date().toISOString(),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
    await updateTask(id, { status: "failed", error: "轮询超时，请稍后重试" });
    await refundTaskPoints(id, "视频任务轮询超时退款");
  } catch (error) {
    await updateTask(id, {
      status: "failed",
      error: generationErrorMessage(error, "视频状态同步失败，请稍后刷新。"),
    });
    await refundTaskPoints(id);
  } finally {
    activePolls.delete(id);
  }
}

async function pollMotionControlSeries(
  id,
  upstreamTaskIds,
  expectedDuration,
  keepOriginalSound = "yes",
) {
  if (activePolls.has(id)) return;
  activePolls.add(id);
  const ids = [...new Set((upstreamTaskIds || []).map(String).filter(Boolean))];
  const states = ids.map((taskId, index) => ({
    index: index + 1,
    taskId,
    status: "queued",
    videoUrl: null,
    payload: null,
  }));
  try {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      for (const state of states) {
        if (state.status === "succeeded") continue;
        const payload = await getVideoTask(state.taskId, "motion-control");
        const normalized = normalizeKlingTask(payload);
        await validateProviderMediaUrls([
          normalized.videoUrl,
          normalized.coverUrl,
        ]);
        state.status = normalized.status;
        state.videoUrl = normalized.videoUrl;
        state.error = normalized.error;
        state.payload = payload;
      }
      const completed = states.filter(
        (state) => state.status === "succeeded",
      ).length;
      await updateTask(id, {
        status: states.some((state) => state.status === "failed")
          ? "failed"
          : "processing",
        motionSegmentProgress: `${completed}/${states.length}`,
        motionSegments: states.map(({ payload: _payload, ...state }) => state),
        upstreamPayload: { segments: states.map((state) => state.payload) },
      });
      const failed = states.find((state) => state.status === "failed");
      if (failed) {
        await updateTask(id, {
          status: "failed",
          error: failed.error || `动作分段 ${failed.index} 生成失败`,
        });
        await refundTaskPoints(id, "长动作分段生成失败退款");
        return;
      }
      if (completed === states.length) {
        const publicBaseUrl = String(
          process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8791",
        ).replace(/\/$/, "");
        const stitched = await stitchMotionResults({
          videoUrls: states.map((state) => state.videoUrl),
          generatedDir,
          publicBaseUrl,
          taskId: id,
          expectedDuration,
          keepOriginalSound: keepOriginalSound === "yes",
        });
        await updateTask(id, {
          status: "succeeded",
          videoUrl: stitched.url,
          duration: String(Math.ceil(stitched.duration)),
          actualDurationSeconds: stitched.duration,
          motionRawDurationSeconds: stitched.sourceDuration,
          motionSegmentProgress: `${states.length}/${states.length}`,
          motionProtectionApplied: true,
          error: null,
          rawStatus: "succeed",
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
    await updateTask(id, {
      status: "failed",
      error: "长动作分段生成轮询超时，请稍后重试",
    });
    await refundTaskPoints(id, "长动作分段轮询超时退款");
  } catch (error) {
    await updateTask(id, {
      status: "failed",
      error: generationErrorMessage(error, "长动作分段合成失败，请稍后重试。"),
    });
    await refundTaskPoints(id, "长动作分段合成失败退款");
  } finally {
    activePolls.delete(id);
  }
}

async function recoverVideoTaskInput(task) {
  if (!task?.recoveryInput) return null;
  const restored = task.recoveryAssets
    ? await loadWorkflowRuntimeAssets(task.recoveryAssets)
    : {};
  return restoreVideoRecoveryInput(task, restored);
}

async function createMiniMaxH3VideoTask(
  item,
  ownerId,
  { existingTaskId = "", deferSubmission = false } = {},
) {
  if (!isMiniMaxVideoConfigured())
    throw Object.assign(
      new Error("MiniMax API 尚未配置，请先在后端设置 MINIMAX_API_KEY"),
      { status: 503, code: "MINIMAX_NOT_CONFIGURED" },
    );
  const taskId = existingTaskId || randomUUID();
  const modelName = "minimax-h3";
  const provider = "minimax";
  const rawContent = Array.isArray(item.content) ? item.content : null;
  const prompt = String(
    item.prompt || rawContent?.find((entry) => entry?.type === "text")?.text || "",
  ).trim();
  const duration = Number(item.duration ?? 5);
  const resolution = String(item.resolution || "768P").toUpperCase();
  const aspectRatio = String(item.aspectRatio || item.ratio || "9:16");
  const mainImage = String(item.image || "").replace(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
    "",
  );
  const tailImage = String(item.imageTail || "").replace(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
    "",
  );
  const referenceImages = (Array.isArray(item.referenceImages)
    ? item.referenceImages
    : []
  ).map((image, index) => ({
    data: String(image?.data || "").replace(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
      "",
    ),
    name: String(image?.name || `参考图 ${index + 1}`),
    mimeType: String(image?.mimeType || "image/png").toLowerCase(),
  }));
  const videos = (Array.isArray(item.videos) ? item.videos : []).map(
    (video, index) => ({
      data: String(video?.data || "").replace(
        /^data:video\/[a-zA-Z0-9.+-]+;base64,/,
        "",
      ),
      name: String(video?.name || `参考视频 ${index + 1}`),
      mimeType: String(video?.mimeType || "video/mp4").toLowerCase(),
    }),
  );
  const audios = (Array.isArray(item.audios) ? item.audios : []).map(
    (audio, index) => ({
      data: String(audio?.data || "").replace(
        /^data:audio\/[a-zA-Z0-9.+-]+;base64,/,
        "",
      ),
      name: String(audio?.name || `参考音频 ${index + 1}`),
      mimeType: String(audio?.mimeType || "audio/mpeg").toLowerCase(),
    }),
  );
  if (
    rawContent &&
    (mainImage || tailImage || referenceImages.length || videos.length || audios.length)
  )
    throw Object.assign(
      new Error("MiniMax content 与本地上传素材不能同时传入"),
      { status: 400 },
    );
  if (item.trustedPerson || (Array.isArray(item.digitalAssetIds) && item.digitalAssetIds.length))
    throw Object.assign(
      new Error("MiniMax-H3 暂不接收平台真人认证或 Element 资产，请改用普通参考图"),
      { status: 400 },
    );
  if (mainImage && decodedMediaBytes(mainImage) > 30 * 1024 * 1024)
    throw Object.assign(new Error("MiniMax-H3 首帧或参考图不能超过 30MB"), {
      status: 413,
    });
  if (tailImage && decodedMediaBytes(tailImage) > 30 * 1024 * 1024)
    throw Object.assign(new Error("MiniMax-H3 尾帧图不能超过 30MB"), {
      status: 413,
    });
  if (
    referenceImages.some(
      (image) =>
        !image.data ||
        !/^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(image.mimeType) ||
        decodedMediaBytes(image.data) > 30 * 1024 * 1024,
    )
  )
    throw Object.assign(
      new Error("MiniMax-H3 参考图仅支持 JPG、PNG、WebP、HEIC/HEIF，单张不超过 30MB"),
      { status: 400 },
    );
  if (
    videos.length > 3 ||
    videos.some(
      (video) =>
        !video.data ||
        !/^video\/(mp4|quicktime)$/.test(video.mimeType) ||
        decodedMediaBytes(video.data) > 50 * 1024 * 1024,
    )
  )
    throw Object.assign(
      new Error("MiniMax-H3 参考视频最多 3 段，仅支持 MP4/MOV，单段不超过 50MB"),
      { status: 400 },
    );
  if (
    audios.length > 3 ||
    audios.some(
      (audio) =>
        !audio.data ||
        !/^audio\/(mpeg|mp3|wav|x-wav)$/.test(audio.mimeType) ||
        decodedMediaBytes(audio.data) > 15 * 1024 * 1024,
    )
  )
    throw Object.assign(
      new Error("MiniMax-H3 参考音频最多 3 段，仅支持 MP3/WAV，单段不超过 15MB"),
      { status: 400 },
    );

  const externalReferenceImages = (Array.isArray(item.referenceImageUrls)
    ? item.referenceImageUrls
    : []
  ).map((value) => (typeof value === "string" ? value : value?.url)).filter(Boolean);
  const externalReferenceVideos = (Array.isArray(item.videoUrls)
    ? item.videoUrls
    : []
  ).map((value) => (typeof value === "string" ? value : value?.url || value?.videoUrl)).filter(Boolean);
  const externalReferenceAudios = (Array.isArray(item.audioUrls)
    ? item.audioUrls
    : []
  ).map((value) => (typeof value === "string" ? value : value?.url || value?.audioUrl)).filter(Boolean);
  await validateProviderMediaUrls([
    ...miniMaxContentMediaUrls(rawContent),
    ...externalReferenceImages,
    ...externalReferenceVideos,
    ...externalReferenceAudios,
    item.firstFrameUrl,
    item.lastFrameUrl,
  ]);
  const callbackUrl = await safeProviderCallbackUrl(item.callbackUrl);
  const referenceMode = Boolean(
    referenceImages.length ||
      videos.length ||
      audios.length ||
      externalReferenceImages.length ||
      externalReferenceVideos.length ||
      externalReferenceAudios.length,
  );
  if (referenceMode && tailImage)
    throw Object.assign(
      new Error("MiniMax-H3 首尾帧与多模态参考素材不能混用"),
      { status: 400 },
    );

  const [persistedMain, persistedTail, persistedImages, persistedVideos, persistedAudios] =
    rawContent
      ? [null, null, [], [], []]
      : await Promise.all([
          mainImage
            ? persistMiniMaxImage(
                {
                  data: mainImage,
                  mimeType: String(item.imageMimeType || "image/png").toLowerCase(),
                  name: String(item.fileName || "主图"),
                },
                "MiniMax 主图",
              )
            : null,
          tailImage
            ? persistMiniMaxImage(
                {
                  data: tailImage,
                  mimeType: String(item.imageTailMimeType || "image/png").toLowerCase(),
                  name: "尾帧",
                },
                "MiniMax 尾帧",
              )
            : null,
          Promise.all(
            referenceImages.map((image) =>
              persistMiniMaxImage(image, `MiniMax ${image.name}`),
            ),
          ),
          Promise.all(
            videos.map((video) =>
              persistSeedanceReferenceMedia(video, "video", { maxDuration: 15 }),
            ),
          ),
          Promise.all(
            audios.map((audio) =>
              persistSeedanceReferenceMedia(audio, "audio", { maxDuration: 15 }),
            ),
          ),
        ]);
  if (
    [...persistedVideos, ...persistedAudios].some(
      (media) => !Number.isFinite(media.durationSeconds) || media.durationSeconds < 2,
    )
  )
    throw Object.assign(new Error("MiniMax-H3 参考视频和音频单段时长必须在 2–15 秒"), {
      status: 400,
    });
  if (
    persistedVideos.reduce((sum, media) => sum + media.durationSeconds, 0) > 15 ||
    persistedAudios.reduce((sum, media) => sum + media.durationSeconds, 0) > 15
  )
    throw Object.assign(new Error("MiniMax-H3 参考视频或音频总时长不能超过 15 秒"), {
      status: 400,
    });

  const submissionInput = rawContent
    ? {
        content: rawContent,
        resolution,
        duration,
        ratio: aspectRatio,
        callbackUrl,
        aigcWatermark: item.aigcWatermark ?? item.watermark,
      }
    : {
        prompt,
        ...(referenceMode
          ? {
              referenceImages: [
                ...(persistedMain ? [persistedMain.url] : []),
                ...persistedImages.map((image) => image.url),
                ...externalReferenceImages,
              ],
              referenceVideos: [
                ...persistedVideos.map((video) => video.url),
                ...externalReferenceVideos,
              ],
              referenceAudios: [
                ...persistedAudios.map((audio) => audio.url),
                ...externalReferenceAudios,
              ],
            }
          : {
              imageUrl: persistedMain?.url || item.firstFrameUrl,
              imageTailUrl: persistedTail?.url || item.lastFrameUrl,
            }),
        resolution,
        duration,
        ratio: aspectRatio,
        callbackUrl,
        aigcWatermark: item.aigcWatermark ?? item.watermark,
      };
  const requestBody = buildMiniMaxVideoRequest(submissionInput);
  const createdAt = new Date().toISOString();
  const existingTask = existingTaskId
    ? (await readCollection("tasks", [])).find(
        (entry) => entry.id === existingTaskId && ownedBy(entry, ownerId),
      )
    : null;
  if (existingTaskId && !existingTask)
    throw Object.assign(new Error("待恢复的 MiniMax 视频任务不存在"), {
      status: 404,
    });
  const recoveryInput = existingTask?.recoveryInput || videoRecoveryInput(item);
  const recoveryAssets =
    existingTask?.recoveryAssets ||
    (await persistWorkflowRuntimeAssets(videoRecoveryAssets(item)));
  const task = {
    id: taskId,
    ownerId,
    workflowNodeId: String(item.workflowNodeId || ""),
    workflowRunId: String(item.workflowRunId || ""),
    workflowTemplateId: String(item.workflowTemplateId || ""),
    workflowName: String(item.workflowName || ""),
    upstreamTaskId: null,
    taskType: "minimax-h3-video",
    sourceType: referenceMode
      ? "multimodal"
      : persistedMain
        ? "image"
        : "text",
    fileName: String(item.fileName || "MiniMax-H3 视频"),
    prompt,
    modelName,
    provider,
    resolution: requestBody.resolution,
    duration: String(requestBody.duration),
    aspectRatio: requestBody.ratio,
    watermark: Boolean(requestBody.aigc_watermark),
    inputMode: requestBody.content.some((entry) => entry.role?.startsWith("reference_"))
      ? "reference"
      : requestBody.content.some((entry) => ["first_frame", "last_frame"].includes(entry.role))
        ? "frame"
        : "text",
    imageInputs: [persistedMain, persistedTail, ...persistedImages]
      .filter(Boolean)
      .map(({ url: _url, ...image }) => image),
    videoInputs: persistedVideos.map(({ url: _url, ...video }) => video),
    audioInputs: persistedAudios.map(({ url: _url, ...audio }) => audio),
    status: "submitting",
    videoUrl: null,
    coverUrl: null,
    error: null,
    pointsCost: videoPointCost(requestBody.duration),
    pointsKind: "video",
    pointsRefundedAt: null,
    recoveryInput,
    recoveryAssets,
    submissionAttempt: Number(existingTask?.submissionAttempt || 0) + 1,
    createdAt: existingTask?.createdAt || createdAt,
    updatedAt: createdAt,
  };
  if (existingTask) {
    task.pointsCost = existingTask.pointsCost;
    task.pointsKind = existingTask.pointsKind || "video";
    task.pointsBalanceAfter = existingTask.pointsBalanceAfter;
    task.pointsRefundedAt = existingTask.pointsRefundedAt || null;
    await updateTask(task.id, task);
  } else {
    const charge = await chargeVideoPoints({
      userId: ownerId,
      duration: requestBody.duration,
      taskId: task.id,
    });
    task.pointsBalanceAfter = charge.balanceAfter;
    try {
      await mutateCollection("tasks", (tasks) => [task, ...tasks]);
    } catch (error) {
      await refundVideoPoints({
        userId: ownerId,
        amount: task.pointsCost,
        taskId: task.id,
        reason: "MiniMax 视频任务创建失败退款",
      });
      throw error;
    }
  }

  const performSubmission = async () => {
    try {
      const submitted = await submitMiniMaxVideo(submissionInput);
      const updated = await updateTask(task.id, {
        upstreamTaskId: submitted.taskId,
        status: "queued",
        upstreamPayload: submitted.payload,
      });
      void pollTask(task.id, submitted.taskId, submitted.taskType, "minimax");
      return safeTask(updated);
    } catch (error) {
      const message = generationErrorMessage(
        error,
        "MiniMax 视频生成提交失败，请调整素材或稍后重试。",
      );
      const failure = generationErrorDetails(error, message);
      await updateTask(task.id, {
        status: "failed",
        error: message,
        failure,
        upstreamPayload: error.payload,
      });
      await refundTaskPoints(task.id, "MiniMax 视频提交失败退款");
      throw Object.assign(new Error(message), {
        status: error.status || 502,
        code: error.code,
        payload: error.payload,
      });
    }
  };
  if (deferSubmission) {
    void performSubmission().catch((error) =>
      console.error(`MiniMax task ${task.id} submission failed:`, error.message),
    );
    return safeTask(task);
  }
  return performSubmission();
}

async function createVideoTask(
  item,
  ownerId,
  { existingTaskId = "", deferSubmission = false } = {},
) {
  if (String(item?.modelName || "").trim() === "minimax-h3")
    return createMiniMaxH3VideoTask(item, ownerId, {
      existingTaskId,
      deferSubmission,
    });
  let base64 = String(item.image || "").replace(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
    "",
  );
  let imageTail = String(item.imageTail || "").replace(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
    "",
  );
  let imageMimeType = String(item.imageMimeType || "image/png").toLowerCase();
  let imageTailMimeType = String(
    item.imageTailMimeType || "image/png",
  ).toLowerCase();
  let referenceImages = (
    Array.isArray(item.referenceImages) ? item.referenceImages : []
  ).map((image, index) => ({
    data: String(image?.data || "").replace(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
      "",
    ),
    name: String(image?.name || `reference_${index + 1}`),
    mimeType: String(image?.mimeType || "image/png").toLowerCase(),
    label: String(image?.label || `image_${index + 2}`),
  }));
  let videos = (Array.isArray(item.videos) ? item.videos : []).map(
    (video, index) => ({
      data: String(video?.data || "").replace(
        /^data:video\/[a-zA-Z0-9.+-]+;base64,/,
        "",
      ),
      name: String(video?.name || `video_${index + 1}`),
      mimeType: String(video?.mimeType || "video/mp4").toLowerCase(),
      label: String(video?.label || `video_${index + 1}`),
    }),
  );
  const rawVideoUrls = Array.isArray(item.videoUrls)
    ? item.videoUrls
    : item.videoUrl
      ? [
          {
            url: item.videoUrl,
            referType: item.videoReferType,
            keepOriginalSound: item.keepOriginalSound,
          },
        ]
      : [];
  let videoUrls = rawVideoUrls.map((video) => ({
    url: String(video?.url || video?.videoUrl || "").trim(),
    referType: String(video?.referType || video?.refer_type || "base"),
    keepOriginalSound: String(
      video?.keepOriginalSound || video?.keep_original_sound || "no",
    ),
  }));
  await validateProviderMediaUrls(videoUrls.map((video) => video.url));
  let audios = (Array.isArray(item.audios) ? item.audios : []).map(
    (audio, index) => ({
      data: String(audio?.data || "").replace(
        /^data:(?:audio|video)\/[a-zA-Z0-9.+-]+;base64,/,
        "",
      ),
      name: String(audio?.name || `audio_${index + 1}`),
      mimeType: String(audio?.mimeType || "audio/mpeg").toLowerCase(),
      label: String(audio?.label || `voice_${index + 1}`),
    }),
  );
  let assetUris = uniqueSeedanceAssets(
    (Array.isArray(item.assetUris) ? item.assetUris : [])
      .map((asset, index) => ({
        label: String(asset?.label || `asset_uri_${index + 1}`),
        uri: String(asset?.uri || "").trim(),
      }))
      .filter((asset) => asset.uri),
  );
  const modelName = String(item.modelName || "kling-v3");
  const isOmni = modelName === "kling-v3-omni";
  const isTurbo = modelName === "kling-v3-turbo";
  const isMotionControl = modelName === "kling-v3-motion-control";
  const isSeedance = isSeedanceModel(modelName);
  const useTrustedPerson = item.trustedPerson === true;
  let submissionImage = seedanceSubmissionImage({
    trustedPerson: useTrustedPerson,
    seedance: isSeedance,
    image: base64,
  });
  let submissionImageMimeType = imageMimeType;
  let submissionImageResize = null;
  let tailFrameResize = null;
  const taskId = existingTaskId || randomUUID();
  const digitalAssetIds = [
    ...new Set(
      (Array.isArray(item.digitalAssetIds) ? item.digitalAssetIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];
  let digitalAssetGuidance = "";
  if (digitalAssetIds.length) {
    if (!isOmni)
      throw Object.assign(
        new Error("平台数字参考资产目前仅支持 Kling 3.0 Omni"),
        { status: 400 },
      );
    const assets = await readCollection("digital_assets", []);
    const selectedAssets = digitalAssetIds.map((id) =>
      assets.find((asset) => asset.id === id && ownedBy(asset, ownerId)),
    );
    if (selectedAssets.some((asset) => !asset))
      throw Object.assign(new Error("选择的数字资产不存在或已失效"), {
        status: 400,
      });
    const { elementAssets, referenceAssets } =
      splitKlingOmniDigitalAssets(selectedAssets);
    const boundElementAssets = elementAssets.map((asset) => {
      const existing = assetUris.find(
        (item) => String(item.uri) === String(asset.klingElementId),
      );
      const binding = existing || {
        label: `element_${assetUris.length + 1}`,
        uri: String(asset.klingElementId),
      };
      if (!existing) assetUris.push(binding);
      return { asset, label: binding.label };
    });
    if (assetUris.length > 3)
      throw Object.assign(
        new Error("Kling 3.0 Omni 最多绑定 3 个 Element 主体"),
        { status: 400 },
      );
    const guidance = [];
    for (const asset of referenceAssets) {
      const indexes = [];
      for (const image of asset.images || []) {
        const imageBuffer = await digitalAssetImageBuffer(image);
        if (!imageBuffer?.length) continue;
        const imageIndex = (base64 ? 1 : 0) + referenceImages.length + 1;
        indexes.push(imageIndex);
        referenceImages.push({
          data: imageBuffer.toString("base64"),
          name: String(image.name || `${asset.name}-${indexes.length}`),
          mimeType: String(image.mimeType || "image/png").toLowerCase(),
          label: `image_${imageIndex}`,
        });
      }
      const refs = indexes.map((index) => `<<<image_${index}>>>`).join("、");
      const rule =
        asset.kind === "clothing"
          ? `服装资产「${asset.name}」以 ${refs} 为唯一服装参考，严格保持版型、颜色、面料纹理、图案、Logo、口袋和五金位置，不得换款或改色。`
          : asset.kind === "face"
            ? `人脸资产「${asset.name}」以 ${refs} 为身份参考，严格锁定五官、脸型、肤色、年龄感和发型，不得换脸。`
            : asset.kind === "avatar"
              ? `数字人素材「${asset.name}」以 ${refs} 为唯一人物参考，保持人物外观、服饰与画面主体一致。`
              : `人物资产「${asset.name}」以 ${refs} 为身份参考，严格保持同一人物、脸部、身材比例和发型。`;
      guidance.push(rule);
    }
    const elementGuidance = boundElementAssets.map(
      ({ asset, label }) =>
        `可灵主体「${asset.name}」已通过 <<<${label}>>> 绑定，必须保持主体身份、外观和关键细节一致。`,
    );
    const allGuidance = [...elementGuidance, ...guidance];
    digitalAssetGuidance = allGuidance.length
      ? `\n\n【数字资产一致性约束】\n${allGuidance.join("\n")}`
      : "";
  }
  if (!String(item.prompt || "").trim())
    throw Object.assign(new Error("提示词不能为空"), { status: 400 });
  if (base64 && !/^image\/(jpeg|jpg|png|webp)$/.test(imageMimeType))
    throw Object.assign(new Error("主图格式仅支持 JPG、PNG 或 WebP"), {
      status: 400,
    });
  if (
    (isOmni || isMotionControl) &&
    base64 &&
    !/^image\/(jpeg|jpg|png)$/.test(imageMimeType)
  )
    throw Object.assign(
      new Error(
        `${isMotionControl ? "动作控制人物图" : "Kling 3.0 Omni 图片"}仅支持 JPG 或 PNG`,
      ),
      { status: 400 },
    );
  if (
    decodedMediaBytes(base64) >
    (isSeedance ? SEEDANCE_UPLOAD_LIMITS.image : 24 * 1024 * 1024)
  )
    throw Object.assign(
      new Error(
        isSeedance
          ? "单张图片超过 48MB，无法安全自动优化"
          : "图片过大，请压缩到 24MB 以内",
      ),
      { status: 413 },
    );
  if (imageTail && !base64)
    throw Object.assign(new Error("V3 尾帧必须与首帧一起使用"), {
      status: 400,
    });
  if (isTurbo && !base64)
    throw Object.assign(
      new Error("Kling 3.0 Turbo 仅支持图生视频，请上传首帧图片"),
      { status: 400 },
    );
  if (isMotionControl && !base64)
    throw Object.assign(new Error("动作控制必须上传一张人物参考图"), {
      status: 400,
    });
  if (isTurbo && !/^image\/(jpeg|jpg|png)$/.test(imageMimeType))
    throw Object.assign(new Error("Kling 3.0 Turbo 首帧仅支持 JPG 或 PNG"), {
      status: 400,
    });
  if (decodedMediaBytes(imageTail) > 24 * 1024 * 1024)
    throw Object.assign(new Error("尾帧图片过大，请压缩到 24MB 以内"), {
      status: 413,
    });
  if (isOmni && decodedMediaBytes(base64) > 10 * 1024 * 1024)
    throw Object.assign(new Error("Kling 3.0 Omni 单张图片不能超过 10MB"), {
      status: 413,
    });
  if (
    isSeedance &&
    referenceImages.length + (base64 ? 1 : 0) + assetUris.length > 9
  )
    throw Object.assign(
      new Error("Seedance 的普通图片与已认证真人参考合计最多 9 张"),
      { status: 400 },
    );
  if (isOmni && referenceImages.length + (base64 ? 1 : 0) > 7)
    throw Object.assign(
      new Error(
        "Kling 3.0 Omni 主图、参考图与平台数字资产图片合计不能超过 7 张",
      ),
      { status: 400 },
    );
  if (
    referenceImages.some(
      (image) =>
        !image.data || !/^image\/(jpeg|jpg|png|webp)$/.test(image.mimeType),
    )
  )
    throw Object.assign(new Error("参考图片格式仅支持 JPG、PNG 或 WebP"), {
      status: 400,
    });
  if (
    isOmni &&
    referenceImages.some(
      (image) => !/^image\/(jpeg|jpg|png)$/.test(image.mimeType),
    )
  )
    throw Object.assign(new Error("Kling 3.0 Omni 参考图片仅支持 JPG 或 PNG"), {
      status: 400,
    });
  if (
    referenceImages.some(
      (image) =>
        decodedMediaBytes(image.data) >
        (isSeedance ? SEEDANCE_UPLOAD_LIMITS.image : 24 * 1024 * 1024),
    )
  )
    throw Object.assign(
      new Error(
        isSeedance
          ? "单张参考图片超过 48MB，无法安全自动优化"
          : "单张参考图片过大，请压缩到 24MB 以内",
      ),
      { status: 413 },
    );
  if (
    isOmni &&
    referenceImages.some(
      (image) => decodedMediaBytes(image.data) > 10 * 1024 * 1024,
    )
  )
    throw Object.assign(new Error("Kling 3.0 Omni 单张参考图片不能超过 10MB"), {
      status: 413,
    });
  if (videos.length > 3)
    throw Object.assign(new Error("Seedance 最多支持 3 段参考视频"), {
      status: 400,
    });
  if (
    videos.some(
      (video) =>
        !video.data || !/^video\/(mp4|quicktime|webm)$/.test(video.mimeType),
    )
  )
    throw Object.assign(new Error("参考视频格式仅支持 MP4、MOV 或 WebM"), {
      status: 400,
    });
  if (
    videos.some(
      (video) =>
        decodedMediaBytes(video.data) >
        (isSeedance
          ? SEEDANCE_UPLOAD_LIMITS.video
          : isMotionControl
            ? 100 * 1024 * 1024
            : 20 * 1024 * 1024),
    )
  )
    throw Object.assign(
      new Error(
        isSeedance
          ? "单段参考视频超过 60MB，无法安全自动优化"
          : isMotionControl
            ? "动作参考视频不能超过 100MB"
            : "单段参考视频过大，请压缩到 20MB 以内",
      ),
      { status: 413 },
    );
  if (
    isOmni &&
    videos.some((video) => !/^video\/(mp4|quicktime)$/.test(video.mimeType))
  )
    throw Object.assign(
      new Error("Kling 3.0 Omni 本地参考视频仅支持 MP4 或 MOV"),
      { status: 400 },
    );
  if (isMotionControl && videos.length + videoUrls.length !== 1)
    throw Object.assign(
      new Error("动作控制需要且只能上传 1 段舞蹈动作参考视频"),
      { status: 400 },
    );
  if (
    isMotionControl &&
    videos.some((video) => !/^video\/(mp4|quicktime)$/.test(video.mimeType))
  )
    throw Object.assign(new Error("动作控制参考视频仅支持 MP4 或 MOV"), {
      status: 400,
    });
  if (audios.length > 3)
    throw Object.assign(new Error("Seedance 最多支持 3 路音频"), {
      status: 400,
    });
  if (
    audios.some(
      (audio) =>
        !audio.data ||
        !/^(?:audio\/(mpeg|mp3|mp4|x-m4a|wav|x-wav|aac|ogg)|video\/(mp4|quicktime|webm|x-m4v))$/.test(
          audio.mimeType,
        ),
    )
  )
    throw Object.assign(
      new Error(
        "参考声音支持 MP3、M4A、WAV、AAC、OGG，以及带音轨的 MP4、MOV、WebM、M4V",
      ),
      { status: 400 },
    );
  if (
    audios.some(
      (audio) =>
        decodedMediaBytes(audio.data) >
        (isVideoAudioSource(audio.mimeType)
          ? SEEDANCE_UPLOAD_LIMITS.audioVideo
          : SEEDANCE_UPLOAD_LIMITS.audio),
    )
  )
    throw Object.assign(
      new Error(
        "参考音频最大支持 30MB；作为声音导入的视频最大支持 60MB，后台会自动抽取并压缩",
      ),
      { status: 413 },
    );
  if (
    isSeedance &&
    audios.length &&
    !base64 &&
    !referenceImages.length &&
    !videos.length &&
    !assetUris.length
  )
    throw Object.assign(
      new Error("音频驱动口播至少需要一张人物图片、参考视频或真人资产"),
      { status: 400 },
    );
  if (
    assetUris.length > 9 ||
    assetUris.some(
      (asset) => asset.uri.length > 2048 || /[\u0000-\u001f]/.test(asset.uri),
    )
  )
    throw Object.assign(new Error("数字资产 URI 不合法"), { status: 400 });
  if (
    isSeedance &&
    assetUris.some(
      (asset) =>
        !/^(?:asset:\/\/)?asset-[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(asset.uri),
    )
  )
    throw Object.assign(
      new Error(
        "Seedance 真人资产必须使用 asset-... 或 asset://asset-... 格式",
      ),
      { status: 400 },
    );
  if (isOmni && assetUris.some((asset) => !/^\d+$/.test(asset.uri)))
    throw Object.assign(
      new Error("Kling Omni 数字资产必须填写纯数字 Element ID"),
      { status: 400 },
    );
  if (videoUrls.length + (isOmni ? videos.length : 0) > 1)
    throw Object.assign(new Error("Kling 3.0 Omni 最多支持 1 段参考视频"), {
      status: 400,
    });
  const totalMediaSize =
    decodedMediaBytes(base64) +
    referenceImages.reduce(
      (sum, image) => sum + decodedMediaBytes(image.data),
      0,
    ) +
    videos.reduce((sum, video) => sum + decodedMediaBytes(video.data), 0) +
    audios.reduce((sum, audio) => sum + decodedMediaBytes(audio.data), 0);
  if (
    totalMediaSize >
    (isMotionControl ? 110 * 1024 * 1024 : SEEDANCE_UPLOAD_LIMITS.total)
  )
    throw Object.assign(
      new Error(
        isMotionControl
          ? "人物图与动作视频合计不能超过 110MB"
          : "本次多模态原始素材超过 96MB，请分批提交或移除不必要素材",
      ),
      { status: 413 },
    );
  const localVideoInputs = videos.map(({ name, mimeType, label }) => ({
    name,
    mimeType,
    label,
  }));
  let motionReference = null;
  let motionSubmissionSegments = [];
  if ((isOmni || isMotionControl) && videos.length) {
    const persistedVideos = await Promise.all(
      videos.map(persistReferenceVideo),
    );
    if (isMotionControl) motionReference = persistedVideos[0];
    videoUrls = [...videoUrls, ...persistedVideos];
    videos = [];
  }

  let duration = Number(item.duration ?? 15);
  const provider = isSeedance ? "volcengine" : "kling";
  const mode = provider === "kling" ? String(item.mode || "pro") : undefined;
  const cfgScale =
    provider === "kling" ? Number(item.cfgScale ?? 0.8) : undefined;
  const rawAspectRatio = String(item.aspectRatio || "16:9");
  const aspectRatio =
    provider === "volcengine"
      ? rawAspectRatio
      : normalizeVideoAspectRatio(rawAspectRatio);
  const shotType = String(item.shotType || "intelligence");
  const multiPrompt = Array.isArray(item.multiPrompt) ? item.multiPrompt : [];
  const sound = String(item.sound || "off");
  const watermark = Boolean(item.watermark);
  const resolution = String(item.resolution || "720p").toLowerCase();
  const generateAudio = audios.length ? true : item.generateAudio !== false;
  const audioMode =
    audios.length && item.audioMode === "reference"
      ? "reference"
      : audios.length
        ? "lip_sync"
        : "native";
  const ratioMode = item.ratioMode === "fixed" ? "fixed" : "adaptive";
  const characterOrientation = String(item.characterOrientation || "video");
  if (isMotionControl && motionReference?.durationSeconds)
    duration = Math.ceil(motionReference.durationSeconds);
  const minimumDuration = provider === "volcengine" ? 4 : 3;
  const maximumDuration = isMotionControl
    ? characterOrientation === "image"
      ? 10
      : 30
    : 15;
  if (
    !Number.isInteger(duration) ||
    duration < minimumDuration ||
    duration > maximumDuration
  )
    throw Object.assign(
      new Error(`时长必须是 ${minimumDuration}–${maximumDuration} 秒的整数`),
      { status: 400 },
    );
  if (isMotionControl && !["image", "video"].includes(characterOrientation))
    throw Object.assign(new Error("动作控制人物朝向只能跟随图片或动作视频"), {
      status: 400,
    });
  if (
    isMotionControl &&
    !["yes", "no"].includes(String(item.keepOriginalSound || "yes"))
  )
    throw Object.assign(new Error("动作控制原声参数只能是 yes 或 no"), {
      status: 400,
    });
  if (
    provider === "kling" &&
    !(
      isTurbo
        ? ["720p", "1080p"]
        : isOmni
          ? ["std", "pro", "4k"]
          : ["std", "pro"]
    ).includes(mode)
  )
    throw Object.assign(
      new Error(
        isTurbo
          ? "Kling 3.0 Turbo 分辨率只能是 720P 或 1080P"
          : isOmni
            ? "Omni 生成模式只能是 std、pro 或 4k"
            : "生成模式只能是 std 或 pro",
      ),
      { status: 400 },
    );
  if (
    provider === "kling" &&
    (!Number.isFinite(cfgScale) || cfgScale < 0 || cfgScale > 1)
  )
    throw Object.assign(new Error("CFG 必须在 0–1 之间"), { status: 400 });
  if (
    !(
      provider === "volcengine"
        ? ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]
        : ["16:9", "9:16", "1:1"]
    ).includes(aspectRatio)
  )
    throw Object.assign(new Error("不支持该画幅比例"), { status: 400 });
  if (
    ![
      "kling-v3",
      "kling-v3-omni",
      "kling-v3-turbo",
      "kling-v3-motion-control",
      ...SEEDANCE_MODELS,
    ].includes(modelName)
  )
    throw Object.assign(new Error("不支持该视频模型"), { status: 400 });
  if (
    isMotionControl &&
    motionReference &&
    item.motionLongProtection !== false &&
    motionReference.durationSeconds > 5.25
  ) {
    const publicBaseUrl = String(
      process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8791",
    ).replace(/\/$/, "");
    motionSubmissionSegments = await splitMotionReference({
      inputPath: motionReference.path,
      generatedDir,
      publicBaseUrl,
      taskId,
      durationSeconds: motionReference.durationSeconds,
    });
  }
  videoUrls = videoUrls.map(
    ({ path: _path, durationSeconds: _durationSeconds, ...video }) => video,
  );
  if (
    provider === "volcengine" &&
    !["480p", "720p", "1080p", "4k"].includes(resolution)
  )
    throw Object.assign(
      new Error("Seedance 分辨率只能是 480P、720P、1080P 或 4K"),
      { status: 400 },
    );
  if (
    provider === "volcengine" &&
    (modelName.includes("-fast") || modelName.includes("-mini")) &&
    ["1080p", "4k"].includes(resolution)
  )
    throw Object.assign(
      new Error("Seedance Fast 仅支持 480P 或 720P；1080P/4K 请切换标准模型"),
      { status: 400 },
    );
  if (
    modelName === "kling-v3" &&
    (referenceImages.length || videos.length || videoUrls.length)
  )
    throw Object.assign(
      new Error(
        "Kling 3.0 基础接口仅支持单张主图；多图、Element 或参考视频请使用 Kling 3.0 Omni",
      ),
      { status: 400 },
    );
  if (
    isTurbo &&
    (imageTail ||
      referenceImages.length ||
      videos.length ||
      videoUrls.length ||
      assetUris.length ||
      digitalAssetIds.length)
  )
    throw Object.assign(
      new Error(
        "Kling 3.0 Turbo 仅支持提示词与单张首帧图，不支持尾帧、多图、视频或数字资产",
      ),
      { status: 400 },
    );
  if (
    isMotionControl &&
    (imageTail ||
      referenceImages.length ||
      assetUris.length ||
      digitalAssetIds.length ||
      audios.length)
  )
    throw Object.assign(
      new Error(
        "动作控制仅接收人物图与一段动作视频，不支持尾帧、多图、数字资产或外部音频",
      ),
      { status: 400 },
    );
  if (provider === "kling" && audios.length)
    throw Object.assign(
      new Error(
        "可灵视频接口不接收本地外部音频；Omni 可开启原生声音或使用已绑定音色的 Element",
      ),
      { status: 400 },
    );
  if (modelName === "kling-v3" && assetUris.length > 3)
    throw Object.assign(new Error("Kling 3.0 最多绑定 3 个 Element 主体"), {
      status: 400,
    });
  if (
    modelName === "kling-v3" &&
    assetUris.some((asset) => !/^\d+$/.test(asset.uri))
  )
    throw Object.assign(new Error("Kling 3.0 主体必须填写纯数字 Element ID"), {
      status: 400,
    });
  if (isOmni && videos.length)
    throw Object.assign(
      new Error(
        "Omni 参考视频必须使用可公开访问的 URL，本地视频需先上传到对象存储",
      ),
      { status: 400 },
    );
  if (!isOmni && !isMotionControl && videoUrls.length)
    throw Object.assign(
      new Error("参考视频 URL 仅用于 Kling 3.0 Omni 或动作控制"),
      { status: 400 },
    );
  if (provider === "volcengine" && !getVolcengineStatus().ready) {
    throw Object.assign(
      new Error(
        "Seedance 2.0 当前不可用；请检查方舟 API Key 或 IAM 的 ark:GetApiKey 权限",
      ),
      { status: 503 },
    );
  }
  let trustedPersonAsset = null;
  if (useTrustedPerson) {
    const uploaded = await uploadTrustedPersonAsset({
      image: {
        data: base64,
        name: String(item.fileName || "真人人脸主图"),
        mimeType: imageMimeType,
        sourceNodeId: "create-main",
      },
      runId: taskId,
      nodeId: "create-main",
      title: "灵感创作真人人脸",
      ownerId,
      templateId: "create",
    });
    assetUris = [
      { label: "reference_image", uri: uploaded.uri },
      ...assetUris.filter(
        (asset) =>
          asset.uri !== uploaded.uri && asset.uri !== `asset://${uploaded.uri}`,
      ),
    ];
    trustedPersonAsset = {
      assetId: uploaded.uri,
      status: uploaded.status,
      reused: Boolean(uploaded.reused),
    };
  }
  if (provider === "kling" && !isOmni && !isMotionControl) {
    if (base64) {
      const prepared = await prepareKlingFrame({
        data: base64,
        mimeType: imageMimeType,
        name: String(item.fileName || "主图"),
      });
      base64 = prepared.buffer.toString("base64");
      imageMimeType = prepared.mimeType;
      submissionImageMimeType = prepared.mimeType;
      submissionImageResize = {
        originalDimensions: prepared.originalDimensions,
        dimensions: prepared.dimensions,
        originalBytes: prepared.originalBytes,
        bytes: prepared.bytes,
        resized: prepared.resized,
        compressed: prepared.compressed,
        normalized: prepared.normalized,
      };
    }
    if (imageTail) {
      const prepared = await prepareKlingFrame({
        data: imageTail,
        mimeType: imageTailMimeType,
        name: "尾帧",
      });
      imageTail = prepared.buffer.toString("base64");
      imageTailMimeType = prepared.mimeType;
      tailFrameResize = {
        originalDimensions: prepared.originalDimensions,
        dimensions: prepared.dimensions,
        originalBytes: prepared.originalBytes,
        bytes: prepared.bytes,
        resized: prepared.resized,
        compressed: prepared.compressed,
        normalized: prepared.normalized,
      };
    }
  }
  if (provider === "volcengine") {
    [videos, audios] = await Promise.all([
      Promise.all(
        videos.map((video) =>
          persistSeedanceReferenceMedia(video, "video", {
            maxDuration: duration,
          }),
        ),
      ),
      Promise.all(
        audios.map((audio) =>
          persistSeedanceReferenceMedia(audio, "audio", {
            maxDuration: duration,
          }),
        ),
      ),
    ]);
    if (submissionImage) {
      const prepared = await prepareSeedanceImage({
        data: submissionImage,
        mimeType: imageMimeType,
        name: String(item.fileName || "主图"),
      });
      submissionImage = prepared.buffer.toString("base64");
      submissionImageMimeType = prepared.mimeType;
      submissionImageResize =
        prepared.resized || prepared.compressed
          ? {
              originalDimensions: prepared.originalDimensions,
              dimensions: prepared.dimensions,
              originalBytes: prepared.originalBytes,
              bytes: prepared.bytes,
              resized: prepared.resized,
              compressed: prepared.compressed,
            }
          : null;
    }
    referenceImages = await Promise.all(
      referenceImages.map(async (reference) => {
        const prepared = await prepareSeedanceImage(reference);
        return {
          ...reference,
          data: prepared.buffer.toString("base64"),
          name: prepared.name,
          mimeType: prepared.mimeType,
          resized: prepared.resized,
          compressed: prepared.compressed,
          dimensions: prepared.dimensions,
          originalDimensions: prepared.originalDimensions,
          originalBytes: prepared.originalBytes,
          bytes: prepared.bytes,
        };
      }),
    );
  }

  const callbackUrl = await safeProviderCallbackUrl(
    provider === "volcengine"
      ? seedanceCallbackUrl(taskId) || item.callbackUrl
      : item.callbackUrl,
  );

  const createdAt = new Date().toISOString();
  const existingTask = existingTaskId
    ? (await readCollection("tasks", [])).find(
        (entry) => entry.id === existingTaskId && ownedBy(entry, ownerId),
      )
    : null;
  if (existingTaskId && !existingTask)
    throw Object.assign(new Error("待恢复的视频任务不存在"), { status: 404 });
  const externalTaskId = String(
    item.externalTaskId ||
      existingTask?.externalTaskId ||
      (provider === "kling" && !isOmni
        ? `lf-${taskId.replace(/-/g, "").slice(0, 32)}`
        : ""),
  ).trim();
  const recoveryInput = existingTask?.recoveryInput || videoRecoveryInput(item);
  const recoveryAssets =
    existingTask?.recoveryAssets ||
    (await persistWorkflowRuntimeAssets(
      videoRecoveryAssets({
        image: base64,
        imageTail,
        imageMimeType,
        imageTailMimeType,
        fileName: item.fileName,
        referenceImages: Array.isArray(item.referenceImages)
          ? item.referenceImages.map((image, index) => ({
              data: String(image?.data || "").replace(
                /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
                "",
              ),
              name: String(image?.name || `reference_${index + 1}`),
              mimeType: String(image?.mimeType || "image/png").toLowerCase(),
            }))
          : [],
        videos: Array.isArray(item.videos)
          ? item.videos.map((video, index) => ({
              data: String(video?.data || "").replace(
                /^data:video\/[a-zA-Z0-9.+-]+;base64,/,
                "",
              ),
              name: String(video?.name || `video_${index + 1}`),
              mimeType: String(video?.mimeType || "video/mp4").toLowerCase(),
            }))
          : [],
        audios: Array.isArray(item.audios)
          ? item.audios.map((audio, index) => ({
              data: String(audio?.data || "").replace(
                /^data:(?:audio|video)\/[a-zA-Z0-9.+-]+;base64,/,
                "",
              ),
              name: String(audio?.name || `audio_${index + 1}`),
              mimeType: String(audio?.mimeType || "audio/mpeg").toLowerCase(),
            }))
          : [],
      }),
    ));
  const taskType =
    provider === "volcengine"
      ? "seedance"
      : isMotionControl
        ? "motion-control"
        : isOmni
          ? "omni-video"
          : isTurbo
            ? "turbo-image2video"
            : base64
              ? "image2video"
              : "text2video";
  const task = {
    id: taskId,
    ownerId,
    workflowNodeId: String(item.workflowNodeId || ""),
    workflowRunId: String(item.workflowRunId || ""),
    workflowTemplateId: String(item.workflowTemplateId || ""),
    workflowName: String(item.workflowName || ""),
    upstreamTaskId: null,
    taskType,
    sourceType:
      base64 || referenceImages.length
        ? "image"
        : videos.length || videoUrls.length
          ? "video"
          : "text",
    fileName: String(
      item.fileName ||
        (base64
          ? "未命名主图"
          : referenceImages[0]?.name ||
            localVideoInputs[0]?.name ||
            videos[0]?.name ||
            videoUrls[0]?.url ||
            "文生视频"),
    ),
    prompt: String(item.prompt).trim(),
    modelName,
    provider,
    ...(provider === "kling"
      ? {
          mode,
          cfgScale,
          multiShot: isMotionControl ? false : item.multiShot !== false,
          shotType,
          multiPrompt,
          sound,
          watermark,
          ...(isMotionControl
            ? {
                characterOrientation: String(
                  item.characterOrientation || "video",
                ),
                keepOriginalSound: String(item.keepOriginalSound || "yes"),
              }
            : {}),
        }
      : {
          resolution,
          generateAudio,
          watermark,
          audioMode,
          ratioMode,
          returnLastFrame: Boolean(item.returnLastFrame),
        }),
    duration: String(duration),
    aspectRatio,
    callbackUrl,
    externalTaskId,
    negativePrompt: String(item.negativePrompt || "").trim(),
    hasTailFrame: Boolean(imageTail),
    ...(tailFrameResize ? { tailFrameResize } : {}),
    audioInputs: audios.map(
      ({
        name,
        mimeType,
        sourceMimeType,
        label,
        durationSeconds,
        originalDurationSeconds,
        bytes,
        originalBytes,
        trimmed,
        compressed,
        transcoded,
        extractedFromVideo,
      }) => ({
        name,
        mimeType,
        sourceMimeType,
        label,
        durationSeconds,
        originalDurationSeconds,
        bytes,
        originalBytes,
        trimmed,
        compressed,
        transcoded,
        extractedFromVideo,
      }),
    ),
    imageInputs: [
      ...(base64
        ? [
            {
              name: String(item.fileName || "主图"),
              mimeType: submissionImageMimeType,
              label: "image_1",
              resized: Boolean(submissionImageResize?.resized),
              compressed: Boolean(submissionImageResize?.compressed),
              ...submissionImageResize,
            },
          ]
        : []),
      ...referenceImages.map(
        ({
          name,
          mimeType,
          label,
          resized,
          compressed,
          dimensions,
          originalDimensions,
          bytes,
          originalBytes,
        }) => ({
          name,
          mimeType,
          label,
          resized: Boolean(resized),
          compressed: Boolean(compressed),
          dimensions,
          originalDimensions,
          bytes,
          originalBytes,
        }),
      ),
    ],
    videoInputs:
      isOmni || isMotionControl
        ? localVideoInputs
        : videos.map(
            ({
              name,
              mimeType,
              sourceMimeType,
              label,
              durationSeconds,
              originalDurationSeconds,
              bytes,
              originalBytes,
              trimmed,
              compressed,
              transcoded,
            }) => ({
              name,
              mimeType,
              sourceMimeType,
              label,
              durationSeconds,
              originalDurationSeconds,
              bytes,
              originalBytes,
              trimmed,
              compressed,
              transcoded,
            }),
          ),
    videoUrlInputs: videoUrls,
    ...(isMotionControl
      ? {
          motionLongProtection: item.motionLongProtection !== false,
          motionSourceDurationSeconds: motionReference?.durationSeconds || null,
          motionSegments: motionSubmissionSegments.map(
            ({ path: _path, ...segment }) => ({
              ...segment,
              status: "waiting",
            }),
          ),
          motionSegmentProgress: motionSubmissionSegments.length
            ? `0/${motionSubmissionSegments.length}`
            : null,
        }
      : {}),
    assetUris,
    trustedPerson: useTrustedPerson,
    trustedPersonAsset,
    digitalAssetIds,
    status: "submitting",
    videoUrl: null,
    coverUrl: null,
    error: null,
    pointsCost: videoPointCost(duration),
    pointsKind: "video",
    pointsRefundedAt: null,
    recoveryInput,
    recoveryAssets,
    submissionAttempt: Number(existingTask?.submissionAttempt || 0) + 1,
    createdAt: existingTask?.createdAt || createdAt,
    updatedAt: createdAt,
  };
  if (existingTask) {
    task.pointsCost = existingTask.pointsCost;
    task.pointsKind = existingTask.pointsKind || "video";
    task.pointsBalanceAfter = existingTask.pointsBalanceAfter;
    task.pointsRefundedAt = existingTask.pointsRefundedAt || null;
    await updateTask(task.id, task);
  } else {
    const charge = await chargeVideoPoints({
      userId: ownerId,
      duration,
      taskId: task.id,
    });
    task.pointsBalanceAfter = charge.balanceAfter;

    try {
      await mutateCollection("tasks", (tasks) => [task, ...tasks]);
    } catch (error) {
      await refundVideoPoints({
        userId: ownerId,
        amount: task.pointsCost,
        taskId: task.id,
        reason: "视频任务创建失败退款",
      });
      throw error;
    }
  }

  const performSubmission = async () => {
    try {
      const submitCurrentProvider = async () =>
        provider === "volcengine"
          ? await submitSeedanceVideo({
              modelName,
              image: submissionImage,
              imageMimeType: submissionImageMimeType,
              referenceImages,
              videos,
              prompt:
                audios.length && audioMode === "lip_sync"
                  ? `${task.prompt}\n\n【音频驱动口播】严格按照音频参考的原始台词、语速和情绪驱动人物口型；不得改词、漏词或添加台词。`
                  : task.prompt,
              duration,
              aspectRatio,
              ratioMode,
              resolution,
              generateAudio,
              watermark,
              audios,
              trustedPersonAssets: assetUris,
              callbackUrl: task.callbackUrl,
              returnLastFrame: Boolean(item.returnLastFrame),
            })
          : isMotionControl
            ? motionSubmissionSegments.length > 1
              ? {
                  taskIds: (
                    await Promise.all(
                      motionSubmissionSegments.map((segment) =>
                        submitMotionControl({
                          image: base64,
                          videoUrl: segment.url,
                          prompt: task.prompt,
                          mode,
                          characterOrientation: task.characterOrientation,
                          keepOriginalSound: task.keepOriginalSound,
                          externalTaskId: task.externalTaskId
                            ? `${task.externalTaskId}-${segment.index}`
                            : "",
                        }),
                      ),
                    )
                  ).map((result) => result.taskId),
                  taskType: "motion-control-series",
                }
              : await submitMotionControl({
                  image: base64,
                  videoUrl: videoUrls[0]?.url,
                  prompt: task.prompt,
                  mode,
                  characterOrientation: task.characterOrientation,
                  keepOriginalSound: task.keepOriginalSound,
                  callbackUrl: task.callbackUrl,
                  externalTaskId: task.externalTaskId,
                })
            : isOmni
              ? await submitOmniVideo({
                  image: base64 || undefined,
                  primaryImageType: item.primaryImageType,
                  referenceImages,
                  elementIds: assetUris.map((asset) => asset.uri),
                  videoUrls,
                  prompt: `${task.prompt}${digitalAssetGuidance}`,
                  multiShot: task.multiShot,
                  shotType,
                  multiPrompt,
                  duration,
                  mode,
                  cfgScale,
                  aspectRatio,
                  sound,
                })
              : isTurbo
                ? await submitTurboImageToVideo({
                    image: base64,
                    prompt: task.prompt,
                    duration,
                    resolution: mode,
                    callbackUrl: task.callbackUrl,
                    externalTaskId: task.externalTaskId,
                    watermark: task.watermark,
                  })
                : submitVideo({
                    image: base64 || undefined,
                    imageTail: imageTail || undefined,
                    prompt: task.prompt,
                    negativePrompt: task.negativePrompt,
                    multiShot: task.multiShot,
                    shotType,
                    multiPrompt,
                    duration,
                    mode,
                    cfgScale,
                    aspectRatio,
                    sound,
                    callbackUrl: task.callbackUrl,
                    externalTaskId: task.externalTaskId,
                    elementIds: assetUris.map((asset) => asset.uri),
                  });
      let submitted;
      try {
        submitted = await submitCurrentProvider();
      } catch (error) {
        if (
          provider !== "volcengine" ||
          !assetUris.length ||
          !isSeedancePrivacyImageError(error)
        )
          throw error;
        const recovered = await recoverSeedanceTrustedImages({
          ownerId,
          taskId: task.id,
          templateId: task.workflowTemplateId,
          assetUris,
          primaryImage: submissionImage,
          primaryName: task.fileName,
          primaryMimeType: submissionImageMimeType,
          referenceImages,
        });
        if (!recovered) throw error;
        assetUris = recovered.assetUris;
        submissionImage = recovered.primary?.data;
        submissionImageMimeType =
          recovered.primary?.mimeType || submissionImageMimeType;
        referenceImages = recovered.references;
        task.assetUris = assetUris;
        task.imageInputs = [
          ...(recovered.primary
            ? [
                {
                  name: recovered.primary.name,
                  mimeType: recovered.primary.mimeType,
                  label: "image_1",
                },
              ]
            : []),
          ...referenceImages.map(({ name, mimeType }, index) => ({
            name,
            mimeType,
            label: `image_${index + (recovered.primary ? 2 : 1)}`,
          })),
        ];
        task.trustedPersonRecovery = {
          converted: recovered.convertedNames,
          convertedCount: recovered.convertedNames.length,
          recoveredAt: new Date().toISOString(),
        };
        await updateTask(task.id, {
          assetUris: task.assetUris,
          imageInputs: task.imageInputs,
          trustedPersonRecovery: task.trustedPersonRecovery,
        });
        submitted = await submitCurrentProvider();
      }
      const updated = await updateTask(task.id, {
        upstreamTaskId: submitted.taskId || submitted.taskIds?.[0],
        ...(submitted.taskIds
          ? {
              upstreamTaskIds: submitted.taskIds,
              taskType: "motion-control-series",
            }
          : {}),
        status: "queued",
        upstreamPayload: submitted.payload,
      });
      if (submitted.taskIds)
        void pollMotionControlSeries(
          task.id,
          submitted.taskIds,
          motionReference.durationSeconds,
          task.keepOriginalSound,
        );
      else
        void pollTask(task.id, submitted.taskId, submitted.taskType, provider);
      return safeTask(updated);
    } catch (error) {
      if (
        provider === "volcengine" &&
        error?.code === "SeedanceRequestTimeout"
      ) {
        const current = (await readCollection("tasks", [])).find(
          (entry) => entry.id === task.id,
        );
        if (
          current &&
          (current.upstreamTaskId ||
            ["queued", "processing", "succeeded"].includes(current.status))
        )
          return safeTask(current);
        const submissionReconcileUntil =
          Date.now() + SEEDANCE_SUBMISSION_RECONCILE_MS;
        const pending = await updateTask(task.id, {
          status: "submitting",
          submissionUncertain: true,
          submissionReconcileUntil,
          submissionMessage:
            "上游响应较慢，正在等待回调确认；不会重复提交，也不会重复扣费。",
          error: null,
          upstreamPayload: error.payload,
        });
        scheduleSeedanceSubmissionExpiry(task.id, submissionReconcileUntil);
        return safeTask(pending);
      }
      const message = generationErrorMessage(
        error,
        "视频生成提交失败，请调整素材或稍后重试。",
      );
      const failure = generationErrorDetails(error, message);
      const taskMessage =
        provider === "kling" &&
        assetUris.length &&
        /(?:连接|超时|频繁|暂时不可用)/.test(message)
          ? `数字资产已正确绑定；${message}`
          : message;
      await updateTask(task.id, {
        status: "failed",
        error: taskMessage,
        failure: { ...failure, message: taskMessage },
        upstreamPayload: error.payload,
      });
      await refundTaskPoints(task.id);
      throw Object.assign(new Error(taskMessage), {
        status: error.status || 502,
        payload: error.payload,
      });
    }
  };
  if (deferSubmission) {
    void performSubmission().catch((error) =>
      console.error(`Video task ${task.id} submission failed:`, error.message),
    );
    return safeTask(task);
  }
  return performSubmission();
}

function parseWorkflowShots(value, totalDuration) {
  const shots = String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const separator = line.indexOf("|");
      if (separator < 1)
        throw new Error(`第 ${index + 1} 个分镜请使用“秒数 | 提示词”格式`);
      return {
        index: index + 1,
        duration: Number(line.slice(0, separator).trim()),
        prompt: line.slice(separator + 1).trim(),
      };
    });
  if (
    shots.length < 1 ||
    shots.length > 6 ||
    shots.some(
      (shot) =>
        !Number.isInteger(shot.duration) || shot.duration < 1 || !shot.prompt,
    ) ||
    shots.reduce((sum, shot) => sum + shot.duration, 0) !==
      Number(totalDuration)
  )
    throw new Error(`自定义分镜需 1–6 段，且总时长等于 ${totalDuration} 秒`);
  return shots;
}

function composeOrderedWorkflowImagePrompt(nodeData, fallback, images = []) {
  const base = String(fallback || "").trim();
  const slotPrompts = nodeData?.imageSlotPrompts || {};
  const lines = images.map((image, index) => {
    const slot = image.inputHandle || `image_${index + 1}`;
    const slotIndex = Number(
      String(slot).match(/^image_(\d+)$/)?.[1] || index + 1,
    );
    const instruction = String(slotPrompts[slot] || "").trim();
    return instruction
      ? `图 ${slotIndex}（${slot}）：${instruction}`
      : `图 ${slotIndex}（${slot}）：按该顺序作为${slotIndex === 1 ? "主图 / 首帧" : "参考图"}`;
  });
  return lines.length
    ? [base, "【多图输入顺序】", ...lines].filter(Boolean).join("\n")
    : base;
}

async function updateWorkflowRun(id, updater) {
  let changed;
  await mutateCollection("workflow_runs", (runs) =>
    runs.map((run) => {
      if (run.id !== id) return run;
      if (run.status === "terminated") {
        changed = run;
        return run;
      }
      const now = new Date();
      const patch = typeof updater === "function" ? updater(run) : updater;
      changed = {
        ...run,
        ...timingPatch(run, patch, now),
        updatedAt: now.toISOString(),
      };
      return changed;
    }),
  );
  return changed;
}

async function updateWorkflowStep(runId, nodeId, patch) {
  return updateWorkflowRun(runId, (run) => ({
    currentNodeId: ["processing", "queued"].includes(patch.status)
      ? nodeId
      : run.currentNodeId,
    steps: run.steps.map((step) =>
      step.nodeId === nodeId
        ? {
            ...step,
            ...timingPatch(step, patch),
            updatedAt: new Date().toISOString(),
          }
        : step,
    ),
  }));
}

function workflowTerminatedError() {
  return Object.assign(new Error("工作流已由用户终止"), {
    code: "WORKFLOW_TERMINATED",
  });
}

async function ensureWorkflowRunActive(runId, signal) {
  if (signal?.aborted)
    throw signal.reason instanceof Error
      ? signal.reason
      : workflowTerminatedError();
  if (terminatedWorkflowRuns.has(runId)) throw workflowTerminatedError();
  const runs = await readCollection("workflow_runs", []);
  const run = runs.find((item) => item.id === runId);
  if (!run || run.status === "terminated") throw workflowTerminatedError();
  return run;
}

const waitForWorkflowPoll = (milliseconds, signal) =>
  new Promise((resolve, reject) => {
    let abort;
    const timer = setTimeout(() => {
      if (signal && abort) signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    if (!signal) return;
    abort = () => {
      clearTimeout(timer);
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : workflowTerminatedError(),
      );
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });

async function imageResultBase64(image) {
  if (image?.base64)
    return String(image.base64).replace(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
      "",
    );
  if (!image?.url) throw new Error("图片节点没有返回可传递的结果");
  const { buffer } = await readExternalMedia(image.url, {
    ...providerMediaUrlOptions(),
    timeoutMs: 30_000,
    maxBytes: 30 * 1024 * 1024,
  });
  return buffer.toString("base64");
}

async function workflowStepResultValues(result = {}) {
  if (result.type === "text" && result.text)
    return [{ type: "text", text: result.text }];
  if (result.type === "assets" && Array.isArray(result.assetIds))
    return result.assetIds.filter(Boolean).map((uri, index) => ({
      type: "asset",
      uri,
      name: `复用资产 ${index + 1}`,
      reused: true,
    }));
  if (result.type === "video") {
    const videoUrls = [
      ...(Array.isArray(result.videoUrls) ? result.videoUrls : []),
      result.videoUrl,
    ]
      .map((url) => String(url || "").trim())
      .filter((url, index, values) => url && values.indexOf(url) === index);
    if (videoUrls.length)
      return videoUrls.map((url, index) => ({
        type: "video",
        url,
        name:
          videoUrls.length > 1
            ? `复用视频 ${index + 1}.mp4`
            : result.fileName || "复用视频.mp4",
        mimeType: "video/mp4",
        reused: true,
      }));
  }
  if (result.type === "audio" && result.audioUrl) {
    const audioUrl = String(result.audioUrl);
    let buffer;
    if (audioUrl.startsWith("/generated/")) {
      buffer = await fs.readFile(
        path.join(generatedDir, path.basename(audioUrl)),
      );
    } else {
      ({ buffer } = await readExternalMedia(audioUrl, {
        ...providerMediaUrlOptions(),
        timeoutMs: 20_000,
        maxBytes: 15 * 1024 * 1024,
      }));
    }
    return [
      {
        type: "audio",
        data: buffer.toString("base64"),
        url: audioUrl,
        name: result.fileName || "复用音频.mp3",
        mimeType: result.mimeType || "audio/mpeg",
        reused: true,
      },
    ];
  }
  if (result.type === "image" && result.imageUrl) {
    const imageUrl = String(result.imageUrl);
    let buffer;
    if (imageUrl.startsWith("/generated/")) {
      const fileName = path.basename(imageUrl);
      buffer = await fs.readFile(path.join(generatedDir, fileName));
    } else {
      ({ buffer } = await readExternalMedia(imageUrl, {
        ...providerMediaUrlOptions(),
        timeoutMs: 20_000,
        maxBytes: 30 * 1024 * 1024,
      }));
    }
    return [
      {
        type: "image",
        data: buffer.toString("base64"),
        url: imageUrl,
        name: result.fileName || "复用图片.png",
        mimeType: "image/png",
        reused: true,
      },
    ];
  }
  return [];
}

async function waitForWorkflowVideo(taskId, onUpdate, runId, signal) {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    await ensureWorkflowRunActive(runId, signal);
    const tasks = await readCollection("tasks", []);
    const task = tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("视频子任务不存在");
    await onUpdate?.(task);
    if (task.status === "succeeded") return task;
    if (task.status === "failed") throw new Error(task.error || "视频生成失败");
    await waitForWorkflowPoll(5000, signal);
    await ensureWorkflowRunActive(runId, signal);
  }
  throw new Error("视频生成等待超时");
}

async function processWorkflowRun(runId, input, signal) {
  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const edges = Array.isArray(input.edges) ? input.edges : [];
  const ordered = orderedWorkflowNodes(nodes, edges);
  const allExecutable = ordered.filter((node) =>
    WORKFLOW_STEP_KINDS.has(node.data?.kind),
  );
  const terminalIds = terminalWorkflowExecutionNodeIds(nodes, edges);
  const reachable = reachableWorkflowExecutionNodes(nodes, edges, terminalIds);
  const singleNodeId = String(input.singleNodeId || "").trim();
  const rerunNodeIds = input.startNodeId
    ? includeRequiredTrustedPersonAssets(
        nodes,
        edges,
        downstreamWorkflowNodeIds(nodes, edges, input.startNodeId),
      )
    : null;
  const recomputeNodeIds = singleNodeId
    ? new Set([singleNodeId])
    : rerunNodeIds;
  const executionNodes = singleNodeId
    ? allExecutable.filter((node) => node.id === singleNodeId)
    : allExecutable.filter(
        (node) =>
          reachable.has(node.id) && (!rerunNodeIds || rerunNodeIds.has(node.id)),
      );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(
    nodes.map((node) => [node.id, orderedIncomingEdges(nodes, edges, node.id)]),
  );
  const outputs = new Map();
  let runtimeAssets = {};
  let assets = [];
  const resolveValues = (nodeId, trail = new Set()) => {
    if (outputs.has(nodeId)) return outputs.get(nodeId);
    if (trail.has(nodeId)) return [];
    const node = nodeById.get(nodeId);
    if (!node) return [];
    if (
      [
        "input",
        "batch-input",
        "face-input",
        "person-video-input",
        "audio",
        "audio-reference",
      ].includes(node.data?.kind)
    ) {
      const localValues = Array.isArray(runtimeAssets[nodeId])
        ? runtimeAssets[nodeId].map((value) => ({
            ...value,
            sourceKind: node.data.kind,
            sourceNodeId: nodeId,
          }))
        : [];
      if (!["face-input", "person-video-input"].includes(node.data?.kind))
        return localValues;
      const nextTrail = new Set(trail).add(nodeId);
      const upstreamValues = (incoming.get(nodeId) || []).flatMap((edge) =>
        resolveValues(edge.source, nextTrail),
      );
      const expectedType = node.data.kind === "face-input" ? "image" : "video";
      const limit = node.data.kind === "face-input" ? 9 : 1;
      return [...localValues, ...upstreamValues]
        .filter((value) => value.type === expectedType)
        .slice(0, limit)
        .map((value) => ({
          ...value,
          sourceKind: node.data.kind,
          sourceNodeId: nodeId,
        }));
    }
    if (node.data?.kind === "text-input") {
      const text = String(node.data.prompt || node.data.value || "").trim();
      return text
        ? [
            {
              type: "text",
              text,
              sourceKind: node.data.kind,
              sourceNodeId: nodeId,
            },
          ]
        : [];
    }
    if (node.data?.kind === "asset") {
      const selectedId =
        input.runtimeDigitalAssetIds?.[nodeId] || node.data.digitalAssetId;
      const selected = assets.find(
        (asset) => asset.id === selectedId && ownedBy(asset, input.ownerId),
      );
      const uri = resolveWorkflowAssetUri({
        runtimeUri: input.assetUris?.[nodeId],
        nodeUri: node.data.assetUri,
        provider: node.data.provider,
        klingElementId: selected?.klingElementId,
      });
      if (uri)
        return [
          { type: "asset", uri, name: selected?.name || node.data.title },
        ];
    }
    const nextTrail = new Set(trail).add(nodeId);
    const localValues =
      node.data?.directMediaInput && Array.isArray(runtimeAssets[nodeId])
        ? runtimeAssets[nodeId].map((value, index) => ({
            ...value,
            sourceKind: node.data.kind,
            sourceNodeId: nodeId,
            inputHandle: value.inputHandle || `image_${index + 1}`,
          }))
        : [];
    const values = [
      ...localValues,
      ...(incoming.get(nodeId) || []).flatMap((edge) =>
        resolveValues(edge.source, nextTrail).map((value) => ({
          ...value,
          inputHandle: edge.targetHandle || value.inputHandle || "",
          ...workflowEdgeMaterialMetadata(edge),
        })),
      ),
    ];
    if (node.data?.kind === "merge" && node.data.mergeStrategy === "first")
      return values.length ? [values[0]] : [];
    if (node.data?.kind === "merge" && node.data.mergeStrategy === "concat") {
      const texts = values.filter((value) => value.type === "text");
      return texts.length
        ? [
            {
              type: "text",
              text: texts.map((value) => value.text).join("\n\n"),
            },
          ]
        : values;
    }
    return values;
  };

  try {
    const runAtStart = await ensureWorkflowRunActive(runId, signal);
    runtimeAssets = await materializeWorkflowRuntimeAssets(input);
    await ensureWorkflowRunActive(runId, signal);
    assets = await readCollection("digital_assets", []);
    const persistedStepByNode = new Map(
      (runAtStart.steps || []).map((step) => [step.nodeId, step]),
    );
    for (const step of runAtStart.steps || []) {
      if (!shouldReuseWorkflowStep(step)) continue;
      outputs.set(step.nodeId, await workflowStepResultValues(step.result));
    }
    if (input.sourceRunId && recomputeNodeIds) {
      const runs = await readCollection("workflow_runs", []);
      const sourceRun = runs.find(
        (run) =>
          run.id === input.sourceRunId &&
          ownedBy(run, input.ownerId) &&
          run.id !== runId,
      );
      if (!sourceRun)
        throw new Error("找不到可复用的上一次工作流结果，请重新运行完整链路");
      const sourceRunById = new Map(
        runs
          .filter((run) => ownedBy(run, input.ownerId) && run.id !== runId)
          .map((run) => [run.id, run]),
      );
      const restoredRunIds = new Set();
      const restoreSourceRun = async (run) => {
        if (!run || restoredRunIds.has(run.id)) return;
        restoredRunIds.add(run.id);
        if (run.sourceRunId)
          await restoreSourceRun(sourceRunById.get(run.sourceRunId));
        for (const step of run.steps || []) {
          if (recomputeNodeIds.has(step.nodeId) || !step.result) continue;
          const values = await workflowStepResultValues(step.result);
          if (values.length) outputs.set(step.nodeId, values);
        }
      };
      await restoreSourceRun(sourceRun);
    }
    await updateWorkflowRun(runId, {
      status: "processing",
      startedAt: runAtStart.startedAt || new Date().toISOString(),
      currentStep: 0,
    });
    for (let index = 0; index < executionNodes.length; index += 1) {
      await ensureWorkflowRunActive(runId, signal);
      const node = executionNodes[index];
      const persistedStep = persistedStepByNode.get(node.id);
      if (shouldReuseWorkflowStep(persistedStep)) continue;
      const title = node.data?.title || `步骤 ${index + 1}`;
      const upstream = resolveValues(node.id);
      const texts = upstream
        .filter((value) => value.type === "text" && value.text)
        .map((value) => value.text);
      const mediaInputs = upstream.filter((value) =>
        ["image", "video", "audio"].includes(value.type),
      );
      const nodeIncoming = incoming.get(node.id) || [];
      const activeEdgeId = nodeIncoming.length
        ? nodeIncoming[nodeIncoming.length - 1].id
        : null;
      const imageInputs = upstream.filter((value) => value.type === "image");
      await updateWorkflowRun(runId, {
        currentStep: index + 1,
        activeEdgeId,
        executionMode: "serial",
      });
      await updateWorkflowStep(runId, node.id, {
        status: "processing",
        startedAt: new Date().toISOString(),
        progressLabel: "正在执行当前节点",
        inputSummary: {
          textCount: texts.length,
          imageCount: imageInputs.length,
          videoCount: upstream.filter((value) => value.type === "video").length,
          imageSlots: imageInputs.map((value, imageIndex) => ({
            slot: value.inputHandle || `image_${imageIndex + 1}`,
            name: value.name || `图片 ${imageIndex + 1}`,
            ...(value.materialId ? { materialId: value.materialId } : {}),
            ...(value.materialLabel
              ? { materialLabel: value.materialLabel }
              : {}),
            ...(value.mentionIndex !== undefined
              ? { mentionIndex: value.mentionIndex }
              : {}),
          })),
          materialOrder: mediaInputs.map((value, mediaIndex) => ({
            type: value.type,
            slot: value.inputHandle || `${value.type}_${mediaIndex + 1}`,
            name: value.name || `素材 ${mediaIndex + 1}`,
            ...(value.materialId ? { materialId: value.materialId } : {}),
            ...(value.materialLabel
              ? { materialLabel: value.materialLabel }
              : {}),
            ...(value.mentionIndex !== undefined
              ? { mentionIndex: value.mentionIndex }
              : {}),
          })),
        },
      });

      if (node.data?.kind === "media-analysis") {
        const videos = upstream.filter((value) => value.type === "video");
        if (!imageInputs.length && !videos.length) {
          outputs.set(node.id, []);
          await updateWorkflowStep(runId, node.id, {
            status: "skipped",
            completedAt: new Date().toISOString(),
            progressLabel: "可选素材为空，已跳过",
            result: {
              type: "empty",
              reason: "optional_input_empty",
            },
          });
          continue;
        }
        const analysisInput = {
          model: node.data.model,
          signal,
          instruction: node.data.prompt,
          targetType: node.data.targetType || "video",
          reasoningEffort: node.data.reasoningEffort || "low",
          maxTokens: node.data.maxTokens || 1800,
          frameLimit: node.data.frameLimit || 18,
          images: imageInputs.map((image) => ({
            data: image.data,
            name: image.name,
            mimeType: image.mimeType,
          })),
          videos: videos.map((video) => ({
            data: video.data,
            name: video.name,
            mimeType: video.mimeType,
          })),
        };
        const pointsCost = analysisPointCost(analysisInput);
        let result;
        try {
          result = await runMeteredUsage({
            ownerId: input.ownerId,
            kind: "analysis",
            quantity: pointsCost,
            taskId: `workflow-${runId}-${node.id}-analysis`,
            reason: `工作流视频分析 ${pointsCost} 帧`,
            refundReason: "工作流视频分析失败退款",
            action: () => analyzeWorkflowMedia(analysisInput),
          });
        } catch (error) {
          if (node.data.failureMode !== "continue") throw error;
          outputs.set(node.id, []);
          await updateWorkflowStep(runId, node.id, {
            status: "skipped",
            completedAt: new Date().toISOString(),
            progressLabel: "分析服务不可用，已按后台策略继续",
            error: null,
            result: {
              type: "empty",
              reason: "analysis_unavailable",
              detail: String(error?.message || "热点原片拆解失败").slice(0, 300),
            },
          });
          continue;
        }
        await ensureWorkflowRunActive(runId, signal);
        outputs.set(node.id, [{ type: "text", text: result.content }]);
        await updateWorkflowStep(runId, node.id, {
          status: "succeeded",
          completedAt: new Date().toISOString(),
          result: {
            type: "text",
            text: result.content,
            model: result.model,
            mediaCount: result.mediaCount,
            frameCount: result.frameCount,
          },
        });
        continue;
      }
      if (node.data?.kind === "text") {
        if (node.data.model === "local-prompt") {
          const instruction = String(node.data.prompt || "").trim();
          const systemPrompt = String(node.data.systemPrompt || "").trim();
          const upstreamText = texts.join("\n\n").trim();
          const content = [
            upstreamText,
            systemPrompt && systemPrompt !== upstreamText
              ? "【后台复刻规则】"
              : "",
            systemPrompt && systemPrompt !== upstreamText ? systemPrompt : "",
            instruction && instruction !== systemPrompt
              ? "【本次复刻要求】"
              : "",
            instruction && instruction !== systemPrompt ? instruction : "",
          ]
            .filter(Boolean)
            .join("\n\n");
          if (!content) throw new Error(`「${title}」缺少复刻要求`);
          outputs.set(node.id, [{ type: "text", text: content }]);
          await updateWorkflowStep(runId, node.id, {
            status: "succeeded",
            completedAt: new Date().toISOString(),
            progressLabel: "已完成本地规则融合",
            result: { type: "text", text: content, model: "local-prompt" },
          });
          continue;
        }
        const result = await runMeteredUsage({
          ownerId: input.ownerId,
          kind: "text",
          quantity: 1,
          taskId: `workflow-${runId}-${node.id}-text`,
          reason: "工作流文本生成 1 次",
          refundReason: "工作流文本生成失败退款",
          action: () =>
            generateTextForModel({
              model: node.data.model,
              signal,
              instruction: node.data.systemPrompt || node.data.prompt,
              inputs:
                node.data.systemPrompt && node.data.prompt !== node.data.systemPrompt
                  ? [...texts, node.data.prompt]
                  : texts,
              maxLength: node.data.maxLength,
              maxTokens: node.data.maxTokens,
            }),
        });
        await ensureWorkflowRunActive(runId, signal);
        outputs.set(node.id, [{ type: "text", text: result.content }]);
        await updateWorkflowStep(runId, node.id, {
          status: "succeeded",
          completedAt: new Date().toISOString(),
          result: { type: "text", text: result.content, model: result.model },
        });
        continue;
      }
      if (node.data?.kind === "text-preview") {
        const text = texts.join("\n\n");
        if (!text) {
          outputs.set(node.id, []);
          await updateWorkflowStep(runId, node.id, {
            status: "skipped",
            completedAt: new Date().toISOString(),
            progressLabel: "上游为空，已跳过",
            result: {
              type: "empty",
              reason: "optional_input_empty",
            },
          });
          continue;
        }
        outputs.set(node.id, [{ type: "text", text }]);
        await updateWorkflowStep(runId, node.id, {
          status: "succeeded",
          completedAt: new Date().toISOString(),
          result: { type: "text", text },
        });
        continue;
      }
      if (node.data?.kind === "audio-generation") {
        const speechText = String(
          texts[texts.length - 1] || node.data.text || node.data.prompt || "",
        ).trim();
        if (!speechText) throw new Error(`「${title}」没有收到口播文本`);
        if (speechText.length > 10000)
          throw new Error(`「${title}」的口播文本不能超过 10000 字`);
        const voices = await userMiniMaxVoices(input.ownerId);
        const voiceId = String(node.data.voiceId || "male-qn-qingse");
        if (!voices.some((voice) => voice.id === voiceId))
          throw new Error(`「${title}」选择的声音已不可用，请重新选择`);
        const model = MINIMAX_TTS_MODELS.has(String(node.data.model || ""))
          ? String(node.data.model)
          : "speech-2.8-hd";
        const format = "mp3";
        const payload = {
          model,
          text: speechText,
          stream: false,
          output_format: "hex",
          voice_setting: {
            voice_id: voiceId,
            speed: Math.max(0.5, Math.min(2, Number(node.data.speed || 1))),
            vol: Math.max(0.1, Math.min(10, Number(node.data.volume || 1))),
            pitch: Math.max(-12, Math.min(12, Number(node.data.pitch || 0))),
            emotion: String(node.data.emotion || "auto"),
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format,
            channel: 1,
          },
          language_boost: String(node.data.languageBoost || "auto"),
          subtitle_enable: false,
          aigc_watermark: false,
        };
        const result = await runMeteredUsage({
          ownerId: input.ownerId,
          kind: "audio",
          quantity: 1,
          taskId: `workflow-${runId}-${node.id}-audio`,
          reason: "工作流音频生成 1 次",
          refundReason: "工作流音频生成失败退款",
          action: () =>
            generateMiniMaxSpeechFile({
              payload,
              fileStem: `workflow-${runId}-${node.id}`,
              format,
            }),
        });
        await ensureWorkflowRunActive(runId, signal);
        const audioUrl = `/generated/${result.fileName}`;
        const audioBuffer = await fs.readFile(
          path.join(generatedDir, result.fileName),
        );
        outputs.set(node.id, [
          {
            type: "audio",
            data: audioBuffer.toString("base64"),
            url: audioUrl,
            name: `${title}.mp3`,
            mimeType: "audio/mpeg",
          },
        ]);
        await updateWorkflowStep(runId, node.id, {
          status: "succeeded",
          completedAt: new Date().toISOString(),
          result: {
            type: "audio",
            audioUrl,
            fileName: result.fileName,
            mimeType: "audio/mpeg",
            voiceId,
            model,
            text: speechText,
          },
        });
        await updateWorkflowRun(runId, { outputUrl: audioUrl });
        continue;
      }
      if (node.data?.kind === "image") {
        const basePrompt = String(
          texts[texts.length - 1] ||
            node.data.prompt ||
            input.fallbackPrompt ||
            "",
        ).trim();
        const brandLockedPrompt = composeCustomBrandLockedPrompt(
          basePrompt,
          node.data.brandInvocation,
        );
        const prompt = [
          brandLockedPrompt,
          node.data.preserveSubject === true
            ? "严格保持参考图中的商品主体、人物身份、颜色、材质、结构、Logo 与关键细节一致。"
            : "",
          node.data.allowText === false
            ? "除参考图中原有且必须保留的文字或 Logo 外，不生成新增文字、价格或水印。"
            : "",
          node.data.useNegativePrompt === true && node.data.negativePrompt
            ? `反向约束：${node.data.negativePrompt}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        if (!prompt) throw new Error(`「${title}」没有收到图片提示词`);
        const images = upstream
          .filter((value) => value.type === "image")
          .slice(0, 4);
        const pointsCost = usagePointCost(
          "image",
          Number(node.data.count || 1),
        );
        const { generated, persisted } = await runMeteredUsage({
          ownerId: input.ownerId,
          kind: "image",
          quantity: pointsCost,
          taskId: `workflow-${runId}-${node.id}-image`,
          reason: `工作流图片生成 ${pointsCost} 张`,
          refundReason: "工作流图片生成失败退款",
          action: async () => {
            const generated = await generateImage2({
              model: node.data.model || "gpt-image-2",
              signal,
              prompt,
              aspectRatio: node.data.aspectRatio || "9:16",
              resolution: node.data.resolution || "2k",
              size: node.data.size || "1024x1792",
              quality: node.data.quality || "high",
              n: pointsCost,
              outputFormat: ["png", "jpeg", "webp"].includes(
                String(node.data.outputFormat || "png").toLowerCase(),
              )
                ? String(node.data.outputFormat || "png").toLowerCase()
                : "png",
              referenceImages: images.map((image) => ({
                data: image.data,
                name: image.name,
                mimeType: image.mimeType,
              })),
            });
            const persisted = await persistGeneratedImages(
              generated.images,
              `${runId}-${node.id}`,
              "png",
              node.data.aspectRatio || "9:16",
            );
            return { generated, persisted };
          },
        });
        await ensureWorkflowRunActive(runId, signal);
        const firstData = await imageResultBase64(persisted[0]);
        outputs.set(node.id, [
          {
            type: "image",
            data: firstData,
            name: `${title}.png`,
            mimeType: "image/png",
            url: persisted[0]?.url,
          },
        ]);
        await updateWorkflowStep(runId, node.id, {
          status: "succeeded",
          completedAt: new Date().toISOString(),
          result: {
            type: "image",
            imageUrl: persisted[0]?.url,
            imageUrls: persisted.map((image) => image.url),
            prompt,
            inputOptimizations: generated.inputOptimizations || [],
          },
        });
        await updateWorkflowRun(runId, {
          coverUrl: persisted[0]?.url,
          outputUrl: persisted[0]?.url,
        });
        continue;
      }
      if (node.data?.kind === "asset") {
        const existing = upstream
          .filter((value) => value.type === "asset" && value.uri)
          .slice(0, 9);
        if (existing.length) {
          outputs.set(node.id, existing);
          await updateWorkflowStep(runId, node.id, {
            status: "succeeded",
            completedAt: new Date().toISOString(),
            result: {
              type: "assets",
              assetIds: existing.map((asset) => asset.uri),
              count: existing.length,
              reused: true,
            },
          });
          continue;
        }
        const videos = upstream.filter((value) => value.type === "video");
        const media =
          node.data.assetMethod === "person-video"
            ? videos.slice(0, 1)
            : imageInputs.slice(0, 9);
        if (!media.length) {
          outputs.set(node.id, []);
          await updateWorkflowStep(runId, node.id, {
            status: "skipped",
            completedAt: new Date().toISOString(),
            progressLabel: "可选真人资产为空，已跳过",
            result: {
              type: "empty",
              reason: "optional_input_empty",
            },
          });
          continue;
        }
        if (node.data.provider !== "volcengine")
          throw new Error(`「${title}」没有可用的 Element ID`);
        const uploadedAssets = [];
        let trustedPersonGroupId = String(
          input.runtimeAssetGroupIds?.[node.id] || node.data.groupId || "",
        ).trim();
        for (let imageIndex = 0; imageIndex < media.length; imageIndex += 1) {
          await ensureWorkflowRunActive(runId, signal);
          await updateWorkflowStep(runId, node.id, {
            progressLabel: `${node.data.assetMethod === "person-video" ? "认证真人视频" : "认证真人参考"} ${imageIndex + 1}/${media.length}`,
          });
          uploadedAssets.push(
            await uploadTrustedPersonAsset({
              image: media[imageIndex],
              groupId: trustedPersonGroupId,
              runId,
              nodeId: `${node.id}-${imageIndex + 1}`,
              title: `${title} ${imageIndex + 1}`,
              ownerId: input.ownerId,
              templateId: input.templateId,
            }),
          );
          trustedPersonGroupId ||=
            uploadedAssets[uploadedAssets.length - 1]?.groupId || "";
        }
        outputs.set(node.id, uploadedAssets);
        await updateWorkflowStep(runId, node.id, {
          status: "succeeded",
          completedAt: new Date().toISOString(),
          result: {
            type: "assets",
            assetIds: uploadedAssets.map((asset) => asset.uri),
            groupIds: uploadedAssets.map((asset) => asset.groupId),
            count: uploadedAssets.length,
            assetStatus: "Active",
          },
        });
        continue;
      }
      if (node.data?.kind === "video") {
        const upstreamPrompt = String(
          (node.data.combineUpstreamText ? texts.join("\n\n") : texts[texts.length - 1]) ||
            input.fallbackPrompt ||
            "",
        ).trim();
        const configuredPrompt = String(node.data.prompt || "").trim();
        const basePrompt = [
          upstreamPrompt,
          node.data.appendConfiguredPrompt && configuredPrompt && configuredPrompt !== upstreamPrompt
            ? "【视频生成约束】"
            : "",
          node.data.appendConfiguredPrompt && configuredPrompt !== upstreamPrompt
            ? configuredPrompt
            : "",
          !upstreamPrompt && !node.data.appendConfiguredPrompt
            ? configuredPrompt
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        const images = upstream.filter((value) => value.type === "image");
        let prompt = composeOrderedWorkflowImagePrompt(
          node.data,
          basePrompt,
          images,
        );
        const videos = upstream.filter((value) => value.type === "video");
        const audios = upstream.filter((value) => value.type === "audio");
        const isSeedance = isSeedanceModel(node.data.model);
        const isMiniMax = node.data.model === "minimax-h3";
        if (
          isSeedance &&
          images.some((image) => image.sourceKind === "face-input")
        ) {
          throw new Error(
            "真人人脸需要先上传到已授权的 AIGC Asset Group，等待资产 Active 后才能提交 Seedance。",
          );
        }
        const elementUris = uniqueTrustedAssetUris(upstream, isSeedance);
        if (isSeedance) {
          const trustedPersonInstructions = Object.entries(
            node.data.trustedPersonSlotPrompts || {},
          )
            .map(([slot, instruction]) => ({
              slot,
              index: Number(
                /^trusted_person_asset_(\d+)$/.exec(String(slot))?.[1] || 0,
              ),
              instruction: String(instruction || "").trim(),
            }))
            .filter((item) => item.index > 0 && item.instruction)
            .sort((left, right) => left.index - right.index)
            .map(
              (item) =>
                `真人认证资产 ${item.index}（${item.slot}）：${item.instruction}`,
            );
          if (trustedPersonInstructions.length)
            prompt = [
              prompt,
              "【真人认证资产顺序】",
              ...trustedPersonInstructions,
            ]
              .filter(Boolean)
              .join("\n");
        }
        const directIds = normalizeDirectDigitalAssetIds(
          input.directDigitalAssetIds,
          node.data.digitalAssetIds,
        );
        if (isMiniMax && (elementUris.length || directIds.length))
          throw new Error(
            "MiniMax H3 不接收平台真人数字资产或 Element，请连接普通图片、视频或音频素材。",
          );
        const unavailableDirectAssetIds = [];
        const selectedDirectAssets = directIds.flatMap((id) => {
          const asset = assets.find(
            (item) => item.id === id && ownedBy(item, input.ownerId),
          );
          if (!asset) {
            unavailableDirectAssetIds.push(id);
            return [];
          }
          return [asset];
        });
        const usableDirectIds = selectedDirectAssets.map((asset) => asset.id);
        const directAssetWarnings = unavailableDirectAssetIds.length
          ? [
              `已忽略 ${unavailableDirectAssetIds.length} 个已删除或无权访问的数字资产，工作流继续生成`,
            ]
          : [];
        if (directAssetWarnings.length)
          await updateWorkflowStep(runId, node.id, {
            progressLabel: directAssetWarnings[0],
          });
        if (node.data.model === "kling-v3") {
          const unavailable = selectedDirectAssets.find(
            (asset) => !asset.klingElementId,
          );
          if (unavailable)
            throw new Error(
              `数字资产「${unavailable.name}」尚未生成 Element ID，当前只能用于 Kling 3.0 Omni`,
            );
          selectedDirectAssets.forEach((asset) => {
            if (
              !elementUris.some(
                (item) => item.uri === String(asset.klingElementId),
              )
            )
              elementUris.push({
                label: `element_${elementUris.length + 1}`,
                uri: String(asset.klingElementId),
              });
          });
        }
        if (node.data.model === "kling-v3" && elementUris.length > 3)
          throw new Error("Kling 3.0 最多绑定 3 个 Element 主体");
        const miniMaxLastFrame = isMiniMax
          ? images.find((image) => image.inputHandle === "last_frame")
          : null;
        const ordinaryImages = miniMaxLastFrame
          ? images.filter((image) => image !== miniMaxLastFrame)
          : images;
        const [primary, ...allReferences] = ordinaryImages;
        if (
          isMiniMax &&
          miniMaxLastFrame &&
          (allReferences.length || videos.length || audios.length)
        )
          throw new Error(
            "MiniMax H3 首尾帧不能与多模态参考图片、视频或音频混用。",
          );
        const references =
          node.data.model === "kling-v3-omni" || isSeedance || isMiniMax
            ? allReferences
            : [];
        const duration = Number(node.data.duration || 15);
        const multiShot = node.data.multiShot !== false;
        const shotType = node.data.shotType || "intelligence";
        const requestedCount = Math.min(
          4,
          Math.max(1, Number(node.data.count || 1)),
        );
        const taskCandidates = await readCollection("tasks", []);
        const persistedTaskIds = new Set(
          [
            persistedStep?.taskId,
            persistedStep?.result?.taskId,
            ...(Array.isArray(persistedStep?.result?.taskIds)
              ? persistedStep.result.taskIds
              : []),
          ]
            .map((value) => String(value || ""))
            .filter(Boolean),
        );
        const reconnectableStatuses = new Set([
          "submitting",
          "queued",
          "processing",
          "succeeded",
          "failed",
        ]);
        const tasks = taskCandidates
          .filter(
            (task) =>
              reconnectableStatuses.has(task.status) &&
              (persistedTaskIds.has(String(task.id || "")) ||
                (String(task.workflowRunId || "") === String(runId) &&
                  String(task.workflowNodeId || "") === String(node.id))),
          )
          .sort(
            (left, right) =>
              (Date.parse(left.createdAt || 0) || 0) -
              (Date.parse(right.createdAt || 0) || 0),
          )
          .slice(0, requestedCount);
        const reconnectedCount = tasks.length;
        const createTaskInput = (variationIndex) => ({
              fileName: primary?.name || `${input.name || "工作流"}-${title}`,
              workflowNodeId: node.id,
              workflowRunId: runId,
              workflowTemplateId: input.templateId,
              workflowName: input.name,
              modelName: node.data.model || "kling-v3",
              image: primary?.data,
              imageMimeType: primary?.mimeType,
              imageTail: miniMaxLastFrame?.data,
              imageTailMimeType: miniMaxLastFrame?.mimeType,
              referenceImages: references.map((image, imageIndex) => ({
                data: image.data,
                name: image.name,
                mimeType: image.mimeType,
                label: `image_${imageIndex + 2}`,
              })),
              videos: videos.map((video, videoIndex) => ({
                data: video.data,
                name: video.name,
                mimeType: video.mimeType,
                label: `video_${videoIndex + 1}`,
              })),
              audios: audios.map((audio, audioIndex) => ({
                data: audio.data,
                name: audio.name,
                mimeType: audio.mimeType,
                label: `voice_${audioIndex + 1}`,
              })),
              assetUris: elementUris,
              digitalAssetIds:
                node.data.model === "kling-v3-omni" ? usableDirectIds : [],
              prompt,
              duration,
              mode: node.data.mode || "pro",
              cfgScale: node.data.cfgScale ?? 0.8,
              aspectRatio: node.data.aspectRatio || "9:16",
              multiShot,
              shotType,
              multiPrompt:
                multiShot && shotType === "customize"
                  ? parseWorkflowShots(node.data.shotPlan, duration)
                  : [],
              sound: ["kling-v3", "kling-v3-omni"].includes(node.data.model)
                ? node.data.sound || "off"
                : "off",
              watermark: Boolean(node.data.watermark),
              resolution: isMiniMax
                ? ["768P", "2K"].includes(node.data.resolution)
                  ? node.data.resolution
                  : "768P"
                : isSeedance
                  ? node.data.resolution || "720p"
                  : undefined,
              aigcWatermark: isMiniMax
                ? Boolean(node.data.aigcWatermark)
                : undefined,
              generateAudio: isSeedance
                ? node.data.generateAudio !== false
                : undefined,
              audioMode: isSeedance
                ? node.data.audioMode || "lip_sync"
                : undefined,
              negativePrompt: node.data.negativePrompt || "",
              callbackUrl: node.data.callbackUrl || "",
              ratioMode: node.data.ratioMode || "fixed",
              returnLastFrame: Boolean(node.data.returnLastFrame),
              externalTaskId:
                requestedCount === 1 && variationIndex === 0
                  ? node.data.externalTaskId || ""
                  : "",
              characterOrientation: node.data.characterOrientation || "video",
              keepOriginalSound: node.data.keepOriginalSound || "yes",
              videoUrls:
                node.data.model === "kling-v3-omni" &&
                node.data.referenceVideoUrl
                  ? [
                      {
                        url: node.data.referenceVideoUrl,
                        referType: node.data.videoReferType || "base",
                        keepOriginalSound: node.data.keepOriginalSound || "no",
                      },
                    ]
                  : [],
            });
        for (let variationIndex = tasks.length;
          variationIndex < requestedCount;
          variationIndex += 1) {
          tasks.push(
            await createVideoTask(
              createTaskInput(variationIndex),
              input.ownerId,
            ),
          );
        }
        const taskIds = tasks.map((task) => task.id);
        const taskStates = new Map(tasks.map((task) => [task.id, task]));
        await ensureWorkflowRunActive(runId, signal);
        await updateWorkflowStep(runId, node.id, {
          status: "processing",
          taskId: taskIds[0],
          progressLabel: reconnectedCount
            ? `服务恢复 · 已重新连接 ${reconnectedCount} / ${requestedCount} 条视频任务`
            : `已提交 ${requestedCount} 条视频任务`,
          result: {
            type: "video",
            taskId: taskIds[0],
            taskIds,
            prompt,
            warnings: directAssetWarnings,
          },
        });
        const completedTasks = await Promise.all(
          tasks.map((task, variationIndex) =>
            waitForWorkflowVideo(
              task.id,
              async (current) => {
                taskStates.set(task.id, current);
                const currentVideoUrls = [...taskStates.values()]
                  .map((item) => item.videoUrl)
                  .filter(Boolean);
                return updateWorkflowStep(runId, node.id, {
                  status:
                    current.status === "failed" ? "failed" : "processing",
                  progressLabel: `正在生成视频 ${variationIndex + 1} / ${requestedCount}`,
                  result: {
                    type: "video",
                    taskId: taskIds[0],
                    taskIds,
                    videoUrl: currentVideoUrls[0],
                    videoUrls: currentVideoUrls,
                    coverUrl: [...taskStates.values()].find(
                      (item) => item.coverUrl,
                    )?.coverUrl,
                    prompt,
                    warnings: directAssetWarnings,
                  },
                });
              },
              runId,
              signal,
            ),
          ),
        );
        const videoUrls = completedTasks
          .map((completed) => completed.videoUrl)
          .filter(Boolean);
        const completed = completedTasks[0];
        outputs.set(
          node.id,
          completedTasks.map((item, index) => ({
            type: "video",
            url: item.videoUrl,
            name: item.fileName || `生成视频 ${index + 1}.mp4`,
          })),
        );
        await updateWorkflowStep(runId, node.id, {
          status: "succeeded",
          completedAt: new Date().toISOString(),
          result: {
            type: "video",
            taskId: taskIds[0],
            taskIds,
            videoUrl: videoUrls[0],
            videoUrls,
            coverUrl: completed.coverUrl,
            prompt,
            warnings: directAssetWarnings,
          },
        });
        await updateWorkflowRun(runId, {
          coverUrl: completed.coverUrl,
          outputUrl: videoUrls[0],
          linkedTaskId: taskIds[0],
        });
      }
    }
    await ensureWorkflowRunActive(runId, signal);
    await updateWorkflowRun(runId, {
      status: "succeeded",
      completedAt: new Date().toISOString(),
      currentNodeId: null,
      activeEdgeId: null,
    });
  } catch (error) {
    if (error.code === "WORKFLOW_TERMINATED") {
      terminatedWorkflowRuns.delete(runId);
      return;
    }
    const current = (await readCollection("workflow_runs", [])).find(
      (run) => run.id === runId,
    );
    const failure = generationErrorDetails(
      error,
      "工作流生成失败，请调整节点素材或稍后重试。",
    );
    const message = failure.message;
    if (current?.currentNodeId)
      await updateWorkflowStep(runId, current.currentNodeId, {
        status: "failed",
        completedAt: new Date().toISOString(),
        error: message,
        failure,
      });
    await updateWorkflowRun(runId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: message,
      failure,
      currentNodeId: null,
      activeEdgeId: null,
    });
    console.error(`Workflow run ${runId} failed:`, error.message);
  }
}

async function resumeWorkflowRunAfterRestart(run, now) {
  if (!run?.recoveryInput?.nodes?.length) return false;
  await updateWorkflowRun(run.id, {
    status: "queued",
    error: null,
    currentNodeId: null,
    activeEdgeId: null,
    steps: (run.steps || []).map((step) =>
      ["queued", "processing"].includes(step.status)
        ? {
            ...step,
            status: "queued",
            progressLabel: "服务恢复 · 等待并发调度",
            updatedAt: now,
          }
        : step,
    ),
    reconnectCount: Number(run.reconnectCount || 0) + 1,
    lastReconnectedAt: now,
  });
  enqueueWorkflowRun(run.id, {
    ...run.recoveryInput,
    runtimeAssetManifest: run.runtimeAssets || {},
    ownerId: run.ownerId,
  });
  return true;
}

async function resumeLegacyWorkflowVideoRun(run, tasks, now) {
  const activeStep = (run.steps || []).find((step) =>
    ["queued", "processing"].includes(step.status),
  );
  if (!activeStep) return false;
  const task = findWorkflowVideoTask(tasks, run, activeStep);
  if (!task?.upstreamTaskId) return false;
  await updateWorkflowRun(run.id, {
    status: "processing",
    error: null,
    reconnectCount: Number(run.reconnectCount || 0) + 1,
    lastReconnectedAt: now,
  });
  void waitForWorkflowVideo(
    task.id,
    async (current) =>
      updateWorkflowStep(run.id, activeStep.nodeId, {
        status: current.status === "failed" ? "failed" : "processing",
        taskId: task.id,
        progressLabel: "服务恢复 · 已重新连接上游视频任务",
        result: {
          ...(activeStep.result || {}),
          type: "video",
          taskId: task.id,
          videoUrl: current.videoUrl,
          coverUrl: current.coverUrl,
        },
      }),
    run.id,
  )
    .then(async (completed) => {
      await updateWorkflowStep(run.id, activeStep.nodeId, {
        status: "succeeded",
        taskId: task.id,
        completedAt: new Date().toISOString(),
        progressLabel: "上游视频任务已恢复完成",
        result: {
          ...(activeStep.result || {}),
          type: "video",
          taskId: task.id,
          videoUrl: completed.videoUrl,
          coverUrl: completed.coverUrl,
        },
      });
      const remaining = (run.steps || []).filter(
        (step) =>
          step.nodeId !== activeStep.nodeId &&
          ["queued", "processing"].includes(step.status),
      );
      await updateWorkflowRun(run.id, {
        status: remaining.length ? "failed" : "succeeded",
        coverUrl: completed.coverUrl,
        outputUrl: completed.videoUrl,
        linkedTaskId: task.id,
        currentNodeId: null,
        activeEdgeId: null,
        completedAt: new Date().toISOString(),
        error: remaining.length
          ? "上游视频结果已恢复；该旧版本工作流缺少后续编排快照，请从结果节点继续运行。"
          : null,
      });
    })
    .catch(async (error) => {
      const message = generationErrorMessage(
        error,
        "上游视频任务恢复失败，请稍后刷新。",
      );
      await updateWorkflowStep(run.id, activeStep.nodeId, {
        status: "failed",
        error: message,
        completedAt: new Date().toISOString(),
      });
      await updateWorkflowRun(run.id, {
        status: "failed",
        error: message,
        currentNodeId: null,
        activeEdgeId: null,
        completedAt: new Date().toISOString(),
      });
    });
  return true;
}

function enqueueWorkflowRun(runId, input) {
  const queueKey = String(input.batchGroupId || runId);
  const previous = workflowRunQueues.get(queueKey) || Promise.resolve();
  const queued = previous
    .catch(() => undefined)
    .then(async () => {
      const priority = await generationQueuePriority(input.ownerId);
      return scheduleWorkflowWork(
        (signal) => processWorkflowRun(runId, input, signal),
        workflowQueueOptions({
          runId,
          ownerId: input.ownerId,
          priority,
          totalConcurrency: scheduleWorkflowWork.stats().concurrency,
          configuredUserConcurrency: process.env.USER_WORKFLOW_CONCURRENCY,
        }),
      );
    })
    .catch((error) => {
      if (
        error?.code === "WORKFLOW_TERMINATED" ||
        error?.code === "WORK_REPLACED"
      ) {
        terminatedWorkflowRuns.delete(runId);
        return;
      }
      console.error(`Workflow run ${runId} queue failed:`, error.message);
    })
    .finally(() => {
      if (workflowRunQueues.get(queueKey) === queued)
        workflowRunQueues.delete(queueKey);
    });
  workflowRunQueues.set(queueKey, queued);
}

const requireVisibleAdminUserTarget = asyncRoute(async (req, res, next) => {
  const users = await readCollection("users", []);
  const user = users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ message: "用户不存在" });
  req.targetUser = user;
  return next();
});

const requireInspirationAccess = asyncRoute(async (req, res, next) => {
  const users = await readCollection("users", []);
  const user = users.find((item) => item.id === req.user.userId);
  if (!user || user.status !== "active")
    return res.status(401).json({ message: "账号不存在或已停用" });
  if (!hasTemplateAccess(user))
    return res.status(403).json({
      message: "模版权限尚未开通，请联系管理员升级",
      code: "TEMPLATE_ACCESS_REQUIRED",
    });
  req.inspirationUser = user;
  return next();
});

const inspirationAssetAccess = (userId, expiresAt) =>
  createHmac(
    "sha256",
    `${signingSecret()}:inspiration-assets`,
  )
    .update(`${userId}:${expiresAt}`)
    .digest("base64url");

const signedInspirationAssetUrl = (url, userId, expiresAt) => {
  if (!String(url || "").startsWith("/inspiration-assets/")) return url || "";
  const params = new URLSearchParams({
    uid: String(userId),
    exp: String(expiresAt),
    sig: inspirationAssetAccess(userId, expiresAt),
  });
  return `${url}?${params}`;
};

const stableAssetExpiry = () => {
  const bucket = 30 * 60_000;
  return Math.ceil((Date.now() + 2 * 60 * 60_000) / bucket) * bucket;
};

const signedInspirationItem = (item, userId) => {
  const expiresAt = stableAssetExpiry();
  return {
    ...item,
    coverUrl: signedInspirationAssetUrl(item.coverUrl, userId, expiresAt),
    thumbnailUrl: signedInspirationAssetUrl(
      item.thumbnailUrl,
      userId,
      expiresAt,
    ),
    mainImageUrl: signedInspirationAssetUrl(
      item.mainImageUrl,
      userId,
      expiresAt,
    ),
    audioUrl: signedInspirationAssetUrl(item.audioUrl, userId, expiresAt),
    videoUrl: signedInspirationAssetUrl(item.videoUrl, userId, expiresAt),
  };
};

const signedInspirationListItem = (item, userId, expiresAt) => {
  const fields = inspirationListFields(item);
  return {
    ...fields,
    coverUrl: signedInspirationAssetUrl(fields.coverUrl, userId, expiresAt),
    thumbnailUrl: signedInspirationAssetUrl(
      fields.thumbnailUrl,
      userId,
      expiresAt,
    ),
    mainImageUrl: signedInspirationAssetUrl(
      fields.mainImageUrl,
      userId,
      expiresAt,
    ),
  };
};

const requireInspirationAssetAccess = asyncRoute(async (req, res, next) => {
  const userId = String(req.query.uid || "");
  const expiresAt = Number(req.query.exp || 0);
  const signature = String(req.query.sig || "");
  const expected = inspirationAssetAccess(userId, expiresAt);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  if (
    !userId ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() ||
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  )
    return res.status(403).json({ message: "素材访问凭证无效或已过期" });
  const users = await readCollection("users", []);
  const user = users.find((item) => item.id === userId);
  if (!user || user.status !== "active" || !hasTemplateAccess(user))
    return res
      .status(403)
      .json({ message: "模版素材访问权限无效或已被关闭" });
  return next();
});

app.use(
  "/inspiration-assets",
  requireInspirationAssetAccess,
  express.static(inspirationAssetsDir, { maxAge: "2h", immutable: true }),
);

app.get("/api/admin/status", (_req, res) => {
  res.json({ configured: isAdminConfigured() });
});

app.post("/api/admin/login", (req, res, next) => {
  const username = String(req.body.username || "");
  const key = loginAttemptKey(req, username);
  let current;
  try {
    current = assertLoginAllowed(adminLoginAttempts, key);
  } catch (error) {
    return next(error);
  }
  if (
    !authenticateAdmin(
      username,
      String(req.body.password || ""),
    )
  ) {
    recordLoginFailure(adminLoginAttempts, key, current);
    return next(
      Object.assign(new Error("管理员账号或密码错误"), { status: 401 }),
    );
  }
  adminLoginAttempts.delete(key);
  res.json({
    token: issueAdminToken(),
    expiresIn: 28_800,
    admin: { username: process.env.ADMIN_USERNAME, role: "超级管理员" },
  });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ username: req.admin.username, role: "超级管理员" });
});

app.get(
  "/api/admin/inspiration-generation-config",
  requireAdmin,
  asyncRoute(async (_req, res) => {
    res.json(await getInspirationGenerationConfig());
  }),
);

app.get(
  "/api/create-generation-config",
  asyncRoute(async (_req, res) => {
    const config = await getInspirationGenerationConfig();
    res.json({
      promptLabel: config.promptLabel,
      promptPlaceholder: config.promptPlaceholder,
      generateButtonLabel: config.generateButtonLabel,
      quickPromptPresets: config.quickPromptPresets,
      batchPromptLabel: config.batchPromptLabel,
      batchPrompt: config.batchPrompt,
      batchApplyLabel: config.batchApplyLabel,
      imagePromptLabel: config.imagePromptLabel,
      imagePromptPlaceholder: config.imagePromptPlaceholder,
      audioTextLabel: config.audioTextLabel,
      audioTextPlaceholder: config.audioTextPlaceholder,
      audioClonePreviewText: config.audioClonePreviewText,
      analysisPromptLabel: config.analysisPromptLabel,
      analysisPromptPlaceholder: config.analysisPromptPlaceholder,
      analysisSeedanceFramework: config.analysisSeedanceFramework,
      analysisKlingFramework: config.analysisKlingFramework,
      canvasDirectorPrompt: config.canvasDirectorPrompt,
      canvasVideoPrompt: config.canvasVideoPrompt,
      canvasAnalysisPrompt: config.canvasAnalysisPrompt,
    });
  }),
);

app.patch(
  "/api/admin/inspiration-generation-config",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const config = normalizeInspirationGenerationConfig(req.body);
    await mutateCollection(
      "system_settings",
      (settings) => ({
        ...(settings || {}),
        inspirationGenerationConfig: config,
      }),
      {},
    );
    res.json(config);
  }),
);

app.get(
  "/api/admin/hot-rank-remake-config",
  requireAdmin,
  asyncRoute(async (_req, res) => {
    res.json(await getHotRankRemakeConfig());
  }),
);

app.patch(
  "/api/admin/hot-rank-remake-config",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const previous = await getHotRankRemakeConfig();
    const config = normalizeHotRankRemakeConfig({
      ...req.body,
      workflow: {
        ...(req.body?.workflow || {}),
        revision: Number(previous.workflow?.revision || 0) + 1,
        updatedAt: new Date().toISOString(),
      },
    });
    await mutateCollection(
      "system_settings",
      (settings) => ({
        ...(settings || {}),
        hotRankRemakeConfig: config,
      }),
      {},
    );
    res.json(config);
  }),
);

app.get(
  "/api/admin/detail-page-templates",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const catalog = await getInspirationTemplateCatalog();
    const { manifest } = catalog;
    const items = [
      ...catalog.detailPageTemplates,
      ...catalog.outfitImageTemplates,
      ...catalog.videoTemplates,
      ...(await materialTemplatesForManifest(manifest)),
    ];
    const summaryView = String(req.query.view || "") === "summary";
    const query = String(req.query.query || "").trim().toLowerCase();
    const kind = String(req.query.kind || "all").trim();
    const primaryCategory = String(
      req.query.primaryCategory || "all",
    ).trim();
    const secondaryCategory = String(
      req.query.secondaryCategory || "all",
    ).trim();
    const platform = String(req.query.platform || "all").trim();
    const filtered = summaryView
      ? items.filter((item) => {
          const haystack = [
            item.id,
            item.title,
            item.primaryCategory,
            item.secondaryCategory,
            item.platform,
            item.imageType,
            ...(Array.isArray(item.tags) ? item.tags : []),
          ]
            .join(" ")
            .toLowerCase();
          return (
            (!query || haystack.includes(query)) &&
            (kind === "all" || item.kind === kind) &&
            (primaryCategory === "all" ||
              item.primaryCategory === primaryCategory ||
              item.primaryCategoryId === primaryCategory) &&
            (secondaryCategory === "all" ||
              item.secondaryCategory === secondaryCategory ||
              item.secondaryCategoryId === secondaryCategory) &&
            (platform === "all" || item.platform === platform)
          );
        })
      : items;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.pageSize, 10) || 48),
    );
    const start = (page - 1) * pageSize;
    const videoCategories = [
      ...new Set(
        items
          .filter((item) => item.kind === "video")
          .map((item) => item.primaryCategory)
          .filter(Boolean),
      ),
    ].map((label) => ({
      id: `video-${label}`,
      label,
      children: [{ id: `video-${label}-all`, label }],
    }));
    res.json({
      total: items.length,
      categoryTree: [
        ...new Map(
          [...DETAIL_PAGE_CATEGORY_TREE, ...OUTFIT_CATEGORY_TREE].map(
            (item) => [item.label, item],
          ),
        ).values(),
        ...videoCategories,
        {
          id: "material-template",
          label: "素材模版",
          children: [{ id: "oral-video", label: "口播类视频" }],
        },
      ],
      platforms: [
        ...new Set([
          ...DETAIL_PAGE_PLATFORMS,
          ...OUTFIT_PLATFORMS,
          ...items
            .filter((item) => ["video", "material"].includes(item.kind))
            .map((item) => item.platform)
          .filter(Boolean),
        ]),
      ],
      ...(summaryView
        ? {
            filteredTotal: filtered.length,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
          }
        : {}),
      items: (summaryView ? filtered.slice(start, start + pageSize) : items).map(
        (item) => {
          const signed = signedInspirationItem(item, "workspace-owner");
          if (!summaryView) return signed;
          return {
            id: signed.id,
            title: signed.title,
            kind: signed.kind,
            enabled: signed.enabled !== false,
            coverUrl: signed.coverUrl,
            thumbnailUrl: signed.thumbnailUrl,
            ratio: signed.ratio || signed.aspectRatio,
            aspectRatio: signed.aspectRatio || signed.ratio,
            primaryCategory: signed.primaryCategory,
            primaryCategoryId: signed.primaryCategoryId,
            secondaryCategory: signed.secondaryCategory,
            secondaryCategoryId: signed.secondaryCategoryId,
            platform: signed.platform,
            imageType: signed.imageType,
            model: signed.model,
            tags: Array.isArray(signed.tags) ? signed.tags.slice(0, 12) : [],
            updatedAt: signed.updatedAt,
          };
        },
      ),
    });
  }),
);

app.get(
  "/api/admin/detail-page-templates/:id",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const catalog = await getInspirationTemplateCatalog();
    const items = [
      ...catalog.detailPageTemplates,
      ...catalog.outfitImageTemplates,
      ...catalog.videoTemplates,
      ...(await materialTemplatesForManifest(catalog.manifest)),
    ];
    const item = items.find((entry) => entry.id === req.params.id);
    if (!item) return res.status(404).json({ message: "模版不存在" });
    res.json(signedInspirationItem(item, "workspace-owner"));
  }),
);

app.patch(
  "/api/admin/detail-page-templates/:id",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const catalog = await getInspirationTemplateCatalog();
    const { manifest } = catalog;
    const items = [
      ...catalog.detailPageTemplates,
      ...catalog.outfitImageTemplates,
      ...catalog.videoTemplates,
      ...(await materialTemplatesForManifest(manifest)),
    ];
    const currentItem = items.find((item) => item.id === req.params.id);
    if (!currentItem)
      return res.status(404).json({ message: "模版不存在" });
    if (currentItem.kind === "material") {
      let updatedTemplate = null;
      await mutateCollection("templates", (templates) =>
        templates.map((template) => {
          if (template.id !== req.params.id) return template;
          const now = new Date().toISOString();
          const tags = (Array.isArray(req.body.tags) ? req.body.tags : [])
            .map((item) => String(item || "").trim().slice(0, 32))
            .filter(Boolean)
            .slice(0, 12);
          const candidate = {
            ...template,
            name: String(req.body.title ?? template.name)
              .trim()
              .slice(0, 80),
            description: String(
              req.body.description ?? template.description ?? "",
            )
              .trim()
              .slice(0, 600),
            enabled:
              req.body.enabled === undefined
                ? template.enabled !== false
                : Boolean(req.body.enabled),
            ...(tags.length ? { tags } : {}),
            ...(Array.isArray(req.body.nodes)
              ? { nodes: req.body.nodes }
              : {}),
            ...(Array.isArray(req.body.edges)
              ? { edges: req.body.edges }
              : {}),
            category: "素材模版",
            workflowType: "oral-material",
            runMode: "backend",
            updatedAt: now,
          };
          const revisionEntry = createTemplateRevisionEntry(
            template,
            candidate,
            {
              revision: templateRevision(template) + 1,
              updatedAt: now,
              updatedBy: req.admin.username,
            },
          );
          const revised = revisionEntry.changes?.length
            ? {
                ...candidate,
                revision: revisionEntry.revision,
                revisionHistory: [
                  ...(template.revisionHistory || []),
                  revisionEntry,
                ].slice(-20),
                lastTemplateRevision: revisionEntry,
              }
            : candidate;
          updatedTemplate = {
            ...revised,
            manifest: buildTemplateManifest(revised),
            versionRef: templateVersionRef(revised),
          };
          return updatedTemplate;
        }),
      );
      if (!updatedTemplate)
        return res.status(404).json({ message: "素材模版不存在" });
      const updated = (await materialTemplatesForManifest(manifest)).find(
        (item) => item.id === req.params.id,
      );
      return res.json(
        signedInspirationItem(updated, "workspace-owner"),
      );
    }
    const currentOverrides = await getDetailPageTemplateOverrides();
    const currentTypePaths = await getDetailPageTemplateTypePaths();
    const override =
      currentItem.kind === "video"
        ? normalizeVideoTemplateOverride(
            req.body,
            currentOverrides[req.params.id],
          )
        : normalizeDetailPageTemplateOverride(
            req.body,
            currentOverrides[req.params.id],
          );
    const typeConfigKey = detailPageTemplateTypeKey(currentItem);
    const typeConfigPath = String(
      req.body?.typeConfigPath ?? currentTypePaths[typeConfigKey] ?? "",
    )
      .trim()
      .slice(0, 240);
    await mutateCollection(
      "system_settings",
      (settings) => ({
        ...(settings || {}),
        detailPageTemplateOverrides: {
          ...((settings || {}).detailPageTemplateOverrides || {}),
          [req.params.id]: override,
        },
        detailPageTemplateTypePaths: {
          ...((settings || {}).detailPageTemplateTypePaths || {}),
          [typeConfigKey]: typeConfigPath,
        },
      }),
      {},
    );
    if (currentItem.kind === "video") {
      const updated = (await videoTemplatesForManifest(manifest)).find(
        (item) => item.id === req.params.id,
      );
      return res.json(signedInspirationItem(updated, "workspace-owner"));
    }
    const templateFactory = currentItem.kind === "outfit"
      ? createOutfitImageTemplates
      : createDetailPageTemplates;
    const updated = withDetailPageTemplateTypePaths(templateFactory({
      coverUrls: (manifest.items || [])
        .map((item) => item.coverUrl || item.mainImageUrl)
        .filter(Boolean),
      overrides: {
        ...currentOverrides,
        [req.params.id]: override,
      },
    }), {
      ...currentTypePaths,
      [typeConfigKey]: typeConfigPath,
    }).find((item) => item.id === req.params.id);
    res.json(
      signedInspirationItem(updated, "workspace-owner"),
    );
  }),
);

const ensureWorkspaceOwnerUser = async () => {
  const ownerId = String(
    process.env.LEGACY_OWNER_USER_ID || "workspace-owner",
  );
  let owner = null;
  const now = new Date().toISOString();
  await mutateCollection("users", (users) =>
    users.map((user) => {
      if (user.id !== ownerId) return user;
      owner = {
        ...user,
        accountType: "admin",
        teamId: DEFAULT_TEAM_ID,
        teamRole: "admin",
        templateAccess: true,
        inspirationAccess: true,
        status: "active",
        lastActiveAt: now,
        updatedAt: now,
      };
      return owner;
    }),
  );
  if (!owner) {
    owner = {
      id: ownerId,
      name: "工作室主账号",
      contact: "admin@example.com",
      plan: "工作室版",
      accountType: "admin",
      teamId: DEFAULT_TEAM_ID,
      teamRole: "admin",
      templateAccess: true,
      inspirationAccess: true,
      status: "active",
      pointsBalance: 1000,
      totalGenerated: 0,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await mutateCollection("users", (users) => [owner, ...users]);
  }
  return owner;
};

const ensureDefaultTeam = async (owner) => {
  const now = new Date().toISOString();
  let result = null;
  await mutateCollection("teams", (teams) => {
    const existing = teams.find((team) => team.id === DEFAULT_TEAM_ID);
    result = normalizeTeam({
      ...(existing || {}),
      id: DEFAULT_TEAM_ID,
      name: existing?.name || "Commerce Canvas工作室",
      ownerId: owner.id,
      adminIds: [...new Set([...(existing?.adminIds || []), owner.id])],
      status: "active",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    return existing
      ? teams.map((team) => (team.id === DEFAULT_TEAM_ID ? result : team))
      : [result, ...teams];
  });
  return result;
};

const migrateLegacyGlobalTemplatesToTeams = async (users) => {
  const userTeamIds = new Map(
    (users || []).map((user) => [String(user.id), String(user.teamId || "")]),
  );
  await mutateCollection("templates", (templates) => {
    let changed = false;
    const next = templates.map((template) => {
      if (
        template.system ||
        String(template.id || "").startsWith("builtin-") ||
        String(template.visibility || "") !== "global"
      )
        return template;
      changed = true;
      return {
        ...template,
        visibility: "team",
        teamId:
          userTeamIds.get(String(effectiveOwnerId(template))) || DEFAULT_TEAM_ID,
        public: false,
      };
    });
    return changed ? next : templates;
  });
};

app.post(
  "/api/dev/admin-session",
  asyncRoute(async (req, res) => {
    const remoteAddress = String(req.socket?.remoteAddress || "");
    if (
      !allowsLocalAdminSession({
        nodeEnv: process.env.NODE_ENV,
        remoteAddress,
      })
    )
      return res.status(404).json({ message: "接口不存在" });
    const owner = await ensureWorkspaceOwnerUser();
    const team = await ensureDefaultTeam(owner);
    res.set("Cache-Control", "no-store");
    res.json({
      token: issueUserToken(owner),
      user: safeUserAccount(owner, null, team),
    });
  }),
);

app.post("/api/dev/admin-console-session", (req, res) => {
  const remoteAddress = String(req.socket?.remoteAddress || "");
  if (
    !allowsLocalAdminSession({
      nodeEnv: process.env.NODE_ENV,
      remoteAddress,
    })
  )
    return res.status(404).json({ message: "接口不存在" });
  res.set("Cache-Control", "no-store");
  res.json({
    token: issueLocalAdminToken(),
    expiresIn: 28_800,
    admin: { username: "本地管理员", role: "超级管理员" },
  });
});

app.post(
  "/api/admin/enter-studio",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const owner = await ensureWorkspaceOwnerUser();
    const team = await ensureDefaultTeam(owner);
    res.json({
      token: issueUserToken(owner),
      user: safeUserAccount(owner, null, team),
      destination: "/#/workflow",
    });
  }),
);

app.get(
  "/api/admin/dashboard",
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const [traffic, allTasks, allRuns, allTemplates, allUsers, allLedger] =
      await Promise.all([
        readTraffic(),
        readCollection("tasks", []),
        readCollection("workflow_runs", []),
        readCollection("templates", []),
        readCollection("users", []),
        readCollection("point_ledger", []),
      ]);
    const users = allUsers;
    const tasks = allTasks;
    const runs = allRuns;
    const templates = allTemplates;
    const ledger = allLedger;
    const trafficSummary = summarizeTraffic(traffic);
    const generationTimes = summarizeGenerationTimes(tasks, runs);
    const taskCounts = tasks.reduce(
      (counts, task) => ({
        ...counts,
        [task.status]: (counts[task.status] || 0) + 1,
      }),
      {},
    );
    const modelUsage = Object.values(
      tasks.reduce((usage, task) => {
        const key =
          task.provider === "volcengine"
            ? String(task.modelName).includes("-fast-")
              ? "Seedance 2.0 Fast"
              : "Seedance 2.0"
            : task.modelName === "kling-v3-omni"
              ? "Kling 3.0 Omni"
              : task.modelName === "kling-v3-turbo"
                ? "Kling 3.0 Turbo"
                : "Kling 3.0";
        usage[key] = usage[key] || { model: key, tasks: 0, succeeded: 0 };
        usage[key].tasks += 1;
        usage[key].succeeded += task.status === "succeeded" ? 1 : 0;
        return usage;
      }, {}),
    );
    const pointsIssued = ledger
      .filter((entry) => entry.amount > 0)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const pointsConsumed = Math.abs(
      ledger
        .filter((entry) => entry.amount < 0)
        .reduce((sum, entry) => sum + entry.amount, 0),
    );
    res.json({
      traffic: trafficSummary,
      users: {
        total: users.length,
        active: users.filter((user) => user.status === "active").length,
        disabled: users.filter((user) => user.status === "disabled").length,
        lowBalance: users.filter(
          (user) => Number(user.pointsBalance || 0) <= 20,
        ).length,
      },
      points: {
        balance: users.reduce(
          (sum, user) => sum + Number(user.pointsBalance || 0),
          0,
        ),
        issued: pointsIssued,
        consumed: pointsConsumed,
        changes: ledger.length,
      },
      tasks: {
        total: tasks.length,
        today: todayGenerationStats(tasks),
        failures24h: recentFailureStats(tasks),
        active:
          (taskCounts.queued || 0) +
          (taskCounts.processing || 0) +
          (taskCounts.submitting || 0),
        succeeded: taskCounts.succeeded || 0,
        failed: taskCounts.failed || 0,
        modelUsage,
      },
      generationTimes,
      templates: {
        total: SYSTEM_TEMPLATES.length + templates.length,
        system: SYSTEM_TEMPLATES.length,
        custom: templates.length,
        pending: templates.filter((template) =>
          ["pending_publish", "pending_delete"].includes(
            templateApprovalStatus(template),
          ),
        ).length,
      },
      providers: {
        kling: { configured: isConfigured(), label: "Kling 3.0" },
        deepseek: {
          configured: isDeepSeekConfigured(),
          label: "DeepSeek V4 Pro",
        },
        image2: { ...getImage2Status(), label: "GPT Image 2 · Azure" },
        minimax: {
          configured: isMiniMaxVideoConfigured(),
          label: "MiniMax H3",
        },
        vapeur: {
          ...getVapeurStatus(),
          imageConfigured: isVapeurImageConfigured(),
          label: "Vapeur · GPT 5.5 / GPT Image 2",
        },
        volcengine: { ...getVolcengineStatus(), label: "Seedance 2.0 Fast" },
      },
    });
  }),
);

app.get(
  "/api/admin/model-deployments",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const requestedWindow = Number.parseInt(req.query.windowDays, 10) || 7;
    if (![1, 7, 30, 90].includes(requestedWindow))
      return res.status(400).json({
        message: "windowDays 仅支持 1、7、30 或 90",
        field: "windowDays",
      });
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.pageSize, 10) || 50),
    );
    const status = String(req.query.status || "").trim().toUpperCase();
    const kind = String(req.query.kind || "").trim().toLowerCase();
    const provider = String(req.query.provider || "").trim().toLowerCase();
    if (
      status &&
      !["HEALTHY", "DEGRADED", "UNAVAILABLE", "UNKNOWN"].includes(status)
    )
      return res.status(400).json({
        message: "status 参数无效",
        field: "status",
      });

    const [tasks, runs, analysisTasks, readinessRecords, traffic] =
      await Promise.all([
        readCollection("tasks", []),
        readCollection("workflow_runs", []),
        readCollection("media_analysis_tasks", []),
        readCollection("model_readiness", []),
        readTraffic(),
      ]);
    const now = new Date();
    const result = buildModelDeployments({
      tasks,
      runs,
      analysisTasks,
      readinessRecords,
      now,
      windowDays: requestedWindow,
      modelsCatalog: modelDeploymentCatalog(),
    });
    const filtered = result.data.filter(
      (item) =>
        (!status || item.deployment.status === status) &&
        (!kind || item.kind === kind) &&
        (!provider || item.provider === provider),
    );
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * pageSize;
    res.json({
      ...result,
      data: filtered.slice(start, start + pageSize),
      apiMetrics: buildApiMetrics(traffic, {
        now,
        windowDays: requestedWindow,
      }),
      pagination: {
        page: currentPage,
        pageSize,
        totalItems,
        totalPages,
      },
    });
  }),
);

app.post(
  "/api/admin/model-readiness-checks",
  requireAdmin,
  asyncRoute(async (_req, res) => {
    // These checks only read provider metadata/authentication state. They never
    // create a generation, upload, clone, analysis, or paid task.
    const records = await runSharedModelReadinessCheck();
    res.json({
      checkedAt:
        records
          .map((record) => record.checkedAt)
          .filter(Boolean)
          .sort()
          .at(-1) || new Date().toISOString(),
      data: records,
    });
  }),
);

app.get(
  "/api/admin/users",
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const users = await readCollection("users", []);
    res.json(
      users
        .sort(
          (left, right) => new Date(right.createdAt) - new Date(left.createdAt),
        )
        .map(safeUserAccount),
    );
  }),
);

app.get(
  "/api/admin/users/:id",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const [users, tasks, templates, assets, ledger] = await Promise.all([
      readCollection("users", []),
      readCollection("tasks", []),
      readCollection("templates", []),
      readCollection("digital_assets", []),
      readCollection("point_ledger", []),
    ]);
    const user = users.find((item) => item.id === req.params.id);
    if (!user) return res.status(404).json({ message: "用户不存在" });
    const userTasks = tasks
      .filter((task) => ownedBy(task, user.id))
      .sort(
        (left, right) => new Date(right.createdAt) - new Date(left.createdAt),
      );
    const statuses = userTasks.reduce(
      (counts, task) => ({
        ...counts,
        [task.status]: (counts[task.status] || 0) + 1,
      }),
      {},
    );
    res.json({
      user: safeUserAccount(user),
      stats: {
        tasks: userTasks.length,
        succeeded: statuses.succeeded || 0,
        failed: statuses.failed || 0,
        active:
          (statuses.submitting || 0) +
          (statuses.queued || 0) +
          (statuses.processing || 0),
        templates: templates.filter((template) => ownedBy(template, user.id))
          .length,
        assets: assets.filter((asset) => ownedBy(asset, user.id)).length,
        pointsConsumed: Math.abs(
          ledger
            .filter((entry) => entry.userId === user.id && entry.amount < 0)
            .reduce((sum, entry) => sum + entry.amount, 0),
        ),
      },
      tasks: userTasks.map(safeTask),
      ledger: ledger.filter((entry) => entry.userId === user.id).slice(0, 100),
    });
  }),
);

app.post(
  "/api/admin/users",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const now = new Date().toISOString();
    const initialPoints = Number(req.body.initialPoints ?? 0);
    if (
      !Number.isInteger(initialPoints) ||
      initialPoints < 0 ||
      initialPoints > 1_000_000
    )
      return res
        .status(400)
        .json({ message: "初始积分必须是 0–1000000 的整数" });
    const user = {
      id: randomUUID(),
      ...cleanUserPatch(req.body, true),
      accountType: "creator",
      templateAccess: false,
      inspirationAccess: false,
      status: "active",
      pointsBalance: initialPoints,
      totalGenerated: 0,
      lastActiveAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await mutateCollection("users", (users) => [user, ...users]);
    if (initialPoints) {
      await mutateCollection("point_ledger", (entries) => [
        {
          id: randomUUID(),
          userId: user.id,
          amount: initialPoints,
          balanceAfter: initialPoints,
          reason: "创建用户初始积分",
          operator: req.admin.username,
          createdAt: now,
        },
        ...entries,
      ]);
    }
    res.status(201).json(safeUserAccount(user));
  }),
);

app.patch(
  "/api/admin/users/:id",
  requireAdmin,
  requireVisibleAdminUserTarget,
  asyncRoute(async (req, res) => {
    const patch = cleanUserPatch(req.body);
    let updated;
    await mutateCollection("users", (users) =>
      users.map((user) => {
        if (user.id !== req.params.id) return user;
        updated = { ...user, ...patch, updatedAt: new Date().toISOString() };
        return updated;
      }),
    );
    if (!updated) return res.status(404).json({ message: "用户不存在" });
    res.json(safeUserAccount(updated));
  }),
);

app.post(
  "/api/admin/users/:id/password",
  requireAdmin,
  requireVisibleAdminUserTarget,
  asyncRoute(async (req, res) => {
    const password = String(req.body.password || "");
    if (password.length < 8)
      return res.status(400).json({ message: "新密码至少需要 8 位" });
    if (password.length > 128)
      return res.status(400).json({ message: "新密码不能超过 128 位" });
    const credentials = hashPassword(password);
    let updated;
    await mutateCollection("users", (users) =>
      users.map((user) => {
        if (user.id !== req.params.id) return user;
        updated = {
          ...user,
          passwordHash: credentials.hash,
          passwordSalt: credentials.salt,
          passwordChangedAt: new Date().toISOString(),
          sessionVersion: Number(user.sessionVersion || 0) + 1,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    );
    if (!updated) return res.status(404).json({ message: "用户不存在" });
    res.json({ user: safeUserAccount(updated), changedAt: updated.updatedAt });
  }),
);

app.delete(
  "/api/admin/users/:id",
  requireAdmin,
  requireVisibleAdminUserTarget,
  asyncRoute(async (req, res) => {
    if (
      req.params.id ===
      String(process.env.LEGACY_OWNER_USER_ID || "workspace-owner")
    ) {
      return res.status(400).json({ message: "工作室主账号不能删除" });
    }
    const [
      users,
      teams,
      hiddenBuiltinEntries,
      pointLedger,
      mcpAudit,
      inspirations,
      systemSettings,
      ...accountCollections
    ] = await Promise.all([
      readCollection("users", []),
      readCollection("teams", []),
      readCollection("hidden_builtin_templates", []),
      readCollection("point_ledger", []),
      readCollection("mcp_audit_logs", []),
      readCollection("inspirations", {}),
      readCollection("system_settings", {}),
      ...ACCOUNT_RECORD_COLLECTIONS.map((name) => readCollection(name, [])),
    ]);
    const recordsByCollection = new Map(
      ACCOUNT_RECORD_COLLECTIONS.map((name, index) => [
        name,
        accountCollections[index],
      ]),
    );
    const user = users.find((item) => item.id === req.params.id);
    if (!user) return res.status(404).json({ message: "用户不存在" });
    const activeTasks = recordsByCollection.get("tasks").filter(
      (task) =>
        ownedBy(task, user.id) &&
        ["submitting", "queued", "processing"].includes(task.status),
    );
    const activeRuns = recordsByCollection
      .get("workflow_runs")
      .filter((run) => ownedBy(run, user.id) && isWorkflowRunActive(run));
    const activeAnalysisTasks = recordsByCollection
      .get("media_analysis_tasks")
      .filter(
        (task) =>
          ownedBy(task, user.id) &&
          (MEDIA_ANALYSIS_ACTIVE_STATUSES.has(task.status) ||
            mediaAnalysisJobs.has(task.id)),
      );
    if (activeTasks.length || activeRuns.length || activeAnalysisTasks.length)
      return res.status(409).json({
        message: "该用户仍有任务运行，请先完成或终止后再删除账号",
        active: {
          tasks: activeTasks.length,
          workflowRuns: activeRuns.length,
          mediaAnalysisTasks: activeAnalysisTasks.length,
        },
      });
    const ownedTeam = teams.find(
      (team) =>
        team.status !== "disabled" && String(team.ownerId || "") === user.id,
    );
    if (ownedTeam)
      return res.status(409).json({
        message: `该用户是团队「${ownedTeam.name || ownedTeam.id}」负责人，请先转移团队负责人`,
        code: "TEAM_OWNER_TRANSFER_REQUIRED",
      });

    const deletedAt = new Date().toISOString();
    const accountIds = new Set([user.id]);
    const plans = new Map(
      ACCOUNT_RECORD_COLLECTIONS.map((name) => [
        name,
        removeAccountRecords(recordsByCollection.get(name), accountIds),
      ]),
    );
    const removedRecords = [...plans.values()].flatMap((plan) => plan.removed);
    const retainedRecords = [
      ...plans.values(),
    ].flatMap((plan) => plan.kept);
    const pendingDeletion = user.deletionPending || {};
    const generatedCandidates = new Set([
      ...(pendingDeletion.generatedFiles || []),
      ...generatedFileNames(user),
      ...generatedFileNames(removedRecords),
    ]);
    const retainedGenerated = generatedFileNames([
      retainedRecords,
      inspirations,
      systemSettings,
      hiddenBuiltinEntries,
      teams,
      users.filter((item) => item.id !== user.id),
    ]);
    const digitalBlobCandidates = new Set([
      ...(pendingDeletion.digitalAssetBlobIds || []),
      ...storageBlobIds(plans.get("digital_assets").removed),
    ]);
    const retainedDigitalBlobs = storageBlobIds(
      plans.get("digital_assets").kept,
    );
    const workflowBlobCandidates = new Set([
      ...(pendingDeletion.workflowAssetBlobIds || []),
      ...storageBlobIds([
        plans.get("workflow_runs").removed,
        plans.get("tasks").removed,
      ]),
    ]);
    const retainedWorkflowBlobs = storageBlobIds([
      plans.get("workflow_runs").kept,
      plans.get("tasks").kept,
    ]);

    // Mark first so a partial filesystem or storage failure can be retried safely.
    await mutateCollection("users", (items) =>
      items.map((item) =>
        item.id === user.id
          ? {
              ...item,
              status: "deleting",
              deletionPending: {
                version: 1,
                startedAt: pendingDeletion.startedAt || deletedAt,
                generatedFiles: [...generatedCandidates],
                digitalAssetBlobIds: [...digitalBlobCandidates],
                workflowAssetBlobIds: [...workflowBlobCandidates],
              },
              updatedAt: deletedAt,
            }
          : item,
      ),
    );

    for (const name of ACCOUNT_RECORD_COLLECTIONS) {
      if (!plans.get(name).removed.length) continue;
      await mutateCollection(name, (items) =>
        removeAccountRecords(items, accountIds).kept,
      );
    }
    await mutateCollection("point_ledger", (items) =>
      anonymizePointLedger(items, accountIds, deletedAt),
    );
    await mutateCollection("mcp_audit_logs", (items) =>
      anonymizeMcpAudit(items, accountIds, deletedAt),
    );
    await mutateCollection("hidden_builtin_templates", (items) =>
      items.filter(
        (item) => typeof item === "string" || item.userId !== user.id,
      ),
    );
    await mutateCollection("teams", (items) =>
      items.map((team) => ({
        ...team,
        adminIds: (team.adminIds || []).filter(
          (adminId) => String(adminId) !== user.id,
        ),
      })),
    );

    const [generatedCleanup, digitalCleanup, workflowCleanup] =
      await Promise.all([
        removeUnreferencedStoredFiles(
          generatedDir,
          generatedCandidates,
          retainedGenerated,
        ),
        removeUnreferencedStoredFiles(
          digitalAssetBlobDir,
          digitalBlobCandidates,
          retainedDigitalBlobs,
        ),
        removeUnreferencedStoredFiles(
          workflowAssetBlobDir,
          workflowBlobCandidates,
          retainedWorkflowBlobs,
        ),
      ]);

    await mutateCollection("users", (items) =>
      items.filter((item) => item.id !== user.id),
    );
    for (const run of plans.get("workflow_runs").removed)
      terminatedWorkflowRuns.delete(run.id);
    for (const task of plans.get("media_analysis_tasks").removed)
      mediaAnalysisJobs.delete(task.id);

    const removedCounts = Object.fromEntries(
      [...plans].map(([name, plan]) => [name, plan.removed.length]),
    );
    res.json({
      deleted: true,
      user: { id: user.id, name: user.name },
      removed: {
        ...removedCounts,
        assets: removedCounts.digital_assets,
      },
      ledgerPreserved: true,
      auditAnonymized: {
        pointLedger: pointLedger.filter((entry) => entry.userId === user.id)
          .length,
        mcp: mcpAudit.filter((entry) => entry.userId === user.id).length,
      },
      filesDeleted:
        generatedCleanup.deleted.length +
        digitalCleanup.deleted.length +
        workflowCleanup.deleted.length,
    });
  }),
);

app.post(
  "/api/admin/users/:id/points",
  requireAdmin,
  requireVisibleAdminUserTarget,
  asyncRoute(async (req, res) => {
    const amount = Number(req.body.amount);
    const reason = String(req.body.reason || "")
      .trim()
      .slice(0, 120);
    if (
      !Number.isInteger(amount) ||
      amount === 0 ||
      Math.abs(amount) > 1_000_000
    )
      return res
        .status(400)
        .json({ message: "积分变动必须是非零整数，且绝对值不超过 1000000" });
    if (reason.length < 2)
      return res.status(400).json({ message: "请填写积分变动原因" });
    let updated;
    await mutateCollection("users", (users) =>
      users.map((user) => {
        if (user.id !== req.params.id) return user;
        const nextBalance = Number(user.pointsBalance || 0) + amount;
        if (nextBalance < 0)
          throw Object.assign(new Error("用户积分余额不足"), { status: 400 });
        updated = {
          ...user,
          pointsBalance: nextBalance,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    );
    if (!updated) return res.status(404).json({ message: "用户不存在" });
    const entry = {
      id: randomUUID(),
      userId: updated.id,
      amount,
      balanceAfter: updated.pointsBalance,
      reason,
      operator: req.admin.username,
      createdAt: new Date().toISOString(),
    };
    await mutateCollection("point_ledger", (entries) =>
      [entry, ...entries].slice(0, 5000),
    );
    res.status(201).json({ user: safeUserAccount(updated), entry });
  }),
);

app.get(
  "/api/admin/points",
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const [ledger, users] = await Promise.all([
      readCollection("point_ledger", []),
      readCollection("users", []),
    ]);
    const userIds = new Set(users.map((user) => String(user.id)));
    const names = new Map(users.map((user) => [user.id, user.name]));
    res.json(
      ledger
        .filter(
          (entry) => !entry.userId || userIds.has(String(entry.userId)),
        )
        .map((entry) => ({
          ...entry,
          userName: names.get(entry.userId) || "已删除用户",
        })),
    );
  }),
);

app.get(
  "/api/admin/templates",
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const [custom, users] = await Promise.all([
      readCollection("templates", []),
      readCollection("users", []),
    ]);
    const userNames = new Map(users.map((user) => [user.id, user.name]));
    res.json([
      ...SYSTEM_TEMPLATES.map((template) => ({
        ...template,
        approvalStatus: "approved",
        visibility: "global",
        public: true,
      })),
      ...custom.map((template) => ({
          ...withTemplateApproval(template),
          ownerName: userNames.get(effectiveOwnerId(template)) || "历史主账号",
          system: false,
          enabled: template.enabled !== false,
          nodeCount: template.nodes?.length || 0,
        })),
    ]);
  }),
);

app.post(
  "/api/admin/templates",
  requireAdmin,
  asyncRoute(async (req, res) => {
    if (!String(req.body.name || "").trim())
      return res.status(400).json({ message: "模板名称不能为空" });
    const now = new Date().toISOString();
    const visibility = ["private", "global"].includes(req.body.visibility)
      ? req.body.visibility
      : "private";
    const template = {
      id: randomUUID(),
      ownerId: String(req.body.ownerId || "workspace-owner"),
      public: visibility === "global",
      visibility,
      approvalStatus: visibility === "global" ? "approved" : "private",
      reviewedAt: now,
      reviewedBy: req.admin.username,
      name: String(req.body.name).trim().slice(0, 80),
      description: String(req.body.description || "")
        .trim()
        .slice(0, 600),
      category: String(req.body.category || "自定义")
        .trim()
        .slice(0, 30),
      accent: String(req.body.accent || "#daff51"),
      runMode: "backend",
      enabled: req.body.enabled !== false,
      nodes: Array.isArray(req.body.nodes) ? req.body.nodes : [],
      edges: Array.isArray(req.body.edges) ? req.body.edges : [],
      sourceInspirationConfigId: String(
        req.body.sourceInspirationConfigId || "",
      ).trim().slice(0, 120),
      revision: 1,
      revisionHistory: [],
      createdAt: now,
      updatedAt: now,
    };
    template.manifest = buildTemplateManifest(template);
    template.versionRef = templateVersionRef(template);
    await mutateCollection("templates", (templates) => [
      template,
      ...templates,
    ]);
    res
      .status(201)
      .json({ ...template, system: false, nodeCount: template.nodes.length });
  }),
);

app.patch(
  "/api/admin/templates/:id",
  requireAdmin,
  asyncRoute(async (req, res) => {
    if (req.params.id.startsWith("builtin-"))
      return res
        .status(400)
        .json({ message: "系统模板只读，请复制为自定义模板后编辑" });
    let updated;
    await mutateCollection("templates", (templates) =>
      templates.map((template) => {
        if (template.id !== req.params.id) return template;
        const now = new Date().toISOString();
        const candidate = {
          ...template,
          ...(req.body.name !== undefined
            ? { name: String(req.body.name).trim().slice(0, 80) }
            : {}),
          ...(req.body.description !== undefined
            ? { description: String(req.body.description).trim().slice(0, 600) }
            : {}),
          ...(req.body.category !== undefined
            ? { category: String(req.body.category).trim().slice(0, 30) }
            : {}),
          ...(req.body.enabled !== undefined
            ? { enabled: Boolean(req.body.enabled) }
            : {}),
          ...(req.body.sourceInspirationConfigId !== undefined
            ? {
                sourceInspirationConfigId: String(
                  req.body.sourceInspirationConfigId || "",
                ).trim().slice(0, 120),
              }
            : {}),
          ...(Array.isArray(req.body.nodes) ? { nodes: req.body.nodes } : {}),
          ...(Array.isArray(req.body.edges) ? { edges: req.body.edges } : {}),
          ...(req.body.visibility !== undefined &&
          ["private", "team", "global"].includes(req.body.visibility)
            ? {
                visibility: req.body.visibility,
                public: req.body.visibility === "global",
                approvalStatus:
                  req.body.visibility === "global"
                    ? "approved"
                    : req.body.visibility === "private"
                      ? "private"
                      : template.approvalStatus || "approved",
              }
            : {}),
          runMode: "backend",
          ...(Array.isArray(req.body.nodes) ? { nodes: req.body.nodes } : {}),
          ...(Array.isArray(req.body.edges) ? { edges: req.body.edges } : {}),
          id: template.id,
          updatedAt: now,
        };
        const revisionEntry =
          isPublicTemplate(template) || isApprovedTeamTemplate(template)
          ? createTemplateRevisionEntry(template, candidate, {
              revision: templateRevision(template) + 1,
              updatedAt: now,
              updatedBy: req.admin.username,
            })
          : null;
        const revised = revisionEntry?.changes?.length
          ? {
              ...candidate,
              revision: revisionEntry.revision,
              revisionHistory: [
                ...(template.revisionHistory || []),
                revisionEntry,
              ].slice(-20),
              lastTemplateRevision: revisionEntry,
            }
          : { ...candidate, revision: templateRevision(template) };
        updated = {
          ...revised,
          manifest: buildTemplateManifest(revised),
          versionRef: templateVersionRef(revised),
        };
        return updated;
      }),
    );
    if (!updated) return res.status(404).json({ message: "模板不存在" });
    res.json({
      ...updated,
      system: false,
      nodeCount: updated.nodes?.length || 0,
    });
  }),
);

app.post(
  "/api/admin/templates/:id/review",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const templates = await readCollection("templates", []);
    const template = templates.find((item) => item.id === req.params.id);
    if (isTeamTemplate(template))
      return res.status(403).json({
        message: "团队工作流仅由所属团队管理员审批",
      });
    const result = await reviewTemplateSubmission(
      req.params.id,
      String(req.body.decision || ""),
      req.admin.username,
    );
    res.json(result);
  }),
);

app.delete(
  "/api/admin/templates/:id",
  requireAdmin,
  asyncRoute(async (req, res) => {
    if (req.params.id.startsWith("builtin-"))
      return res.status(400).json({ message: "系统模板不能删除" });
    let removed = false;
    await mutateCollection("templates", (templates) =>
      templates.filter((template) => {
        if (template.id === req.params.id) removed = true;
        return template.id !== req.params.id;
      }),
    );
    if (!removed) return res.status(404).json({ message: "模板不存在" });
    res.status(204).end();
  }),
);

const digitalAssetImageAccessToken = (asset, index, expiresAt) =>
  createHmac(
    "sha256",
    `${signingSecret()}:digital-asset-images`,
  )
    .update(`${asset.id}:${effectiveOwnerId(asset)}:${index}:${Number(expiresAt)}`)
    .digest("base64url");

const hasValidAssetImageAccess = (asset, index, expiresAt, provided) => {
  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
  const expected = Buffer.from(
    digitalAssetImageAccessToken(asset, index, expiry),
  );
  const received = Buffer.from(String(provided || ""));
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
};

const safeDigitalAsset = ({
  images = [],
  klingElementPayload: _klingElementPayload,
  ...asset
}) => {
  const expiresAt = stableAssetExpiry();
  return {
    ...asset,
    imageCount: images.length,
    coverUrl: images.length
      ? `/api/digital-assets/${asset.id}/images/0?exp=${expiresAt}&access=${digitalAssetImageAccessToken(asset, 0, expiresAt)}`
      : null,
  };
};

async function pollDigitalAssetElement(assetId, taskId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const payload = await getAdvancedElement(taskId);
      const data = payload?.data || payload || {};
      const status = String(
        data.task_status || data.status || "",
      ).toLowerCase();
      const elementId =
        data?.task_result?.elements?.[0]?.element_id ||
        data?.elements?.[0]?.element_id;
      await mutateCollection("digital_assets", (assets) => {
        const current = assets.find((asset) => asset.id === assetId);
        const nextStatus = elementId ? "succeed" : status || "processing";
        const terminal =
          Boolean(elementId) || ["failed", "failure"].includes(status);
        if (
          !current ||
          (!terminal && current.klingElementStatus === nextStatus)
        )
          return assets;
        return assets.map((asset) =>
          asset.id === assetId
            ? {
                ...asset,
                klingElementStatus: nextStatus,
                ...(elementId ? { klingElementId: String(elementId) } : {}),
                ...(terminal ? { klingElementPayload: payload } : {}),
                updatedAt: new Date().toISOString(),
              }
            : asset,
        );
      });
      if (elementId || ["failed", "failure"].includes(status)) return;
    } catch (error) {
      await mutateCollection("digital_assets", (assets) =>
        assets.map((asset) =>
          asset.id === assetId
            ? {
                ...asset,
                klingElementStatus: "failed",
                klingElementError: error.message,
                updatedAt: new Date().toISOString(),
              }
            : asset,
        ),
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

app.get(
  "/api/digital-assets",
  requireUser,
  asyncRoute(async (req, res) => {
    const [assets, users] = await Promise.all([
      readCollection("digital_assets", []),
      readCollection("users", []),
    ]);
    const requester = users.find((user) => user.id === req.user.userId);
    res.json(
      visibleDigitalAssets(assets)
        .filter(
          (asset) =>
            ownedBy(asset, req.user.userId) &&
            canExposeTemplateAsset(requester, asset),
        )
        .map(safeDigitalAsset),
    );
  }),
);

app.post(
  "/api/digital-assets",
  requireUser,
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || "")
      .trim()
      .slice(0, 60);
    const kind = String(req.body.kind || "person");
    const inputImages = Array.isArray(req.body.images) ? req.body.images : [];
    if (!name) return res.status(400).json({ message: "数字资产名称不能为空" });
    if (!isDigitalAssetKind(kind))
      return res
        .status(400)
        .json({ message: "数字资产类型只能是人脸、人物、服装、数字人或模版原创" });
    if (kind === "template_original") {
      const users = await readCollection("users", []);
      const requester = users.find((user) => user.id === req.user.userId);
      if (!hasTemplateAccess(requester))
        return res.status(403).json({
          message: "模版权限尚未开通，不能保存模版原创资产",
          code: "TEMPLATE_ACCESS_REQUIRED",
        });
    }
    if (!isDigitalAssetImageCountValid(kind, inputImages.length))
      return res.status(400).json({
        message:
          ["avatar", "template_original"].includes(kind)
            ? `${kind === "template_original" ? "模版原创" : "数字人快捷素材"}只能保存 1 张图片`
            : "每个数字资产需要 1–4 张参考图",
      });
    const images = inputImages.map((image, index) => ({
      data: String(image?.data || "").replace(
        /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
        "",
      ),
      name: String(image?.name || `reference_${index + 1}`),
      mimeType: String(image?.mimeType || "image/png").toLowerCase(),
    }));
    if (
      images.some(
        (image) =>
          !image.data || !/^image\/(jpeg|jpg|png)$/.test(image.mimeType),
      )
    )
      return res
        .status(400)
        .json({ message: "数字资产参考图仅支持 JPG 或 PNG" });
    if (images.some((image) => image.data.length > 14 * 1024 * 1024))
      return res.status(413).json({ message: "数字资产单张图片不能超过 10MB" });
    const now = new Date().toISOString();
    const storedImages = await persistDigitalAssetImages(images);
    if (storedImages.length !== images.length)
      return res
        .status(400)
        .json({ message: "数字资产参考图保存失败，请重新上传" });
    const asset = {
      id: randomUUID(),
      ownerId: req.user.userId,
      name,
      kind,
      images: storedImages,
      createdAt: now,
      updatedAt: now,
    };
    await mutateCollection("digital_assets", (assets) => [asset, ...assets]);
    res.status(201).json(safeDigitalAsset(asset));
  }),
);

app.post(
  "/api/digital-assets/from-task",
  requireUser,
  asyncRoute(async (req, res) => {
    const taskId = String(req.body.taskId || "").trim();
    const kind = String(req.body.kind || "clothing");
    if (!taskId) return res.status(400).json({ message: "请选择要保存的生成图片" });
    if (!isDigitalAssetKind(kind))
      return res.status(400).json({ message: "数字资产类型不正确" });
    if (kind === "template_original") {
      const users = await readCollection("users", []);
      const requester = users.find((user) => user.id === req.user.userId);
      if (!hasTemplateAccess(requester))
        return res.status(403).json({
          message: "模版权限尚未开通，不能保存模版原创资产",
          code: "TEMPLATE_ACCESS_REQUIRED",
        });
    }

    const [tasks, assets] = await Promise.all([
      readCollection("tasks", []),
      readCollection("digital_assets", []),
    ]);
    const task = tasks.find(
      (item) =>
        item.id === taskId &&
        ownedBy(item, req.user.userId) &&
        item.status === "succeeded" &&
        (item.imageUrl || item.imageUrls?.[0]),
    );
    if (!task)
      return res.status(404).json({ message: "生成图片不存在、尚未完成或无权操作" });
    const existing = visibleDigitalAssets(assets).find(
      (asset) =>
        ownedBy(asset, req.user.userId) && asset.sourceTaskId === taskId,
    );
    if (existing)
      return res.json({ asset: safeDigitalAsset(existing), alreadySaved: true });

    const imageUrl = String(task.imageUrl || task.imageUrls?.[0]);
    let buffer;
    let mimeType = "image/png";
    if (imageUrl.startsWith("/generated/")) {
      const cleanPath = imageUrl.split("?")[0];
      const fileName = path.basename(cleanPath);
      if (!fileName || cleanPath !== `/generated/${fileName}`)
        return res.status(400).json({ message: "生成图片地址不合法" });
      buffer = await fs.readFile(path.join(generatedDir, fileName));
      if (/\.jpe?g$/i.test(fileName)) mimeType = "image/jpeg";
      else if (!/\.png$/i.test(fileName))
        return res.status(400).json({ message: "仅 JPG 或 PNG 生成结果可保存为数字资产" });
    } else {
      const externalImage = await readExternalMedia(imageUrl, {
        ...providerMediaUrlOptions(),
        timeoutMs: 20_000,
        maxBytes: 10 * 1024 * 1024,
      });
      mimeType = externalImage.contentType;
      if (!/^image\/(jpeg|jpg|png)$/.test(mimeType))
        return res.status(400).json({ message: "仅 JPG 或 PNG 生成结果可保存为数字资产" });
      buffer = externalImage.buffer;
    }
    if (!buffer?.length)
      return res.status(400).json({ message: "生成图片内容为空" });
    if (buffer.length > 10 * 1024 * 1024)
      return res.status(413).json({ message: "生成图片超过 10MB，暂不能保存为数字资产" });

    const requestedName = String(req.body.name || "").trim();
    const fallbackName = String(
      task.workflowName || task.fileName || "生成图片资产",
    )
      .replace(/\.(png|jpe?g)$/i, "")
      .slice(0, 60);
    const now = new Date().toISOString();
    const storedImages = await persistDigitalAssetImages([
      {
        data: buffer.toString("base64"),
        name: String(task.fileName || `${fallbackName}.png`),
        mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType,
      },
    ]);
    if (!storedImages.length)
      return res.status(400).json({ message: "生成图片保存失败，请稍后重试" });
    const asset = {
      id: randomUUID(),
      ownerId: req.user.userId,
      name: (requestedName || fallbackName).slice(0, 60),
      kind,
      images: storedImages,
      sourceTaskId: task.id,
      sourceType: "generated",
      ...(kind === "template_original"
        ? {
            sourceType: "template-original",
            sourceInspirationId: String(req.body.sourceInspirationId || "").slice(0, 120),
            sourceTemplateId: String(req.body.sourceTemplateId || "").slice(0, 120),
            sourceTemplateName: String(req.body.sourceTemplateName || "").slice(0, 120),
          }
        : {}),
      sourceWorkflowName: String(task.workflowName || "").slice(0, 80),
      aspectRatio: String(task.aspectRatio || "9:16"),
      createdAt: now,
      updatedAt: now,
    };
    await mutateCollection("digital_assets", (items) => [asset, ...items]);
    res.status(201).json({ asset: safeDigitalAsset(asset), alreadySaved: false });
  }),
);

app.post(
  "/api/digital-assets/:id/kling-element",
  requireUser,
  asyncRoute(async (req, res) => {
    const assets = await readCollection("digital_assets", []);
    const asset = assets.find(
      (item) =>
        item.id === req.params.id &&
        ownedBy(item, req.user.userId) &&
        !item.deletedAt,
    );
    if (!asset)
      return res.status(404).json({ message: "数字资产不存在或无权操作" });
    if (!isKlingConvertibleDigitalAssetKind(asset.kind))
      return res.status(400).json({
        message: "数字人快捷素材无需转换可灵主体，可直接作为图片参考使用",
      });
    if (asset.klingElementId)
      return res.json({ asset: safeDigitalAsset(asset), alreadyBound: true });
    if (
      ["submitted", "processing", "pending"].includes(asset.klingElementStatus)
    )
      return res.status(409).json({ message: "可灵主体正在创建，请稍后刷新" });
    if (!Array.isArray(asset.images) || asset.images.length < 2)
      return res.status(400).json({
        message: "创建可灵主体至少需要 1 张正面图和 1 张其他角度图",
      });
    const images = await Promise.all(
      asset.images.map(async (image) => {
        const buffer = await digitalAssetImageBuffer(image);
        if (!buffer?.length)
          throw new Error("数字资产参考图读取失败，请重新上传");
        const mimeType =
          image.mimeType === "image/jpg" ? "image/jpeg" : image.mimeType;
        return `data:${mimeType};base64,${buffer.toString("base64")}`;
      }),
    );
    const elementDescription = String(
      req.body.elementDescription ||
        (asset.kind === "clothing"
          ? "保持服装版型、颜色、材质、图案和关键细节一致"
          : "保持人物身份、脸部、发型、肤色和身体比例一致"),
    )
      .trim()
      .slice(0, 100);
    const payload = await createAdvancedElement({
      elementName: String(asset.name || "数字资产")
        .trim()
        .slice(0, 20),
      elementDescription,
      referenceType: "image_refer",
      elementImageList: {
        frontal_image: images[0],
        refer_images: images.slice(1).map((imageUrl) => ({
          image_url: imageUrl,
        })),
      },
      elementVoiceId: String(req.body.elementVoiceId || "").trim() || undefined,
      tags: [
        {
          tag_id: asset.kind === "clothing" ? "o_105" : "o_102",
        },
      ],
    });
    const taskId = payload?.data?.task_id || payload?.task_id;
    if (!taskId)
      throw Object.assign(new Error("可灵主体创建已响应，但没有返回 task_id"), {
        status: 502,
      });
    await mutateCollection("digital_assets", (items) =>
      items.map((item) =>
        item.id === asset.id
          ? {
              ...item,
              klingElementTaskId: String(taskId),
              klingElementStatus: "submitted",
              klingElementError: "",
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    void pollDigitalAssetElement(asset.id, String(taskId));
    res.status(202).json({ taskId: String(taskId), payload });
  }),
);

app.delete(
  "/api/digital-assets/:id",
  requireUser,
  asyncRoute(async (req, res) => {
    let removed = false;
    const deletedAt = new Date().toISOString();
    await mutateCollection("digital_assets", (assets) =>
      assets.map((asset) => {
        if (
          asset.id !== req.params.id ||
          !ownedBy(asset, req.user.userId) ||
          asset.deletedAt
        )
          return asset;
        removed = true;
        return { ...asset, deletedAt, updatedAt: deletedAt };
      }),
    );
    if (!removed) return res.status(404).json({ message: "数字资产不存在" });
    res.status(204).end();
  }),
);

app.get(
  "/api/digital-assets/:id/images/:index",
  asyncRoute(async (req, res) => {
    const [assets, users] = await Promise.all([
      readCollection("digital_assets", []),
      readCollection("users", []),
    ]);
    const asset = assets.find((item) => item.id === req.params.id);
    const owner = users.find(
      (user) => user.id === effectiveOwnerId(asset || {}),
    );
    const index = Number(req.params.index);
    const image = asset?.images?.[index];
    if (
      !image ||
      !canExposeTemplateAsset(owner, asset) ||
      !hasValidAssetImageAccess(
        asset,
        index,
        req.query.exp,
        req.query.access,
      )
    )
      return res.status(404).json({ message: "数字资产图片不存在" });
    const buffer = await digitalAssetImageBuffer(image).catch(() => null);
    if (!buffer) return res.status(404).json({ message: "数字资产图片不存在" });
    res.setHeader(
      "Content-Type",
      image.mimeType === "image/jpg" ? "image/jpeg" : image.mimeType,
    );
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  }),
);

app.get(
  "/api/bootstrap",
  requireUser,
  asyncRoute(async (req, res) => {
    const [
      users,
      tasks,
      runs,
      templates,
      assets,
      hiddenBuiltinEntries,
      templateUsages,
      ledger,
      teams,
    ] = await Promise.all([
      readCollection("users", []),
      readCollection("tasks", []),
      readCollection("workflow_runs", []),
      readCollection("templates", []),
      readCollection("digital_assets", []),
      readCollection("hidden_builtin_templates", []),
      readCollection("template_usages", []),
      readCollection("point_ledger", []),
      readCollection("teams", []),
    ]);
    const user = users.find((item) => item.id === req.user.userId);
    if (!user || user.status !== "active")
      return res.status(401).json({ message: "账号不存在或已停用" });
    const templateLibraryEnabled = hasTemplateAccess(user);
    const ownedTasks = tasks.filter((task) => ownedBy(task, user.id));
    const ownedRuns = runs.filter((run) => ownedBy(run, user.id));
    const bootstrapTasks = selectRecentRecords(ownedTasks, {
      limit: parseRecordLimit(req.query.taskLimit, { max: 250 }),
      activeStatuses: ["submitting", "queued", "processing"],
    });
    const bootstrapRuns = selectRecentRecords(ownedRuns, {
      limit: parseRecordLimit(req.query.runLimit, { max: 200 }),
      activeStatuses: ["queued", "processing"],
    });
    res.json({
      user: safeUserAccount(
        user,
        pointUsageSummary(ledger, user.id),
        teamForUser(teams, user),
      ),
      promptFramework:
        user.preferences?.promptFramework || DEFAULT_PROMPT_FRAMEWORK,
      tasks: bootstrapTasks.map((task) =>
        req.query.view === "summary"
          ? safeTask(summarizeTaskForList(task))
          : safeTask(task),
      ),
      taskTotal: ownedTasks.length,
      workflowRuns: bootstrapRuns.map((run) =>
        req.query.view === "summary"
          ? safeWorkflowRun(summarizeWorkflowRunForList(run))
          : safeWorkflowRun(run),
      ),
      workflowRunTotal: ownedRuns.length,
      templates: [
        ...(templateLibraryEnabled
          ? SYSTEM_TEMPLATES.filter(
              (template) => template.enabled !== false,
            ).map((template) => ({
              ...template,
              approvalStatus: "approved",
              visibility: "global",
              public: true,
            }))
          : []),
        ...templates
          .filter(
            (template) =>
              template.enabled !== false &&
              canExposeTemplateToUser(user, template, {
                owned: ownedBy(template, user.id),
                sharedVisible: sharedTemplateVisibleToUser(
                  template,
                  user,
                  teams,
                ),
              }),
          )
          .map((template) => ({
            ...withTemplateApproval(template),
            ownerId: effectiveOwnerId(template),
          })),
      ],
      digitalAssets: visibleDigitalAssets(assets)
        .filter(
          (asset) =>
            ownedBy(asset, user.id) && canExposeTemplateAsset(user, asset),
        )
        .map(safeDigitalAsset),
      hiddenBuiltinTemplateIds: templateLibraryEnabled
        ? hiddenBuiltinEntries
            .filter((entry) =>
              typeof entry === "string"
                ? user.id === process.env.LEGACY_OWNER_USER_ID
                : entry.userId === user.id,
            )
            .map((entry) =>
              typeof entry === "string" ? entry : entry.templateId,
            )
        : [],
      templateUpdateNotices: templateLibraryEnabled
        ? templateUpdateNoticesForUser({
            templates,
            usages: templateUsages,
            runs,
            userId: user.id,
          })
        : [],
    });
  }),
);

const capabilityStatus = () => {
  const volcengine = getVolcengineStatus();
  return {
    klingConfigured: isConfigured(),
    deepSeekConfigured: isDeepSeekConfigured(),
    image2Configured: isImage2Configured(),
    vapeurConfigured: isVapeurConfigured(),
    vapeurImageConfigured: isVapeurImageConfigured(),
    minimaxAudioConfigured: Boolean(minimaxApiKey()),
    minimaxVideoConfigured: isMiniMaxVideoConfigured(),
    volcengine: { ready: volcengine.ready },
  };
};

const detailedHealthStatus = () => {
  const memory = process.memoryUsage();
  return {
    ...publicHealthPayload(RELEASE_INFO),
    release: RELEASE_INFO,
    ...capabilityStatus(),
    queues: {
      workflow: scheduleWorkflowWork.stats(),
      image: scheduleImageWork.stats(),
      workflowGroups: workflowRunQueues.size,
      policy: {
        userWorkflowConcurrency: workflowUserConcurrency(
          scheduleWorkflowWork.stats().concurrency,
          process.env.USER_WORKFLOW_CONCURRENCY,
        ),
        adminPriority: 100,
      },
    },
    resources: {
      uptimeSeconds: Math.round(process.uptime()),
      cpuCount: os.cpus().length,
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
      },
    },
  };
};

registerHealthRoutes(app, {
  requireUser,
  requireAdmin,
  publicHealth: () => publicHealthPayload(RELEASE_INFO),
  capabilities: capabilityStatus,
  adminHealth: detailedHealthStatus,
});

const normalizeInspirationManifest = (manifest) => ({
  version: Number(manifest?.version || 1),
  updatedAt: String(manifest?.updatedAt || ""),
  prompts:
    manifest?.prompts && typeof manifest.prompts === "object"
      ? manifest.prompts
      : {},
  items: Array.isArray(manifest?.items)
    ? [...manifest.items].sort(
        (left, right) =>
          (Number(left?.sortOrder) || 0) - (Number(right?.sortOrder) || 0),
      )
    : [],
});

const loadInspirationTemplateCatalog = createInspirationCatalogCache(
  async ({ manifestSource, settings }) => {
    const manifest = normalizeInspirationManifest(manifestSource);
    const context = {
      overrides:
        settings?.detailPageTemplateOverrides &&
        typeof settings.detailPageTemplateOverrides === "object"
          ? settings.detailPageTemplateOverrides
          : {},
      typePaths:
        settings?.detailPageTemplateTypePaths &&
        typeof settings.detailPageTemplateTypePaths === "object"
          ? settings.detailPageTemplateTypePaths
          : {},
    };
    const [detailPageTemplates, outfitImageTemplates, videoTemplates] =
      await Promise.all([
        detailPageTemplatesForManifest(manifest, context),
        outfitImageTemplatesForManifest(manifest, context),
        videoTemplatesForManifest(manifest, context),
      ]);
    return {
      manifest,
      detailPageTemplates,
      outfitImageTemplates,
      videoTemplates,
    };
  },
);

const getInspirationTemplateCatalog = async () => {
  const [manifestSource, settings] = await Promise.all([
    readCollection("inspirations", {}),
    readCollection("system_settings", {}),
  ]);
  return loadInspirationTemplateCatalog({ manifestSource, settings });
};

async function persistInspirationCover(id, image, mimeType, extension) {
  const buffer = Buffer.from(String(image || ""), "base64");
  if (!buffer.length)
    throw Object.assign(new Error("案例封面内容为空"), { status: 400 });
  if (buffer.length > 24 * 1024 * 1024)
    throw Object.assign(new Error("案例封面不能超过 24MB"), { status: 400 });
  await fs.mkdir(inspirationAssetsDir, { recursive: true });
  const fileName = `custom-${id}-${randomUUID()}.${extension}`;
  await fs.writeFile(path.join(inspirationAssetsDir, fileName), buffer);
  return `/inspiration-assets/${fileName}`;
}

app.post(
  "/api/inspirations",
  requireUser,
  requireInspirationAccess,
  asyncRoute(async (req, res) => {
    if (!isPlatformAdmin(req.inspirationUser))
      return res.status(403).json({ message: "仅管理员可以发布模版案例" });
    const input = normalizeInspirationCaseInput(req.body);
    const templates = await readCollection("templates", []);
    const template = templates.find(
      (item) =>
        item.id === input.workflowTemplateId &&
        ownedBy(item, req.user.userId) &&
        item.enabled !== false,
    );
    if (!template)
      return res.status(404).json({ message: "绑定工作流不存在或无权发布" });
    const templateManifest = normalizeTemplateManifest(template);
    if (templateManifest.validation?.status !== "ready")
      return res.status(400).json({
        message: templateManifest.validation?.issues?.[0] || "工作流尚未达到模板发布条件",
      });
    if (input.kind === "qianchuan") {
      const now = new Date().toISOString();
      const coverUrl = await persistTemplateCover(
        template.id,
        input.coverImage,
        input.coverMimeType,
      );
      let publishedTemplate = null;
      await mutateCollection("templates", (items) =>
        items.map((item) => {
          if (item.id !== template.id || !ownedBy(item, req.user.userId))
            return item;
          const publication = materialTemplatePublicationPatch(input, {
            coverUrl,
            now,
            userId: req.user.userId,
          });
          publishedTemplate = {
            ...item,
            ...publication,
          };
          publishedTemplate.manifest = buildTemplateManifest(publishedTemplate);
          publishedTemplate.versionRef = templateVersionRef(publishedTemplate);
          return publishedTemplate;
        }),
      );
      if (!publishedTemplate)
        return res.status(404).json({ message: "绑定工作流不存在或无权发布" });
      return res.status(201).json({
        id: publishedTemplate.id,
        title: publishedTemplate.name,
        kind: "qianchuan",
        category: "素材同款",
        coverUrl,
        mainImageUrl: coverUrl,
        workflowTemplateId: publishedTemplate.id,
        workflowTemplate: publishedTemplate,
        createdAt: now,
        updatedAt: now,
      });
    }
    const id = `custom-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const coverUrl = await persistInspirationCover(
      id,
      input.coverImage,
      input.coverMimeType,
      input.extension,
    );
    const now = new Date().toISOString();
    const mediaType = inspirationWorkflowMediaType(template);
    const item = {
      id,
      title: input.title,
      kind: input.kind || undefined,
      category: input.category,
      ratio: input.ratio,
      description: input.description,
      tags: input.tags,
      coverUrl,
      mainImageUrl: coverUrl,
      workflowTemplateId: template.id,
      workflowName: template.name,
      workflowTemplate: inspirationWorkflowSnapshot(template),
      workflowTemplateRevision: templateRevision(template),
      workflowTemplateVersionRef: templateVersionRef(template),
      templateManifest,
      mediaType,
      custom: true,
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now,
      sortOrder: -Date.now(),
    };
    item.kind = inspirationCaseKind(item);
    await mutateCollection(
      "inspirations",
      (manifest) => {
        const normalized = normalizeInspirationManifest(manifest);
        return {
          ...normalized,
          version: normalized.version + 1,
          updatedAt: now,
          items: [item, ...normalized.items],
        };
      },
      {},
    );
    res.status(201).json(signedInspirationItem(item, req.user.userId));
  }),
);

app.get(
  "/api/inspirations",
  requireUser,
  requireInspirationAccess,
  asyncRoute(async (req, res) => {
    const {
      manifest,
      detailPageTemplates,
      outfitImageTemplates,
      videoTemplates,
    } = await getInspirationTemplateCatalog();
    const query = String(req.query.query || "")
      .trim()
      .toLowerCase();
    const category = String(req.query.category || "all").trim();
    const primaryCategory = String(
      req.query.primaryCategory || category || "all",
    ).trim();
    const secondaryCategory = String(
      req.query.secondaryCategory || "all",
    ).trim();
    const platform = String(req.query.platform || "all").trim();
    const requestedKind = String(req.query.kind || "");
    const kind = ["outfit", "image", "video"].includes(requestedKind)
      ? requestedKind
      : ["image", "video"].includes(String(req.query.mediaType))
        ? String(req.query.mediaType)
        : "video";
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(
      60,
      Math.max(1, Number.parseInt(req.query.pageSize, 10) || 24),
    );
    const sourceItems =
      kind === "image"
        ? detailPageTemplates.filter((item) => item.enabled !== false)
        : kind === "outfit"
          ? outfitImageTemplates.filter((item) => item.enabled !== false)
          : videoTemplates.filter((item) => item.enabled !== false);
    const filtered = sourceItems.filter((item) => {
      const categoryMatch =
        kind === "image" || kind === "outfit"
          ? primaryCategory === "all" ||
            item.primaryCategory === primaryCategory ||
            item.primaryCategoryId === primaryCategory
          : category === "all" || item.category === category;
      const secondaryMatch =
        secondaryCategory === "all" ||
        item.secondaryCategory === secondaryCategory ||
        item.secondaryCategoryId === secondaryCategory;
      const platformMatch =
        platform === "all" || item.platform === platform;
      const haystack = [
        item.title,
        item.id,
        item.category,
        item.primaryCategory,
        item.secondaryCategory,
        item.platform,
        item.imageType,
        ...(item.tags || []),
      ]
        .join(" ")
        .toLowerCase();
      return (
        categoryMatch &&
        secondaryMatch &&
        platformMatch &&
        (!query || haystack.includes(query))
      );
    });
    const start = (page - 1) * pageSize;
    const categories = Array.from(
      new Set(
        sourceItems
          .map((item) => item.category)
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, "zh-CN"));
    const kindCounts = { outfit: 0, image: 0, video: 0 };
    kindCounts.image = detailPageTemplates.filter(
      (item) => item.enabled !== false,
    ).length;
    kindCounts.outfit = outfitImageTemplates.filter(
      (item) => item.enabled !== false,
    ).length;
    kindCounts.video = videoTemplates.filter(
      (item) => item.enabled !== false,
    ).length;
    const expiresAt = stableAssetExpiry();
    res.json({
      version: manifest.version,
      updatedAt: manifest.updatedAt,
      total: filtered.length,
      page,
      pageSize,
      categories,
      categoryTree:
        kind === "image"
          ? DETAIL_PAGE_CATEGORY_TREE
          : kind === "outfit"
            ? OUTFIT_CATEGORY_TREE
            : [],
      platforms:
        kind === "image"
          ? DETAIL_PAGE_PLATFORMS
          : kind === "outfit"
            ? OUTFIT_PLATFORMS
            : [],
      kind,
      mediaType: kind === "video" ? "video" : "image",
      kindCounts,
      mediaCounts: {
        image: kindCounts.image + kindCounts.outfit,
        video: kindCounts.video,
      },
      items: filtered
        .slice(start, start + pageSize)
        .map((item) =>
          signedInspirationListItem(item, req.user.userId, expiresAt),
        ),
    });
  }),
);

app.get(
  "/api/inspirations/:id",
  requireUser,
  requireInspirationAccess,
  asyncRoute(async (req, res) => {
    const catalog = await getInspirationTemplateCatalog();
    const { manifest } = catalog;
    const item =
      catalog.videoTemplates.find(
        (entry) => entry.id === req.params.id && entry.enabled !== false,
      ) ||
      catalog.detailPageTemplates.find(
        (entry) => entry.id === req.params.id && entry.enabled !== false,
      ) ||
      catalog.outfitImageTemplates.find(
        (entry) => entry.id === req.params.id && entry.enabled !== false,
      );
    if (!item) return res.status(404).json({ message: "模版案例不存在" });
    const globalGenerationConfig = await getInspirationGenerationConfig();
    res.json({
      ...signedInspirationItem(item, req.user.userId),
      prompts: {
        ...manifest.prompts,
        ...(item.kind === "image" ? { detail: item.promptText } : {}),
        ...(item.kind === "outfit" ? { outfitImage: item.promptText } : {}),
      },
      generationConfig: {
        ...globalGenerationConfig,
        ...(item.generationConfig || {}),
        outfitPrompt:
          item.generationConfig?.outfitPrompt ||
          globalGenerationConfig.outfitPrompt,
      },
    });
  }),
);

app.get(
  "/api/models",
  requireUser,
  asyncRoute(async (_req, res) => {
    const readinessRecords = await readCollection("model_readiness", []);
    res.json(
      buildModelCatalog({
        providerConfigured: modelProviderConfiguration(),
        readinessRecords,
      }),
    );
  }),
);

app.post(
  "/api/providers/volcengine/check",
  requireUser,
  asyncRoute(async (_req, res) => {
    res.json(await checkVolcengineConnection());
  }),
);

app.post(
  "/api/providers/volcengine/asset-groups/check",
  requireUser,
  asyncRoute(async (req, res) => {
    const group = await getAssetGroup(req.body.groupId);
    res.json({
      id: group.Id,
      name: group.Name || "",
      groupType: group.GroupType,
      projectName: group.ProjectName,
      eligibleForTrustedAsset: group.GroupType === "AIGC",
      verifiedRealPerson: group.GroupType === "AIGC",
    });
  }),
);

app.post(
  "/api/providers/volcengine/trusted-person-assets",
  requireUser,
  asyncRoute(async (req, res) => {
    const image = req.body?.video || req.body?.image || {};
    const isVideo = String(image.mimeType || "").startsWith("video/");
    if (!String(image.data || "").trim())
      return res.status(400).json({
        message: isVideo ? "请上传真人人物视频" : "请上传真人人脸图片",
      });
    if (String(image.data).length > (isVideo ? 68 : 32) * 1024 * 1024)
      return res.status(413).json({
        message: isVideo
          ? "真人人物视频请压缩到 50MB 以内"
          : "真人人脸图片请压缩到 24MB 以内",
      });
    const uploaded = await uploadTrustedPersonAsset({
      image: {
        data: image.data,
        name: String(image.name || "真人人脸"),
        mimeType: String(image.mimeType || "image/png"),
        sourceNodeId: String(
          req.body.sourceNodeId || image.sourceNodeId || "frontend",
        ),
      },
      groupId: String(req.body.groupId || ""),
      runId: `frontend-${randomUUID()}`,
      nodeId: String(
        req.body.sourceNodeId || image.sourceNodeId || "frontend",
      ).slice(0, 120),
      title: isVideo ? "前端工作流真人人物视频" : "前端工作流真人人脸",
      ownerId: req.user.userId,
      templateId: String(req.body.templateId || "draft"),
    });
    res.status(uploaded.reused ? 200 : 201).json(uploaded);
  }),
);

app.get(
  "/api/kling/voices",
  requireUser,
  asyncRoute(async (_req, res) => {
    const [custom, presets] = await Promise.all([
      listCustomVoices(),
      listPresetVoices(),
    ]);
    res.json({ custom, presets });
  }),
);

app.post(
  "/api/kling/voices",
  requireUser,
  asyncRoute(async (req, res) => {
    res.status(202).json(await createCustomVoice(req.body));
  }),
);

app.get(
  "/api/kling/elements",
  requireUser,
  asyncRoute(async (_req, res) => {
    const [custom, presets] = await Promise.all([
      listAdvancedElements(),
      listPresetElements(),
    ]);
    res.json({ custom, presets });
  }),
);

app.post(
  "/api/kling/elements",
  requireUser,
  asyncRoute(async (req, res) => {
    const payload = await createAdvancedElement(req.body);
    const taskId = payload?.data?.task_id || payload?.task_id;
    const digitalAssetId = String(req.body.digitalAssetId || "");
    if (digitalAssetId && taskId) {
      const assets = await readCollection("digital_assets", []);
      if (
        !assets.some(
          (asset) =>
            asset.id === digitalAssetId && ownedBy(asset, req.user.userId),
        )
      )
        throw Object.assign(new Error("数字资产不存在或无权操作"), {
          status: 404,
        });
      await mutateCollection("digital_assets", (items) =>
        items.map((asset) =>
          asset.id === digitalAssetId && ownedBy(asset, req.user.userId)
            ? {
                ...asset,
                klingElementTaskId: String(taskId),
                klingElementStatus: "submitted",
                updatedAt: new Date().toISOString(),
              }
            : asset,
        ),
      );
      void pollDigitalAssetElement(digitalAssetId, String(taskId));
    }
    res.status(202).json(payload);
  }),
);

app.post(
  "/api/text/refine",
  requireUser,
  asyncRoute(async (req, res) => {
    const usageId = `text-refine-${randomUUID()}`;
    res.json(
      await runMeteredUsage({
        ownerId: req.user.userId,
        kind: "text",
        quantity: 1,
        taskId: usageId,
        reason: "提示词优化 1 次",
        refundReason: "提示词优化失败退款",
        action: () => refineVapeurPrompt(req.body),
      }),
    );
  }),
);

app.post(
  "/api/text/generate",
  requireUser,
  asyncRoute(async (req, res) => {
    const usageId = `text-generate-${randomUUID()}`;
    res.json(
      await runMeteredUsage({
        ownerId: req.user.userId,
        kind: "text",
        quantity: 1,
        taskId: usageId,
        reason: "文本生成 1 次",
        refundReason: "文本生成失败退款",
        action: () => generateTextForModel(req.body),
      }),
    );
  }),
);

app.get(
  "/api/media/analysis-tasks",
  requireUser,
  asyncRoute(async (req, res) => {
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 8));
    const tasks = await readCollection("media_analysis_tasks", []);
    res.json(
      tasks
        .filter((task) => ownedBy(task, req.user.userId))
        .slice(0, limit)
        .map(publicMediaAnalysisTask),
    );
  }),
);

app.get(
  "/api/media/analysis-tasks/:id",
  requireUser,
  asyncRoute(async (req, res) => {
    const tasks = await readCollection("media_analysis_tasks", []);
    const task = tasks.find(
      (item) => item.id === req.params.id && ownedBy(item, req.user.userId),
    );
    if (!task) return res.status(404).json({ message: "视频分析记录不存在" });
    res.json(publicMediaAnalysisTask(task));
  }),
);

app.post(
  "/api/media/analysis-tasks",
  requireUser,
  asyncRoute(async (req, res) => {
    const videos = Array.isArray(req.body?.videos) ? req.body.videos : [];
    if (!videos.some((video) => String(video?.data || "").trim()))
      return res.status(400).json({ message: "请先上传需要分析的视频" });
    const tasks = await readCollection("media_analysis_tasks", []);
    const inputFingerprint = mediaAnalysisInputFingerprint(req.body);
    const activeTask = tasks.find(
      (task) =>
        ownedBy(task, req.user.userId) &&
        MEDIA_ANALYSIS_ACTIVE_STATUSES.has(task.status),
    );
    if (
      (activeTask?.serverInputFingerprint || activeTask?.inputFingerprint) ===
      inputFingerprint
    )
      return res
        .status(202)
        .json({ ...publicMediaAnalysisTask(activeTask), reused: true });
    if (activeTask)
      return res.status(409).json({
        message: "另一个视频分析任务正在运行，请等待完成后再提交新视频",
        code: "MEDIA_ANALYSIS_ALREADY_ACTIVE",
        activeTask: publicMediaAnalysisTask(activeTask),
      });
    const taskId = randomUUID();
    const pointsCost = analysisPointCost(req.body);
    const task = {
      ...createMediaAnalysisTaskRecord({
        id: taskId,
        ownerId: req.user.userId,
        input: req.body,
      }),
      pointsCost,
      pointsKind: "analysis",
    };
    await chargeUsagePoints({
      userId: req.user.userId,
      kind: "analysis",
      quantity: pointsCost,
      taskId,
      reason: `视频分析 ${pointsCost} 帧`,
    });
    try {
      await mutateCollection("media_analysis_tasks", (items) =>
        [task, ...items].slice(0, 200),
      );
    } catch (error) {
      await refundUsagePoints({
        userId: req.user.userId,
        kind: "analysis",
        quantity: pointsCost,
        taskId,
        reason: "视频分析任务创建失败退款",
      });
      throw error;
    }
    const job = processMediaAnalysisTask(task.id, req.body).catch((error) =>
      console.error(`Media analysis task ${task.id} failed to persist:`, error),
    );
    mediaAnalysisJobs.set(task.id, job);
    res.status(202).json(publicMediaAnalysisTask(task));
  }),
);

app.post(
  "/api/media/analyze",
  requireUser,
  asyncRoute(async (req, res) => {
    const usageId = `media-analysis-${randomUUID()}`;
    const pointsCost = analysisPointCost(req.body);
    res.json(
      await runMeteredUsage({
        ownerId: req.user.userId,
        kind: "analysis",
        quantity: pointsCost,
        taskId: usageId,
        reason: `视频分析 ${pointsCost} 帧`,
        refundReason: "视频分析失败退款",
        action: () => analyzeWorkflowMedia(req.body),
      }),
    );
  }),
);

app.post(
  "/api/providers/volcengine/callback/:taskId",
  asyncRoute(async (req, res) => {
    const expected = Buffer.from(seedanceCallbackToken(req.params.taskId));
    const received = Buffer.from(String(req.query.token || ""));
    if (
      !seedanceCallbackSecret() ||
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    )
      return res.status(403).json({ message: "回调凭证无效" });
    const tasks = await readCollection("tasks", []);
    const task = tasks.find(
      (item) => item.id === req.params.taskId && item.provider === "volcengine",
    );
    if (!task) return res.status(404).json({ message: "任务不存在" });
    const upstreamTaskId = String(req.body?.id || task.upstreamTaskId || "");
    const normalized = normalizeSeedanceTask(req.body || {});
    await validateProviderMediaUrls([
      normalized.videoUrl,
      normalized.coverUrl,
      ...(Array.isArray(normalized.videoUrls) ? normalized.videoUrls : []),
    ]);
    const failure =
      normalized.status === "failed"
        ? generationErrorDetails(
            { message: normalized.error, payload: req.body },
            normalized.error,
          )
        : null;
    await updateTask(task.id, {
      ...normalized,
      ...(failure ? { failure } : {}),
      upstreamTaskId: upstreamTaskId || null,
      upstreamPayload: req.body,
      submissionUncertain: false,
      submissionMessage: null,
      callbackReceivedAt: new Date().toISOString(),
      error: normalized.error,
    });
    if (normalized.status === "failed")
      await refundTaskPoints(task.id, "Seedance 回调失败退款");
    else if (upstreamTaskId && normalized.status !== "succeeded")
      void pollTask(task.id, upstreamTaskId, "seedance", "volcengine");
    res.status(204).end();
  }),
);

app.post(
  "/api/images/grid-split",
  requireUser,
  asyncRoute(async (req, res) => {
    const source = req.body?.imageData || req.body?.imageUrl;
    if (!String(source || "").trim())
      return res.status(400).json({ message: "请选择要切分的图片" });
    const result = await splitImageGrid(
      {
        imageData: req.body.imageData,
        imageUrl: req.body.imageUrl,
        grid: req.body.grid || req.body.preset,
        rows: req.body.rows,
        columns: req.body.columns ?? req.body.cols,
      },
      { generatedDir },
    );
    res.status(201).json({
      ...result,
      limits: {
        maxAxis: GRID_SPLIT_LIMITS.maxAxis,
        maxTiles: GRID_SPLIT_LIMITS.maxTiles,
        maxConcurrentJobs: GRID_SPLIT_LIMITS.maxConcurrentJobs,
      },
    });
  }),
);

app.post(
  "/api/tasks/image",
  requireUser,
  asyncRoute(async (req, res) => {
    const sourceInspirationId = String(
      req.body.sourceInspirationId || "",
    )
      .trim()
      .slice(0, 120);
    const brandInvocation =
      customBrandInvocationForTemplate(sourceInspirationId);
    const imagePrompt = composeCustomBrandLockedPrompt(
      req.body.prompt,
      brandInvocation,
    );
    if (!imagePrompt)
      return res.status(400).json({ message: "请输入图片提示词" });
    const referenceImages = Array.isArray(req.body.referenceImages)
      ? req.body.referenceImages
      : [];
    if (referenceImages.length > 4)
      return res.status(400).json({ message: "图片任务最多支持 4 张参考图" });
    assertImageReferencesWithinApiLimit(referenceImages, 24 * 1024 * 1024);
    const requestedQuality = String(req.body.quality || "high").toLowerCase();
    const quality = ["low", "medium", "high"].includes(requestedQuality)
      ? requestedQuality
      : "high";
    const requestedOutputFormat = String(
      req.body.outputFormat || "png",
    ).toLowerCase();
    const outputFormat = ["png", "jpeg", "webp"].includes(
      requestedOutputFormat,
    )
      ? requestedOutputFormat
      : "png";
    const outputCount = usagePointCost(
      "image",
      Number(req.body.n || req.body.count || 1),
    );
    const recoveryAssets = await persistWorkflowRuntimeAssets({
      "image-references": referenceImages.map((image, index) => ({
        type: "image",
        data: image?.data,
        name: String(image?.name || `参考图 ${index + 1}`),
        mimeType: String(image?.mimeType || "image/png"),
      })),
    });
    const createdAt = new Date().toISOString();
    const task = {
      id: randomUUID(),
      ownerId: req.user.userId,
      workflowNodeId: String(req.body.workflowNodeId || ""),
      workflowRunId: String(req.body.workflowRunId || ""),
      workflowTemplateId: String(req.body.workflowTemplateId || ""),
      workflowName: String(req.body.workflowName || ""),
      sourceInspirationId,
      brandInvocationStatus: brandInvocation?.status || "",
      brandInvocationVersion: brandInvocation?.version || "",
      brandSourceDocument: brandInvocation?.sourceDocument || "",
      upstreamTaskId: null,
      taskType: "image-generation",
      outputType: "image",
      sourceType: referenceImages.length ? "image" : "text",
      fileName: String(
        req.body.fileName ||
          `GPT Image 2 · ${createdAt.slice(0, 16).replace("T", " ")}`,
      ),
      prompt: imagePrompt,
      modelName: String(req.body.model || "gpt-image-2"),
      provider:
        String(req.body.model || "") === "vapeur-gpt-image-2"
          ? "vapeur"
          : "azure",
      aspectRatio: String(req.body.aspectRatio || "9:16"),
      resolution: String(req.body.resolution || "2k"),
      quality,
      imageInputs: referenceImages.slice(0, 4).map((image, index) => ({
        name: String(image?.name || `参考图 ${index + 1}`),
        mimeType: String(image?.mimeType || "image/png"),
        label: `image_${index + 1}`,
      })),
      status: "queued",
      imageUrl: null,
      imageUrls: [],
      coverUrl: null,
      error: null,
      pointsCost: outputCount,
      pointsKind: "image",
      pointsRefundedAt: null,
      recoveryInput: {
        model: String(req.body.model || "gpt-image-2"),
        prompt: imagePrompt,
        aspectRatio: String(req.body.aspectRatio || "9:16"),
        resolution: String(req.body.resolution || "2k"),
        size: String(req.body.size || "1024x1792"),
        quality,
        n: outputCount,
        outputFormat,
      },
      recoveryAssets,
      createdAt,
      updatedAt: createdAt,
    };
    const charge = await chargeUsagePoints({
      userId: req.user.userId,
      kind: "image",
      quantity: outputCount,
      taskId: task.id,
      reason: `图片生成 ${outputCount} 张`,
    });
    task.pointsBalanceAfter = charge.balanceAfter;
    try {
      await mutateCollection("tasks", (tasks) => [task, ...tasks]);
    } catch (error) {
      await refundUsagePoints({
        userId: req.user.userId,
        kind: "image",
        quantity: outputCount,
        taskId: task.id,
        reason: "图片任务创建失败退款",
      });
      throw error;
    }
    const queuePriority = await generationQueuePriority(req.user.userId);
    void scheduleImageWork(
      async () => {
        const input = await recoverImageTaskInput(task);
        if (!input) throw new Error("图片任务缺少可恢复的提交参数");
        return processImageTask(task, input);
      },
      { priority: queuePriority },
    ).catch(async (error) => {
      await updateTask(task.id, {
        status: "failed",
        error: generationErrorMessage(error, "图片任务读取失败，请重新提交。"),
      });
      await refundTaskPoints(task.id, "图片任务读取失败退款");
      console.error(`Image task ${task.id} queue failed:`, error.message);
    });
    res.status(202).json(safeTask(task));
  }),
);

app.get(
  "/api/tasks",
  requireUser,
  asyncRoute(async (req, res) => {
    const tasks = await readCollection("tasks", []);
    const ownedTasks = tasks.filter((task) => ownedBy(task, req.user.userId));
    res.json(
      selectRecentRecords(ownedTasks, {
        limit: parseRecordLimit(req.query.limit, { max: 500 }),
        ids: parseRecordIds(req.query.ids, { max: 200 }),
        activeStatuses: ["submitting", "queued", "processing"],
      }).map((task) =>
        req.query.view === "summary"
          ? safeTask(summarizeTaskForList(task))
          : safeTask(task),
      ),
    );
  }),
);

app.get(
  "/api/tasks/:id",
  requireUser,
  asyncRoute(async (req, res) => {
    const tasks = await readCollection("tasks", []);
    const task = tasks.find(
      (item) => item.id === req.params.id && ownedBy(item, req.user.userId),
    );
    if (!task) return res.status(404).json({ message: "任务不存在" });
    res.json(safeTask(task));
  }),
);

app.get(
  "/api/generation-time-summary",
  requireUser,
  asyncRoute(async (req, res) => {
    const [tasks, runs] = await Promise.all([
      readCollection("tasks", []),
      readCollection("workflow_runs", []),
    ]);
    res.json(
      summarizeGenerationTimes(
        tasks.filter((task) => ownedBy(task, req.user.userId)),
        runs.filter((run) => ownedBy(run, req.user.userId)),
      ),
    );
  }),
);

app.get(
  "/api/workflow-runs",
  requireUser,
  asyncRoute(async (req, res) => {
    const runs = await readCollection("workflow_runs", []);
    const ownedRuns = runs.filter((run) => ownedBy(run, req.user.userId));
    res.json(
      selectRecentRecords(ownedRuns, {
        limit: parseRecordLimit(req.query.limit, { max: 500 }),
        ids: parseRecordIds(req.query.ids, { max: 200 }),
        activeStatuses: ["queued", "processing"],
      }).map((run) =>
        req.query.view === "summary"
          ? safeWorkflowRun(summarizeWorkflowRunForList(run))
          : safeWorkflowRun(run),
      ),
    );
  }),
);

app.post(
  "/api/workflow-assets",
  requireUser,
  asyncRoute(async (req, res) => {
    const type = ["image", "video", "audio"].includes(req.body?.type)
      ? req.body.type
      : String(req.body?.mimeType || "application/octet-stream").split("/")[0];
    const maxBytes = SEEDANCE_UPLOAD_LIMITS[type];
    if (!maxBytes)
      return res.status(400).json({ message: "不支持的工作流素材类型" });
    assertBase64MediaLimit(req.body?.data, {
      label: type === "image" ? "图片" : type === "video" ? "视频" : "音频",
      name: String(req.body?.name || "").slice(0, 180),
      maxBytes,
    });
    const stored = await persistWorkflowRuntimeAsset({
      type,
      data: String(req.body?.data || ""),
      name: String(req.body?.name || "项目素材").slice(0, 180),
      mimeType: String(req.body?.mimeType || "application/octet-stream").slice(
        0,
        120,
      ),
    });
    if (!stored)
      return res.status(400).json({ message: "工作流素材为空或无法读取" });
    res.status(201).json({
      ...stored,
      uploadToken: workflowAssetUploadToken(req.user.userId, stored),
    });
  }),
);

app.post(
  "/api/workflow-assets/raw",
  requireUser,
  express.raw({ type: "application/octet-stream", limit: "64mb" }),
  asyncRoute(async (req, res) => {
    const decodeHeader = (name, fallback) => {
      try {
        return decodeURIComponent(String(req.get(name) || fallback));
      } catch {
        return String(fallback);
      }
    };
    const declaredType = String(req.get("X-Commerce-Canvas-Asset-Type") || "");
    const mimeType = decodeHeader(
      "X-Commerce-Canvas-Asset-Mime",
      "application/octet-stream",
    ).slice(0, 120);
    const type = ["image", "video", "audio"].includes(declaredType)
      ? declaredType
      : mimeType.split("/")[0];
    const maxBytes = SEEDANCE_UPLOAD_LIMITS[type];
    if (!maxBytes)
      return res.status(400).json({ message: "不支持的工作流素材类型" });
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const name = decodeHeader("X-Commerce-Canvas-Asset-Name", "项目素材").slice(
      0,
      180,
    );
    if (data.length > maxBytes)
      throw mediaLimitError(
        type === "image" ? "图片" : type === "video" ? "视频" : "音频",
        name,
        maxBytes,
      );
    if (!data.length)
      return res.status(400).json({ message: "工作流素材为空或无法读取" });
    const stored = await persistWorkflowRuntimeAsset({
      type,
      data,
      name,
      mimeType,
    });
    if (!stored)
      return res.status(400).json({ message: "工作流素材为空或无法读取" });
    res.status(201).json({
      ...stored,
      uploadToken: workflowAssetUploadToken(req.user.userId, stored),
    });
  }),
);

app.get(
  "/api/workflow-runs/:id",
  requireUser,
  asyncRoute(async (req, res) => {
    const runs = await readCollection("workflow_runs", []);
    const run = runs.find(
      (item) => item.id === req.params.id && ownedBy(item, req.user.userId),
    );
    if (!run) return res.status(404).json({ message: "工作流运行记录不存在" });
    res.json(safeWorkflowRun(run));
  }),
);

app.get(
  "/api/workflow-runs/:id/assets/:nodeId/:index",
  requireUser,
  asyncRoute(async (req, res) => {
    const runs = await readCollection("workflow_runs", []);
    const run = runs.find(
      (item) => item.id === req.params.id && ownedBy(item, req.user.userId),
    );
    if (!run) return res.status(404).json({ message: "工作流运行记录不存在" });
    const asset =
      run.runtimeAssets?.[req.params.nodeId]?.[Number(req.params.index)];
    const buffer = await workflowRuntimeAssetBuffer(
      run.runtimeAssets,
      req.params.nodeId,
      req.params.index,
    ).catch(() => null);
    if (!asset || !buffer)
      return res.status(404).json({ message: "项目素材不存在或已清理" });
    res.setHeader("Content-Type", asset.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(asset.name || "workflow-asset")}`,
    );
    res.send(buffer);
  }),
);

app.post(
  "/api/workflow-runs/:id/terminate",
  requireUser,
  asyncRoute(async (req, res) => {
    const runs = await readCollection("workflow_runs", []);
    const run = runs.find(
      (item) => item.id === req.params.id && ownedBy(item, req.user.userId),
    );
    if (!run) return res.status(404).json({ message: "工作流运行记录不存在" });
    if (!isWorkflowRunActive(run))
      return res
        .status(409)
        .json({ message: "只有排队中或生成中的工作流可以终止" });
    terminatedWorkflowRuns.add(run.id);
    const now = new Date().toISOString();
    let terminated;
    await mutateCollection("workflow_runs", (items) =>
      items.map((item) => {
        if (item.id !== run.id) return item;
        terminated = terminateWorkflowRunRecord(item, now);
        return terminated;
      }),
    );
    scheduleWorkflowWork.cancel(run.id, workflowTerminatedError());
    res.json(safeWorkflowRun(terminated));
  }),
);

app.delete(
  "/api/workflow-runs/:id",
  requireUser,
  asyncRoute(async (req, res) => {
    const runs = await readCollection("workflow_runs", []);
    const run = runs.find(
      (item) => item.id === req.params.id && ownedBy(item, req.user.userId),
    );
    if (!run) return res.status(404).json({ message: "工作流运行记录不存在" });
    if (!canDeleteWorkflowRun(run))
      return res
        .status(409)
        .json({ message: "请先终止正在运行的工作流，再删除记录" });
    await mutateCollection("workflow_runs", (items) =>
      items.filter((item) => item.id !== run.id),
    );
    terminatedWorkflowRuns.delete(run.id);
    res.status(204).end();
  }),
);

app.post(
  "/api/workflow-runs",
  requireUser,
  asyncRoute(async (req, res) => {
    const trustedPersonGroupIds = mergeTrustedPersonGroupIds(
      req.body.runtimeAssetGroupIds,
      req.body.trustedPersonGroupIds,
    );
    const injected = injectTrustedPersonAssetNodes(
      Array.isArray(req.body.nodes) ? req.body.nodes : [],
      Array.isArray(req.body.edges) ? req.body.edges : [],
      trustedPersonGroupIds,
    );
    const sourceInspirationId = String(
      req.body.sourceInspirationId || "",
    )
      .trim()
      .slice(0, 120);
    const brandInvocation =
      customBrandInvocationForTemplate(sourceInspirationId);
    const nodes = injected.nodes.map((node) =>
      brandInvocation && node.data?.kind === "image"
        ? {
            ...node,
            data: {
              ...node.data,
              brandInvocation,
            },
          }
        : node,
    );
    const edges = injected.edges;
    const batchTotal = Number(req.body.batchTotal || 0);
    const batchIndex = Number(req.body.batchIndex || 0);
    if (
      batchTotal &&
      (!Number.isInteger(batchTotal) ||
        batchTotal < 1 ||
        batchTotal > 50 ||
        !Number.isInteger(batchIndex) ||
        batchIndex < 1 ||
        batchIndex > batchTotal)
    )
      return res
        .status(400)
        .json({ message: "批量工作流每批支持 1–50 张图片" });
    if (!nodes.length)
      return res.status(400).json({ message: "工作流没有节点" });
    const startNodeId = String(req.body.startNodeId || "").trim();
    const singleNodeId = String(req.body.singleNodeId || "").trim();
    const sourceRunId = String(req.body.sourceRunId || "").trim();
    let sourceRun = null;
    if (startNodeId && singleNodeId)
      return res
        .status(400)
        .json({ message: "单节点运行不能同时使用断点重跑" });
    if (startNodeId && !sourceRunId)
      return res
        .status(400)
        .json({ message: "断点重跑需要同时提供起始节点和来源运行记录" });
    if (sourceRunId) {
      const sourceRuns = await readCollection("workflow_runs", []);
      sourceRun = sourceRuns.find(
        (item) => item.id === sourceRunId && ownedBy(item, req.user.userId),
      );
      if (!sourceRun)
        return res.status(404).json({ message: "来源工作流运行记录不存在" });
    }
    if (startNodeId || singleNodeId) {
      const targetNodeId = startNodeId || singleNodeId;
      const targetNode = nodes.find((node) => node.id === targetNodeId);
      if (!targetNode || !WORKFLOW_STEP_KINDS.has(targetNode.data?.kind))
        return res.status(400).json({ message: "请选择可生成的节点重新运行" });
      if (singleNodeId && !sourceRun) {
        const upstreamExecutable = [...reachableWorkflowNodes(nodes, edges, singleNodeId)]
          .filter((nodeId) => nodeId !== singleNodeId)
          .map((nodeId) => nodes.find((node) => node.id === nodeId))
          .filter(
            (node) =>
              node &&
              WORKFLOW_STEP_KINDS.has(node.data?.kind) &&
              node.data?.kind !== "asset",
          );
        if (upstreamExecutable.length)
          return res.status(400).json({
            message: `请先运行上游节点「${upstreamExecutable.at(-1).data?.title || "上游生成节点"}」，再单独运行当前节点`,
          });
      }
    }
    if (hasDirectSeedanceFaceConnection(nodes, edges))
      return res.status(400).json({
        message:
          "真人图片或人物视频必须先进入火山 AIGC 授权组；系统会自动上传资产、等待 Active，再提交 Seedance。",
      });
    const runtimeInputNodeIds = new Set(
      nodes
        .filter(
          (node) =>
            node.data?.directMediaInput ||
            [
              "input",
              "batch-input",
              "face-input",
              "person-video-input",
              "audio",
              "audio-reference",
            ].includes(node.data?.kind),
        )
        .map((node) => node.id),
    );
    const filterRuntimeAssets = (runtimeAssets = {}) =>
      Object.fromEntries(
        Object.entries(runtimeAssets || {}).filter(([nodeId]) =>
          runtimeInputNodeIds.has(nodeId),
        ),
      );
    const inheritedRuntimeAssets = sourceRun?.runtimeAssets
      ? await loadWorkflowRuntimeAssets(
          filterRuntimeAssets(sourceRun.runtimeAssets),
        )
      : {};
    const submittedRuntimeAssets = Object.fromEntries(
      Object.entries(filterRuntimeAssets(req.body.runtimeAssets || {})).map(
        ([nodeId, assets]) => [
          nodeId,
          (Array.isArray(assets) ? assets : []).map((asset) => {
            if (!asset?.blobId) return asset;
            if (!validWorkflowAssetUpload(req.user.userId, asset))
              throw Object.assign(
                new Error("工作流素材引用已失效，请重新上传"),
                { status: 403 },
              );
            const { uploadToken: _uploadToken, ...safeAsset } = asset;
            return safeAsset;
          }),
        ],
      ),
    );
    const runtimeAssets = mergeWorkflowRuntimeAssets(
      inheritedRuntimeAssets,
      submittedRuntimeAssets,
    );
    assertWorkflowProjectAssetFiles(runtimeAssets, {
      seedanceOnly: workflowUsesSeedanceOnly(nodes),
    });
    const ordered = orderedWorkflowNodes(nodes, edges);
    const allExecutable = ordered.filter((node) =>
      WORKFLOW_STEP_KINDS.has(node.data?.kind),
    );
    const terminalIds = terminalWorkflowExecutionNodeIds(nodes, edges);
    if (!terminalIds.length && !singleNodeId)
      return res
        .status(400)
        .json({
          message: "工作流没有可执行的分析、文本、图片、音频或视频节点",
        });
    const reachable = singleNodeId
      ? reachableWorkflowNodes(nodes, edges, singleNodeId)
      : reachableWorkflowExecutionNodes(nodes, edges, terminalIds);
    const downstream = startNodeId
      ? includeRequiredTrustedPersonAssets(
          nodes,
          edges,
          downstreamWorkflowNodeIds(nodes, edges, startNodeId),
        )
      : null;
    const executable = singleNodeId
      ? allExecutable.filter((node) => node.id === singleNodeId)
      : allExecutable.filter(
          (node) =>
            reachable.has(node.id) && (!downstream || downstream.has(node.id)),
        );
    if (startNodeId && !executable.length)
      return res.status(400).json({ message: "该节点后面没有可执行链路" });
    const digitalAssets = await readCollection("digital_assets", []);
    assertWorkflowDigitalAssets({
      nodes: nodes.filter((node) => reachable.has(node.id)),
      input: req.body,
      assets: digitalAssets.map((asset) => ({
        ...asset,
        ownerId: effectiveOwnerId(asset),
      })),
      ownerId: req.user.userId,
      allowDeleted: Boolean(sourceRun),
    });
    const now = new Date().toISOString();
    const runId = randomUUID();
    const runtimeAssetManifest =
      await persistWorkflowRuntimeAssets(runtimeAssets);
    const recoveryInput = buildWorkflowRecoveryInput(req.body, {
      name: req.body.name,
      templateId: req.body.templateId,
      sourceRunId,
      startNodeId,
      singleNodeId,
      batchGroupId: req.body.batchGroupId,
      nodes,
      edges,
      runtimeAssetGroupIds: injected.runtimeAssetGroupIds,
    });
    const run = {
      id: runId,
      ownerId: req.user.userId,
      name: String(req.body.name || "未命名工作流")
        .trim()
        .slice(0, 80),
      templateId: String(req.body.templateId || ""),
      templateRevision: Math.max(1, Number(req.body.templateRevision) || 1),
      templateVersionRef: String(
        req.body.templateVersionRef ||
          `${String(req.body.templateId || "draft")}@${Math.max(1, Number(req.body.templateRevision) || 1)}`,
      ).slice(0, 180),
      templateManifest: buildTemplateManifest({
        id: String(req.body.templateId || "draft"),
        revision: Math.max(1, Number(req.body.templateRevision) || 1),
        runMode: req.body.runMode,
        nodes,
        edges,
      }),
      source: ["inspiration", "hot-rank", "creator"].includes(req.body.source)
        ? req.body.source
        : "creator",
      sourceInspirationId,
      brandInvocationStatus: brandInvocation?.status || "",
      brandInvocationVersion: brandInvocation?.version || "",
      brandSourceDocument: brandInvocation?.sourceDocument || "",
      sourceRunId,
      startNodeId,
      singleNodeId,
      rerun: Boolean(startNodeId),
      singleNode: Boolean(singleNodeId),
      batchGroupId: String(req.body.batchGroupId || ""),
      batchIndex,
      batchTotal,
      sourceFileName: String(req.body.sourceFileName || "").slice(0, 180),
      status: "queued",
      currentStep: 0,
      totalSteps: executable.length,
      currentNodeId: null,
      activeEdgeId: null,
      executionMode: "serial",
      runMode: "backend",
      coverUrl: null,
      outputUrl: null,
      error: null,
      runtimeAssets: runtimeAssetManifest,
      recoveryInput,
      steps: executable.map((node, index) => ({
        id: randomUUID(),
        nodeId: node.id,
        index: index + 1,
        kind: node.data.kind,
        title: node.data.title || `步骤 ${index + 1}`,
        model: node.data.model || "",
        apiPath:
          node.data.backendPath || node.data.backendGenerationPath || "",
        promptVersion: node.data.promptVersion || "",
        outputFormat: node.data.outputFormat || "",
        status: "queued",
        result: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      })),
      createdAt: now,
      updatedAt: now,
    };
    await mutateCollection("workflow_runs", (runs) =>
      [run, ...runs].slice(0, 1000),
    );
    if (run.templateId && run.templateId !== "draft") {
      const templates = await readCollection("templates", []);
      const template = templates.find((item) => item.id === run.templateId);
      await recordTemplateUsage({
        template,
        userId: req.user.userId,
        usedAt: now,
      });
    }
    enqueueWorkflowRun(run.id, {
      ...recoveryInput,
      runtimeAssetManifest: runtimeAssetManifest,
      ownerId: req.user.userId,
    });
    res.status(202).json(safeWorkflowRun(run));
  }),
);

app.post(
  "/api/tasks/image-to-video",
  requireUser,
  asyncRoute(async (req, res) => {
    const task = await createVideoTask(req.body, req.user.userId, {
      deferSubmission: true,
    });
    res.status(202).json(task);
  }),
);

app.post(
  "/api/tasks/video",
  requireUser,
  asyncRoute(async (req, res) => {
    const task = await createVideoTask(req.body, req.user.userId, {
      deferSubmission: true,
    });
    res.status(202).json(task);
  }),
);

app.post(
  "/api/tasks/image-to-video/batch",
  requireUser,
  asyncRoute(async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length)
      return res.status(400).json({ message: "请至少上传一张主图" });
    if (items.length > 20)
      return res.status(400).json({ message: "单批最多 20 张主图" });
    const results = await mapWithConcurrency(items, 3, async (item) => {
      try {
        return {
          ok: true,
          task: await createVideoTask(item, req.user.userId, {
            deferSubmission: true,
          }),
        };
      } catch (error) {
        return {
          ok: false,
          fileName: item.fileName,
          error: generationErrorMessage(
            error,
            "视频生成提交失败，请调整素材或稍后重试。",
          ),
        };
      }
    });
    res.status(207).json({ results });
  }),
);

app.post(
  "/api/tasks/video/batch",
  requireUser,
  asyncRoute(async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length)
      return res.status(400).json({ message: "请至少添加一个生成任务" });
    if (items.length > 20)
      return res.status(400).json({ message: "单批最多 20 个任务" });
    const results = await mapWithConcurrency(items, 3, async (item) => {
      try {
        return {
          ok: true,
          task: await createVideoTask(item, req.user.userId, {
            deferSubmission: true,
          }),
        };
      } catch (error) {
        return {
          ok: false,
          fileName: item.fileName,
          error: generationErrorMessage(
            error,
            "视频生成提交失败，请调整素材或稍后重试。",
          ),
        };
      }
    });
    res.status(207).json({ results });
  }),
);

app.post(
  "/api/tasks/:id/refresh",
  requireUser,
  asyncRoute(async (req, res) => {
    const tasks = await readCollection("tasks", []);
    const task = tasks.find(
      (item) => item.id === req.params.id && ownedBy(item, req.user.userId),
    );
    if (!task) return res.status(404).json({ message: "任务不存在" });
    if (
      task.taskType === "motion-control-series" &&
      task.upstreamTaskIds?.length
    ) {
      void pollMotionControlSeries(
        task.id,
        task.upstreamTaskIds,
        task.motionSourceDurationSeconds || Number(task.duration),
        task.keepOriginalSound,
      );
      return res.json(safeTask(task));
    }
    if (!task.upstreamTaskId) return res.json(safeTask(task));
    const provider = task.provider || "kling";
    const payload =
      provider === "volcengine"
        ? await getSeedanceTask(task.upstreamTaskId)
        : provider === "minimax"
          ? await getMiniMaxVideoTask(task.upstreamTaskId)
          : await getVideoTask(
              task.upstreamTaskId,
              task.taskType || "image2video",
            );
    const normalized =
      provider === "volcengine"
        ? normalizeSeedanceTask(payload)
        : provider === "minimax"
          ? normalizeMiniMaxVideoTask(payload)
          : normalizeKlingTask(payload);
    const failure =
      normalized.status === "failed"
        ? generationErrorDetails(
            { message: normalized.error, payload },
            normalized.error,
          )
        : null;
    const updated = await updateTask(task.id, {
      ...normalized,
      ...(failure ? { failure } : {}),
      upstreamPayload: payload,
    });
    if (normalized.status === "failed") await refundTaskPoints(task.id);
    res.json(safeTask(updated));
  }),
);

app.get(
  "/api/templates",
  requireUser,
  asyncRoute(async (req, res) => {
    const [templates, users, teams] = await Promise.all([
      readCollection("templates", []),
      readCollection("users", []),
      readCollection("teams", []),
    ]);
    const requester = users.find((user) => user.id === req.user.userId);
    if (!requester || requester.status !== "active")
      return res.status(401).json({ message: "账号不存在或已停用" });
    const templateLibraryEnabled = hasTemplateAccess(requester);
    res.json([
      ...(templateLibraryEnabled
        ? SYSTEM_TEMPLATES.filter(
            (template) => template.enabled !== false,
          ).map((template) => ({
            ...template,
            approvalStatus: "approved",
            visibility: "global",
            public: true,
          }))
        : []),
      ...templates
        .filter(
          (template) =>
            template.enabled !== false &&
            canExposeTemplateToUser(requester, template, {
              owned: ownedBy(template, req.user.userId),
              sharedVisible: sharedTemplateVisibleToUser(
                template,
                requester,
                teams,
              ),
            }),
        )
        .map((template) => ({
          ...withTemplateApproval(template),
          ownerId: effectiveOwnerId(template),
        })),
    ]);
  }),
);

app.get(
  "/api/templates-hidden-builtins",
  requireUser,
  requireInspirationAccess,
  asyncRoute(async (req, res) => {
    const entries = await readCollection("hidden_builtin_templates", []);
    res.json(
      entries
        .filter((entry) =>
          typeof entry === "string"
            ? req.user.userId === process.env.LEGACY_OWNER_USER_ID
            : entry.userId === req.user.userId,
        )
        .map((entry) => (typeof entry === "string" ? entry : entry.templateId)),
    );
  }),
);

app.post(
  "/api/templates",
  requireUser,
  asyncRoute(async (req, res) => {
    if (!String(req.body.name || "").trim())
      return res.status(400).json({ message: "模板名称不能为空" });
    const now = new Date().toISOString();
    const [users, teams] = await Promise.all([
      readCollection("users", []),
      readCollection("teams", []),
    ]);
    const requester = users.find((user) => user.id === req.user.userId);
    const requesterTeam = teamForUser(teams, requester);
    const visibility = ["team", "global"].includes(req.body.visibility)
      ? "team"
      : "private";
    if (visibility === "team" && !canCreateSharedTemplate(requester))
      return res.status(403).json({
        message: "模版权限尚未开通，不能上传团队工作流",
        code: "TEMPLATE_ACCESS_REQUIRED",
      });
    if (visibility === "team" && !requesterTeam)
      return res.status(403).json({ message: "请先加入团队，再上传团队工作流" });
    const template = {
      id: randomUUID(),
      ownerId: req.user.userId,
      name: String(req.body.name).trim(),
      description: String(req.body.description || "").trim(),
      category: String(req.body.category || "自定义"),
      accent: String(req.body.accent || "#daff51"),
      ...templateCreationAccess(visibility, now, requesterTeam?.id),
      enabled: true,
      runMode: req.body.runMode === "frontend" ? "frontend" : "backend",
      nodes: Array.isArray(req.body.nodes) ? req.body.nodes : [],
      edges: Array.isArray(req.body.edges) ? req.body.edges : [],
      sourceTemplateId: String(
        req.body.sourceTemplateId || req.body.forkedFromTemplateId || "",
      ),
      sourceTemplateRevision: Math.max(
        0,
        Number(req.body.sourceTemplateRevision) || 0,
      ),
      sourceInspirationConfigId: String(
        req.body.sourceInspirationConfigId || "",
      ).trim().slice(0, 120),
      revision: 1,
      revisionHistory: [],
      createdAt: now,
      updatedAt: now,
    };
    if (req.body.coverImage)
      template.coverUrl = await persistTemplateCover(
        template.id,
        req.body.coverImage,
        req.body.coverMimeType,
      );
    template.manifest = buildTemplateManifest(template);
    template.versionRef = templateVersionRef(template);
    await mutateCollection("templates", (templates) => [
      template,
      ...templates,
    ]);
    res.status(201).json(template);
  }),
);

app.put(
  "/api/templates/:id",
  requireUser,
  asyncRoute(async (req, res) => {
    const {
      coverImage,
      coverMimeType,
      coverFileName: _coverFileName,
      ...templatePatch
    } = req.body || {};
    const [users, teams, storedTemplates] = await Promise.all([
      readCollection("users", []),
      readCollection("teams", []),
      readCollection("templates", []),
    ]);
    const requester = users.find((user) => user.id === req.user.userId);
    const requesterTeam = teamForUser(teams, requester);
    const storedTemplate = storedTemplates.find(
      (template) =>
        template.id === req.params.id && ownedBy(template, req.user.userId),
    );
    if (!storedTemplate)
      return res.status(404).json({ message: "模板不存在" });
    if (
      !canManageTemplate(requester, storedTemplate, {
        owned: true,
        requestedVisibility: templatePatch.visibility,
      })
    )
      return res.status(403).json({
        message: "模版权限尚未开通，不能编辑或上传共享模版",
        code: "TEMPLATE_ACCESS_REQUIRED",
      });
    const coverUrl = coverImage
      ? await persistTemplateCover(req.params.id, coverImage, coverMimeType)
      : undefined;
    let updated;
    await mutateCollection("templates", (templates) =>
      templates.map((template) => {
        if (
          template.id !== req.params.id ||
          !ownedBy(template, req.user.userId)
        )
          return template;
        const now = new Date().toISOString();
        const nextVisibility =
          templatePatch.visibility === undefined
            ? isTeamTemplate(template) ||
              template.visibility === "global" ||
              isPublicTemplate(template)
              ? "team"
              : "private"
            : ["team", "global"].includes(templatePatch.visibility)
              ? "team"
              : "private";
        if (nextVisibility === "team" && !requesterTeam) return template;
        const approvalPatch =
          nextVisibility === "team"
            ? templateCreationAccess("team", now, requesterTeam.id)
            : {
                visibility: "private",
                public: false,
                approvalStatus: "private",
                requestedAt: null,
              };
        const publicBase =
          template.pendingPublicBase ||
          (isPublicTemplate(template) || isApprovedTeamTemplate(template)
            ? { nodes: template.nodes || [], edges: template.edges || [] }
            : null);
        const nextCandidate = {
          ...template,
          ...templatePatch,
          nodes: Array.isArray(templatePatch.nodes)
            ? templatePatch.nodes
            : template.nodes || [],
          edges: Array.isArray(templatePatch.edges)
            ? templatePatch.edges
            : template.edges || [],
        };
        const pendingTemplateRevision =
          nextVisibility === "team" && publicBase
            ? createTemplateRevisionEntry(publicBase, nextCandidate, {
                revision: templateRevision(template) + 1,
                updatedAt: now,
                updatedBy: req.user.userId,
              })
            : null;
        const hasPublicNodeChanges = Boolean(
          pendingTemplateRevision?.changes?.length,
        );
        updated = {
          ...template,
          ...templatePatch,
          ...(coverUrl ? { coverUrl } : {}),
          ...approvalPatch,
          id: template.id,
          ownerId: effectiveOwnerId(template),
          revision: templateRevision(template),
          ...(nextVisibility === "team" && hasPublicNodeChanges
            ? {
                pendingPublicUpdate: true,
                pendingPublicBase: publicBase,
                pendingTemplateRevision,
              }
            : nextVisibility === "private" ||
                (nextVisibility === "team" && publicBase)
              ? {
                  pendingPublicUpdate: undefined,
                  pendingPublicBase: undefined,
                  pendingTemplateRevision: undefined,
                }
              : {}),
          updatedAt: now,
        };
        updated.manifest = buildTemplateManifest(updated);
        updated.versionRef = templateVersionRef(updated);
        return updated;
      }),
    );
    if (!updated) {
      if (!requesterTeam && ["team", "global"].includes(templatePatch.visibility))
        return res.status(403).json({ message: "请先加入团队，再上传团队工作流" });
      return res.status(404).json({ message: "模板不存在" });
    }
    await syncInspirationOverrideFromWorkflowTemplate(updated);
    res.json(updated);
  }),
);

app.get(
  "/api/template-update-notices",
  requireUser,
  requireInspirationAccess,
  asyncRoute(async (req, res) => {
    const [templates, usages, runs] = await Promise.all([
      readCollection("templates", []),
      readCollection("template_usages", []),
      readCollection("workflow_runs", []),
    ]);
    res.json(
      templateUpdateNoticesForUser({
        templates,
        usages,
        runs,
        userId: req.user.userId,
      }),
    );
  }),
);

app.post(
  "/api/templates/:id/usage",
  requireUser,
  requireInspirationAccess,
  asyncRoute(async (req, res) => {
    const [templates, runs, users, teams] = await Promise.all([
      readCollection("templates", []),
      readCollection("workflow_runs", []),
      readCollection("users", []),
      readCollection("teams", []),
    ]);
    const requester = users.find((user) => user.id === req.user.userId);
    const template = templates.find(
      (item) =>
        item.id === req.params.id &&
        (isPublicTemplate(item) ||
          (isApprovedTeamTemplate(item) &&
            canViewTeamTemplate(item, requester, teamForTemplate(teams, item)))),
    );
    if (!template) return res.status(404).json({ message: "团队工作流不存在" });
    const now = new Date().toISOString();
    const legacyRun = runs
      .filter(
        (run) =>
          ownedBy(run, req.user.userId) && run.templateId === template.id,
      )
      .sort(
        (left, right) => new Date(left.createdAt) - new Date(right.createdAt),
      )[0];
    const result = await recordTemplateUsage({
      template,
      userId: req.user.userId,
      usedAt: now,
      firstUsedAt: legacyRun?.createdAt || now,
      firstUsedRevision: legacyRun
        ? templateRevisionAtTime(template, legacyRun.createdAt)
        : templateRevision(template),
    });
    res.status(201).json(result);
  }),
);

app.post(
  "/api/templates/:id/updates/acknowledge",
  requireUser,
  requireInspirationAccess,
  asyncRoute(async (req, res) => {
    const [templates, users, teams] = await Promise.all([
      readCollection("templates", []),
      readCollection("users", []),
      readCollection("teams", []),
    ]);
    const requester = users.find((user) => user.id === req.user.userId);
    const template = templates.find(
      (item) =>
        item.id === req.params.id &&
        (isPublicTemplate(item) ||
          (isApprovedTeamTemplate(item) &&
            canViewTeamTemplate(item, requester, teamForTemplate(teams, item)))),
    );
    if (!template) return res.status(404).json({ message: "团队工作流不存在" });
    const now = new Date().toISOString();
    let result;
    await mutateCollection("template_usages", (usages) => {
      const existing = usages.find(
        (usage) =>
          usage.userId === req.user.userId && usage.templateId === template.id,
      );
      result = {
        ...(existing || {
          id: `${req.user.userId}:${template.id}`,
          userId: req.user.userId,
          templateId: template.id,
          firstUsedRevision: templateRevision(template),
          firstUsedAt: now,
        }),
        acknowledgedRevision: templateRevision(template),
        acknowledgedAt: now,
        lastUsedAt: existing?.lastUsedAt || now,
      };
      return existing
        ? usages.map((usage) => (usage === existing ? result : usage))
        : [result, ...usages];
    });
    res.json(result);
  }),
);

app.post(
  "/api/templates/:id/review",
  requireUser,
  requireInspirationAccess,
  asyncRoute(async (req, res) => {
    const [users, teams, templates] = await Promise.all([
      readCollection("users", []),
      readCollection("teams", []),
      readCollection("templates", []),
    ]);
    const reviewer = users.find((user) => user.id === req.user.userId);
    const template = templates.find((item) => item.id === req.params.id);
    const team = teamForTemplate(teams, template);
    if (!canReviewTeamTemplate(template, reviewer, team))
      return res.status(403).json({ message: "仅所属团队管理员可以审批团队工作流" });
    const result = await reviewTemplateSubmission(
      req.params.id,
      String(req.body.decision || ""),
      reviewer.name || "文鸟",
    );
    res.json(result);
  }),
);

app.delete(
  "/api/templates/:id",
  requireUser,
  asyncRoute(async (req, res) => {
    if (req.params.id.startsWith("builtin-")) {
      return res.status(403).json({ message: "系统公开模板只能由管理员管理" });
    }
    const [users, storedTemplates] = await Promise.all([
      readCollection("users", []),
      readCollection("templates", []),
    ]);
    const requester = users.find((user) => user.id === req.user.userId);
    const storedTemplate = storedTemplates.find(
      (template) =>
        template.id === req.params.id && ownedBy(template, req.user.userId),
    );
    if (
      storedTemplate &&
      !canManageTemplate(requester, storedTemplate, { owned: true })
    )
      return res.status(403).json({
        message: "模版权限尚未开通，不能删除共享模版",
        code: "TEMPLATE_ACCESS_REQUIRED",
      });
    let result;
    await mutateCollection("templates", (templates) =>
      templates.flatMap((template) => {
        if (
          template.id !== req.params.id ||
          !ownedBy(template, req.user.userId)
        )
          return [template];
        result = { deleted: true, id: template.id };
        return [];
      }),
    );
    if (!result)
      return res.status(404).json({ message: "模板不存在或无权操作" });
    res.status(204).end();
  }),
);

app.get(
  "/api/hot-rank",
  requireUser,
  asyncRoute(async (req, res) => {
    res.json(await getHotRankSnapshot(req.query));
  }),
);

app.get(
  "/api/hot-rank-remake-config",
  requireUser,
  asyncRoute(async (_req, res) => {
    const config = await getHotRankRemakeConfig();
    res.json(publicHotRankRemakeConfig(config, hotRankRemakeRuntime(config)));
  }),
);

app.get(
  "/api/hot-rank/:id/remake-template",
  requireUser,
  asyncRoute(async (req, res) => {
    const config = await getHotRankRemakeConfig();
    if (!config.enabled)
      return res.status(409).json({ message: "排行榜一键同款当前已停用" });
    const manifest = await readHotRankManifest();
    const item = manifest.items.find((entry) => entry.id === req.params.id);
    if (!item) return res.status(404).json({ message: "榜单视频不存在" });
    const source = hotRankSource(item);
    const mediaPath = source.fileName
      ? await findHotRankMediaPath(source.fileName)
      : null;
    if (!mediaPath)
      return res.status(409).json({ message: "榜单原片尚未导入，暂时无法复刻" });
    const runtime = hotRankRemakeRuntime(config);
    res.json({
      item,
      source: {
        ...source,
        available: true,
        mediaUrl: hotRankMediaUrl(source.fileName),
      },
      config: publicHotRankRemakeConfig(config, runtime),
      template: buildHotRankRemakeTemplate(item, config),
    });
  }),
);

app.post(
  "/api/hot-rank/:id/workflow-asset",
  requireUser,
  asyncRoute(async (req, res) => {
    const config = await getHotRankRemakeConfig();
    if (!config.enabled)
      return res.status(409).json({ message: "排行榜一键同款当前已停用" });
    const manifest = await readHotRankManifest();
    const item = manifest.items.find((entry) => entry.id === req.params.id);
    if (!item) return res.status(404).json({ message: "榜单视频不存在" });
    const source = hotRankSource(item);
    const mediaPath = source.fileName
      ? await findHotRankMediaPath(source.fileName)
      : null;
    if (!mediaPath)
      return res.status(409).json({ message: "榜单原片尚未导入，暂时无法复刻" });
    const stored = await persistWorkflowRuntimeAssetFile(
      mediaPath,
      {
        type: "video",
        name: source.fileName,
        mimeType: "video/mp4",
        source: "hot-rank",
      },
      { rootDir: workflowAssetBlobDir },
    );
    if (!stored)
      return res.status(409).json({ message: "榜单原片为空，暂时无法复刻" });
    res.status(201).json({
      asset: {
        ...stored,
        uploadToken: workflowAssetUploadToken(req.user.userId, stored),
      },
    });
  }),
);

app.get(
  "/api/hot-rank/:id/source",
  requireUser,
  asyncRoute(async (req, res) => {
    const manifest = await readHotRankManifest();
    const item = manifest.items.find((entry) => entry.id === req.params.id);
    if (!item) return res.status(404).json({ message: "榜单视频不存在" });
    const source = hotRankSource(item);
    if (!source.fileName) return res.json({ ...source, available: false });
    const previewFileName = hotRankPreviewFileName(source.fileName);
    const previewPath = previewFileName
      ? await findHotRankMediaPath(previewFileName)
      : null;
    const playbackFileName = previewPath ? previewFileName : source.fileName;
    const mediaPath = previewPath || (await findHotRankMediaPath(source.fileName));
    const available = Boolean(mediaPath);
    const posterFileName = hotRankPosterFileName(source.fileName);
    const posterPath = posterFileName
      ? await findHotRankMediaPath(posterFileName)
      : null;
    res.json({
      ...source,
      available,
      preview: Boolean(previewPath),
      mediaUrl: available ? hotRankMediaUrl(playbackFileName) : "",
      posterUrl: posterPath ? hotRankMediaUrl(posterFileName) : "",
    });
  }),
);

app.get(
  "/api/hot-rank/media/:fileName",
  asyncRoute(async (req, res) => {
    if (!verifyHotRankMediaTicket(req.params.fileName, req.query.ticket))
      return res.status(401).json({ message: "榜单视频访问链接已失效" });
    const mediaPath = await findHotRankMediaPath(req.params.fileName);
    if (!mediaPath)
      return res.status(404).json({ message: "榜单视频尚未导入" });
    res.setHeader("Cache-Control", "private, max-age=900");
    res.sendFile(mediaPath);
  }),
);

// One MCP service instance keeps token rate limits and audit writes consistent.
const mcpService = createMcpService({
  readCollection,
  mutateCollection,
  systemTemplates: SYSTEM_TEMPLATES,
  submitVideo: (input, ownerId) =>
    createVideoTask(input, ownerId, { deferSubmission: true }),
});

const mcpPrincipalForUser = async (userId) => {
  const users = await readCollection("users", []);
  const user = users.find((item) => String(item.id) === String(userId || ""));
  if (!user || user.status !== "active")
    throw Object.assign(new Error("账号不存在或已停用"), { status: 401 });
  return {
    userId: user.id,
    role: user.accountType === "admin" ? "admin" : "user",
    user,
  };
};

app.get(
  "/api/mcp/access",
  requireUser,
  asyncRoute(async (req, res) => {
    const principal = await mcpPrincipalForUser(req.user.userId);
    const tokens = await mcpService.listTokens({ userId: principal.userId });
    res.json(mcpService.accessInfo(principal, mcpEndpointForRequest(req), tokens));
  }),
);

app.post(
  "/api/mcp/tokens",
  requireUser,
  asyncRoute(async (req, res) => {
    const principal = await mcpPrincipalForUser(req.user.userId);
    const issued = await mcpService.issueToken({
      userId: principal.userId,
      name: req.body?.name,
      expiresInDays: req.body?.expiresInDays,
      source: "studio_account",
      issuedBy: principal.user.name,
    });
    const tokens = await mcpService.listTokens({ userId: principal.userId });
    res.status(201).json({
      ...issued,
      access: mcpService.accessInfo(
        principal,
        mcpEndpointForRequest(req),
        tokens,
      ),
    });
  }),
);

app.delete(
  "/api/mcp/tokens/:id",
  requireUser,
  asyncRoute(async (req, res) => {
    const record = await mcpService.revokeToken({
      tokenId: req.params.id,
      userId: req.user.userId,
    });
    res.json(record);
  }),
);

app.get(
  "/api/mcp/audit",
  requireUser,
  asyncRoute(async (req, res) => {
    res.json(
      await mcpService.listAudit({
        userId: req.user.userId,
        limit: req.query.limit,
      }),
    );
  }),
);

app.get(
  "/api/admin/mcp/access",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const owner = await ensureWorkspaceOwnerUser();
    const principal = { userId: owner.id, role: "admin", user: owner };
    const tokens = await mcpService.listTokens({ role: "admin" });
    res.json(mcpService.accessInfo(principal, mcpEndpointForRequest(req), tokens));
  }),
);

app.post(
  "/api/admin/mcp/tokens",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const owner = await ensureWorkspaceOwnerUser();
    const principal = { userId: owner.id, role: "admin", user: owner };
    const issued = await mcpService.issueToken({
      userId: owner.id,
      name: req.body?.name,
      expiresInDays: req.body?.expiresInDays,
      source: "admin_console",
      issuedBy: req.admin.username,
      forceAdmin: true,
    });
    const tokens = await mcpService.listTokens({ role: "admin" });
    res.status(201).json({
      ...issued,
      access: mcpService.accessInfo(
        principal,
        mcpEndpointForRequest(req),
        tokens,
      ),
    });
  }),
);

app.delete(
  "/api/admin/mcp/tokens/:id",
  requireAdmin,
  asyncRoute(async (req, res) => {
    res.json(
      await mcpService.revokeToken({
        tokenId: req.params.id,
        role: "admin",
      }),
    );
  }),
);

app.get(
  "/api/admin/mcp/audit",
  requireAdmin,
  asyncRoute(async (req, res) => {
    res.json(
      await mcpService.listAudit({
        role: "admin",
        limit: req.query.limit,
      }),
    );
  }),
);

const allowedMcpOrigins = String(process.env.MCP_ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const rpcTransportError = (message) => ({
  jsonrpc: "2.0",
  id: null,
  error: { code: -32000, message },
});

app.get("/mcp", (_req, res) => {
  res.setHeader("Allow", "POST");
  res.status(405).json({ message: "该 MCP 服务不提供独立 SSE 监听流，请使用 Streamable HTTP POST" });
});

app.delete("/mcp", (_req, res) => {
  res.setHeader("Allow", "POST");
  res.status(405).end();
});

app.post(
  "/mcp",
  asyncRoute(async (req, res) => {
    if (!isAllowedMcpOrigin(req, allowedMcpOrigins))
      return res.status(403).json(rpcTransportError("MCP Origin 不在允许列表"));
    const protocolHeader = String(req.header("MCP-Protocol-Version") || "").trim();
    if (protocolHeader && !MCP_PROTOCOL_VERSIONS.includes(protocolHeader))
      return res.status(400).json(
        rpcTransportError(`不支持的 MCP 协议版本：${protocolHeader}`),
      );
    const secret = bearerTokenFromRequest(req);
    if (!secret)
      return res.status(401).json(rpcTransportError("请提供 MCP Bearer Token"));
    let principal;
    try {
      principal = await mcpService.authenticate(secret);
    } catch (error) {
      return res
        .status(Number(error.status) || 401)
        .json(rpcTransportError(error.message));
    }
    const response = await mcpService.handleRpc(principal, req.body);
    if (!response) return res.status(202).end();
    res.type("application/json").json(response);
  }),
);

app.use("/api", apiNotFound);

app.get("/release.json", (_req, res) => {
  res.json(RELEASE_INFO);
});

if (process.env.NODE_ENV === "production") {
  const distDir = path.join(here, "..", "dist");
  const staticNotFound = (_req, res) =>
    res.status(404).type("text/plain").send("Not Found");
  app.all(/^\/ops-[a-z0-9_-]+(?:\/.*)?$/i, (_req, res) =>
    res.status(404).send("Not Found"),
  );
  app.all("/vault.html", (_req, res) => res.status(404).send("Not Found"));
  app.use(
    "/template-thumbnails",
    express.static(path.join(distDir, "template-thumbnails"), {
      maxAge: "1d",
    }),
    staticNotFound,
  );
  app.use(
    "/template-covers",
    express.static(path.join(distDir, "template-covers"), {
      maxAge: "1h",
    }),
    staticNotFound,
  );
  app.use(
    "/template-products",
    express.static(path.join(distDir, "template-products"), {
      maxAge: "1h",
    }),
    staticNotFound,
  );
  app.use(
    "/assets",
    express.static(path.join(distDir, "assets"), {
      maxAge: "1y",
      immutable: true,
    }),
    staticNotFound,
  );
  app.use(express.static(distDir, { maxAge: 0 }));
  app.get("/admin", (_req, res) =>
    res.sendFile(path.join(distDir, "admin.html")),
  );
  app.get("/admin/*path", (_req, res) =>
    res.sendFile(path.join(distDir, "admin.html")),
  );
  app.get(/^\/.*\.[a-z0-9]{1,16}$/i, staticNotFound);
  app.get("*path", (_req, res) =>
    res.sendFile(path.join(distDir, "index.html")),
  );
}

app.use((error, req, res, _next) => {
  const requestedStatus = Number(error?.status || error?.statusCode);
  const status =
    Number.isInteger(requestedStatus) &&
    requestedStatus >= 400 &&
    requestedStatus <= 599
      ? requestedStatus
      : 500;
  const errorId = randomUUID();
  const isGenerationApi =
    /^\/api\/(tasks|workflow-runs|media|text|providers|kling)/.test(req.path);
  const failure = isGenerationApi
    ? generationErrorDetails(error, "生成服务处理失败，请稍后重试。")
    : null;
  const message = failure
    ? failure.message
    : safeHttpErrorMessage(error, status);
  if (status >= 500) {
    console.error("Unhandled API request error", {
      errorId,
      method: req.method,
      path: req.path,
      status,
      code: sanitizeProviderError(error?.code || error?.name, "UNHANDLED_ERROR"),
      detail: sanitizeProviderError(error?.stack || error?.message),
    });
  }
  res.status(status).json({
    message,
    ...(failure ? { failure } : {}),
    ...(status >= 500 ? { referenceId: errorId } : {}),
  });
});

app.listen(port, "127.0.0.1", async () => {
  await checkVolcengineConnection();
  const now = new Date().toISOString();
  await mutateCollection("users", (users) =>
    (users.length
      ? users
      : [
          {
            id: "workspace-owner",
            name: "工作室主账号",
            contact: "local@example.com",
            accountType: "creator",
            templateAccess: false,
            inspirationAccess: false,
            plan: "工作室版",
            status: "active",
            pointsBalance: 1000,
            totalGenerated: 0,
            lastActiveAt: now,
            createdAt: now,
            updatedAt: now,
          },
        ]
    ).map(normalizeLegacyAccountType),
  );
  const initializedUsers = await readCollection("users", []);
  const workspaceOwner =
    initializedUsers.find((user) => user.id === "workspace-owner") ||
    initializedUsers[0];
  if (workspaceOwner) {
    const teamOwner = {
      ...workspaceOwner,
      teamId: DEFAULT_TEAM_ID,
      teamRole: "admin",
    };
    await mutateCollection("users", (users) =>
      users.map((user) => (user.id === teamOwner.id ? teamOwner : user)),
    );
    await ensureDefaultTeam(teamOwner);
    await migrateLegacyGlobalTemplatesToTeams(
      await readCollection("users", []),
    );
    await ensureQianchuanSpeakingTemplate();
  }
  await mutateCollection("point_ledger", (entries) =>
    entries.length
      ? entries
      : [
          {
            id: randomUUID(),
            userId: "workspace-owner",
            amount: 1000,
            balanceAfter: 1000,
            reason: "初始化工作室额度",
            operator: process.env.ADMIN_USERNAME || "system",
            createdAt: now,
          },
        ],
  );
  const tasks = await readCollection("tasks", []);
  for (const task of tasks.filter((item) => item.status === "submitting")) {
    const recoveryAction = startupRecoveryAction(task);
    if (recoveryAction === "wait-callback") {
      const deadline = Number(
        task.submissionReconcileUntil ||
          Date.now() + SEEDANCE_SUBMISSION_RECONCILE_MS,
      );
      if (deadline > Date.now()) {
        scheduleSeedanceSubmissionExpiry(task.id, deadline);
        continue;
      }
      await updateTask(task.id, {
        status: "failed",
        submissionUncertain: false,
        error:
          "Seedance 提交后未取得任务 ID，且服务恢复时回调等待期已结束；本次积分已退回，请重新提交。",
      });
      await refundTaskPoints(task.id, "Seedance 提交恢复对账超时退款");
      continue;
    }
    if (recoveryAction === "resubmit") {
      void recoverVideoTaskInput(task)
        .then((input) => {
          if (!input) throw new Error("视频任务缺少可恢复的提交参数");
          return createVideoTask(input, task.ownerId, {
            existingTaskId: task.id,
          });
        })
        .catch(async (error) => {
          const current = (await readCollection("tasks", [])).find(
            (entry) => entry.id === task.id,
          );
          if (current?.status !== "failed") {
            await updateTask(task.id, {
              status: "failed",
              error: generationErrorMessage(
                error,
                "视频任务恢复失败，请重新提交。",
              ),
            });
            await refundTaskPoints(task.id, "视频任务恢复失败退款");
          }
          console.error(
            `Video task ${task.id} recovery failed:`,
            error.message,
          );
        });
      continue;
    }
    await updateTask(task.id, {
      status: "failed",
      error: "服务中断时任务尚未取得供应商任务 ID，请重新提交。",
    });
    await refundTaskPoints(task.id, "视频提交中断退款");
  }
  for (const task of tasks.filter((item) =>
    ["queued", "processing"].includes(item.status),
  )) {
    const recoveryAction = startupRecoveryAction(task);
    if (recoveryAction === "poll") {
      if (
        task.taskType === "motion-control-series" &&
        task.upstreamTaskIds?.length
      )
        void pollMotionControlSeries(
          task.id,
          task.upstreamTaskIds,
          task.motionSourceDurationSeconds || Number(task.duration),
          task.keepOriginalSound,
        );
      else
        void pollTask(
          task.id,
          task.upstreamTaskId,
          task.taskType || "image2video",
          task.provider || "kling",
        );
      continue;
    }
    if (recoveryAction === "resume-image") {
      void recoverImageTaskInput(task)
        .then(async (input) =>
          scheduleImageWork(() => processImageTask(task, input), {
            priority: await generationQueuePriority(task.ownerId),
          }),
        )
        .catch(async (error) => {
          await updateTask(task.id, {
            status: "failed",
            error: generationErrorMessage(
              error,
              "图片任务恢复失败，请重新提交。",
            ),
          });
          await refundTaskPoints(task.id, "图片任务恢复失败退款");
        });
      continue;
    }
    await updateTask(task.id, {
      status: "failed",
      error: "服务重启后无法恢复该任务，请重新提交。",
    });
    await refundTaskPoints(task.id, "不可恢复任务退款");
  }
  const analysisTasksBeforeRestart = await readCollection(
    "media_analysis_tasks",
    [],
  );
  const interruptedAnalysisTasks = analysisTasksBeforeRestart.filter((task) =>
    MEDIA_ANALYSIS_ACTIVE_STATUSES.has(task.status),
  );
  await mutateCollection("media_analysis_tasks", (analysisTasks) =>
    analysisTasks.map((task) => failInterruptedMediaAnalysisTask(task, now)),
  );
  for (const task of interruptedAnalysisTasks) {
    if (!task.ownerId || !task.pointsCost) continue;
    await refundUsagePoints({
      userId: task.ownerId,
      kind: "analysis",
      quantity: task.pointsCost,
      taskId: task.id,
      reason: "服务重启导致视频分析中断退款",
    }).catch((error) =>
      console.error(
        `Interrupted analysis refund ${task.id} failed:`,
        error.message,
      ),
    );
  }
  const workflowRunsBeforeRestart = await readCollection("workflow_runs", []);
  const templatesBeforeRestart = await readCollection("templates", []);
  for (const run of oldestWorkflowRunsFirst(
    workflowRunsBeforeRestart.filter((item) =>
      ["queued", "processing"].includes(item.status),
    ),
  )) {
    try {
      let recoverableRun = run;
      if (!recoverableRun.recoveryInput?.nodes?.length) {
        const template = templatesBeforeRestart.find(
          (item) => item.id === run.templateId,
        );
        if (template?.nodes?.length) {
          const recoveryInput = buildWorkflowRecoveryInput(
            {
              name: run.name,
              templateId: run.templateId,
              sourceRunId: run.sourceRunId,
              startNodeId: run.startNodeId,
              batchGroupId: run.batchGroupId,
              nodes: template.nodes,
              edges: template.edges,
            },
            { nodes: template.nodes, edges: template.edges },
          );
          recoverableRun = { ...run, recoveryInput };
          await updateWorkflowRun(run.id, {
            recoveryInput,
            recoverySource: "template-migration",
          });
        }
      }
      const resumed = await resumeWorkflowRunAfterRestart(recoverableRun, now);
      if (resumed) continue;
      const legacyResumed = await resumeLegacyWorkflowVideoRun(run, tasks, now);
      if (legacyResumed) continue;
      await updateWorkflowRun(run.id, {
        status: "failed",
        error:
          "该任务来自旧版本且没有可恢复的编排快照；已提交的视频子任务仍保留在生成记录中。",
        currentNodeId: null,
        completedAt: now,
        steps: (run.steps || []).map((step) =>
          step.status === "processing"
            ? {
                ...step,
                status: "failed",
                error: "旧版本未保存恢复快照",
                updatedAt: now,
              }
            : step,
        ),
      });
    } catch (error) {
      await updateWorkflowRun(run.id, {
        status: "failed",
        error: generationErrorMessage(
          error,
          "工作流自动恢复失败，请从失败节点继续运行。",
        ),
        currentNodeId: null,
        completedAt: now,
      });
    }
  }
  void getInspirationTemplateCatalog()
    .then((catalog) =>
      console.log(
        `Inspiration catalog ready: ${catalog.videoTemplates.length} video, ${catalog.outfitImageTemplates.length} outfit, ${catalog.detailPageTemplates.length} detail`,
      ),
    )
    .catch((error) =>
      console.error("Inspiration catalog warmup failed:", error.message),
    );
  console.log(`Commerce Canvas API listening on http://127.0.0.1:${port}`);
});

