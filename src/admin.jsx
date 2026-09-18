import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Aperture,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  Coins,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  FolderOutput,
  Gauge,
  Image as ImageIcon,
  KeyRound,
  LayoutTemplate,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundX,
  UserRoundPlus,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { adminApi, adminSession } from "./adminApi";
import { McpAccessPanel } from "./mcp-access-panel.jsx";
import { installRuntimeStyle } from "./install-runtime-style.js";
import restoredSurfaceTheme from "./restored-surface-theme.css?inline";
import "./admin.css";
import "./dark-green-theme.css";

installRuntimeStyle("commerce-canvas-restored-surface-theme", restoredSurfaceTheme);

const LOCAL_ADMIN_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const LOCAL_ADMIN_PREVIEW = LOCAL_ADMIN_HOSTS.has(window.location.hostname);

const NAV_ITEMS = [
  { id: "dashboard", label: "运营总览", icon: Gauge },
  { id: "models", label: "模型与 API", icon: Server },
  { id: "users", label: "用户管理", icon: Users },
  { id: "points", label: "积分中心", icon: Coins },
  { id: "templates", label: "画布管理", icon: LayoutTemplate },
  { id: "mcp", label: "MCP 管理", icon: KeyRound },
  { id: "inspiration", label: "模版提示词配置", icon: Settings2 },
  { id: "globalConfig", label: "全局配置", icon: Server, child: true },
];
const ADMIN_QUICK_PROMPT_PRESETS = [
  { label: "电商走秀", prompt: "模特自然走秀并完整展示服装" },
  { label: "定点转身", prompt: "模特原地转身展示正面、侧面与背面" },
  { label: "细节环绕", prompt: "镜头环绕主体并展示材质细节" },
];

const GLOBAL_CONFIG_GROUPS = [
  {
    id: "generation",
    label: "一键同款",
    hint: "模型、换装、资产绑定",
    icon: Sparkles,
  },
  {
    id: "rankRemake",
    label: "排行榜同款",
    hint: "节点流程、输入与生成参数",
    icon: Workflow,
  },
  {
    id: "quick",
    label: "快速创作",
    hint: "标题、示例、快捷提示词",
    icon: Zap,
  },
  {
    id: "batch",
    label: "批量任务",
    hint: "统一提示词与按钮",
    icon: FolderOutput,
  },
  {
    id: "media",
    label: "图片与声音",
    hint: "图片示例、配音与试听",
    icon: ImageIcon,
  },
  {
    id: "analysis",
    label: "分析与画布",
    hint: "分析框架、节点默认提示词",
    icon: Workflow,
  },
];

const ADMIN_TEMPLATE_TAG_PRESETS = [
  "服装",
  "鞋包配饰",
  "美妆个护",
  "食品饮料",
  "家居数码",
  "淘宝",
  "抖音商城",
  "小红书",
  "京东",
  "主图",
  "产品图",
  "种草图",
  "搭配图",
  "视频模版",
  "1:1",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
];

const MATERIAL_TEMPLATE_FLOW = [
  { id: "qc-remake-reference", label: "一键同款", hint: "参考原片" },
  { id: "qc-voice", label: "音频输入", hint: "声线与节奏" },
  { id: "qc-visual-analysis", label: "图片识别", hint: "可见事实" },
  { id: "qc-brand-brief", label: "文本词", hint: "品牌与卖点" },
  { id: "qc-person-whitelist", label: "真人过白", hint: "白名单" },
  { id: "qc-copy-director", label: "口播策划", hint: "钩子与行动" },
  { id: "qc-keyframe", label: "首帧合成", hint: "人物与产品" },
  { id: "qc-video", label: "有声成片", hint: "Seedance" },
];

const normalizeTemplateTags = (value) =>
  (Array.isArray(value) ? value : String(value || "").split(/[，,]/))
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 12);

const MINIMAX_H3_RATIOS = ["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"];
const MINIMAX_H3_RESOLUTIONS = ["768P", "2K"];
const MINIMAX_H3_RATIO_MODES = ["fixed", "adaptive"];

const normalizeMiniMaxH3Duration = (value) => {
  const duration = Number(value);
  return Number.isInteger(duration)
    ? Math.min(15, Math.max(4, duration))
    : 5;
};

const normalizeMiniMaxH3Ratio = (value) =>
  MINIMAX_H3_RATIOS.includes(value) ? value : "9:16";

const normalizeMiniMaxH3Resolution = (value) =>
  MINIMAX_H3_RESOLUTIONS.includes(value) ? value : "768P";

const normalizeMiniMaxH3RatioMode = (value) =>
  MINIMAX_H3_RATIO_MODES.includes(value) ? value : "fixed";

const miniMaxH3Settings = (
  source = {},
  { template = false } = {},
) => ({
  duration: normalizeMiniMaxH3Duration(source.duration),
  resolution: normalizeMiniMaxH3Resolution(source.resolution),
  ratioMode: normalizeMiniMaxH3RatioMode(source.ratioMode),
  aspectRatio: normalizeMiniMaxH3Ratio(
    source.aspectRatio || source.ratio,
  ),
  aigcWatermark: Boolean(source.aigcWatermark),
  multiShot: false,
  sound: false,
  ...(template ? { digitalAssetMode: "none" } : {}),
});

const normalizeMiniMaxHotRankConfig = (config) => {
  if (!config) return config;
  const video = config.nodes?.video;
  return {
    ...config,
    nodes: video
      ? {
          ...config.nodes,
          video:
            video.model === "minimax-h3"
              ? { ...video, ...miniMaxH3Settings(video) }
              : video,
        }
      : config.nodes,
    workflow: config.workflow
      ? {
          ...config.workflow,
          nodes: (config.workflow.nodes || []).map((node) =>
            node.kind === "video" && node.model === "minimax-h3"
              ? { ...node, ...miniMaxH3Settings(node) }
              : node,
          ),
        }
      : config.workflow,
  };
};

const templateWorkflowGraph = (template) => {
  const model = template.model || "kling-v3-omni";
  const minimax = model === "minimax-h3";
  const ratio = minimax
    ? normalizeMiniMaxH3Ratio(template.aspectRatio || template.ratio)
    : template.aspectRatio || template.ratio || "9:16";
  const withOutfit =
    (template.workflowPreset || "main-outfit-video") === "main-outfit-video";
  const assetMode = model === "kling-v3-turbo" || minimax
    ? "none"
    : template.digitalAssetMode || "optional";
  const seedance = model.includes("seedance");
  const nodes = [
    {
      id: "inspiration-main",
      type: "studio",
      position: { x: 40, y: 170 },
      data: {
        kind: "input",
        title: "主图素材",
        subtitle: withOutfit ? "模版封面 + 用户换装素材" : "模版主图 / 用户替换素材",
        aspectRatio: ratio,
        remakeEditable: true,
        remakeRequired: true,
        outputs: [{ id: "asset", label: "主图与素材", type: "ANY", multiple: true }],
      },
    },
    ...(withOutfit
      ? [{
          id: "inspiration-outfit",
          type: "studio",
          position: { x: 380, y: 170 },
          data: {
            kind: "image",
            title: "换装生成",
            subtitle: template.outfitModel === "vapeur-gpt-image-2" ? "GPT Image 2 · Vapeur" : "GPT Image 2 · Azure",
            model: template.outfitModel || "gpt-image-2",
            prompt: template.outfitPrompt || "",
            negativePrompt: template.outfitNegativePrompt || template.negativePrompt || "",
            aspectRatio: ratio,
            resolution: template.outfitResolution || "2k",
            quality: template.outfitQuality || "high",
            count: 1,
            outputFormat: "png",
            preserveSubject: true,
            useNegativePrompt: true,
            allowText: false,
            backendGenerationPath: template.outfitGenerationPath || "/api/tasks/image",
            modelConfigPath: template.outfitConfigPath || "models/gpt-image-2/image/outfit-change",
            inputs: [{ id: "generation_input", label: "换装素材", type: "ANY", multiple: true }],
            outputs: [{ id: "image", label: "换装结果", type: "IMAGE" }],
          },
        }]
      : []),
    ...(assetMode !== "none"
      ? [{
          id: "inspiration-digital-asset",
          type: "studio",
          position: { x: 720, y: 430 },
          data: {
            kind: "asset",
            provider: seedance ? "volcengine" : "kling",
            title: "数字资产绑定",
            subtitle: assetMode === "required" ? "必须绑定" : "可选绑定",
            assetMethod: seedance ? "face-image" : "platform-reference",
            remakeEditable: true,
            remakeRequired: assetMode === "required",
            inputs: [{ id: "reference", label: "人物参考", type: "ANY", multiple: true }],
            outputs: [{ id: "asset_uri", label: seedance ? "reference_image" : "element_id", type: "ASSET_URI" }],
          },
        }]
      : []),
    {
      id: "inspiration-video",
      type: "studio",
      position: { x: withOutfit ? 720 : 380, y: 170 },
      data: {
        kind: "video",
        title: "同款视频生成",
        subtitle: `${minimax ? "MiniMax H3" : model} · ${minimax ? normalizeMiniMaxH3Duration(template.duration) : Number(template.duration || 15)} 秒`,
        model,
        prompt: template.promptText || "",
        negativePrompt: template.negativePrompt || "",
        multiShot: minimax ? false : template.multiShot !== false,
        duration: minimax
          ? normalizeMiniMaxH3Duration(template.duration)
          : Number(template.duration || 15),
        mode: template.mode || "pro",
        ...(minimax
          ? {
              resolution: normalizeMiniMaxH3Resolution(template.resolution),
              ratioMode: normalizeMiniMaxH3RatioMode(template.ratioMode),
              aigcWatermark: Boolean(template.aigcWatermark),
            }
          : {}),
        cfgScale: Number(template.cfgScale ?? 0.8),
        sound: minimax ? false : Boolean(template.sound),
        aspectRatio: ratio,
        backendGenerationPath: template.generationPath || "/api/tasks/video",
        modelConfigPath: template.typeConfigPath || "",
        inputs: [
          { id: "prompt", label: "提示词", type: "TEXT" },
          { id: "image_1", label: "首帧图片", type: "IMAGE" },
          ...(minimax
            ? [
                { id: "last_frame", label: "尾帧图片", type: "IMAGE" },
                { id: "reference_video", label: "参考视频", type: "VIDEO", multiple: true },
                { id: "reference_audio", label: "参考音频", type: "AUDIO", multiple: true },
              ]
            : []),
          ...(assetMode !== "none"
            ? [{ id: seedance ? "trusted_person_asset_1" : "asset", label: "数字资产", type: "ASSET_URI", multiple: true }]
            : []),
        ],
        outputs: [{ id: "video", label: "视频", type: "VIDEO" }],
      },
    },
    {
      id: "inspiration-output",
      type: "studio",
      position: { x: withOutfit ? 1060 : 720, y: 170 },
      data: {
        kind: "output",
        title: "视频输出",
        subtitle: `MP4 · ${ratio}`,
        aspectRatio: ratio,
        inputs: [{ id: "video", label: "成片", type: "VIDEO" }],
      },
    },
  ];
  const edges = [
    withOutfit
      ? { id: "main-outfit", source: "inspiration-main", target: "inspiration-outfit", sourceHandle: "asset", targetHandle: "generation_input", type: "removable" }
      : { id: "main-video", source: "inspiration-main", target: "inspiration-video", sourceHandle: "asset", targetHandle: "image_1", type: "removable" },
    ...(withOutfit
      ? [{ id: "outfit-video", source: "inspiration-outfit", target: "inspiration-video", sourceHandle: "image", targetHandle: "image_1", type: "removable" }]
      : []),
    ...(assetMode !== "none"
      ? [{ id: "asset-video", source: "inspiration-digital-asset", target: "inspiration-video", sourceHandle: "asset_uri", targetHandle: seedance ? "trusted_person_asset_1" : "asset", type: "removable" }]
      : []),
    { id: "video-output", source: "inspiration-video", target: "inspiration-output", sourceHandle: "video", targetHandle: "video", type: "removable" },
  ];
  return { nodes, edges };
};

const number = new Intl.NumberFormat("zh-CN");
const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "从未";
const userTypeMeta = (user) =>
  user?.accountType === "admin"
    ? { className: "admin", label: "管理员" }
    : { className: "free", label: "创作者" };
const formatDuration = (value) => {
  const seconds = Math.max(0, Math.round(Number(value || 0) / 1000));
  if (seconds < 1) return "0 秒";
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return `${minutes}分${String(seconds % 60).padStart(2, "0")}秒`;
  return `${Math.floor(minutes / 60)}小时${String(minutes % 60).padStart(2, "0")}分`;
};
const formatSampledDuration = (value, sampleCount) =>
  Number(sampleCount || 0) > 0 ? formatDuration(value) : "—";

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await adminApi.login({ username, password });
      adminSession.set(result.token);
      onLogin(result.admin);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="login-ambient">
        <span />
        <span />
        <span />
      </div>
      <section className="login-form-wrap">
        <form className="login-card" onSubmit={submit}>
          <span className="login-lock">
            <LockKeyhole size={22} />
          </span>
          <h2>管理员登录</h2>
          <label>
            <span>管理员账号</span>
            <input
              aria-label="管理员账号"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            <span>登录密码</span>
            <div className="password-field">
              <input
                aria-label="登录密码"
                autoComplete="current-password"
                type={visible ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                aria-label={visible ? "隐藏密码" : "显示密码"}
                onClick={() => setVisible((current) => !current)}
              >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          {error && <div className="login-error">{error}</div>}
          <button className="admin-primary login-submit" disabled={loading}>
            {loading ? (
              <>
                <LoaderCircle className="spin" size={17} />
                验证中
              </>
            ) : (
              <>
                <ShieldCheck size={17} />
                进入管理后台
              </>
            )}
          </button>
        </form>
      </section>
    </div>
  );
}

function Modal({ title, description, children, onClose, footer }) {
  return (
    <div
      className="admin-modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="admin-modal">
        <div className="admin-modal-head">
          <div>
            <h2>{title}</h2>
          </div>
          <button
            className="admin-icon-button"
            onClick={onClose}
            aria-label={`关闭${title}`}
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="admin-modal-body">{children}</div>
        <div className="admin-modal-footer">{footer}</div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "lime",
  change,
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-head">
        <span>{label}</span>
        <i>
          <Icon size={17} />
        </i>
      </div>
      <strong>{value}</strong>
      <div className="metric-detail">
        <span>{detail}</span>
        {change !== undefined && (
          <b className={change >= 0 ? "up" : "down"}>
            {change >= 0 ? (
              <ArrowUpRight size={12} />
            ) : (
              <ArrowDownRight size={12} />
            )}
            {Math.abs(change)}%
          </b>
        )}
      </div>
    </article>
  );
}

function DashboardPage({ data }) {
  if (!data) return <LoadingBlock />;
  const maxRequests = Math.max(
    1,
    ...data.traffic.series.map((item) => item.requests),
  );
  const today = data.tasks.today || { total: 0, images: 0, videos: 0 };
  return (
    <div className="admin-page">
      <div className="daily-generation-grid">
        <MetricCard
          label="今日生成量"
          value={number.format(today.total)}
          detail="按任务创建时间统计"
          icon={Sparkles}
        />
        <MetricCard
          label="今日图片"
          value={number.format(today.images)}
          detail="图片生成任务"
          icon={ImageIcon}
          tone="blue"
        />
        <MetricCard
          label="今日视频"
          value={number.format(today.videos)}
          detail="视频生成任务"
          icon={Film}
          tone="orange"
        />
      </div>
      <div className="generation-time-grid">
        <MetricCard
          label="成功任务累计耗时"
          value={formatDuration(data.generationTimes?.tasks?.totalMs)}
          detail={`${data.generationTimes?.tasks?.count || 0} 个图片 / 视频任务`}
          icon={Clock3}
        />
        <MetricCard
          label="图片平均生成"
          value={formatSampledDuration(
            data.generationTimes?.tasks?.byType?.image?.averageMs,
            data.generationTimes?.tasks?.byType?.image?.count,
          )}
          detail={`${data.generationTimes?.tasks?.byType?.image?.count || 0} 张成功图片`}
          icon={ImageIcon}
          tone="blue"
        />
        <MetricCard
          label="视频平均生成"
          value={formatSampledDuration(
            data.generationTimes?.tasks?.byType?.video?.averageMs,
            data.generationTimes?.tasks?.byType?.video?.count,
          )}
          detail={`${data.generationTimes?.tasks?.byType?.video?.count || 0} 条成功视频`}
          icon={Film}
          tone="orange"
        />
        <MetricCard
          label="工作流平均耗时"
          value={formatSampledDuration(
            data.generationTimes?.workflows?.averageMs,
            data.generationTimes?.workflows?.count,
          )}
          detail={`${data.generationTimes?.workflows?.count || 0} 条成功工作流`}
          icon={Zap}
          tone="violet"
        />
      </div>
      <div className="metrics-grid">
        <MetricCard
          label="24H API 请求"
          value={number.format(data.traffic.total24h)}
          detail={`近 5 分钟 ${data.traffic.active5m} 次`}
          icon={Activity}
          change={data.traffic.change24h}
        />
        <MetricCard
          label="请求成功率"
          value={`${data.traffic.successRate}%`}
          detail={`错误率 ${data.traffic.errorRate}%`}
          icon={CheckCircle2}
          tone="blue"
        />
        <MetricCard
          label="平均响应耗时"
          value={`${data.traffic.avgLatency}ms`}
          detail="所有 API 接口"
          icon={Clock3}
          tone="violet"
        />
        <MetricCard
          label="活跃生成任务"
          value={number.format(data.tasks.active)}
          detail={`累计完成 ${data.tasks.succeeded}`}
          icon={Zap}
          tone="orange"
        />
      </div>
      <div className="dashboard-grid">
        <section className="admin-card traffic-card">
          <CardHead
            title="24 小时流量趋势"
            subtitle="每 2 小时请求量与失败请求"
            tag="LIVE"
          />
          <div className="traffic-chart">
            {data.traffic.series.map((item) => (
              <div className="traffic-column" key={item.label}>
                <div className="traffic-bars">
                  <i
                    style={{
                      height: `${Math.max(4, (item.requests / maxRequests) * 100)}%`,
                    }}
                  />
                  <b
                    style={{
                      height: `${Math.max(0, (item.failures / maxRequests) * 100)}%`,
                    }}
                  />
                </div>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            <span>
              <i />
              请求
            </span>
            <span>
              <i className="failure" />
              失败
            </span>
          </div>
        </section>
        <section className="admin-card platform-card">
          <CardHead title="平台资产" subtitle="用户、积分与模版规模" />
          <div className="asset-stats">
            <div>
              <span>
                <Users size={16} />
              </span>
              <p>用户总数</p>
              <strong>{data.users.total}</strong>
              <small>{data.users.active} 个正常</small>
            </div>
            <div>
              <span>
                <Coins size={16} />
              </span>
              <p>积分余额</p>
              <strong>{number.format(data.points.balance)}</strong>
              <small>{data.points.changes} 条流水</small>
            </div>
            <div>
              <span>
                <LayoutTemplate size={16} />
              </span>
              <p>模版数量</p>
              <strong>{data.templates.total}</strong>
              <small>{data.templates.custom} 个自定义</small>
            </div>
            <div>
              <span>
                <Activity size={16} />
              </span>
              <p>生成任务</p>
              <strong>{data.tasks.total}</strong>
              <small>{data.tasks.failed} 个失败</small>
            </div>
          </div>
        </section>
        <section className="admin-card routes-card">
          <CardHead
            title="接口流量排行"
            subtitle="过去 24 小时调用量最高的接口"
          />
          <div className="route-table">
            <div className="table-head">
              <span>接口</span>
              <span>请求</span>
              <span>耗时</span>
              <span>错误率</span>
            </div>
            {data.traffic.routes.length ? (
              data.traffic.routes.map((route) => (
                <div className="route-row" key={route.route}>
                  <code>{route.route}</code>
                  <strong>{route.requests}</strong>
                  <span>{route.avgLatency}ms</span>
                  <b className={route.errorRate ? "danger" : ""}>
                    {route.errorRate}%
                  </b>
                </div>
              ))
            ) : (
              <EmptyInline text="等待产生 API 流量" />
            )}
          </div>
        </section>
        <section className="admin-card routes-card">
          <CardHead
            title="失败原因"
            subtitle="近 24 小时生成失败分类"
            tag={`${data.tasks.failures24h?.total || 0} 条`}
          />
          <div className="route-table">
            <div className="table-head">
              <span>原因</span>
              <span>数量</span>
              <span>处理</span>
              <span>占比</span>
            </div>
            {data.tasks.failures24h?.categories?.length ? (
              data.tasks.failures24h.categories.map((item) => (
                <div className="route-row" key={item.category}>
                  <code>{item.label}</code>
                  <strong>{item.count}</strong>
                  <span>
                    {[
                      "rate_limit",
                      "timeout",
                      "network",
                      "provider_unavailable",
                    ].includes(item.category)
                      ? "可重试"
                      : "需处理"}
                  </span>
                  <b>
                    {Math.round(
                      (item.count / data.tasks.failures24h.total) * 100,
                    )}
                    %
                  </b>
                </div>
              ))
            ) : (
              <EmptyInline text="近 24 小时无生成失败" />
            )}
          </div>
        </section>
        <section className="admin-card providers-card">
          <CardHead title="服务配置状态" subtitle="凭证与基础配置" />
          <div className="provider-list">
            <Provider
              name="Kling 3.0"
              provider="可灵"
              ready={data.providers.kling.configured}
            />
            <Provider
              name="GPT Image 2"
              provider="Image2 图片模型"
              ready={data.providers.image2?.configured}
              note={
                data.providers.image2?.configured
                  ? "文生图 / 多图编辑"
                  : "待配置"
              }
            />
            <Provider
              name="MiniMax H3"
              provider="MiniMax 视频"
              ready={data.providers.minimax?.configured}
              note={data.providers.minimax?.configured ? "视频生成 V2" : "待配置"}
            />
            <Provider
              name="GPT 5.5"
              provider="主页提示词润色 · Vapeur"
              ready={data.providers.vapeur.configured}
              note={data.providers.vapeur.textModel || "gpt-5.5"}
            />
            <Provider
              name="Seedance 2.0 Fast"
              provider="火山方舟"
              ready={data.providers.volcengine.ready}
              readyLabel="已验证"
              note={
                data.providers.volcengine.ready
                  ? "推理可用"
                  : data.providers.volcengine.error || "待配置"
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Provider({ name, provider, ready, note, readyLabel = "已配置" }) {
  return (
    <div className="provider-row">
      <span className={ready ? "ready" : "warning"}>
        <Server size={16} />
      </span>
      <div>
        <strong>{name}</strong>
        <small>{provider}</small>
      </div>
      <b className={ready ? "online" : "pending"}>
        <i />
        {ready ? readyLabel : "需要处理"}
      </b>
      {note && <em title={note}>{note}</em>}
    </div>
  );
}

const MODEL_HEALTH_FILTERS = [
  { id: "all", label: "全部" },
  { id: "healthy", label: "可用" },
  { id: "warning", label: "需关注" },
  { id: "unavailable", label: "不可用" },
];

const modelStatusMeta = (value, kind = "health") => {
  const status = String(value ?? "").trim().toLowerCase();
  if (["true", "ready", "ok", "healthy", "available", "online", "deployed", "configured", "authenticated", "visible", "passed", "success"].includes(status))
    return { tone: "healthy", label: kind === "visibility" ? "可见" : kind === "auth" ? "已通过" : kind === "deployment" ? "已部署" : "可用" };
  if (["warning", "degraded", "partial", "unknown", "unchecked", "pending", "checking", "configured_only"].includes(status))
    return { tone: "warning", label: status === "checking" ? "检测中" : status === "pending" ? "待检测" : "需关注" };
  if (["false", "failed", "error", "unhealthy", "unavailable", "offline", "missing", "disabled", "unauthenticated", "hidden", "not_visible", "not_configured"].includes(status))
    return { tone: "unavailable", label: kind === "visibility" ? "不可见" : kind === "auth" ? "未通过" : kind === "deployment" ? "未部署" : "不可用" };
  return { tone: "warning", label: "未检测" };
};

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);
const asPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
};
const displayPercent = (value) => {
  const numeric = asPercent(value);
  return numeric === null ? "—" : `${numeric.toFixed(numeric % 1 ? 1 : 0)}%`;
};
const displayMetricDuration = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "—";
  if (numeric < 1000) return `${Math.round(numeric)}ms`;
  if (numeric < 60_000) return `${(numeric / 1000).toFixed(numeric < 10_000 ? 1 : 0)}秒`;
  return formatDuration(numeric);
};
const redactModelDiagnostic = (value) => {
  if (!value) return "—";
  return String(value)
    .replace(/https?:\/\/[^\s)\]}>]+/gi, "[上游地址]")
    .replace(/\b(bearer|api[-_ ]?key|access[-_ ]?token|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[已隐藏]")
    .slice(0, 96);
};

function normalizeModelDeployment(item, index) {
  const deploymentValue = firstDefined(item.deploymentStatus, item.deployment?.configured, item.configured, item.deployed);
  const authValue = firstDefined(item.authStatus, item.authenticationStatus, item.deployment?.authenticated, item.authenticated, item.auth?.ok, item.authentication?.ok);
  const visibilityValue = firstDefined(item.modelVisibility, item.visibilityStatus, item.deployment?.modelAvailable, item.modelVisible, item.visible, item.model?.visible);
  const explicitHealth = firstDefined(item.health, item.healthStatus, item.status, item.deployment?.status, item.readinessStatus, item.ready);
  const deployment = modelStatusMeta(deploymentValue, "deployment");
  const auth = modelStatusMeta(authValue, "auth");
  const visibility = modelStatusMeta(visibilityValue, "visibility");
  let health = modelStatusMeta(explicitHealth, "health");
  if (explicitHealth === undefined || explicitHealth === null) {
    const tones = [deployment.tone, auth.tone, visibility.tone];
    health = tones.includes("unavailable")
      ? { tone: "unavailable", label: "不可用" }
      : tones.includes("warning")
        ? { tone: "warning", label: "需关注" }
        : { tone: "healthy", label: "可用" };
  }
  if (item.usable === true) health = { tone: "healthy", label: "可用" };
  if (item.usable === false && health.tone === "healthy") health = { tone: "unavailable", label: "不可用" };
  const lastFailure = firstDefined(item.lastFailure, item.latestFailure, item.lastError, {
    at: item.metrics?.lastFailureAt,
    message: item.deployment?.lastErrorMessage,
    code: item.deployment?.lastErrorCode,
  });
  return {
    id: firstDefined(item.id, item.deploymentId, item.modelId, `${item.provider || "provider"}-${index}`),
    model: firstDefined(item.modelName, item.model, item.name, item.modelId, "未命名模型"),
    provider: firstDefined(item.providerName, item.provider, item.vendor, "—"),
    type: firstDefined(item.typeLabel, item.modelType, item.type, item.kind, item.capability, "—"),
    deployment,
    auth,
    visibility,
    health,
    requests: Number(firstDefined(item.requestCount, item.requests, item.metrics?.requestCount, item.metrics?.requests, 0)) || 0,
    successRate: firstDefined(item.successRate, item.metrics?.successRate),
    failureRate: firstDefined(item.failureRate, item.errorRate, item.metrics?.failureRate, item.metrics?.errorRate),
    averageMs: firstDefined(item.averageDurationMs, item.avgDurationMs, item.averageLatencyMs, item.avgLatencyMs, item.metrics?.avgDurationMs, item.metrics?.averageMs, item.metrics?.avgLatencyMs),
    p95Ms: firstDefined(item.p95DurationMs, item.p95LatencyMs, item.metrics?.p95DurationMs, item.metrics?.p95Ms, item.metrics?.p95LatencyMs),
    lastFailureAt: firstDefined(lastFailure.at, lastFailure.createdAt, lastFailure.time, item.lastFailureAt, item.lastErrorAt),
    lastFailure: redactModelDiagnostic(firstDefined(lastFailure.message, lastFailure.reason, lastFailure.code, typeof lastFailure === "string" ? lastFailure : null, item.lastFailureMessage)),
    checkedAt: firstDefined(item.checkedAt, item.deployment?.checkedAt, item.lastCheckedAt, item.readinessCheckedAt),
  };
}

function ModelStatusChip({ meta }) {
  return (
    <span className={`model-status-chip ${meta.tone}`}>
      <i />
      {meta.label}
    </span>
  );
}

function ModelsApiPage({ notify }) {
  const [windowDays, setWindowDays] = useState(7);
  const [healthFilter, setHealthFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const pageSize = 50;

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const payload = await adminApi.modelDeployments({ windowDays, page, pageSize });
      setResult(payload);
    } catch (loadError) {
      setError(loadError.message || "模型指标加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, windowDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const runChecks = async () => {
    setChecking(true);
    try {
      await adminApi.runModelReadinessChecks({ windowDays });
      await load({ quiet: true });
      notify("模型连通性检测已完成");
    } catch (checkError) {
      notify(checkError.message || "模型连通性检测失败", "error");
    } finally {
      setChecking(false);
    }
  };

  const models = useMemo(
    () => (Array.isArray(result?.data) ? result.data : []).map(normalizeModelDeployment),
    [result],
  );
  const sortedModels = useMemo(() => {
    const order = { healthy: 0, warning: 1, unavailable: 2 };
    return models
      .filter((model) => healthFilter === "all" || model.health.tone === healthFilter)
      .sort((left, right) => (order[left.health.tone] - order[right.health.tone]) || right.requests - left.requests || String(left.model).localeCompare(String(right.model), "zh-CN"));
  }, [healthFilter, models]);
  const localSummary = useMemo(() => ({
    total: models.length,
    healthy: models.filter((item) => item.health.tone === "healthy").length,
    abnormal: models.filter((item) => item.health.tone !== "healthy").length,
    requests: models.reduce((total, item) => total + item.requests, 0),
    successes: models.reduce((total, item) => total + item.requests * ((asPercent(item.successRate) || 0) / 100), 0),
    weightedMs: models.reduce((total, item) => total + item.requests * (Number(item.averageMs) || 0), 0),
    durationRequests: models.reduce((total, item) => {
      const duration = Number(item.averageMs);
      return total + (Number.isFinite(duration) && duration >= 0 ? item.requests : 0);
    }, 0),
  }), [models]);
  const summary = result?.summary || {};
  const totalRequests = Number(firstDefined(summary.requestCount, summary.requests, summary.totalRequests, localSummary.requests)) || 0;
  const overallSuccessRate = firstDefined(summary.successRate, summary.metrics?.successRate, totalRequests ? (localSummary.successes / totalRequests) * 100 : null);
  const averageMs = firstDefined(
    summary.averageDurationMs,
    summary.avgDurationMs,
    summary.avgLatencyMs,
    summary.metrics?.averageMs,
    localSummary.durationRequests ? localSummary.weightedMs / localSummary.durationRequests : null,
  );
  const totalModels = Number(firstDefined(summary.total, summary.totalModels, result?.pagination?.total, localSummary.total)) || 0;
  const healthyModels = Number(firstDefined(summary.healthy, summary.available, summary.usable, summary.healthyModels, localSummary.healthy)) || 0;
  const abnormalModels = Number(firstDefined(summary.abnormal, summary.unavailable, summary.problematic, summary.unhealthyModels, Math.max(0, totalModels - healthyModels), localSummary.abnormal)) || 0;
  const pagination = result?.pagination || {};
  const currentPage = Number(pagination.page || page) || 1;
  const totalPages = Math.max(1, Number(pagination.totalPages || Math.ceil(totalModels / (Number(pagination.pageSize) || pageSize))) || 1);
  const apiSummary = result?.apiMetrics?.summary || {};
  const apiRoutes = Array.isArray(result?.apiMetrics?.routes) ? result.apiMetrics.routes : [];

  return (
    <div className="admin-page model-api-page">
      <div className="model-api-heading">
        <div>
          <span className="admin-eyebrow">DEPLOYMENT STATUS</span>
          <h1>模型与 API</h1>
        </div>
        <div className="model-api-heading-actions">
          <div className="model-window-switch" aria-label="指标统计周期">
            {[7, 30].map((days) => (
              <button
                key={days}
                className={windowDays === days ? "active" : ""}
                onClick={() => { setPage(1); setWindowDays(days); }}
              >
                {days} 天
              </button>
            ))}
          </div>
          <button className="admin-primary" disabled={checking || loading} onClick={runChecks}>
            {checking ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
            {checking ? "检测中" : "重新检测"}
          </button>
        </div>
      </div>

      {error ? (
        <section className="model-api-error" role="alert">
          <Activity size={20} />
          <div><strong>指标接口不可用</strong><span>{redactModelDiagnostic(error)}</span></div>
          <button onClick={() => load()}>重试</button>
        </section>
      ) : loading && !result ? (
        <LoadingBlock />
      ) : (
        <>
          <section className="model-summary-grid" aria-label="模型 API 概览">
            <MetricCard label="部署模型" value={number.format(totalModels)} detail={`${windowDays} 天窗口`} icon={Server} />
            <MetricCard label="综合可用" value={number.format(healthyModels)} detail={`${abnormalModels} 个需关注`} icon={CheckCircle2} tone="blue" />
            <MetricCard label="API 请求" value={number.format(totalRequests)} detail={`成功率 ${displayPercent(overallSuccessRate)}`} icon={Activity} tone="violet" />
            <MetricCard label="平均生成" value={displayMetricDuration(averageMs)} detail={`统计至 ${formatDate(result?.checkedAt)}`} icon={Clock3} tone="orange" />
          </section>

          <section className="admin-card model-deployment-card">
            <div className="model-table-toolbar">
              <div className="model-health-filters" aria-label="模型健康状态筛选">
                {MODEL_HEALTH_FILTERS.map((filter) => (
                  <button key={filter.id} className={healthFilter === filter.id ? "active" : ""} onClick={() => setHealthFilter(filter.id)}>
                    {filter.label}
                    {filter.id !== "all" && <b>{models.filter((item) => item.health.tone === filter.id).length}</b>}
                  </button>
                ))}
              </div>
              <span>{sortedModels.length} 个模型 · 可用优先</span>
            </div>
            <div className="model-table-scroll">
              <table className="admin-table model-deployment-table">
                <thead><tr><th>模型</th><th>Provider</th><th>类型</th><th>部署状态</th><th>鉴权</th><th>模型可见</th><th>请求量</th><th>成功率</th><th>失败率</th><th>平均</th><th>P95 耗时</th><th>最近失败</th><th>最近检测</th></tr></thead>
                <tbody>
                  {sortedModels.map((model) => (
                    <tr key={model.id} className={`model-health-row ${model.health.tone}`}>
                      <td><div className="model-name-cell"><ModelStatusChip meta={model.health} /><strong>{model.model}</strong></div></td>
                      <td>{model.provider}</td>
                      <td><span className="model-type-chip">{model.type}</span></td>
                      <td><ModelStatusChip meta={model.deployment} /></td>
                      <td><ModelStatusChip meta={model.auth} /></td>
                      <td><ModelStatusChip meta={model.visibility} /></td>
                      <td className="model-number-cell">{number.format(model.requests)}</td>
                      <td className="model-rate-success">{displayPercent(model.successRate)}</td>
                      <td className={Number(asPercent(model.failureRate)) > 0 ? "model-rate-failure" : ""}>{displayPercent(model.failureRate)}</td>
                      <td>{displayMetricDuration(model.averageMs)}</td>
                      <td>{displayMetricDuration(model.p95Ms)}</td>
                      <td><div className="model-last-failure" title={model.lastFailure}><strong>{model.lastFailure}</strong>{model.lastFailureAt && <small>{formatDate(model.lastFailureAt)}</small>}</div></td>
                      <td>{formatDate(model.checkedAt || result?.checkedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!sortedModels.length && <EmptyInline text={healthFilter === "all" ? "尚无已部署模型" : "当前筛选没有模型"} />}
            </div>
            {totalPages > 1 && (
              <div className="model-pagination">
                <button disabled={currentPage <= 1 || loading} onClick={() => setPage(Math.max(1, currentPage - 1))}>上一页</button>
                <span>{currentPage} / {totalPages}</span>
                <button disabled={currentPage >= totalPages || loading} onClick={() => setPage(Math.min(totalPages, currentPage + 1))}>下一页</button>
              </div>
            )}
          </section>

          <section className="admin-card api-route-card">
            <div className="model-table-toolbar">
              <strong>站内 API</strong>
              <span>
                {number.format(Number(apiSummary.requestCount || 0))} 次请求 · HTTP 失败率 {displayPercent(apiSummary.failureRate)} · 平均 {displayMetricDuration(apiSummary.avgLatencyMs)}
              </span>
            </div>
            <div className="model-table-scroll">
              <table className="admin-table api-route-table">
                <thead><tr><th>方法</th><th>路由</th><th>请求量</th><th>失败量</th><th>失败率</th><th>平均响应</th><th>P95 响应</th><th>最近请求</th></tr></thead>
                <tbody>
                  {apiRoutes.map((route) => (
                    <tr key={`${route.method}-${route.route}`}>
                      <td><span className="api-method-chip">{route.method || "GET"}</span></td>
                      <td><code>{route.route || "—"}</code></td>
                      <td>{number.format(Number(route.requestCount || 0))}</td>
                      <td>{number.format(Number(route.failureCount || 0))}</td>
                      <td className={Number(asPercent(route.failureRate)) > 0 ? "model-rate-failure" : ""}>{displayPercent(route.failureRate)}</td>
                      <td>{displayMetricDuration(route.avgLatencyMs)}</td>
                      <td>{displayMetricDuration(route.p95LatencyMs)}</td>
                      <td>{formatDate(route.lastRequestAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!apiRoutes.length && <EmptyInline text="当前周期暂无站内 API 请求" />}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function UsersPage({ users, onCreate, onToggle, onPoints, onOpen }) {
  const [query, setQuery] = useState("");
  const visible = users.filter((user) =>
    `${user.name} ${user.contact} ${user.plan}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="admin-page">
      <PageTitle
        action={
          <button className="admin-primary" onClick={onCreate}>
            <UserRoundPlus size={16} />
            新增用户
          </button>
        }
      />
      <div className="table-toolbar">
        <div className="admin-search">
          <Search size={15} />
          <input
            aria-label="搜索用户"
            placeholder="搜索名称、联系方式或套餐"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span>
          {visible.length} / {users.length} 个用户
        </span>
      </div>
      <section className="admin-card data-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>用户</th>
              <th>用户类型</th>
              <th>模版权限</th>
              <th>状态</th>
              <th>套餐</th>
              <th>积分余额</th>
              <th>生成次数</th>
              <th>最近活跃</th>
              <th>快捷操作</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((user) => {
              const type = userTypeMeta(user);
              return (
                <tr
                  className="clickable-user-row"
                  key={user.id}
                  onClick={() => onOpen(user)}
                >
                  <td>
                    <div className="user-cell">
                      <span>{user.name.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <strong>{user.name}</strong>
                        <small>{user.contact || "未填写联系方式"}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`user-type-chip ${type.className}`}>
                      {type.label}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`inspiration-access-chip ${user.templateAccess ? "enabled" : "disabled"}`}
                    >
                      {user.templateAccess ? "已开通" : "未开通"}
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={user.status} />
                  </td>
                  <td>
                    <span className="plan-tag">{user.plan}</span>
                  </td>
                  <td>
                    <strong className="points-value">
                      {number.format(user.pointsBalance)}
                    </strong>
                  </td>
                  <td>{number.format(user.totalGenerated || 0)}</td>
                  <td>{formatDate(user.lastActiveAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onPoints(user);
                        }}
                      >
                        <CircleDollarSign size={14} />
                        积分
                      </button>
                      <button
                        className={
                          user.status === "active"
                            ? "danger-soft"
                            : "success-soft"
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggle(user);
                        }}
                      >
                        {user.status === "active" ? "停用" : "启用"}
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(user);
                        }}
                      >
                        <Eye size={14} />
                        详情
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && <EmptyInline text="没有匹配的用户" />}
      </section>
    </div>
  );
}

const taskStatusLabel = {
  submitting: "提交中",
  queued: "排队中",
  processing: "生成中",
  succeeded: "已完成",
  failed: "失败",
};

function UserDetailDrawer({
  user,
  onClose,
  onPassword,
  onDelete,
  onToggleInspiration,
  notify,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    adminApi
      .user(user.id)
      .then((result) => active && setDetail(result))
      .catch((error) => notify(error.message, "error"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user.id, notify]);
  const data = detail?.user || user;
  const stats = detail?.stats || {};
  const type = userTypeMeta(data);
  return (
    <div
      className="admin-user-drawer-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside className="admin-user-drawer">
        <header className="user-drawer-head">
          <div className="user-detail-identity">
            <span>{data.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <small>USER PROFILE</small>
              <h2>{data.name}</h2>
              <p>
                {data.contact || "未填写联系方式"} · {data.plan}
              </p>
            </div>
          </div>
          <button
            className="admin-icon-button"
            onClick={onClose}
            aria-label="关闭用户详情"
            title="关闭"
          >
            <X size={18} />
          </button>
        </header>
        {loading ? (
          <LoadingBlock />
        ) : (
          <div className="user-drawer-content">
            <section className="user-visual-stats">
              <div>
                <Coins size={16} />
                <span>积分余额</span>
                <strong>{number.format(data.pointsBalance || 0)}</strong>
              </div>
              <div>
                <Film size={16} />
                <span>生成任务</span>
                <strong>{stats.tasks || 0}</strong>
              </div>
              <div>
                <CheckCircle2 size={16} />
                <span>完成结果</span>
                <strong>{stats.succeeded || 0}</strong>
              </div>
              <div>
                <Activity size={16} />
                <span>运行中</span>
                <strong>{stats.active || 0}</strong>
              </div>
              <div>
                <LayoutTemplate size={16} />
                <span>工作流模版</span>
                <strong>{stats.templates || 0}</strong>
              </div>
              <div>
                <CircleDollarSign size={16} />
                <span>累计消耗</span>
                <strong>{stats.pointsConsumed || 0}</strong>
              </div>
            </section>
            <section className="user-account-actions">
              <div>
                <StatusBadge status={data.status} />
                <span className={`user-type-chip ${type.className}`}>
                  {type.label}
                </span>
                <span
                  className={`inspiration-access-chip ${data.templateAccess ? "enabled" : "disabled"}`}
                >
                  模版 · {data.templateAccess ? "已开通" : "未开通"}
                </span>
                <span>
                  注册于 {formatDate(data.createdAt)} · 最近活跃{" "}
                  {formatDate(data.lastActiveAt)}
                </span>
              </div>
              <div>
                {data.accountType !== "admin" && (
                  <button
                    className={
                      data.templateAccess ? "danger-soft" : "access-enable"
                    }
                    onClick={() => onToggleInspiration(data)}
                  >
                    {data.templateAccess ? (
                      <LockKeyhole size={14} />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    {data.templateAccess ? "降为创作者" : "升级模版权限"}
                  </button>
                )}
                <button onClick={() => onPassword(data)}>
                  <KeyRound size={14} />
                  修改密码
                </button>
                <button
                  className="danger"
                  disabled={data.id === "workspace-owner"}
                  onClick={() => onDelete(data)}
                >
                  <UserRoundX size={14} />
                  删除用户
                </button>
              </div>
            </section>
            <section className="user-generation-section">
              <div className="user-section-head">
                <div>
                  <h3>生成路径与结果</h3>
                  <p>按时间查看输入、模型处理、输出结果和失败原因</p>
                </div>
                <span>{detail.tasks.length} 条</span>
              </div>
              {detail.tasks.length ? (
                <div className="user-task-list">
                  {detail.tasks.map((task) => (
                    <UserTaskCard key={task.id} task={task} />
                  ))}
                </div>
              ) : (
                <EmptyInline text="该用户还没有生成任务" />
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function UserTaskCard({ task }) {
  const source =
    task.sourceType === "image"
      ? `${task.imageInputs?.length || 1} 张图片`
      : task.sourceType === "video"
        ? "参考视频"
        : "文本提示词";
  const isImageTask =
    task.outputType === "image" ||
    task.taskType === "image-generation" ||
    Boolean(task.imageUrl);
  const model = isImageTask
    ? "GPT Image 2"
    : task.provider === "volcengine"
      ? String(task.modelName).includes("-fast-")
        ? "Seedance 2.0 Fast"
        : "Seedance 2.0"
      : task.provider === "minimax" || task.modelName === "minimax-h3"
        ? "MiniMax H3"
      : task.modelName === "kling-v3-omni"
        ? "Kling 3.0 Omni"
        : task.modelName === "kling-v3-turbo"
          ? `Kling 3.0 Turbo · ${String(task.mode || "1080p").toUpperCase()}`
          : "Kling 3.0";
  const resultUrl = task.videoUrl || task.imageUrl || "";
  return (
    <article className={`user-task-card status-${task.status}`}>
      <div className="user-task-preview">
        {resultUrl && task.videoUrl ? (
          <video
            src={resultUrl}
            poster={task.coverUrl || undefined}
            controls
            preload="metadata"
            playsInline
          />
        ) : resultUrl ? (
          <img src={resultUrl} alt={task.fileName} />
        ) : task.coverUrl ? (
          <img src={task.coverUrl} alt={task.fileName} />
        ) : (
          <div>
            <FolderOutput size={24} />
            <span>{taskStatusLabel[task.status] || task.status}</span>
          </div>
        )}
        {!isImageTask && <b>{task.duration || 15}s</b>}
      </div>
      <div className="user-task-main">
        <div className="user-task-title">
          <div>
            <strong>{task.fileName || "未命名任务"}</strong>
            <small>
              {formatDate(task.createdAt)} · {task.aspectRatio || "9:16"}
            </small>
          </div>
          <span className={task.status}>
            {taskStatusLabel[task.status] || task.status}
          </span>
        </div>
        <div className="generation-path">
          <div>
            <ImageIcon size={13} />
            <span>{source}</span>
          </div>
          <i>→</i>
          <div>
            <Server size={13} />
            <span>{model}</span>
          </div>
          <i>→</i>
          <div>
            <FolderOutput size={13} />
            <span>
              {task.status === "succeeded"
                ? isImageTask
                  ? "图片结果"
                  : "MP4 结果"
                : taskStatusLabel[task.status] || "处理中"}
            </span>
          </div>
        </div>
        <p className="user-task-prompt">{task.prompt || "无提示词记录"}</p>
        {task.error && <div className="user-task-error">{task.error}</div>}
        <div className="user-task-meta">
          <span>任务 ID · {task.id.slice(0, 8)}</span>
          <span>
            {isImageTask
              ? `${String(task.resolution || "2k").toUpperCase()} · ${task.quality || "high"}`
              : task.provider === "volcengine"
                ? `${task.duration || 15}s · ${task.aspectRatio || "9:16"}`
                : `${task.mode?.toUpperCase()} · CFG ${task.cfgScale ?? 0.8}`}
          </span>
          {resultUrl && (
            <a href={resultUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={12} />
              打开结果
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function PointsPage({ dashboard, ledger, users, onAdjust }) {
  return (
    <div className="admin-page">
      <PageTitle
        action={
          <button
            className="admin-primary"
            onClick={() => onAdjust(users[0])}
            disabled={!users.length}
          >
            <Plus size={16} />
            积分调整
          </button>
        }
      />
      <div className="points-summary">
        <MetricCard
          label="平台积分余额"
          value={number.format(dashboard?.points.balance || 0)}
          detail="所有用户当前余额"
          icon={Coins}
        />
        <MetricCard
          label="累计发放"
          value={number.format(dashboard?.points.issued || 0)}
          detail="正向积分流水"
          icon={ArrowUpRight}
          tone="blue"
        />
        <MetricCard
          label="累计消耗"
          value={number.format(dashboard?.points.consumed || 0)}
          detail="扣减积分流水"
          icon={ArrowDownRight}
          tone="orange"
        />
        <MetricCard
          label="低余额用户"
          value={dashboard?.users.lowBalance || 0}
          detail="余额不超过 20"
          icon={Activity}
          tone="violet"
        />
      </div>
      <section className="admin-card data-table-card">
        <div className="ledger-title">
          <div>
            <h3>积分流水</h3>
            <p>展示最近 5,000 条积分变动</p>
          </div>
          <span>{ledger.length} 条记录</span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>变动</th>
              <th>变动后余额</th>
              <th>原因</th>
              <th>操作人</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDate(entry.createdAt)}</td>
                <td>
                  <strong>{entry.userName}</strong>
                </td>
                <td>
                  <b
                    className={
                      entry.amount > 0 ? "amount-plus" : "amount-minus"
                    }
                  >
                    {entry.amount > 0 ? "+" : ""}
                    {number.format(entry.amount)}
                  </b>
                </td>
                <td>{number.format(entry.balanceAfter)}</td>
                <td>{entry.reason}</td>
                <td>
                  <span className="operator-tag">{entry.operator}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!ledger.length && <EmptyInline text="还没有积分流水" />}
      </section>
    </div>
  );
}

function TemplatesPage({
  templates,
  onCreate,
  onEdit,
  onToggle,
  onDelete,
  onReview,
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const isPending = (template) =>
    template.visibility !== "team" &&
    ["pending_publish", "pending_delete"].includes(template.approvalStatus);
  const isGlobal = (template) =>
    template.system || template.visibility === "global" || template.public;
  const isTeam = (template) =>
    !template.system && template.visibility === "team";
  const stats = useMemo(() => {
    const nodeTotal = templates.reduce(
      (total, template) =>
        total +
        (Array.isArray(template.nodes)
          ? template.nodes.length
          : Number(template.nodeCount || template.nodes || 0)),
      0,
    );
    return {
      total: templates.length,
      global: templates.filter(isGlobal).length,
      team: templates.filter(isTeam).length,
      private: templates.filter(
        (template) => template.visibility === "private" && !template.system,
      ).length,
      pending: templates.filter(isPending).length,
      disabled: templates.filter((template) => template.enabled === false)
        .length,
      nodeTotal,
    };
  }, [templates]);
  const categoryStats = useMemo(() => {
    const counts = new Map();
    templates.forEach((template) => {
      const category = template.category || "未分类";
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [templates]);
  const pendingTemplates = useMemo(
    () => templates.filter(isPending).slice(0, 4),
    [templates],
  );
  const visible = templates.filter((template) => {
    const matchesQuery =
      `${template.name} ${template.category} ${template.model || ""} ${template.ownerName || ""}`
        .toLowerCase()
        .includes(query.toLowerCase());
    const matchesScope =
      scope === "all" ||
      (scope === "global" && isGlobal(template)) ||
      (scope === "team" && isTeam(template)) ||
      (scope === "private" && template.visibility === "private") ||
      (scope === "pending" && isPending(template)) ||
      (scope === "disabled" && template.enabled === false) ||
      (scope === "rejected" && template.approvalStatus === "rejected");
    return matchesQuery && matchesScope;
  });
  const pendingCount = templates.filter((template) =>
    ["pending_publish", "pending_delete"].includes(template.approvalStatus),
  ).length;
  const approvalLabel = (template) =>
    template.approvalStatus === "pending_publish"
      ? "待发布审批"
      : template.approvalStatus === "pending_delete"
        ? "待删除审批"
        : template.approvalStatus === "rejected"
          ? "已驳回"
            : template.public || template.system
              ? "全域可见"
              : template.visibility === "team"
                ? "团队画布"
                : "个人画布";
  return (
    <div className="admin-page">
      <PageTitle
        action={
          <button className="admin-primary" onClick={onCreate}>
            <Plus size={16} />
            新建空白画布
          </button>
        }
      />
      <section className="template-management-board" aria-label="画布管理看板">
        <div className="template-board-metrics">
          {[
            {
              id: "all",
              label: "画布总量",
              value: stats.total,
              detail: `${stats.nodeTotal} 个工作流节点`,
              icon: LayoutTemplate,
            },
            {
              id: "global",
              label: "全域画布",
              value: stats.global,
              detail: "创作端公开使用",
              icon: Eye,
            },
            {
              id: "team",
              label: "团队画布",
              value: stats.team,
              detail: "团队管理员审批",
              icon: Users,
            },
            {
              id: "private",
              label: "个人画布",
              value: stats.private,
              detail: "仅创建者可见",
              icon: LockKeyhole,
            },
            {
              id: "pending",
              label: "待审批",
              value: stats.pending,
              detail: "发布与删除申请",
              icon: Clock3,
            },
            {
              id: "disabled",
              label: "已下架",
              value: stats.disabled,
              detail: "当前停止展示",
              icon: EyeOff,
            },
          ].map(({ id, label, value, detail, icon: Icon }) => (
            <button
              className={scope === id ? "active" : ""}
              key={id}
              onClick={() => setScope(id)}
            >
              <span>
                <Icon size={16} />
              </span>
              <div>
                <small>{label}</small>
                <strong>{number.format(value)}</strong>
                <p>{detail}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="template-board-detail-grid">
          <article className="template-board-panel">
            <header>
              <div>
                <span className="admin-eyebrow">CATEGORY DISTRIBUTION</span>
                <h3>画布分类结构</h3>
              </div>
              <b>{categoryStats.length} 类</b>
            </header>
            <div className="template-category-bars">
              {categoryStats.map((category) => (
                <div key={category.name}>
                  <span>
                    <strong>{category.name}</strong>
                    <b>{category.count}</b>
                  </span>
                  <i>
                    <em
                      style={{
                        width: `${Math.max(
                          8,
                          (category.count /
                            Math.max(1, categoryStats[0]?.count || 1)) *
                            100,
                        )}%`,
                      }}
                    />
                  </i>
                </div>
              ))}
              {!categoryStats.length && <EmptyInline text="暂无画布分类" />}
            </div>
          </article>
          <article className="template-board-panel review-queue-panel">
            <header>
              <div>
                <span className="admin-eyebrow">REVIEW QUEUE</span>
                <h3>发布审批队列</h3>
              </div>
              <b>{pendingCount} 项</b>
            </header>
            <div className="template-review-queue">
              {pendingTemplates.map((template) => (
                <div key={template.id}>
                  <span>
                    <strong>{template.name}</strong>
                    <small>
                      {template.ownerName || "用户模版"} ·{" "}
                      {template.approvalStatus === "pending_delete"
                        ? "申请删除"
                        : "申请发布"}
                    </small>
                  </span>
                  <button onClick={() => onReview(template, "approve")}>
                    审批
                  </button>
                </div>
              ))}
              {!pendingTemplates.length && (
                <div className="template-review-clear">
                  <CheckCircle2 size={17} />
                  <span>
                    <strong>审批队列已清空</strong>
                    <small>当前没有等待处理的画布申请</small>
                  </span>
                </div>
              )}
            </div>
          </article>
        </div>
      </section>
      <div className="table-toolbar">
        <div className="admin-search">
          <Search size={15} />
          <input
            aria-label="搜索画布"
            placeholder="搜索画布名称、分类或模型"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="template-scope-filters" aria-label="筛选模版状态">
          {[
            ["all", "全部"],
            ["global", "全域"],
            ["team", "团队"],
            ["private", "私人"],
            ["pending", "待审批"],
            ["disabled", "已下架"],
            ["rejected", "已驳回"],
          ].map(([id, label]) => (
            <button
              className={scope === id ? "active" : ""}
              key={id}
              onClick={() => setScope(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span>{visible.length} 个结果</span>
      </div>
      <section className="template-admin-grid">
        {visible.map((template) => {
          const nodeCount = Array.isArray(template.nodes)
            ? template.nodes.length
            : template.nodeCount || template.nodes || 0;
          const pending = ["pending_publish", "pending_delete"].includes(
            template.approvalStatus,
          );
          const teamPending = pending && template.visibility === "team";
          return (
            <article
              className={`admin-template-card ${!template.enabled ? "disabled" : ""} ${pending ? "pending-review" : ""}`}
              key={template.id}
            >
              <div className="template-card-top">
                <span className={template.system ? "system" : "custom"}>
                  {template.system ? (
                    <ShieldCheck size={13} />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  {template.system
                    ? "系统画布"
                    : template.ownerName || "用户画布"}
                </span>
                <b
                  className={`approval-${template.approvalStatus || "approved"}`}
                >
                  <i />
                  {approvalLabel(template)}
                </b>
              </div>
              <div className="template-symbol">
                <LayoutTemplate size={25} />
                <span>{nodeCount}</span>
              </div>
              <small>
                {template.category || "自定义"} ·{" "}
                {template.model || `${nodeCount} 个节点`}
              </small>
              <h3>{template.name}</h3>
              <p>
                {template.description ||
                  (template.system ? "系统内置项目" : "用户项目工作流")}
              </p>
              {pending && (
                <div className="admin-approval-request">
                  <strong>
                    {template.approvalStatus === "pending_publish"
                      ? "申请全域发布"
                      : "申请删除全域模版"}
                  </strong>
                  <span>
                    {formatDate(template.requestedAt || template.updatedAt)}
                  </span>
                </div>
              )}
              <div className="template-admin-actions">
                {template.system ? (
                  <button className="read-only" disabled>
                    <ShieldCheck size={14} />
                    系统全域画布
                  </button>
                ) : teamPending ? (
                  <button className="read-only" disabled>
                    <Clock3 size={14} />
                    等待团队管理员审批
                  </button>
                ) : pending ? (
                  <>
                    <button
                      className="approve"
                      onClick={() => onReview(template, "approve")}
                    >
                      <CheckCircle2 size={14} />
                      {template.approvalStatus === "pending_delete"
                        ? "批准删除"
                        : "批准发布"}
                    </button>
                    <button
                      className="reject"
                      onClick={() => onReview(template, "reject")}
                    >
                      <X size={14} />
                      驳回
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => onEdit(template)}>
                      <Pencil size={14} />
                      画布设置
                    </button>
                    <button onClick={() => onToggle(template)}>
                      {template.enabled ? "停用" : "启用"}
                    </button>
                    <button
                      className="danger-icon"
                      aria-label={`删除画布 ${template.name}`}
                      onClick={() => onDelete(template)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>
      {!visible.length && <EmptyInline text="没有匹配的画布" />}
    </div>
  );
}

function InspirationSettingsPage({
  config,
  hotRankConfig,
  notify,
  onSaved,
  onHotRankSaved,
  section = "templates",
}) {
  const [form, setForm] = useState(config);
  const [rankForm, setRankForm] = useState(hotRankConfig);
  const [saving, setSaving] = useState(false);
  const [rankSaving, setRankSaving] = useState(false);
  const [detailLibrary, setDetailLibrary] = useState(null);
  const [detailQuery, setDetailQuery] = useState("");
  const [detailKind, setDetailKind] = useState("all");
  const [detailPrimary, setDetailPrimary] = useState("all");
  const [detailSecondary, setDetailSecondary] = useState("all");
  const [detailPlatform, setDetailPlatform] = useState("all");
  const [detailPage, setDetailPage] = useState(1);
  const [selectedDetailId, setSelectedDetailId] = useState("");
  const [detailForm, setDetailForm] = useState(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailOpeningId, setDetailOpeningId] = useState("");
  const [detailEditorOpen, setDetailEditorOpen] = useState(false);
  const [detailWorkflowNode, setDetailWorkflowNode] = useState("video");
  const [openingWorkflowCanvas, setOpeningWorkflowCanvas] = useState(false);
  const [globalConfigGroup, setGlobalConfigGroup] = useState("generation");

  useEffect(
    () =>
      setForm(
        config?.modelName === "minimax-h3"
          ? { ...config, ...miniMaxH3Settings(config) }
          : config,
      ),
    [config],
  );
  useEffect(
    () => setRankForm(normalizeMiniMaxHotRankConfig(hotRankConfig)),
    [hotRankConfig],
  );
  useEffect(() => {
    if (section !== "templates") return;
    let active = true;
    const timer = window.setTimeout(() => {
      adminApi
        .detailPageTemplates({
          page: detailPage,
          pageSize: 48,
          query: detailQuery,
          kind: detailKind,
          primaryCategory: detailPrimary,
          secondaryCategory: detailSecondary,
          platform: detailPlatform,
        })
        .then((result) => {
          if (active) setDetailLibrary(result);
        })
        .catch((error) => active && notify(error.message, "error"));
    }, detailQuery.trim() ? 240 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    detailKind,
    detailPage,
    detailPlatform,
    detailPrimary,
    detailQuery,
    detailSecondary,
    notify,
    section,
  ]);
  if (!form || (section === "global" && !rankForm)) return <LoadingBlock />;

  const save = async () => {
    setSaving(true);
    try {
      const normalizedForm =
        form.modelName === "minimax-h3"
          ? { ...form, ...miniMaxH3Settings(form) }
          : form;
      const updated = await adminApi.saveInspirationGenerationConfig({
        ...normalizedForm,
        duration: Number(normalizedForm.duration),
        cfgScale: Number(normalizedForm.cfgScale),
      });
      setForm(updated);
      onSaved(updated);
      notify("全局界面配置已保存并同步到创作端");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const updateRankInput = (patch) =>
    setRankForm((current) => ({
      ...current,
      input: { ...current.input, ...patch },
      ...(patch.requirementPrompt === undefined
        ? {}
        : {
            workflow: {
              ...current.workflow,
              nodes: (current.workflow?.nodes || []).map((item) =>
                item.kind === "prompt"
                  ? { ...item, prompt: patch.requirementPrompt }
                  : item,
              ),
            },
          }),
    }));
  const updateRankWorkflowNode = (id, patch) =>
    setRankForm((current) => {
      const nextNodes = (current.workflow?.nodes || []).map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      );
      const nextPrompt = nextNodes.find((item) => item.kind === "prompt");
      return {
        ...current,
        input: nextPrompt
          ? { ...current.input, requirementPrompt: nextPrompt.prompt }
          : current.input,
        workflow: { ...current.workflow, nodes: nextNodes },
      };
    });
  const updateRankNode = (node, patch) => {
    const workflowId =
      node === "analysis"
        ? "visual-analysis"
        : node === "prompt"
          ? "prompt"
          : "video";
    setRankForm((current) => ({
      ...current,
      nodes: {
        ...current.nodes,
        [node]: { ...current.nodes[node], ...patch },
      },
      workflow: {
        ...current.workflow,
        nodes: (current.workflow?.nodes || []).map((item) =>
          item.id === workflowId ? { ...item, ...patch } : item,
        ),
      },
    }));
  };
  const moveRankWorkflowNode = (id, direction) =>
    setRankForm((current) => {
      const ordered = [...(current.workflow?.nodes || [])].sort(
        (left, right) => left.order - right.order,
      );
      const from = ordered.findIndex((item) => item.id === id);
      const to = from + direction;
      if (
        from < 0 ||
        to < 0 ||
        to >= ordered.length ||
        ordered[from].kind === "video" ||
        ordered[to].kind === "video"
      )
        return current;
      [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
      return {
        ...current,
        workflow: {
          ...current.workflow,
          nodes: ordered.map((item, index) => ({
            ...item,
            order: (index + 1) * 10,
          })),
        },
      };
    });
  const toggleRankWorkflowNode = (id, enabled) => {
    const target = rankForm.workflow?.nodes?.find((item) => item.id === id);
    if (!target || ["prompt", "video"].includes(target.kind)) return;
    const enabledAnalyses = (rankForm.workflow?.nodes || []).filter(
      (item) => item.kind === "analysis" && item.enabled,
    );
    if (!enabled && target.kind === "analysis" && enabledAnalyses.length <= 1)
      return notify("视频分析链路至少保留一个启用节点", "error");
    updateRankWorkflowNode(id, { enabled });
  };
  const rankWorkflowNodes = [...(rankForm?.workflow?.nodes || [])].sort(
    (left, right) => left.order - right.order,
  );
  const saveRank = async () => {
    setRankSaving(true);
    try {
      const updated = await adminApi.saveHotRankRemakeConfig(
        normalizeMiniMaxHotRankConfig(rankForm),
      );
      setRankForm(updated);
      onHotRankSaved?.(updated);
      notify("排行榜一键同款节点流程与参数已保存并同步到前台");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setRankSaving(false);
    }
  };

  const quickPromptPresets = Array.isArray(form.quickPromptPresets)
    ? form.quickPromptPresets
    : ADMIN_QUICK_PROMPT_PRESETS;

  const visibleDetailTemplates = (detailLibrary?.items || []).filter((item) => {
    const query = detailQuery.trim().toLowerCase();
    const queryMatch =
      !query ||
      [
        item.title,
        item.primaryCategory,
        item.secondaryCategory,
        item.platform,
        item.imageType,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    return (
      queryMatch &&
      (detailKind === "all" || item.kind === detailKind) &&
      (detailPrimary === "all" || item.primaryCategory === detailPrimary) &&
      (detailSecondary === "all" ||
        item.secondaryCategory === detailSecondary) &&
      (detailPlatform === "all" || item.platform === detailPlatform)
    );
  });

  const activeDetailPrimary = detailLibrary?.categoryTree?.find(
    (item) => item.label === detailPrimary || item.id === detailPrimary,
  );
  const editingVideoTemplate = detailForm?.kind === "video";
  const editingMaterialTemplate = detailForm?.kind === "material";
  const detailVideoModel = detailForm?.model || "kling-v3-omni";
  const detailVideoConnection = detailVideoModel.includes("seedance")
    ? {
        label: "Seedance 真人认证连接",
        detail: "换装结果接图像端口；数字资产接 trusted_person_asset_1",
      }
    : detailVideoModel === "minimax-h3"
      ? {
          label: "MiniMax H3 多模态连接",
          detail: "普通图片、视频与音频按参考素材接入；不连接真人数字资产或 Element",
        }
    : detailVideoModel === "kling-v3-turbo"
      ? {
          label: "Turbo 首帧连接",
          detail: "换装结果只接 image_1；该模型不接数字资产",
        }
      : detailVideoModel === "kling-v3"
        ? {
            label: "Kling Element 连接",
            detail: "换装结果接 image_1；数字资产转换为 Element 后接 asset",
          }
        : {
            label: "Omni 多模态连接",
            detail: "换装结果接 image_1；数字资产通过 Element 或参考图接 asset",
          };
  const selectedDetailTags = normalizeTemplateTags(detailForm?.tags);
  const materialWorkflowNodes = editingMaterialTemplate
    ? MATERIAL_TEMPLATE_FLOW.map((item) => ({
        ...item,
        node: (detailForm?.nodes || []).find((node) => node.id === item.id),
      })).filter((item) => item.node)
    : [];
  const selectedMaterialWorkflowNode =
    materialWorkflowNodes.find((item) => item.id === detailWorkflowNode) ||
    materialWorkflowNodes[0] ||
    null;
  const updateMaterialWorkflowNode = (nodeId, patch) =>
    setDetailForm((current) => ({
      ...current,
      nodes: (current?.nodes || []).map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...patch } }
          : node,
      ),
    }));
  const detailTagOptions = Array.from(
    new Set(
      [
        ...selectedDetailTags,
        detailForm?.primaryCategory,
        detailForm?.secondaryCategory,
        detailForm?.platform,
        detailForm?.imageType,
        detailForm?.ratio,
        detailForm?.aspectRatio,
        ...ADMIN_TEMPLATE_TAG_PRESETS,
        ...(detailLibrary?.items || []).flatMap((item) =>
          normalizeTemplateTags(item.tags),
        ),
      ].filter(Boolean),
    ),
  ).slice(0, 48);

  const toggleDetailTag = (tag) => {
    const nextTags = selectedDetailTags.includes(tag)
      ? selectedDetailTags.filter((item) => item !== tag)
      : selectedDetailTags.length < 12
        ? [...selectedDetailTags, tag]
        : selectedDetailTags;
    setDetailForm({ ...detailForm, tags: nextTags });
  };

  const detailTemplatePayload = (template = detailForm) => ({
    title: template.title,
    promptText: template.promptText,
    negativePrompt: template.negativePrompt,
    enabled: template.enabled,
    generationPath: template.generationPath,
    typeConfigPath: template.typeConfigPath,
    tags: template.tags,
    model: template.model,
    aspectRatio: template.aspectRatio || template.ratio,
    resolution: template.resolution,
    ratioMode: template.ratioMode,
    aigcWatermark: template.aigcWatermark,
    quality: template.quality,
    count: template.count,
    outputFormat: template.outputFormat,
    preserveSubject: template.preserveSubject,
    useNegativePrompt: template.useNegativePrompt,
    allowText: template.allowText,
    duration: template.duration,
    mode: template.mode,
    cfgScale: template.cfgScale,
    multiShot: template.multiShot,
    sound: template.sound,
    workflowPreset: template.workflowPreset,
    outfitModel: template.outfitModel,
    outfitPrompt: template.outfitPrompt,
    outfitNegativePrompt: template.outfitNegativePrompt,
    outfitResolution: template.outfitResolution,
    outfitQuality: template.outfitQuality,
    outfitConfigPath: template.outfitConfigPath,
    outfitGenerationPath: template.outfitGenerationPath,
    digitalAssetMode: template.digitalAssetMode,
    workflowTemplateId: template.workflowTemplateId,
    description: template.description,
    nodes: template.nodes,
    edges: template.edges,
  });

  const openDetailTemplate = async (item) => {
    setSelectedDetailId(item.id);
    setDetailOpeningId(item.id);
    try {
      const detail = await adminApi.detailPageTemplate(item.id);
      setDetailForm(
        detail.model === "minimax-h3"
          ? { ...detail, ...miniMaxH3Settings(detail, { template: true }) }
          : detail,
      );
      setDetailWorkflowNode(
        detail.kind === "material" ? MATERIAL_TEMPLATE_FLOW[0].id : "video",
      );
      setDetailEditorOpen(true);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setDetailOpeningId("");
    }
  };

  const saveDetailTemplate = async () => {
    if (!detailForm) return;
    setDetailSaving(true);
    try {
      const normalizedDetailForm =
        detailForm.model === "minimax-h3"
          ? {
              ...detailForm,
              ...miniMaxH3Settings(detailForm, { template: true }),
            }
          : detailForm;
      const updated = await adminApi.saveDetailPageTemplate(detailForm.id, {
        ...detailTemplatePayload(normalizedDetailForm),
      });
      setDetailLibrary((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id
                  ? {
                      ...item,
                      title: updated.title,
                      enabled: updated.enabled !== false,
                      ratio: updated.ratio || updated.aspectRatio,
                      aspectRatio: updated.aspectRatio || updated.ratio,
                      model: updated.model,
                      tags: updated.tags,
                      updatedAt: updated.updatedAt,
                    }
                  : item,
              ),
            }
          : current,
      );
      setDetailForm(updated);
      notify(`「${updated.title}」模版配置已保存`);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setDetailSaving(false);
    }
  };

  const openDetailWorkflowCanvas = async () => {
    if (
      !detailForm ||
      !["video", "material"].includes(detailForm.kind)
    )
      return;
    setOpeningWorkflowCanvas(true);
    try {
      const graph =
        detailForm.kind === "material"
          ? {
              nodes: detailForm.nodes || [],
              edges: detailForm.edges || [],
            }
          : templateWorkflowGraph(detailForm);
      const workflowPayload = {
        name: `${detailForm.title} · 模版工作流`,
        description: "从模版后台进入无限画布编辑；保存后同步回模版配置。",
        category: "模版配置",
        visibility: "private",
        enabled: true,
        nodes: graph.nodes,
        edges: graph.edges,
        sourceInspirationConfigId: detailForm.id,
      };
      const workflow =
        detailForm.kind === "material"
          ? await adminApi.updateTemplate(detailForm.id, {
              ...workflowPayload,
              name: detailForm.title,
              description: detailForm.description,
              category: "素材模版",
            })
          : detailForm.workflowTemplateId
            ? await adminApi.updateTemplate(
                detailForm.workflowTemplateId,
                workflowPayload,
              )
            : await adminApi.createTemplate(workflowPayload);
      const nextForm = { ...detailForm, workflowTemplateId: workflow.id };
      if (detailForm.kind !== "material")
        await adminApi.saveDetailPageTemplate(
          detailForm.id,
          detailTemplatePayload(nextForm),
        );
      const session = await adminApi.enterStudio();
      localStorage.setItem("commerce-canvas_user_token", session.token);
      localStorage.setItem("commerce-canvas_current_page", "workflow");
      localStorage.setItem("commerce-canvas_open_workflow_editor", "1");
      localStorage.setItem(
        "commerce-canvas_workflow_draft",
        JSON.stringify({
          schemaVersion: 2,
          savedAt: new Date().toISOString(),
          nodes: workflow.nodes || graph.nodes,
          edges: workflow.edges || graph.edges,
          templateName: workflow.name,
          templateVisibility: "private",
          currentTemplateId: workflow.id,
          sourceInspirationConfigId: detailForm.id,
          draftWorkspaceId: `template-config-${detailForm.id}`,
        }),
      );
      window.location.assign("/#/workflow");
    } catch (error) {
      notify(error.message || "无限画布打开失败", "error");
      setOpeningWorkflowCanvas(false);
    }
  };

  return (
    <div className="admin-page inspiration-config-page">
      {section === "global" && (
      <section className="inspiration-config-card global-config-card">
        <header className="global-config-page-head">
          <div>
            <h2>全局配置中心</h2>
          </div>
        </header>
        <div className="global-config-layout">
          <nav className="global-config-nav" aria-label="全局配置分类">
            {GLOBAL_CONFIG_GROUPS.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className={globalConfigGroup === id ? "active" : ""}
                onClick={() => setGlobalConfigGroup(id)}
                aria-pressed={globalConfigGroup === id}
              >
                <span className="global-config-nav-icon"><Icon size={17} /></span>
                <span className="global-config-nav-copy">
                  <strong>{label}</strong>
                </span>
              </button>
            ))}
          </nav>
          <div className={`global-config-panel global-config-panel-${globalConfigGroup}`}>
            {globalConfigGroup === "generation" && (
              <div className="global-config-section">
                <header><strong>一键同款与视频生成</strong><small>控制模版默认模型、视频参数、换装规则和数字资产路径</small></header>
                <div className="inspiration-config-grid">
                  <label className="admin-field">
                    <span>默认视频模型</span>
                    <select
                      value={form.modelName}
                      onChange={(event) => {
                        const modelName = event.target.value;
                        setForm({
                          ...form,
                          modelName,
                          ...(modelName === "minimax-h3"
                            ? miniMaxH3Settings(form)
                            : {}),
                        });
                      }}
                    >
                      <option value="kling-v3-omni">Kling 3.0 Omni</option>
                      <option value="kling-v3">Kling 3.0</option>
                      <option value="minimax-h3">MiniMax H3</option>
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>视频时长</span>
                    <select
                      value={
                        form.modelName === "minimax-h3"
                          ? normalizeMiniMaxH3Duration(form.duration)
                          : form.duration
                      }
                      onChange={(event) =>
                        setForm({ ...form, duration: Number(event.target.value) })
                      }
                    >
                      {(form.modelName === "minimax-h3"
                        ? Array.from({ length: 12 }, (_, index) => index + 4)
                        : [5, 10, 15]
                      ).map((duration) => (
                        <option value={duration} key={duration}>
                          {duration} 秒
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>画面比例</span>
                    <select
                      value={
                        form.modelName === "minimax-h3"
                          ? normalizeMiniMaxH3Ratio(form.aspectRatio)
                          : form.aspectRatio
                      }
                      onChange={(event) =>
                        setForm({ ...form, aspectRatio: event.target.value })
                      }
                    >
                      {(form.modelName === "minimax-h3"
                        ? MINIMAX_H3_RATIOS
                        : ["9:16", "16:9", "1:1"]
                      ).map((ratio) => (
                        <option value={ratio} key={ratio}>
                          {ratio}
                        </option>
                      ))}
                    </select>
                  </label>
                  {form.modelName === "minimax-h3" ? (
                    <>
                      <label className="admin-field">
                        <span>输出分辨率</span>
                        <select
                          value={normalizeMiniMaxH3Resolution(form.resolution)}
                          onChange={(event) =>
                            setForm({ ...form, resolution: event.target.value })
                          }
                        >
                          {MINIMAX_H3_RESOLUTIONS.map((resolution) => (
                            <option value={resolution} key={resolution}>
                              {resolution}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-field">
                        <span>画幅策略</span>
                        <select
                          value={normalizeMiniMaxH3RatioMode(form.ratioMode)}
                          onChange={(event) =>
                            setForm({ ...form, ratioMode: event.target.value })
                          }
                        >
                          <option value="fixed">文生固定 / 首帧自适应</option>
                          <option value="adaptive">多模态自适应</option>
                        </select>
                      </label>
                      <label className="publish-toggle inspiration-multishot-toggle">
                        <div>
                          <strong>AIGC 水印</strong>
                          <small>输出 MiniMax AIGC 标识</small>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(form.aigcWatermark)}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              aigcWatermark: event.target.checked,
                            })
                          }
                        />
                        <span />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="admin-field">
                        <span>生成模式</span>
                        <select
                          value={form.mode}
                          onChange={(event) =>
                            setForm({ ...form, mode: event.target.value })
                          }
                        >
                          <option value="pro">Pro</option>
                          <option value="std">Standard</option>
                        </select>
                      </label>
                      <label className="admin-field">
                        <span>提示词引导强度</span>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={form.cfgScale}
                          onChange={(event) =>
                            setForm({ ...form, cfgScale: event.target.value })
                          }
                        />
                      </label>
                      <label className="publish-toggle inspiration-multishot-toggle">
                        <div>
                          <strong>智能多镜头</strong>
                          <small>允许模型按模版提示词生成多个镜头</small>
                        </div>
                        <input
                          type="checkbox"
                          checked={form.multiShot}
                          onChange={(event) =>
                            setForm({ ...form, multiShot: event.target.checked })
                          }
                        />
                        <span />
                      </label>
                    </>
                  )}
                </div>
                <label className="admin-field inspiration-prompt-field"><span>默认换装提示词</span><textarea value={form.outfitPrompt} onChange={(event) => setForm({ ...form, outfitPrompt: event.target.value })} /><small>{form.outfitPrompt.length} / 8000</small></label>
              </div>
            )}

            {globalConfigGroup === "rankRemake" && (
              <div className="global-config-section rank-remake-config-section">
                <header>
                  <div>
                    <strong>排行榜一键同款技术链路</strong>
                    <small>前台输入会按这里保存的节点流程进入后台工作流队列，并在任务中心持续回显</small>
                  </div>
                  <label className="publish-toggle rank-remake-master-toggle">
                    <div>
                      <strong>{rankForm.enabled ? "前台已启用" : "前台已停用"}</strong>
                      <small>同时控制千川榜与巨量榜</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={rankForm.enabled}
                      onChange={(event) =>
                        setRankForm({ ...rankForm, enabled: event.target.checked })
                      }
                    />
                    <span />
                  </label>
                </header>

                <div className="rank-remake-copy-grid">
                  <label className="admin-field">
                    <span>前台按钮文字</span>
                    <input
                      maxLength="24"
                      value={rankForm.buttonLabel}
                      onChange={(event) =>
                        setRankForm({ ...rankForm, buttonLabel: event.target.value })
                      }
                    />
                  </label>
                  <label className="admin-field">
                    <span>流程标题</span>
                    <input
                      maxLength="80"
                      value={rankForm.title}
                      onChange={(event) =>
                        setRankForm({ ...rankForm, title: event.target.value })
                      }
                    />
                  </label>
                  <label className="admin-field full">
                    <span>前台流程说明</span>
                    <input
                      maxLength="300"
                      value={rankForm.description}
                      onChange={(event) =>
                        setRankForm({ ...rankForm, description: event.target.value })
                      }
                    />
                  </label>
                </div>

                <div className="rank-remake-flow-editor" aria-label="排行榜同款节点流程">
                  {[
                    { id: "source", label: "榜单原片", fixed: true },
                    ...rankWorkflowNodes.filter((node) => node.enabled),
                    { id: "output", label: "任务中心", fixed: true },
                  ].map((node, index, nodes) => (
                    <React.Fragment key={node.id}>
                      <div className={`rank-remake-flow-node ${node.fixed ? "fixed" : ""}`}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{node.label}</strong>
                        <small>{node.fixed ? "系统节点" : "可配置节点"}</small>
                      </div>
                      {index < nodes.length - 1 && <b className="rank-remake-flow-edge">→</b>}
                    </React.Fragment>
                  ))}
                </div>

                <section className="rank-workflow-builder" aria-label="视频分析节点后台编辑器">
                  <header>
                    <div>
                      <strong>节点顺序、执行路径与提示词</strong>
                      <small>
                        Workflow v{rankForm.schemaVersion || 2} · 修订 {rankForm.workflow?.revision || 1}；保存后新任务按当前顺序生成运行图
                      </small>
                    </div>
                    <span>{rankWorkflowNodes.filter((node) => node.enabled).length} / {rankWorkflowNodes.length} ACTIVE</span>
                  </header>
                  <div className="rank-workflow-node-list">
                    {rankWorkflowNodes.map((node, index) => {
                      const canMoveUp = index > 0 && node.kind !== "video";
                      const canMoveDown =
                        index < rankWorkflowNodes.length - 1 &&
                        node.kind !== "video" &&
                        rankWorkflowNodes[index + 1]?.kind !== "video";
                      const kindLabel =
                        node.kind === "analysis"
                          ? "VIDEO ANALYSIS"
                          : node.kind === "prompt"
                            ? "PROMPT ENGINE"
                            : "VIDEO MODEL";
                      return (
                        <article
                          key={node.id}
                          className={`rank-workflow-config-node ${node.enabled ? "active" : "disabled"}`}
                        >
                          <header>
                            <span className="rank-workflow-node-order">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <strong>{node.label}</strong>
                              <small>{kindLabel} · {node.id}</small>
                            </div>
                            <div className="rank-workflow-node-actions">
                              <button
                                type="button"
                                aria-label={`上移 ${node.label}`}
                                disabled={!canMoveUp}
                                onClick={() => moveRankWorkflowNode(node.id, -1)}
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                type="button"
                                aria-label={`下移 ${node.label}`}
                                disabled={!canMoveDown}
                                onClick={() => moveRankWorkflowNode(node.id, 1)}
                              >
                                <ChevronDown size={14} />
                              </button>
                              {node.kind === "analysis" ? (
                                <label className="publish-toggle">
                                  <input
                                    type="checkbox"
                                    checked={node.enabled}
                                    onChange={(event) =>
                                      toggleRankWorkflowNode(node.id, event.target.checked)
                                    }
                                  />
                                  <span />
                                </label>
                              ) : (
                                <em>CORE</em>
                              )}
                            </div>
                          </header>
                          <div className="rank-workflow-config-grid">
                            <label className="admin-field">
                              <span>节点名称</span>
                              <input
                                maxLength="48"
                                value={node.label}
                                onChange={(event) =>
                                  updateRankWorkflowNode(node.id, { label: event.target.value })
                                }
                              />
                            </label>
                            <label className="admin-field">
                              <span>执行路径</span>
                              <select
                                value={node.apiPath}
                                onChange={(event) =>
                                  updateRankWorkflowNode(node.id, { apiPath: event.target.value })
                                }
                              >
                                {node.kind === "analysis" && <option value="/api/media/analyze">/api/media/analyze</option>}
                                {node.kind === "prompt" && <>
                                  <option value="internal://local-prompt">internal://local-prompt</option>
                                  <option value="/api/text/generate">/api/text/generate</option>
                                </>}
                                {node.kind === "video" && <option value="/api/tasks/video">/api/tasks/video</option>}
                              </select>
                            </label>
                            <label className="admin-field">
                              <span>Prompt 版本</span>
                              <input
                                maxLength="40"
                                value={node.promptVersion || ""}
                                onChange={(event) =>
                                  updateRankWorkflowNode(node.id, { promptVersion: event.target.value })
                                }
                              />
                            </label>
                            <label className="admin-field">
                              <span>节点说明</span>
                              <input
                                maxLength="180"
                                value={node.description || ""}
                                onChange={(event) =>
                                  updateRankWorkflowNode(node.id, { description: event.target.value })
                                }
                              />
                            </label>

                            {node.kind === "analysis" && <>
                              <label className="admin-field">
                                <span>分析模型</span>
                                <select value={node.model} onChange={(event) => updateRankWorkflowNode(node.id, { model: event.target.value })}>
                                  <option value="vapeur-gemini-3.1-pro">Gemini 3.1 Pro · 精细</option>
                                  <option value="vapeur-gemini-3.5-flash">Gemini 3.5 Flash · 快速</option>
                                </select>
                              </label>
                              <label className="admin-field">
                                <span>抽帧数量</span>
                                <select value={node.frameLimit} onChange={(event) => updateRankWorkflowNode(node.id, { frameLimit: Number(event.target.value) })}>
                                  <option value="6">6 帧</option>
                                  <option value="12">12 帧</option>
                                  <option value="18">18 帧</option>
                                </select>
                              </label>
                              <label className="admin-field">
                                <span>分析失败策略</span>
                                <select value={node.failureMode} onChange={(event) => updateRankWorkflowNode(node.id, { failureMode: event.target.value })}>
                                  <option value="continue">记录并继续</option>
                                  <option value="fail">阻断任务</option>
                                </select>
                              </label>
                              <label className="admin-field">
                                <span>输出 Token</span>
                                <input type="number" min="600" max="4000" step="100" value={node.maxTokens} onChange={(event) => updateRankWorkflowNode(node.id, { maxTokens: Number(event.target.value) })} />
                              </label>
                            </>}

                            {node.kind === "prompt" && <>
                              <label className="admin-field">
                                <span>文本模型</span>
                                <select
                                  value={node.model}
                                  onChange={(event) => {
                                    const model = event.target.value;
                                    updateRankWorkflowNode(node.id, {
                                      model,
                                      apiPath: model === "local-prompt" ? "internal://local-prompt" : "/api/text/generate",
                                    });
                                  }}
                                >
                                  <option value="local-prompt">本地规则融合 · 无需 API</option>
                                  <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
                                  <option value="deepseek-chat">DeepSeek Chat</option>
                                </select>
                              </label>
                              <label className="admin-field">
                                <span>最大长度</span>
                                <input type="number" min="500" max="8000" step="100" value={node.maxLength} onChange={(event) => updateRankWorkflowNode(node.id, { maxLength: Number(event.target.value) })} />
                              </label>
                            </>}

                            {node.kind === "video" && <>
                              <label className="admin-field">
                                <span>视频模型</span>
                                <select
                                  value={node.model}
                                  onChange={(event) => {
                                    const model = event.target.value;
                                    updateRankWorkflowNode(node.id, {
                                      model,
                                      ...(model === "minimax-h3"
                                        ? miniMaxH3Settings(node)
                                        : {}),
                                    });
                                  }}
                                >
                                  <option value="kling-v3-omni">Kling 3.0 Omni</option>
                                  <option value="kling-v3">Kling 3.0</option>
                                  <option value="kling-v3-turbo">Kling 3.0 Turbo</option>
                                  <option value="doubao-seedance-2-0-260128">Seedance 2.0</option>
                                  <option value="doubao-seedance-2-0-fast-260128">Seedance 2.0 Fast</option>
                                  <option value="minimax-h3">MiniMax H3</option>
                                </select>
                              </label>
                              <label className="admin-field">
                                <span>画面比例 / 时长</span>
                                <div className="rank-workflow-inline-controls">
                                  <select value={node.model === "minimax-h3" ? normalizeMiniMaxH3Ratio(node.aspectRatio) : node.aspectRatio} onChange={(event) => updateRankWorkflowNode(node.id, { aspectRatio: event.target.value })}>
                                    {(node.model === "minimax-h3" ? MINIMAX_H3_RATIOS : ["9:16", "16:9", "1:1", "3:4", "4:3"]).map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                                  </select>
                                  <select value={node.model === "minimax-h3" ? normalizeMiniMaxH3Duration(node.duration) : node.duration} onChange={(event) => updateRankWorkflowNode(node.id, { duration: Number(event.target.value) })}>
                                    {(node.model === "minimax-h3" ? Array.from({ length: 12 }, (_, index) => index + 4) : [5, 10, 15]).map((duration) => <option key={duration} value={duration}>{duration} 秒</option>)}
                                  </select>
                                </div>
                              </label>
                              {node.model === "minimax-h3" && <><label className="admin-field"><span>输出分辨率</span><select value={normalizeMiniMaxH3Resolution(node.resolution)} onChange={(event) => updateRankWorkflowNode(node.id, { resolution: event.target.value })}><option value="768P">768P</option><option value="2K">2K</option></select></label><label className="admin-field"><span>画幅策略</span><select value={normalizeMiniMaxH3RatioMode(node.ratioMode)} onChange={(event) => updateRankWorkflowNode(node.id, { ratioMode: event.target.value })}><option value="fixed">固定 / 首帧自适应</option><option value="adaptive">多模态自适应</option></select></label><label className="publish-toggle"><div><strong>AIGC 水印</strong><small>MiniMax 输出标识</small></div><input type="checkbox" checked={Boolean(node.aigcWatermark)} onChange={(event) => updateRankWorkflowNode(node.id, { aigcWatermark: event.target.checked })} /><span /></label></>}
                            </>}

                            <label className="admin-field full rank-workflow-prompt-field">
                              <span>{node.kind === "video" ? "视频生成约束 Prompt" : "节点 Prompt"}</span>
                              <textarea
                                maxLength="8000"
                                value={node.prompt}
                                onChange={(event) =>
                                  updateRankWorkflowNode(node.id, { prompt: event.target.value })
                                }
                              />
                              <small>{node.prompt.length} / 8000 · 输出 {node.outputFormat?.toUpperCase()}</small>
                            </label>
                            {node.kind === "video" && (
                              <label className="admin-field full">
                                <span>反向提示词</span>
                                <textarea maxLength="2000" value={node.negativePrompt} onChange={(event) => updateRankWorkflowNode(node.id, { negativePrompt: event.target.value })} />
                              </label>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <div className="rank-remake-node-grid">
                  <article className={`rank-remake-node-card ${rankForm.nodes.analysis.enabled ? "active" : "disabled"}`}>
                    <header>
                      <div>
                        <span>NODE 01</span>
                        <strong>热点原片拆解</strong>
                        <small>读取榜单视频并输出镜头、动作、节奏和商品结构</small>
                      </div>
                      <label className="publish-toggle">
                        <input
                          type="checkbox"
                          checked={rankForm.nodes.analysis.enabled}
                          onChange={(event) =>
                            updateRankNode("analysis", { enabled: event.target.checked })
                          }
                        />
                        <span />
                      </label>
                    </header>
                    <div className="rank-remake-node-fields">
                      <label className="admin-field">
                        <span>节点名称</span>
                        <input
                          maxLength="48"
                          value={rankForm.nodes.analysis.label}
                          onChange={(event) => updateRankNode("analysis", { label: event.target.value })}
                        />
                      </label>
                      <label className="admin-field">
                        <span>分析模型</span>
                        <select
                          value={rankForm.nodes.analysis.model}
                          onChange={(event) => updateRankNode("analysis", { model: event.target.value })}
                        >
                          <option value="vapeur-gemini-3.1-pro">Gemini 3.1 Pro · 精细</option>
                          <option value="vapeur-gemini-3.5-flash">Gemini 3.5 Flash · 快速</option>
                        </select>
                      </label>
                      <label className="admin-field">
                        <span>抽帧数量</span>
                        <select
                          value={rankForm.nodes.analysis.frameLimit}
                          onChange={(event) => updateRankNode("analysis", { frameLimit: Number(event.target.value) })}
                        >
                          <option value="6">6 帧 · 快速</option>
                          <option value="12">12 帧 · 精细</option>
                          <option value="18">18 帧 · 超精细</option>
                        </select>
                      </label>
                      <label className="admin-field">
                        <span>输出 Token</span>
                        <input
                          type="number"
                          min="600"
                          max="4000"
                          step="100"
                          value={rankForm.nodes.analysis.maxTokens}
                          onChange={(event) => updateRankNode("analysis", { maxTokens: Number(event.target.value) })}
                        />
                      </label>
                      <label className="admin-field">
                        <span>分析失败策略</span>
                        <select
                          value={rankForm.nodes.analysis.failureMode || "continue"}
                          onChange={(event) => updateRankNode("analysis", { failureMode: event.target.value })}
                        >
                          <option value="continue">跳过分析并继续生成</option>
                          <option value="fail">阻断任务并提示错误</option>
                        </select>
                      </label>
                      <label className="admin-field full">
                        <span>原片拆解指令</span>
                        <textarea
                          maxLength="8000"
                          value={rankForm.nodes.analysis.prompt}
                          onChange={(event) => updateRankNode("analysis", { prompt: event.target.value })}
                        />
                      </label>
                    </div>
                  </article>

                  <article className="rank-remake-node-card active">
                    <header>
                      <div>
                        <span>NODE 02</span>
                        <strong>前台输入与要求融合</strong>
                        <small>用户可输入，后台控制字段名称、默认规则和文本模型</small>
                      </div>
                      <em>REQUIRED</em>
                    </header>
                    <div className="rank-remake-node-fields">
                      <label className="admin-field">
                        <span>节点名称</span>
                        <input
                          maxLength="48"
                          value={rankForm.nodes.prompt.label}
                          onChange={(event) => updateRankNode("prompt", { label: event.target.value })}
                        />
                      </label>
                      <label className="admin-field">
                        <span>文本模型</span>
                        <select
                          value={rankForm.nodes.prompt.model}
                          onChange={(event) => updateRankNode("prompt", { model: event.target.value })}
                        >
                          <option value="local-prompt">本地规则融合 · 无需 API</option>
                          <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
                          <option value="deepseek-chat">DeepSeek Chat</option>
                        </select>
                      </label>
                      <label className="admin-field">
                        <span>前台输入标题</span>
                        <input
                          maxLength="48"
                          value={rankForm.input.requirementLabel}
                          onChange={(event) => updateRankInput({ requirementLabel: event.target.value })}
                        />
                      </label>
                      <label className="admin-field">
                        <span>前台输入说明</span>
                        <input
                          maxLength="180"
                          value={rankForm.input.requirementDescription}
                          onChange={(event) => updateRankInput({ requirementDescription: event.target.value })}
                        />
                      </label>
                      <label className="admin-field full">
                        <span>默认复刻要求（前台可修改）</span>
                        <textarea
                          maxLength="8000"
                          value={rankForm.input.requirementPrompt}
                          onChange={(event) => updateRankInput({ requirementPrompt: event.target.value })}
                        />
                      </label>
                    </div>
                  </article>

                  <article className="rank-remake-node-card active rank-remake-video-node">
                    <header>
                      <div>
                        <span>NODE 03</span>
                        <strong>同款视频生成</strong>
                        <small>真正提交到视频任务接口，参数随工作流记录持久化</small>
                      </div>
                      <em>OUTPUT</em>
                    </header>
                    <div className="rank-remake-node-fields compact">
                      <label className="admin-field">
                        <span>节点名称</span>
                        <input
                          maxLength="48"
                          value={rankForm.nodes.video.label}
                          onChange={(event) => updateRankNode("video", { label: event.target.value })}
                        />
                      </label>
                      <label className="admin-field">
                        <span>视频模型</span>
                        <select
                          value={rankForm.nodes.video.model}
                          onChange={(event) => {
                            const model = event.target.value;
                            updateRankNode("video", {
                              model,
                              ...(model === "minimax-h3"
                                ? miniMaxH3Settings(rankForm.nodes.video)
                                : {}),
                            });
                          }}
                        >
                          <option value="kling-v3-omni">Kling 3.0 Omni</option>
                          <option value="kling-v3">Kling 3.0</option>
                          <option value="kling-v3-turbo">Kling 3.0 Turbo</option>
                          <option value="doubao-seedance-2-0-260128">Seedance 2.0</option>
                          <option value="doubao-seedance-2-0-fast-260128">Seedance 2.0 Fast</option>
                          <option value="minimax-h3">MiniMax H3</option>
                        </select>
                      </label>
                      <label className="admin-field">
                        <span>画面比例</span>
                        <select
                          value={rankForm.nodes.video.model === "minimax-h3" ? normalizeMiniMaxH3Ratio(rankForm.nodes.video.aspectRatio) : rankForm.nodes.video.aspectRatio}
                          onChange={(event) => updateRankNode("video", { aspectRatio: event.target.value })}
                        >
                          {(rankForm.nodes.video.model === "minimax-h3" ? MINIMAX_H3_RATIOS : ["9:16", "16:9", "1:1", "3:4", "4:3"]).map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                        </select>
                      </label>
                      <label className="admin-field">
                        <span>时长</span>
                        <select
                          value={rankForm.nodes.video.model === "minimax-h3" ? normalizeMiniMaxH3Duration(rankForm.nodes.video.duration) : rankForm.nodes.video.duration}
                          onChange={(event) => updateRankNode("video", { duration: Number(event.target.value) })}
                        >
                          {(rankForm.nodes.video.model === "minimax-h3" ? Array.from({ length: 12 }, (_, index) => index + 4) : [5, 10, 15]).map((duration) => <option key={duration} value={duration}>{duration} 秒</option>)}
                        </select>
                      </label>
                      {rankForm.nodes.video.model === "minimax-h3" ? <><label className="admin-field"><span>输出分辨率</span><select value={normalizeMiniMaxH3Resolution(rankForm.nodes.video.resolution)} onChange={(event) => updateRankNode("video", { resolution: event.target.value })}><option value="768P">768P</option><option value="2K">2K</option></select></label><label className="admin-field"><span>画幅策略</span><select value={normalizeMiniMaxH3RatioMode(rankForm.nodes.video.ratioMode)} onChange={(event) => updateRankNode("video", { ratioMode: event.target.value })}><option value="fixed">固定 / 首帧自适应</option><option value="adaptive">多模态自适应</option></select></label><label className="publish-toggle"><div><strong>AIGC 水印</strong><small>MiniMax 输出标识</small></div><input type="checkbox" checked={Boolean(rankForm.nodes.video.aigcWatermark)} onChange={(event) => updateRankNode("video", { aigcWatermark: event.target.checked })} /><span /></label></> : <label className="admin-field"><span>模式</span><select value={rankForm.nodes.video.mode} onChange={(event) => updateRankNode("video", { mode: event.target.value })}><option value="pro">Pro</option><option value="std">Standard</option><option value="1080p">1080P</option><option value="720p">720P</option></select></label>}
                      {rankForm.nodes.video.model !== "minimax-h3" && <>
                      <label className="admin-field">
                        <span>CFG 强度</span>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={rankForm.nodes.video.cfgScale}
                          onChange={(event) => updateRankNode("video", { cfgScale: Number(event.target.value) })}
                        />
                      </label>
                      <label className="publish-toggle">
                        <div><strong>智能多镜头</strong><small>沿用拆解出的镜头节奏</small></div>
                        <input
                          type="checkbox"
                          checked={rankForm.nodes.video.multiShot}
                          onChange={(event) => updateRankNode("video", { multiShot: event.target.checked })}
                        />
                        <span />
                      </label>
                      <label className="publish-toggle">
                        <div><strong>生成声音</strong><small>模型支持时一并生成</small></div>
                        <input
                          type="checkbox"
                          checked={rankForm.nodes.video.sound}
                          onChange={(event) => updateRankNode("video", { sound: event.target.checked })}
                        />
                        <span />
                      </label>
                      </>}
                      <label className="admin-field full">
                        <span>视频生成安全约束</span>
                        <textarea
                          maxLength="8000"
                          value={rankForm.nodes.video.prompt}
                          onChange={(event) => updateRankNode("video", { prompt: event.target.value })}
                        />
                      </label>
                      <label className="admin-field full">
                        <span>反向提示词</span>
                        <textarea
                          maxLength="2000"
                          value={rankForm.nodes.video.negativePrompt}
                          onChange={(event) => updateRankNode("video", { negativePrompt: event.target.value })}
                        />
                      </label>
                    </div>
                  </article>
                </div>

                <div className="rank-remake-input-config">
                  <header><strong>前台素材输入</strong><small>控制用户在一键同款弹窗中需要填写的素材字段</small></header>
                  <div className="rank-remake-copy-grid">
                    <label className="admin-field"><span>素材字段标题</span><input maxLength="48" value={rankForm.input.mediaLabel} onChange={(event) => updateRankInput({ mediaLabel: event.target.value })} /></label>
                    <label className="admin-field"><span>最多素材数</span><input type="number" min="1" max="8" value={rankForm.input.mediaMaxItems} onChange={(event) => updateRankInput({ mediaMaxItems: Number(event.target.value) })} /></label>
                    <label className="admin-field full"><span>素材字段说明</span><input maxLength="180" value={rankForm.input.mediaDescription} onChange={(event) => updateRankInput({ mediaDescription: event.target.value })} /></label>
                    <label className="publish-toggle"><div><strong>素材必填</strong><small>关闭后允许纯文生视频</small></div><input type="checkbox" checked={rankForm.input.mediaRequired} onChange={(event) => updateRankInput({ mediaRequired: event.target.checked })} /><span /></label>
                    <label className="publish-toggle"><div><strong>复刻要求必填</strong><small>避免空提示词任务</small></div><input type="checkbox" checked={rankForm.input.requirementRequired} onChange={(event) => updateRankInput({ requirementRequired: event.target.checked })} /><span /></label>
                  </div>
                </div>
              </div>
            )}

            {globalConfigGroup === "quick" && (
              <div className="global-config-section quick-create-copy-config">
                <header><div><strong>快速创作文案</strong><small>修改前台提示词标题、透明示例、生成按钮和快捷标签</small></div><span>CREATE UI</span></header>
                <div className="quick-create-copy-grid">
                  <label className="admin-field"><span>提示词标题</span><input value={form.promptLabel || "提示词"} onChange={(event) => setForm({ ...form, promptLabel: event.target.value })} /></label>
                  <label className="admin-field"><span>生成按钮文字</span><input value={form.generateButtonLabel || "生成"} onChange={(event) => setForm({ ...form, generateButtonLabel: event.target.value })} /></label>
                  <label className="admin-field quick-create-placeholder-field"><span>透明演示提示词</span><textarea maxLength="2500" value={form.promptPlaceholder || ""} onChange={(event) => setForm({ ...form, promptPlaceholder: event.target.value })} /></label>
                </div>
                <div className="quick-prompt-preset-config">
                  {quickPromptPresets.map((preset, index) => (
                    <div key={index}>
                      <label className="admin-field"><span>快捷标签 {index + 1}</span><input maxLength="24" value={preset.label} onChange={(event) => setForm({ ...form, quickPromptPresets: quickPromptPresets.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /></label>
                      <label className="admin-field"><span>标签提示词</span><textarea maxLength="2500" value={preset.prompt} onChange={(event) => setForm({ ...form, quickPromptPresets: quickPromptPresets.map((item, itemIndex) => itemIndex === index ? { ...item, prompt: event.target.value } : item) })} /></label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {globalConfigGroup === "batch" && (
              <div className="global-config-section">
                <header><strong>批量任务文案</strong><small>保存后新打开的批量任务直接使用这里的统一提示词</small></header>
                <div className="global-copy-grid">
                  <label className="admin-field"><span>提示词区标题</span><input value={form.batchPromptLabel || ""} onChange={(event) => setForm({ ...form, batchPromptLabel: event.target.value })} /></label>
                  <label className="admin-field"><span>应用按钮文字</span><input value={form.batchApplyLabel || ""} onChange={(event) => setForm({ ...form, batchApplyLabel: event.target.value })} /></label>
                  <label className="admin-field full"><span>默认统一提示词</span><textarea maxLength="4000" value={form.batchPrompt || ""} onChange={(event) => setForm({ ...form, batchPrompt: event.target.value })} /></label>
                </div>
              </div>
            )}

            {globalConfigGroup === "media" && (
              <div className="global-config-section">
                <header><strong>图片与声音生成</strong><small>统一管理图片提示词、配音示例和声音克隆试听内容</small></header>
                <div className="global-copy-grid">
                  <label className="admin-field"><span>图片提示词标题</span><input value={form.imagePromptLabel || ""} onChange={(event) => setForm({ ...form, imagePromptLabel: event.target.value })} /></label>
                  <label className="admin-field"><span>配音文本标题</span><input value={form.audioTextLabel || ""} onChange={(event) => setForm({ ...form, audioTextLabel: event.target.value })} /></label>
                  <label className="admin-field full"><span>图片生成演示提示词</span><textarea maxLength="4000" value={form.imagePromptPlaceholder || ""} onChange={(event) => setForm({ ...form, imagePromptPlaceholder: event.target.value })} /></label>
                  <label className="admin-field media-copy-field"><span>声音生成演示文本</span><textarea maxLength="4000" value={form.audioTextPlaceholder || ""} onChange={(event) => setForm({ ...form, audioTextPlaceholder: event.target.value })} /></label>
                  <label className="admin-field media-copy-field"><span>声音克隆试听文本</span><textarea maxLength="1000" value={form.audioClonePreviewText || ""} onChange={(event) => setForm({ ...form, audioClonePreviewText: event.target.value })} /></label>
                </div>
              </div>
            )}

            {globalConfigGroup === "analysis" && (
              <div className="global-config-section">
                <header><strong>视频分析与项目中心</strong><small>配置分析框架，以及新建画布节点使用的默认提示词</small></header>
                <div className="global-copy-grid">
                  <label className="admin-field"><span>分析框架标题</span><input value={form.analysisPromptLabel || ""} onChange={(event) => setForm({ ...form, analysisPromptLabel: event.target.value })} /></label>
                  <label className="admin-field"><span>分析输入提示</span><input value={form.analysisPromptPlaceholder || ""} onChange={(event) => setForm({ ...form, analysisPromptPlaceholder: event.target.value })} /></label>
                  <label className="admin-field analysis-framework-field"><span>Seedance 默认分析框架</span><textarea maxLength="4000" value={form.analysisSeedanceFramework || ""} onChange={(event) => setForm({ ...form, analysisSeedanceFramework: event.target.value })} /></label>
                  <label className="admin-field analysis-framework-field"><span>可灵默认分析框架</span><textarea maxLength="4000" value={form.analysisKlingFramework || ""} onChange={(event) => setForm({ ...form, analysisKlingFramework: event.target.value })} /></label>
                  <label className="admin-field full"><span>画布提示词导演默认内容</span><textarea maxLength="2500" value={form.canvasDirectorPrompt || ""} onChange={(event) => setForm({ ...form, canvasDirectorPrompt: event.target.value })} /></label>
                  <label className="admin-field canvas-node-default-field"><span>画布视频节点默认提示词</span><textarea maxLength="4000" value={form.canvasVideoPrompt || ""} onChange={(event) => setForm({ ...form, canvasVideoPrompt: event.target.value })} /></label>
                  <label className="admin-field canvas-node-default-field"><span>画布分析节点默认提示词</span><textarea maxLength="4000" value={form.canvasAnalysisPrompt || ""} onChange={(event) => setForm({ ...form, canvasAnalysisPrompt: event.target.value })} /></label>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="inspiration-config-actions">
          <button
            className="admin-primary"
            disabled={globalConfigGroup === "rankRemake" ? rankSaving : saving}
            onClick={globalConfigGroup === "rankRemake" ? saveRank : save}
          >
            {(globalConfigGroup === "rankRemake" ? rankSaving : saving) ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            {globalConfigGroup === "rankRemake"
              ? "保存排行榜节点流程"
              : "保存全局配置"}
          </button>
        </div>
      </section>
      )}
      {section === "templates" && (
      <section className="admin-card detail-template-admin-card">
        <CardHead
          title="模版后台配置"
          subtitle="搭配图、详情页与视频模版统一管理"
          tag={`${detailLibrary?.total || 0} TEMPLATES`}
        />
        {!detailLibrary ? (
          <LoadingBlock />
        ) : (
          <>
            <div className="detail-template-admin-toolbar">
              <label className="admin-field">
                <span>模版类型</span>
                <select
                  value={detailKind}
                  onChange={(event) => {
                    setDetailKind(event.target.value);
                    setDetailPrimary("all");
                    setDetailSecondary("all");
                    setDetailPage(1);
                  }}
                >
                  <option value="all">全部模版</option>
                  <option value="outfit">搭配图</option>
                  <option value="image">详情页</option>
                  <option value="video">视频模版</option>
                  <option value="material">素材模版</option>
                </select>
              </label>
              <label className="admin-field">
                <span>搜索模版</span>
                <input
                  value={detailQuery}
                  onChange={(event) => {
                    setDetailQuery(event.target.value);
                    setDetailPage(1);
                  }}
                  placeholder="搜索类目、平台或模版名称"
                />
              </label>
              <label className="admin-field">
                <span>一级类目</span>
                <select
                  value={detailPrimary}
                  onChange={(event) => {
                    setDetailPrimary(event.target.value);
                    setDetailSecondary("all");
                    setDetailPage(1);
                  }}
                >
                  <option value="all">全部一级类目</option>
                  {(detailLibrary.categoryTree || []).map((item) => (
                    <option value={item.label} key={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>二级类目</span>
                <select
                  value={detailSecondary}
                  onChange={(event) => {
                    setDetailSecondary(event.target.value);
                    setDetailPage(1);
                  }}
                >
                  <option value="all">全部二级类目</option>
                  {(activeDetailPrimary?.children ||
                    (detailLibrary.categoryTree || []).flatMap(
                      (item) => item.children || [],
                    )
                  ).map((item) => (
                    <option value={item.label} key={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>平台</span>
                <select
                  value={detailPlatform}
                  onChange={(event) => {
                    setDetailPlatform(event.target.value);
                    setDetailPage(1);
                  }}
                >
                  <option value="all">全部平台</option>
                  {(detailLibrary.platforms || []).map((item) => (
                    <option value={item} key={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="detail-template-admin-library">
              <header>
                <div>
                  <strong>模版库</strong>
                  <small>点击卡片调整提示词和后台生成路径</small>
                </div>
                <span>{detailLibrary.filteredTotal ?? visibleDetailTemplates.length} 个</span>
              </header>
              <div className="detail-template-admin-grid">
                {visibleDetailTemplates.map((item) => (
                  <button
                    key={item.id}
                    className={selectedDetailId === item.id ? "active" : ""}
                    disabled={detailOpeningId === item.id}
                    onClick={() => void openDetailTemplate(item)}
                  >
                    <span
                      className={`detail-template-admin-cover${
                        ["video", "material"].includes(item.kind)
                          ? " video"
                          : ""
                      }`}
                    >
                      <img
                        src={item.thumbnailUrl || item.coverUrl}
                        alt={item.title}
                        loading="lazy"
                      />
                      <em>
                        {item.kind === "outfit"
                          ? "搭配图"
                          : item.kind === "material"
                            ? "素材模版"
                          : item.kind === "video"
                            ? "视频模版"
                            : "详情页"}
                      </em>
                      <i className={item.enabled ? "online" : ""} />
                    </span>
                    <span className="detail-template-admin-card-copy">
                      <strong>{item.title}</strong>
                      <small>
                        {item.platform} · {item.imageType} · {item.ratio}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
              {!visibleDetailTemplates.length && (
                <EmptyInline text="没有匹配的模版" />
              )}
              {(detailLibrary.totalPages || 1) > 1 && (
                <div className="model-pagination">
                  <button
                    disabled={detailPage <= 1}
                    onClick={() => setDetailPage((current) => Math.max(1, current - 1))}
                  >
                    上一页
                  </button>
                  <span>
                    {detailPage} / {detailLibrary.totalPages}
                  </span>
                  <button
                    disabled={detailPage >= detailLibrary.totalPages}
                    onClick={() =>
                      setDetailPage((current) =>
                        Math.min(detailLibrary.totalPages, current + 1),
                      )
                    }
                  >
                    下一页
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
      )}
      {detailEditorOpen && detailForm && (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setDetailEditorOpen(false)
          }
        >
          <div className="admin-modal detail-template-edit-modal">
            <div className="admin-modal-head">
              <div>
                <h2>{detailForm.title}</h2>
                <p>
                  {detailForm.primaryCategory} / {detailForm.secondaryCategory} ·{" "}
                  {detailForm.platform}{detailForm.imageType}
                </p>
              </div>
              <button
                className="admin-icon-button"
                onClick={() => setDetailEditorOpen(false)}
                aria-label="关闭模版配置"
              >
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body detail-template-edit-body">
              <aside className="detail-template-edit-preview">
                <img src={detailForm.coverUrl} alt={detailForm.title} />
                <div>
                  <strong>{detailForm.title}</strong>
                  <small>{detailForm.ratio} · {detailForm.platform}</small>
                </div>
              </aside>
              <div className="detail-template-edit-fields">
                <div className="detail-template-edit-topline">
                  <label className="publish-toggle">
                    <div><strong>启用模版</strong></div>
                    <input
                      type="checkbox"
                      checked={detailForm.enabled !== false}
                      onChange={(event) =>
                        setDetailForm({
                          ...detailForm,
                          enabled: event.target.checked,
                        })
                      }
                    />
                    <span />
                  </label>
                </div>
                <label className="admin-field">
                  <span>模版名称</span>
                  <input
                    value={detailForm.title}
                    onChange={(event) =>
                      setDetailForm({ ...detailForm, title: event.target.value })
                    }
                  />
                </label>
                <div className="admin-field detail-template-tag-field">
                  <span>模版标签</span>
                  <div
                    className="detail-template-tag-picker"
                    role="group"
                    aria-label="模版标签"
                  >
                    {detailTagOptions.map((tag) => {
                      const selected = selectedDetailTags.includes(tag);
                      return (
                        <button
                          type="button"
                          key={tag}
                          className={selected ? "selected" : ""}
                          aria-pressed={selected}
                          disabled={!selected && selectedDetailTags.length >= 12}
                          onClick={() => toggleDetailTag(tag)}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  <small>已选 {selectedDetailTags.length}/12</small>
                </div>
                {!editingMaterialTemplate && (
                <div className="detail-template-route-grid">
                  <label className="admin-field">
                    <span>单模版后台生成路径</span>
                    <input
                      value={detailForm.generationPath || ""}
                      onChange={(event) =>
                        setDetailForm({
                          ...detailForm,
                          generationPath: event.target.value,
                        })
                      }
                      placeholder={
                        editingVideoTemplate
                          ? "/api/tasks/video"
                          : "/api/tasks/image"
                      }
                    />
                  </label>
                  <label className="admin-field">
                    <span>同类型默认配置路径</span>
                    <input
                      value={detailForm.typeConfigPath || ""}
                      onChange={(event) =>
                        setDetailForm({
                          ...detailForm,
                          typeConfigPath: event.target.value,
                        })
                      }
                      placeholder={
                        editingVideoTemplate
                          ? "models/kling-v3-omni/video/type"
                          : "models/gpt-image-2/image/type"
                      }
                    />
                    <small>应用到同一二级类目的全部平台模版</small>
                  </label>
                </div>
                )}
                <section className="detail-template-advanced-config">
                  <header>
                    <strong>模型与高级参数</strong>
                    <small>
                      一键套用时直接写入
                      {editingMaterialTemplate
                        ? "口播素材工作流"
                        : editingVideoTemplate
                          ? "视频生成节点"
                          : "图片生成节点"}
                    </small>
                  </header>
                  {editingMaterialTemplate ? (
                    <>
                      <div className="template-workflow-map material-template-workflow-map">
                        {materialWorkflowNodes.map((item, index) => (
                          <React.Fragment key={item.id}>
                            {index > 0 && <i>→</i>}
                            <button
                              type="button"
                              className={
                                detailWorkflowNode === item.id ? "active" : ""
                              }
                              onClick={() => setDetailWorkflowNode(item.id)}
                            >
                              <b>{index + 1}</b>
                              <strong>{item.label}</strong>
                              <small>{item.hint}</small>
                              <em>详情</em>
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                      <p>
                        一键同款参考与人物、服装、产品、声音资料汇入同一条口播生成路径。
                      </p>
                      <section className="template-workflow-node-detail material-template-node-detail">
                        <header>
                          <div>
                            <strong>
                              {selectedMaterialWorkflowNode?.label || "节点详情"}
                            </strong>
                            <small>
                              {selectedMaterialWorkflowNode?.node?.data?.subtitle ||
                                "后端节点参数"}
                            </small>
                          </div>
                          <button
                            type="button"
                            className="admin-secondary"
                            disabled={openingWorkflowCanvas}
                            onClick={openDetailWorkflowCanvas}
                          >
                            {openingWorkflowCanvas ? (
                              <LoaderCircle className="spin" size={14} />
                            ) : (
                              <Workflow size={14} />
                            )}
                            {openingWorkflowCanvas
                              ? "正在打开"
                              : "进入无限画布编辑"}
                          </button>
                        </header>
                        {selectedMaterialWorkflowNode && (
                          <>
                            <div className="template-node-form-grid">
                              <div className="template-node-readonly">
                                <strong>节点类型</strong>
                                <span>
                                  {selectedMaterialWorkflowNode.node.data?.kind}
                                </span>
                              </div>
                              <div className="template-node-readonly">
                                <strong>执行策略</strong>
                                <span>
                                  {selectedMaterialWorkflowNode.node.data
                                    ?.failureMode === "continue"
                                    ? "失败继续下游"
                                    : "按工作流顺序执行"}
                                </span>
                              </div>
                              {selectedMaterialWorkflowNode.node.data?.model && (
                                <label className="admin-field">
                                  <span>使用模型</span>
                                  <input
                                    value={
                                      selectedMaterialWorkflowNode.node.data
                                        .model
                                    }
                                    onChange={(event) =>
                                      updateMaterialWorkflowNode(
                                        selectedMaterialWorkflowNode.id,
                                        { model: event.target.value },
                                      )
                                    }
                                  />
                                </label>
                              )}
                              {selectedMaterialWorkflowNode.node.data
                                ?.backendGenerationPath && (
                                <label className="admin-field">
                                  <span>后端执行路径</span>
                                  <input
                                    value={
                                      selectedMaterialWorkflowNode.node.data
                                        .backendGenerationPath
                                    }
                                    onChange={(event) =>
                                      updateMaterialWorkflowNode(
                                        selectedMaterialWorkflowNode.id,
                                        {
                                          backendGenerationPath:
                                            event.target.value,
                                        },
                                      )
                                    }
                                  />
                                </label>
                              )}
                            </div>
                            {selectedMaterialWorkflowNode.node.data?.prompt !==
                              undefined && (
                              <label className="admin-field">
                                <span>节点提示词</span>
                                <textarea
                                  value={
                                    selectedMaterialWorkflowNode.node.data
                                      .prompt || ""
                                  }
                                  onChange={(event) =>
                                    updateMaterialWorkflowNode(
                                      selectedMaterialWorkflowNode.id,
                                      { prompt: event.target.value },
                                    )
                                  }
                                />
                              </label>
                            )}
                          </>
                        )}
                      </section>
                    </>
                  ) : editingVideoTemplate ? (
                    <>
                      <div className="detail-template-parameter-grid">
                        <label className="admin-field">
                          <span>使用模型</span>
                          <select
                            value={detailForm.model || "kling-v3-omni"}
                            onChange={(event) => {
                              const model = event.target.value;
                              if (
                                model === "minimax-h3" &&
                                detailWorkflowNode === "asset"
                              )
                                setDetailWorkflowNode("video");
                              setDetailForm({
                                ...detailForm,
                                model,
                                ...(model === "minimax-h3"
                                  ? miniMaxH3Settings(detailForm, {
                                      template: true,
                                    })
                                  : {}),
                              });
                            }}
                          >
                            <option value="kling-v3-omni">Kling 3.0 Omni</option>
                            <option value="kling-v3">Kling 3.0</option>
                            <option value="kling-v3-turbo">Kling 3.0 Turbo</option>
                            <option value="doubao-seedance-2-0-260128">Seedance 2.0</option>
                            <option value="doubao-seedance-2-0-fast-260128">Seedance 2.0 Fast</option>
                            <option value="minimax-h3">MiniMax H3</option>
                          </select>
                        </label>
                        <label className="admin-field">
                          <span>画面比例</span>
                          <select
                            value={detailVideoModel === "minimax-h3" ? normalizeMiniMaxH3Ratio(detailForm.aspectRatio || detailForm.ratio) : detailForm.aspectRatio || detailForm.ratio || "9:16"}
                            onChange={(event) =>
                              setDetailForm({
                                ...detailForm,
                                aspectRatio: event.target.value,
                              })
                            }
                          >
                            <option value="9:16">9:16</option>
                            <option value="16:9">16:9</option>
                            <option value="1:1">1:1</option>
                            <option value="3:4">3:4</option>
                            <option value="4:3">4:3</option>
                            <option value="21:9">21:9</option>
                          </select>
                        </label>
                        <label className="admin-field">
                          <span>视频时长</span>
                          <select
                            value={detailVideoModel === "minimax-h3" ? normalizeMiniMaxH3Duration(detailForm.duration) : Number(detailForm.duration || 15)}
                            onChange={(event) =>
                              setDetailForm({
                                ...detailForm,
                                duration: Number(event.target.value),
                              })
                            }
                          >
                            {(detailVideoModel === "minimax-h3"
                              ? Array.from({ length: 12 }, (_, index) => index + 4)
                              : [5, 10, 15]
                            ).map((duration) => (
                              <option value={duration} key={duration}>
                                {duration} 秒
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-field">
                          <span>{detailVideoModel === "minimax-h3" ? "输出分辨率" : "生成模式"}</span>
                          <select
                            value={
                              detailVideoModel === "minimax-h3"
                                ? normalizeMiniMaxH3Resolution(detailForm.resolution)
                                : detailForm.mode || "pro"
                            }
                            onChange={(event) =>
                              setDetailForm(
                                detailVideoModel === "minimax-h3"
                                  ? { ...detailForm, resolution: event.target.value }
                                  : { ...detailForm, mode: event.target.value },
                              )
                            }
                          >
                            {detailVideoModel === "minimax-h3" ? (
                              <>
                                <option value="768P">768P</option>
                                <option value="2K">2K</option>
                              </>
                            ) : (
                              <>
                                <option value="std">Standard</option>
                                <option value="pro">Pro</option>
                                <option value="4k">4K</option>
                              </>
                            )}
                          </select>
                        </label>
                        {detailVideoModel === "minimax-h3" && <><label className="admin-field"><span>画幅策略</span><select value={normalizeMiniMaxH3RatioMode(detailForm.ratioMode)} onChange={(event) => setDetailForm({ ...detailForm, ratioMode: event.target.value })}><option value="fixed">固定 / 首帧自适应</option><option value="adaptive">多模态自适应</option></select></label><label className="publish-toggle"><div><strong>AIGC 水印</strong><small>MiniMax 输出标识</small></div><input type="checkbox" checked={Boolean(detailForm.aigcWatermark)} onChange={(event) => setDetailForm({ ...detailForm, aigcWatermark: event.target.checked })} /><span /></label></>}
                        {detailVideoModel !== "minimax-h3" && <label className="admin-field">
                          <span>提示词引导强度</span>
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            value={detailForm.cfgScale ?? 0.8}
                            onChange={(event) =>
                              setDetailForm({
                                ...detailForm,
                                cfgScale: Number(event.target.value),
                              })
                            }
                          />
                        </label>}
                      </div>
                      {detailVideoModel !== "minimax-h3" && <div className="detail-template-switch-grid video-switches">
                        {[
                          ["multiShot", "智能多镜头", "按模版提示词生成多镜头分镜"],
                          ["sound", "生成声音", "允许支持的模型生成或保留声音"],
                        ].map(([key, label, description]) => (
                          <label className="detail-parameter-switch" key={key}>
                            <span>
                              <strong>{label}</strong>
                              <small>{description}</small>
                            </span>
                            <input
                              type="checkbox"
                              checked={
                                key === "multiShot"
                                  ? detailForm[key] !== false
                                  : Boolean(detailForm[key])
                              }
                              onChange={(event) =>
                                setDetailForm({
                                  ...detailForm,
                                  [key]: event.target.checked,
                                })
                              }
                            />
                            <i />
                          </label>
                        ))}
                      </div>}
                      <section className="template-workflow-config">
                        <header>
                          <div>
                            <strong>详情工作流</strong>
                            <small>一键同款时按当前配置直接创建节点与连接</small>
                          </div>
                          <span>AUTO LINK</span>
                        </header>
                        <div className="template-workflow-fields">
                          <label className="admin-field">
                            <span>工作流结构</span>
                            <select
                              value={detailForm.workflowPreset || "main-outfit-video"}
                              onChange={(event) =>
                                setDetailForm({
                                  ...detailForm,
                                  workflowPreset: event.target.value,
                                })
                              }
                            >
                              <option value="main-outfit-video">主图 → 换装 → 视频生成</option>
                              <option value="single-node-outfit-video">上传换装图 → 单节点视频生成</option>
                              <option value="direct-video">主图 → 直接视频生成</option>
                            </select>
                          </label>
                          <label className="admin-field">
                            <span>换装模型</span>
                            <select
                              disabled={(detailForm.workflowPreset || "main-outfit-video") !== "main-outfit-video"}
                              value={detailForm.outfitModel || "gpt-image-2"}
                              onChange={(event) =>
                                setDetailForm({
                                  ...detailForm,
                                  outfitModel: event.target.value,
                                })
                              }
                            >
                              <option value="gpt-image-2">GPT Image 2 · Azure</option>
                              <option value="vapeur-gpt-image-2">GPT Image 2 · Vapeur</option>
                            </select>
                          </label>
                          <label className="admin-field">
                            <span>数字资产节点</span>
                            <select
                              disabled={
                                detailVideoModel === "kling-v3-turbo" ||
                                detailVideoModel === "minimax-h3"
                              }
                              value={
                                detailVideoModel === "kling-v3-turbo" ||
                                detailVideoModel === "minimax-h3"
                                  ? "none"
                                  : detailForm.digitalAssetMode || "optional"
                              }
                              onChange={(event) =>
                                setDetailForm({
                                  ...detailForm,
                                  digitalAssetMode: event.target.value,
                                })
                              }
                            >
                              <option value="none">不添加</option>
                              <option value="optional">添加 · 可选绑定</option>
                              <option value="required">添加 · 必须绑定</option>
                            </select>
                          </label>
                          <label className="admin-field">
                            <span>换装生成路径</span>
                            <input
                              disabled={(detailForm.workflowPreset || "main-outfit-video") !== "main-outfit-video"}
                              value={detailForm.outfitGenerationPath || "/api/tasks/image"}
                              onChange={(event) =>
                                setDetailForm({
                                  ...detailForm,
                                  outfitGenerationPath: event.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="template-workflow-map">
                          <button type="button" className={detailWorkflowNode === "main" ? "active" : ""} onClick={() => setDetailWorkflowNode("main")}><b>1</b><strong>主图</strong><small>封面 + 用户素材</small><em>详情</em></button>
                          <i>→</i>
                          {(detailForm.workflowPreset || "main-outfit-video") === "main-outfit-video" && (
                            <>
                              <button type="button" className={detailWorkflowNode === "outfit" ? "active" : ""} onClick={() => setDetailWorkflowNode("outfit")}><b>2</b><strong>换装</strong><small>{detailForm.outfitModel === "vapeur-gpt-image-2" ? "Vapeur" : "Azure"}</small><em>详情</em></button>
                              <i>→</i>
                            </>
                          )}
                          <button type="button" className={detailWorkflowNode === "video" ? "active" : ""} onClick={() => setDetailWorkflowNode("video")}><b>3</b><strong>视频生成</strong><small>{detailVideoConnection.label}</small><em>详情</em></button>
                          {!["kling-v3-turbo", "minimax-h3"].includes(
                            detailVideoModel,
                          ) &&
                            (detailForm.digitalAssetMode || "optional") !== "none" && (
                              <button type="button" className={`asset ${detailWorkflowNode === "asset" ? "active" : ""}`} onClick={() => setDetailWorkflowNode("asset")}><b>+</b><strong>数字资产</strong><small>{(detailForm.digitalAssetMode || "optional") === "required" ? "必填" : "可选"}</small><em>详情</em></button>
                            )}
                        </div>
                        <p>{detailVideoConnection.detail}</p>
                        <section className="template-workflow-node-detail">
                          <header>
                            <div>
                              <strong>{detailWorkflowNode === "main" ? "主图节点详情" : detailWorkflowNode === "outfit" ? "换装节点详情" : detailWorkflowNode === "asset" ? "数字资产节点详情" : "视频生成节点详情"}</strong>
                              <small>这里修改的提示词和参数会写入当前模版</small>
                            </div>
                            <button type="button" className="admin-secondary" disabled={openingWorkflowCanvas} onClick={openDetailWorkflowCanvas}>
                              {openingWorkflowCanvas ? <LoaderCircle className="spin" size={14} /> : <Workflow size={14} />}
                              {openingWorkflowCanvas ? "正在打开" : "进入无限画布编辑"}
                            </button>
                          </header>
                          {detailWorkflowNode === "main" && (
                            <div className="template-node-form-grid">
                              <label className="admin-field"><span>画面比例</span><select value={detailForm.aspectRatio || "9:16"} onChange={(event) => setDetailForm({ ...detailForm, aspectRatio: event.target.value })}><option>9:16</option><option>16:9</option><option>1:1</option><option>3:4</option><option>4:3</option></select></label>
                              <div className="template-node-readonly"><strong>素材规则</strong><span>{(detailForm.workflowPreset || "main-outfit-video") === "main-outfit-video" ? "模版封面作为图 1，用户换装素材作为图 2" : (detailForm.workflowPreset || "main-outfit-video") === "single-node-outfit-video" ? "上传一张已换装人物图" : "模版主图或用户替换素材"}</span></div>
                            </div>
                          )}
                          {detailWorkflowNode === "outfit" && (
                            <>
                              <div className="template-node-form-grid">
                                <label className="admin-field"><span>换装模型</span><select value={detailForm.outfitModel || "gpt-image-2"} onChange={(event) => setDetailForm({ ...detailForm, outfitModel: event.target.value })}><option value="gpt-image-2">GPT Image 2 · Azure</option><option value="vapeur-gpt-image-2">GPT Image 2 · Vapeur</option></select></label>
                                <label className="admin-field"><span>清晰度</span><select value={detailForm.outfitResolution || "2k"} onChange={(event) => setDetailForm({ ...detailForm, outfitResolution: event.target.value })}><option value="1k">1K</option><option value="2k">2K</option><option value="4k">4K</option></select></label>
                                <label className="admin-field"><span>生成质量</span><select value={detailForm.outfitQuality || "high"} onChange={(event) => setDetailForm({ ...detailForm, outfitQuality: event.target.value })}><option value="standard">Standard</option><option value="high">High</option></select></label>
                                <label className="admin-field"><span>模型配置路径</span><input value={detailForm.outfitConfigPath || "models/gpt-image-2/image/outfit-change"} onChange={(event) => setDetailForm({ ...detailForm, outfitConfigPath: event.target.value })} /></label>
                              </div>
                              <label className="admin-field"><span>换装节点提示词</span><textarea value={detailForm.outfitPrompt || ""} onChange={(event) => setDetailForm({ ...detailForm, outfitPrompt: event.target.value })} placeholder="未填写时使用全局默认换装提示词" /></label>
                              <label className="admin-field"><span>换装反向提示词</span><textarea value={detailForm.outfitNegativePrompt || ""} onChange={(event) => setDetailForm({ ...detailForm, outfitNegativePrompt: event.target.value })} /></label>
                            </>
                          )}
                          {detailWorkflowNode === "video" && (
                            <>
                              <div className="template-node-form-grid">
                                <label className="admin-field"><span>视频模型</span><select value={detailForm.model || "kling-v3-omni"} onChange={(event) => { const model = event.target.value; if (model === "minimax-h3" && detailWorkflowNode === "asset") setDetailWorkflowNode("video"); setDetailForm({ ...detailForm, model, ...(model === "minimax-h3" ? miniMaxH3Settings(detailForm, { template: true }) : {}) }); }}><option value="kling-v3-omni">Kling 3.0 Omni</option><option value="kling-v3">Kling 3.0</option><option value="kling-v3-turbo">Kling 3.0 Turbo</option><option value="doubao-seedance-2-0-260128">Seedance 2.0</option><option value="doubao-seedance-2-0-fast-260128">Seedance 2.0 Fast</option><option value="minimax-h3">MiniMax H3</option></select></label>
                                <label className="admin-field"><span>视频时长</span><select value={detailVideoModel === "minimax-h3" ? normalizeMiniMaxH3Duration(detailForm.duration) : Number(detailForm.duration || 15)} onChange={(event) => setDetailForm({ ...detailForm, duration: Number(event.target.value) })}>{(detailVideoModel === "minimax-h3" ? Array.from({ length: 12 }, (_, index) => index + 4) : [5, 10, 15]).map((item) => <option value={item} key={item}>{item} 秒</option>)}</select></label>
                                <label className="admin-field"><span>{detailVideoModel === "minimax-h3" ? "输出分辨率" : "生成模式"}</span><select value={detailVideoModel === "minimax-h3" ? normalizeMiniMaxH3Resolution(detailForm.resolution) : detailForm.mode || "pro"} onChange={(event) => setDetailForm(detailVideoModel === "minimax-h3" ? { ...detailForm, resolution: event.target.value } : { ...detailForm, mode: event.target.value })}>{detailVideoModel === "minimax-h3" ? <><option value="768P">768P</option><option value="2K">2K</option></> : <><option value="std">Standard</option><option value="pro">Pro</option><option value="4k">4K</option></>}</select></label>
                                {detailVideoModel === "minimax-h3" && <><label className="admin-field"><span>画幅策略</span><select value={normalizeMiniMaxH3RatioMode(detailForm.ratioMode)} onChange={(event) => setDetailForm({ ...detailForm, ratioMode: event.target.value })}><option value="fixed">固定 / 首帧自适应</option><option value="adaptive">多模态自适应</option></select></label><label className="publish-toggle"><div><strong>AIGC 水印</strong><small>MiniMax 输出标识</small></div><input type="checkbox" checked={Boolean(detailForm.aigcWatermark)} onChange={(event) => setDetailForm({ ...detailForm, aigcWatermark: event.target.checked })} /><span /></label></>}
                                <label className="admin-field"><span>生成路径</span><input value={detailForm.generationPath || "/api/tasks/video"} onChange={(event) => setDetailForm({ ...detailForm, generationPath: event.target.value })} /></label>
                              </div>
                              <label className="admin-field"><span>视频节点提示词</span><textarea value={detailForm.promptText || ""} onChange={(event) => setDetailForm({ ...detailForm, promptText: event.target.value })} /></label>
                              <label className="admin-field"><span>视频反向提示词</span><textarea value={detailForm.negativePrompt || ""} onChange={(event) => setDetailForm({ ...detailForm, negativePrompt: event.target.value })} /></label>
                            </>
                          )}
                          {detailWorkflowNode === "asset" && detailVideoModel !== "minimax-h3" && (
                            <div className="template-node-form-grid">
                              <label className="admin-field"><span>绑定方式</span><select value={detailForm.digitalAssetMode || "optional"} onChange={(event) => setDetailForm({ ...detailForm, digitalAssetMode: event.target.value })}><option value="none">不添加</option><option value="optional">可选绑定</option><option value="required">必须绑定</option></select></label>
                              <div className="template-node-readonly"><strong>模型连接</strong><span>{detailVideoConnection.detail}</span></div>
                            </div>
                          )}
                        </section>
                      </section>
                    </>
                  ) : (
                    <>
                  <div className="detail-template-parameter-grid">
                    <label className="admin-field">
                      <span>使用模型</span>
                      <select
                        value={detailForm.model || "gpt-image-2"}
                        onChange={(event) =>
                          setDetailForm({
                            ...detailForm,
                            model: event.target.value,
                          })
                        }
                      >
                        <option value="gpt-image-2">GPT Image 2 · Azure</option>
                        <option value="vapeur-gpt-image-2">GPT Image 2 · Vapeur</option>
                      </select>
                    </label>
                    <label className="admin-field">
                      <span>画面比例</span>
                      <select
                        value={detailForm.aspectRatio || detailForm.ratio || "1:1"}
                        onChange={(event) =>
                          setDetailForm({
                            ...detailForm,
                            aspectRatio: event.target.value,
                          })
                        }
                      >
                        <option value="1:1">1:1</option>
                        <option value="3:4">3:4</option>
                        <option value="4:3">4:3</option>
                        <option value="9:16">9:16</option>
                        <option value="16:9">16:9</option>
                      </select>
                    </label>
                    <label className="admin-field">
                      <span>清晰度</span>
                      <select
                        value={detailForm.resolution || "2k"}
                        onChange={(event) =>
                          setDetailForm({
                            ...detailForm,
                            resolution: event.target.value,
                          })
                        }
                      >
                        <option value="1k">1K</option>
                        <option value="2k">2K</option>
                        <option value="4k">4K</option>
                      </select>
                    </label>
                    <label className="admin-field">
                      <span>生成质量</span>
                      <select
                        value={detailForm.quality || "high"}
                        onChange={(event) =>
                          setDetailForm({
                            ...detailForm,
                            quality: event.target.value,
                          })
                        }
                      >
                        <option value="high">High 高质量</option>
                        <option value="medium">Medium 平衡</option>
                        <option value="low">Low 快速</option>
                      </select>
                    </label>
                    <label className="admin-field">
                      <span>生成数量</span>
                      <select
                        value={Number(detailForm.count || 1)}
                        onChange={(event) =>
                          setDetailForm({
                            ...detailForm,
                            count: Number(event.target.value),
                          })
                        }
                      >
                        <option value="1">1 张</option>
                        <option value="2">2 张</option>
                        <option value="4">4 张</option>
                      </select>
                    </label>
                    <label className="admin-field">
                      <span>输出格式</span>
                      <select
                        value={detailForm.outputFormat || "png"}
                        onChange={(event) =>
                          setDetailForm({
                            ...detailForm,
                            outputFormat: event.target.value,
                          })
                        }
                      >
                        <option value="png">PNG</option>
                        <option value="jpeg">JPEG</option>
                        <option value="webp">WebP</option>
                      </select>
                    </label>
                  </div>
                  <div className="detail-template-switch-grid">
                    {[
                      ["preserveSubject", "保持主体一致性", "锁定商品、人物、颜色、材质与 Logo"],
                      ["useNegativePrompt", "启用反向提示词", "生成时自动追加下方反向约束"],
                      ["allowText", "允许新增文字", "允许模型生成标题或营销文字"],
                    ].map(([key, label, description]) => (
                      <label className="detail-parameter-switch" key={key}>
                        <span>
                          <strong>{label}</strong>
                          <small>{description}</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={
                            key === "allowText"
                              ? Boolean(detailForm[key])
                              : detailForm[key] !== false
                          }
                          onChange={(event) =>
                            setDetailForm({
                              ...detailForm,
                              [key]: event.target.checked,
                            })
                          }
                        />
                        <i />
                      </label>
                    ))}
                  </div>
                    </>
                  )}
                </section>
                <label className="admin-field detail-template-prompt-editor">
                  <span>生成提示词</span>
                  <textarea
                    maxLength="8000"
                    value={detailForm.promptText}
                    onChange={(event) =>
                      setDetailForm({
                        ...detailForm,
                        promptText: event.target.value,
                      })
                    }
                  />
                  <small>{detailForm.promptText.length} / 8000</small>
                </label>
                <label className="admin-field detail-template-negative-editor">
                  <span>反向提示词</span>
                  <textarea
                    value={detailForm.negativePrompt || ""}
                    onChange={(event) =>
                      setDetailForm({
                        ...detailForm,
                        negativePrompt: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button
                className="admin-secondary"
                onClick={() => setDetailEditorOpen(false)}
              >
                取消
              </button>
              <button
                className="admin-primary"
                disabled={detailSaving}
                onClick={saveDetailTemplate}
              >
                {detailSaving ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Save size={16} />
                )}
                保存模版配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PageTitle({ action }) {
  if (!action) return null;
  return (
    <div className="admin-page-title admin-page-title-actions-only">
      {action}
    </div>
  );
}
function CardHead({ title, subtitle, tag }) {
  return (
    <div className="card-head">
      <div>
        <h3>{title}</h3>
      </div>
      {tag && (
        <span>
          <i />
          {tag}
        </span>
      )}
    </div>
  );
}
function StatusBadge({ status }) {
  return (
    <span className={`status-chip ${status}`}>
      <i />
      {status === "active" ? "正常" : "已停用"}
    </span>
  );
}
function EmptyInline({ text }) {
  return (
    <div className="empty-inline">
      <Activity size={18} />
      <span>{text}</span>
    </div>
  );
}
function LoadingBlock() {
  return (
    <div className="loading-block">
      <LoaderCircle className="spin" size={24} />
      <span>正在加载管理数据</span>
    </div>
  );
}

function AdminApp() {
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [inspirationConfig, setInspirationConfig] = useState(null);
  const [hotRankConfig, setHotRankConfig] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [enteringStudio, setEnteringStudio] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);

  const notify = useCallback(
    (message, type = "success") => setToast({ message, type, id: Date.now() }),
    [],
  );
  const logout = useCallback(() => {
    adminSession.clear();
    setAdmin(null);
    setDashboard(null);
  }, []);

  const loadAll = useCallback(
    async (quiet = false) => {
      if (!quiet) setRefreshing(true);
      try {
        const [
          dashboardResult,
          userResult,
          ledgerResult,
          templateResult,
          inspirationConfigResult,
          hotRankConfigResult,
        ] =
          await Promise.all([
            adminApi.dashboard(),
            adminApi.users(),
            adminApi.points(),
            adminApi.templates(),
            adminApi.inspirationGenerationConfig(),
            adminApi.hotRankRemakeConfig(),
          ]);
        setDashboard(dashboardResult);
        setUsers(userResult);
        setLedger(ledgerResult);
        setTemplates(templateResult);
        setInspirationConfig(inspirationConfigResult);
        setHotRankConfig(hotRankConfigResult);
      } catch (error) {
        if (error.status === 401) logout();
        else notify(error.message, "error");
      } finally {
        setRefreshing(false);
      }
    },
    [logout, notify],
  );

  useEffect(() => {
    const restore = async () => {
      if (!adminSession.get() && LOCAL_ADMIN_PREVIEW) {
        const localSession = await adminApi.localAdminSession();
        adminSession.set(localSession.token);
      }
      if (!adminSession.get()) return;
      const result = await adminApi.me();
      setAdmin(result);
      await loadAll(true);
    };
    restore()
      .catch(() => logout())
      .finally(() => setChecking(false));
  }, [loadAll, logout]);
  useEffect(() => {
    if (admin) void loadAll(true);
  }, [admin, loadAll]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleLogin = (result) => {
    setAdmin(result);
    setChecking(false);
  };
  const toggleUser = async (user) => {
    try {
      await adminApi.updateUser(user.id, {
        status: user.status === "active" ? "disabled" : "active",
      });
      notify(`已${user.status === "active" ? "停用" : "启用"} ${user.name}`);
      await loadAll(true);
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const toggleInspirationAccess = async (user) => {
    const enabled = user.templateAccess !== true;
    if (
      !window.confirm(
        `确定${enabled ? "升级" : "降级"}「${user.name}」的模版权限吗？`,
      )
    )
      return;
    try {
      await adminApi.updateUser(user.id, { templateAccess: enabled });
      setModal(null);
      notify(`已将「${user.name}」${enabled ? "升级为模版用户" : "降为创作者"}`);
      await loadAll(true);
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const deleteUser = async (user) => {
    if (
      !window.confirm(
        `确定删除用户「${user.name}」吗？该用户的任务、模版和数字资产会一并删除，积分流水将作为审计记录保留。`,
      )
    )
      return;
    try {
      await adminApi.deleteUser(user.id);
      setModal(null);
      notify(`用户「${user.name}」已删除`);
      await loadAll(true);
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const toggleTemplate = async (template) => {
    try {
      await adminApi.updateTemplate(template.id, {
        enabled: !template.enabled,
      });
      notify(`画布已${template.enabled ? "停用" : "启用"}`);
      await loadAll(true);
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const deleteTemplate = async (template) => {
    if (!window.confirm(`确定删除画布「${template.name}」吗？`)) return;
    try {
      await adminApi.deleteTemplate(template.id);
      notify("画布已删除");
      await loadAll(true);
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const reviewTemplate = async (template, decision) => {
    const action =
      template.approvalStatus === "pending_delete" && decision === "approve"
        ? "批准删除"
        : decision === "approve"
          ? "批准发布"
          : "驳回申请";
    if (!window.confirm(`确定${action}模版「${template.name}」吗？`)) return;
    try {
      const result = await adminApi.reviewTemplate(template.id, decision);
      notify(
        result.deleted
          ? "全域模版已删除"
          : decision === "approve"
            ? "审批已通过"
            : "申请已驳回",
      );
      await loadAll(true);
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const enterStudio = async () => {
    setEnteringStudio(true);
    try {
      const result = await adminApi.enterStudio();
      localStorage.setItem("commerce-canvas_user_token", result.token);
      window.location.assign(result.destination || "/#/workflow");
    } catch (error) {
      notify(error.message, "error");
      setEnteringStudio(false);
    }
  };

  if (checking)
    return (
      <div className="admin-boot">
        <Aperture size={28} />
        <LoaderCircle className="spin" size={20} />
      </div>
    );
  if (!admin) return <LoginPage onLogin={handleLogin} />;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-logo">
          <span>
            <Aperture size={20} />
          </span>
          <div>
            <strong>Commerce Canvas</strong>
            <small>ADMIN</small>
          </div>
        </div>
        <nav>
          {NAV_ITEMS.map(({ id, label, icon: Icon, child }) => (
            <button
              className={`${page === id ? "active" : ""}${child ? " admin-nav-child" : ""}`}
              key={id}
              aria-label={label}
              onClick={() => setPage(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "users" && <b>{users.length}</b>}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-foot">
          <button
            className="enter-studio-button"
            disabled={enteringStudio}
            aria-label={enteringStudio ? "正在进入创作平台" : "打开创作平台"}
            onClick={enterStudio}
          >
            {enteringStudio ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <ExternalLink size={16} />
            )}
            <span>{enteringStudio ? "正在进入创作平台" : "打开创作平台"}</span>
          </button>
          <button onClick={logout} aria-label="退出登录">
            <LogOut size={16} />
            <span>退出登录</span>
          </button>
          <div className="admin-profile">
            <span>{admin.username.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{admin.username}</strong>
              <small>{admin.role}</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="online-pulse" />
            <strong>管理服务正常</strong>
            <small>安全会话 · 本机访问</small>
          </div>
          <div>
            <span className="topbar-time">
              {new Date().toLocaleDateString("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </span>
            <button
              className="admin-refresh"
              disabled={refreshing}
              onClick={() => loadAll()}
            >
              <RefreshCw className={refreshing ? "spin" : ""} size={15} />
              刷新数据
            </button>
          </div>
        </header>
        <div className="admin-content">
          {page === "dashboard" && <DashboardPage data={dashboard} />}
          {page === "models" && <ModelsApiPage notify={notify} />}
          {page === "users" && (
            <UsersPage
              users={users}
              onCreate={() => setModal({ type: "user" })}
              onToggle={toggleUser}
              onPoints={(user) => setModal({ type: "points", user })}
              onOpen={(user) => setModal({ type: "userDetail", user })}
            />
          )}
          {page === "points" && (
            <PointsPage
              dashboard={dashboard}
              ledger={ledger}
              users={users}
              onAdjust={(user) => setModal({ type: "points", user })}
            />
          )}
          {page === "templates" && (
            <TemplatesPage
              templates={templates}
              onCreate={() => setModal({ type: "template" })}
              onEdit={(template) => setModal({ type: "template", template })}
              onToggle={toggleTemplate}
              onDelete={deleteTemplate}
              onReview={reviewTemplate}
            />
          )}
          {page === "mcp" && (
            <McpAccessPanel
              variant="admin"
              loadAccess={adminApi.mcpAccess}
              createToken={adminApi.createMcpToken}
              revokeToken={adminApi.revokeMcpToken}
              loadAudit={adminApi.mcpAudit}
              notify={notify}
            />
          )}
          {page === "inspiration" && (
            <InspirationSettingsPage
              config={inspirationConfig}
              notify={notify}
              onSaved={setInspirationConfig}
              section="templates"
            />
          )}
          {page === "globalConfig" && (
            <InspirationSettingsPage
              config={inspirationConfig}
              hotRankConfig={hotRankConfig}
              notify={notify}
              onSaved={setInspirationConfig}
              onHotRankSaved={setHotRankConfig}
              section="global"
            />
          )}
        </div>
      </main>
      {modal?.type === "user" && (
        <UserModal
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            notify("用户已创建");
            await loadAll(true);
          }}
        />
      )}
      {modal?.type === "points" && (
        <PointsModal
          users={users}
          initialUser={modal.user}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            notify("积分已调整");
            await loadAll(true);
          }}
        />
      )}
      {modal?.type === "template" && (
        <TemplateModal
          template={modal.template}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            notify(modal.template ? "模版已更新" : "模版已创建");
            await loadAll(true);
          }}
        />
      )}
      {modal?.type === "userDetail" && (
        <UserDetailDrawer
          user={modal.user}
          onClose={() => setModal(null)}
          notify={notify}
          onDelete={deleteUser}
          onToggleInspiration={toggleInspirationAccess}
          onPassword={(user) => setModal({ type: "password", user })}
        />
      )}
      {modal?.type === "password" && (
        <PasswordModal
          user={modal.user}
          onClose={() => setModal({ type: "userDetail", user: modal.user })}
          onSaved={async () => {
            notify(`已修改 ${modal.user.name} 的登录密码`);
            setModal({ type: "userDetail", user: modal.user });
          }}
        />
      )}
      {toast && (
        <div className={`admin-toast ${toast.type}`} key={toast.id}>
          {toast.type === "error" ? (
            <X size={16} />
          ) : (
            <CheckCircle2 size={16} />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function UserModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    contact: "",
    plan: "基础版",
    initialPoints: 100,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await adminApi.createUser({
        ...form,
        initialPoints: Number(form.initialPoints),
      });
      await onSaved();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="新增平台用户"
      description="创建用户并设置套餐与初始积分。"
      onClose={onClose}
      footer={
        <>
          <button className="admin-secondary" onClick={onClose}>
            取消
          </button>
          <button className="admin-primary" disabled={saving} onClick={save}>
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            保存用户
          </button>
        </>
      }
    >
      <div className="modal-form-grid">
        <label className="admin-field">
          <span>用户名称</span>
          <input
            autoFocus
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="例如：上海直播团队"
          />
        </label>
        <label className="admin-field">
          <span>联系方式</span>
          <input
            value={form.contact}
            onChange={(event) =>
              setForm({ ...form, contact: event.target.value })
            }
            placeholder="邮箱或手机号"
          />
        </label>
        <label className="admin-field">
          <span>用户套餐</span>
          <select
            value={form.plan}
            onChange={(event) => setForm({ ...form, plan: event.target.value })}
          >
            <option>基础版</option>
            <option>专业版</option>
            <option>工作室版</option>
            <option>企业版</option>
          </select>
        </label>
        <label className="admin-field">
          <span>初始积分</span>
          <input
            type="number"
            min="0"
            max="1000000"
            value={form.initialPoints}
            onChange={(event) =>
              setForm({ ...form, initialPoints: event.target.value })
            }
          />
        </label>
      </div>
      {error && <div className="modal-error">{error}</div>}
    </Modal>
  );
}

function PointsModal({ users, initialUser, onClose, onSaved }) {
  const [userId, setUserId] = useState(initialUser?.id || users[0]?.id || "");
  const [amount, setAmount] = useState(100);
  const [reason, setReason] = useState("运营活动发放");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = users.find((user) => user.id === userId);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await adminApi.adjustPoints(userId, { amount: Number(amount), reason });
      await onSaved();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="调整用户积分"
      description="正数为发放，负数为扣减；所有操作都会记录流水。"
      onClose={onClose}
      footer={
        <>
          <button className="admin-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="admin-primary"
            disabled={saving || !userId}
            onClick={save}
          >
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <CircleDollarSign size={16} />
            )}
            确认调整
          </button>
        </>
      }
    >
      <label className="admin-field">
        <span>目标用户</span>
        <select
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
        >
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} · 余额 {user.pointsBalance}
            </option>
          ))}
        </select>
      </label>
      <div className="points-preview">
        <span>
          当前余额<strong>{number.format(selected?.pointsBalance || 0)}</strong>
        </span>
        <b>
          {Number(amount) >= 0 ? "+" : ""}
          {number.format(Number(amount) || 0)}
        </b>
        <span>
          调整后
          <strong>
            {number.format(
              (selected?.pointsBalance || 0) + (Number(amount) || 0),
            )}
          </strong>
        </span>
      </div>
      <div className="modal-form-grid">
        <label className="admin-field">
          <span>积分变动</span>
          <input
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label className="admin-field">
          <span>变动原因</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      </div>
      {error && <div className="modal-error">{error}</div>}
    </Modal>
  );
}

function PasswordModal({ user, onClose, onSaved }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (password.length < 8) return setError("新密码至少需要 8 位");
    if (password !== confirmPassword) return setError("两次输入的密码不一致");
    setSaving(true);
    setError("");
    try {
      await adminApi.resetUserPassword(user.id, password);
      await onSaved();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={`修改 ${user.name} 的密码`}
      description="保存后用户下次登录需使用新密码，管理员不会看到原密码。"
      onClose={onClose}
      footer={
        <>
          <button className="admin-secondary" onClick={onClose}>
            取消
          </button>
          <button className="admin-primary" disabled={saving} onClick={save}>
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <KeyRound size={16} />
            )}
            保存新密码
          </button>
        </>
      }
    >
      <label className="admin-field">
        <span>新密码</span>
        <div className="admin-password-input">
          <input
            autoFocus
            type={visible ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 8 位"
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </label>
      <label className="admin-field">
        <span>确认新密码</span>
        <input
          type={visible ? "text" : "password"}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void save()}
        />
      </label>
      {error && <div className="modal-error">{error}</div>}
    </Modal>
  );
}

function TemplateModal({ template, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: template?.name || "",
    category: template?.category || "自定义",
    description: template?.description || "",
    visibility: template?.visibility || (template?.public ? "global" : "private"),
    runMode: template?.runMode || "backend",
    enabled: template?.enabled !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (template) await adminApi.updateTemplate(template.id, form);
      else await adminApi.createTemplate(form);
      await onSaved();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={template ? "编辑画布设置" : "创建空白画布"}
      description="与创作者端项目中心使用同一份设置；名称、范围和状态保存后立即同步。"
      onClose={onClose}
      footer={
        <>
          <button className="admin-secondary" onClick={onClose}>
            取消
          </button>
          <button className="admin-primary" disabled={saving} onClick={save}>
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            {template ? "保存画布设置" : "创建空白画布"}
          </button>
        </>
      }
    >
      <div className="modal-form-grid">
        <label className="admin-field">
          <span>画布名称</span>
          <input
            autoFocus
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label className="admin-field">
          <span>业务分类</span>
          <select
            value={form.category}
            onChange={(event) =>
              setForm({ ...form, category: event.target.value })
            }
          >
            <option>自定义</option>
            <option>数字人</option>
            <option>电商服饰</option>
            <option>商品营销</option>
            <option>社媒种草</option>
          </select>
        </label>
      </div>
      <div className="modal-form-grid">
        <label className="admin-field">
          <span>画布范围</span>
          <select
            value={form.visibility}
            onChange={(event) =>
              setForm({ ...form, visibility: event.target.value })
            }
          >
            <option value="private">个人画布</option>
            {template?.visibility === "team" && (
              <option value="team">团队画布</option>
            )}
            <option value="global">全域画布</option>
          </select>
        </label>
        <label className="admin-field">
          <span>执行方式</span>
          <select value={form.runMode} disabled>
            <option value="backend">后端同步执行</option>
          </select>
        </label>
      </div>
      <label className="admin-field">
        <span>画布说明</span>
        <textarea
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
        />
      </label>
      {template && (
        <div className="canvas-sync-summary">
          <span>
            <strong>{Array.isArray(template.nodes) ? template.nodes.length : template.nodeCount || 0}</strong>
            <small>节点</small>
          </span>
          <span>
            <strong>{Array.isArray(template.edges) ? template.edges.length : 0}</strong>
            <small>连线</small>
          </span>
          <p>节点、连线和模型参数以项目中心内保存的设置为准，后台不再维护重复配置。</p>
        </div>
      )}
      <label className="publish-toggle">
        <div>
          <strong>启用画布</strong>
          <small>关闭后创作者端将停止显示和调用此画布</small>
        </div>
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(event) =>
            setForm({ ...form, enabled: event.target.checked })
          }
        />
        <span />
      </label>
      {error && <div className="modal-error">{error}</div>}
    </Modal>
  );
}

const adminRootElement = document.getElementById("admin-root");
const adminRoot =
  globalThis.__LINGFLOW_ADMIN_ROOT__ || createRoot(adminRootElement);
globalThis.__LINGFLOW_ADMIN_ROOT__ = adminRoot;

adminRoot.render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>,
);

