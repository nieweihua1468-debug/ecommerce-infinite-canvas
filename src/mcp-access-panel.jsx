import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  Clipboard,
  Download,
  KeyRound,
  LoaderCircle,
  MessageSquareText,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import {
  buildCodexSetup,
  buildSiteHandoff,
  mcpClientIdentity,
} from "../shared/mcp-client-package.js";
import "./mcp-access.css";

const formatTime = (value) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "从未";

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

export function McpAccessPanel({
  variant = "user",
  loadAccess,
  createToken,
  revokeToken,
  loadAudit,
  notify,
}) {
  const adminMode = variant === "admin";
  const [access, setAccess] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [tokenName, setTokenName] = useState(adminMode ? "后台 Codex" : "我的 Codex");
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [createdSecret, setCreatedSecret] = useState("");
  const [createdTokenId, setCreatedTokenId] = useState("");
  const [copied, setCopied] = useState("");
  const [intent, setIntent] = useState(
    adminMode
      ? "检查后台模板结构，找出可复用和需要优化的节点，并在我确认后修改"
      : "检查我的视频创作项目和素材，给出可直接执行的优化方案",
  );
  const [connectionState, setConnectionState] = useState({
    status: "idle",
    message: "创建令牌后可检测 Codex MCP 链路",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [accessResult, auditResult] = await Promise.all([
        loadAccess(),
        loadAudit(),
      ]);
      setAccess(accessResult);
      setAudit(auditResult || []);
    } catch (caught) {
      setError(caught.message || "MCP 接入信息加载失败");
    } finally {
      setLoading(false);
    }
  }, [loadAccess, loadAudit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { envName, serverName } = mcpClientIdentity(adminMode ? "admin" : "user");
  const codexCommand = useMemo(() => {
    return buildCodexSetup({
      endpoint: access?.endpoint,
      token: createdSecret,
      role: adminMode ? "admin" : "user",
    });
  }, [access?.endpoint, adminMode, createdSecret]);
  const siteHandoff = useMemo(
    () =>
      buildSiteHandoff({
        endpoint: access?.endpoint,
        siteUrl:
          typeof window === "undefined"
            ? ""
            : `${window.location.origin}${window.location.pathname}${window.location.hash}`,
        role: access?.role || (adminMode ? "admin" : "user"),
        accountName: access?.account?.name,
        scopeLabel: access?.scope?.label,
        tools: access?.tools,
        intent,
      }),
    [access, adminMode, intent],
  );

  const flashCopied = async (key, value) => {
    try {
      await copyText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1800);
      notify?.("已复制到剪贴板", "success");
    } catch {
      notify?.("复制失败，请手动选择文本", "error");
    }
  };

  const issue = async () => {
    if (tokenName.trim().length < 2) {
      notify?.("令牌名称至少需要 2 个字符", "error");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createToken({
        name: tokenName.trim(),
        expiresInDays: Number(expiresInDays),
      });
      setAccess(result.access);
      setCreatedSecret(result.token);
      setCreatedTokenId(result.record?.id || "");
      setConnectionState({
        status: "idle",
        message: "令牌已就绪，可立即检测 MCP 连接",
      });
      const nextAudit = await loadAudit().catch(() => audit);
      setAudit(nextAudit || []);
      notify?.("MCP 令牌已创建，明文只显示这一次", "success");
    } catch (caught) {
      notify?.(caught.message || "MCP 令牌创建失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const testConnection = async () => {
    if (!createdSecret || !access?.endpoint) {
      notify?.("请先创建一个新的 MCP 令牌", "error");
      return;
    }
    setConnectionState({ status: "testing", message: "正在验证 MCP Bearer 令牌与协议响应" });
    try {
      const browserEndpoint =
        typeof window === "undefined"
          ? access.endpoint
          : new URL(access.endpoint, window.location.origin).origin === window.location.origin
            ? access.endpoint
            : `${window.location.origin}/mcp`;
      const response = await fetch(browserEndpoint, {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${createdSecret}`,
          "Content-Type": "application/json",
          "MCP-Protocol-Version": access.protocolVersions?.[0] || "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `studio-check-${Date.now()}`,
          method: "ping",
          params: {},
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.error)
        throw new Error(payload?.error?.message || `连接失败（${response.status}）`);
      setConnectionState({ status: "success", message: "连接已验证，Codex 可调用当前账号工具" });
      notify?.("MCP 连接验证成功", "success");
      const nextAudit = await loadAudit().catch(() => audit);
      setAudit(nextAudit || []);
    } catch (caught) {
      setConnectionState({ status: "failed", message: caught.message || "MCP 连接验证失败" });
      notify?.(caught.message || "MCP 连接验证失败", "error");
    }
  };

  const revoke = async (record) => {
    if (!window.confirm(`确定撤销 MCP 令牌「${record.name}」吗？撤销后 Codex 会立即失去访问权限。`))
      return;
    try {
      await revokeToken(record.id);
      if (record.id === createdTokenId) {
        setCreatedSecret("");
        setCreatedTokenId("");
      }
      await refresh();
      notify?.("MCP 令牌已撤销", "success");
    } catch (caught) {
      notify?.(caught.message || "撤销失败", "error");
    }
  };

  const exportConfig = () => {
    if (!createdSecret || !access?.endpoint) return;
    const payload = {
      name: serverName,
      transport: "streamable-http",
      url: access.endpoint,
      authorization: {
        type: "bearer",
        envVar: envName,
        token: createdSecret,
      },
      codex: {
        command: `codex mcp add ${serverName} --url ${access.endpoint} --bearer-token-env-var ${envName}`,
        setup: codexCommand,
      },
      permissions: {
        role: access.role,
        tools: (access.tools || []).map((tool) => tool.name),
      },
      exportedAt: new Date().toISOString(),
      securityNotice: "此文件包含 MCP 访问令牌，请勿上传网盘、代码仓库或转发给他人。",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${serverName}-mcp.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify?.("MCP 配置已导出", "success");
  };

  if (loading && !access)
    return (
      <div className="mcp-access-loading">
        <LoaderCircle className="spin" size={20} /> 正在读取 MCP 接入状态
      </div>
    );

  if (error && !access)
    return (
      <div className="mcp-access-error">
        <strong>MCP 接入信息加载失败</strong>
        <span>{error}</span>
        <button className="secondary-button" onClick={() => void refresh()}>
          <RefreshCw size={14} />重试
        </button>
      </div>
    );

  const activeTokens = (access?.tokens || []).filter((token) => token.isActive);

  return (
    <div className={`mcp-access-panel ${adminMode ? "admin-mode" : "user-mode"}`}>
      <section className="mcp-access-hero">
        <div className="mcp-access-hero-icon">
          {adminMode ? <ShieldCheck size={24} /> : <TerminalSquare size={24} />}
        </div>
        <div>
          <h3>{adminMode ? "管理员 MCP 接入" : "创作 MCP 接入"}</h3>
        </div>
        <div className="mcp-access-status">
          <span><i />MCP 服务已发布</span>
          <small>{access?.tools?.length || 0} 个工具 · {activeTokens.length} 个有效令牌</small>
        </div>
      </section>

      <section className="mcp-card mcp-codex-quickstart">
        <header>
          <div><strong>快速交给 Codex</strong></div>
          <Bot size={18} />
        </header>
        <div className="mcp-codex-workbench">
          <div className="mcp-intent-editor">
            <label htmlFor={`mcp-intent-${variant}`}>这次希望 Codex 协助什么</label>
            <textarea
              id={`mcp-intent-${variant}`}
              value={intent}
              maxLength={800}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="例如：读取我的千川口播画布，检查提示词和节点顺序并优化"
            />
            <div className="mcp-intent-presets">
              {(adminMode
                ? ["审查后台模板节点", "批量优化模板提示词", "检查模板发布范围"]
                : ["优化视频画布", "整理素材与任务", "设计批量创作流程"]
              ).map((preset) => (
                <button key={preset} type="button" onClick={() => setIntent(preset)}>{preset}</button>
              ))}
            </div>
          </div>
          <div className="mcp-quick-actions">
            <article>
              <span>01</span>
              <div><strong>安装到 Codex</strong><small>{createdSecret ? "新令牌已就绪" : "先在下方创建一次性令牌"}</small></div>
              <button
                className="secondary-button"
                disabled={!codexCommand}
                onClick={() => void flashCopied("quick-command", codexCommand)}
              >
                {copied === "quick-command" ? <Check size={14} /> : <TerminalSquare size={14} />}
                复制安装命令
              </button>
            </article>
            <article>
              <span>02</span>
              <div><strong>验证连接</strong><small className={`mcp-connection-${connectionState.status}`}>{connectionState.message}</small></div>
              <button
                className="secondary-button"
                disabled={!createdSecret || connectionState.status === "testing"}
                onClick={() => void testConnection()}
              >
                {connectionState.status === "testing" ? <LoaderCircle className="spin" size={14} /> : <PlugZap size={14} />}
                {connectionState.status === "testing" ? "检测中" : "检测连接"}
              </button>
            </article>
            <article className="mcp-handoff-action">
              <span>03</span>
              <div><strong>复制站点资料</strong><small>不含令牌，可安全粘贴到自己的 Codex 任务</small></div>
              <button
                className="primary-button"
                onClick={() => void flashCopied("handoff", siteHandoff)}
              >
                {copied === "handoff" ? <Check size={14} /> : <MessageSquareText size={14} />}
                复制给 Codex
              </button>
            </article>
          </div>
        </div>
      </section>

      <div className="mcp-access-grid">
        <section className="mcp-card mcp-token-issuer">
          <header>
            <div><strong>创建访问令牌</strong><small>明文仅在创建后显示一次</small></div>
            <KeyRound size={18} />
          </header>
          <div className="mcp-token-form">
            <label><span>令牌名称</span><input value={tokenName} maxLength={60} onChange={(event) => setTokenName(event.target.value)} /></label>
            <label><span>有效期</span><select value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))}><option value={30}>30 天</option><option value={90}>90 天</option><option value={180}>180 天</option><option value={365}>365 天</option></select></label>
            <button className="primary-button" disabled={submitting} onClick={() => void issue()}>
              {submitting ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />}
              {submitting ? "创建中" : "创建 MCP 令牌"}
            </button>
          </div>
          <div className="mcp-endpoint">
            <span>MCP 地址</span>
            <code>{access?.endpoint}</code>
            <button title="复制 MCP 地址" onClick={() => void flashCopied("endpoint", access?.endpoint || "")}>
              {copied === "endpoint" ? <Check size={14} /> : <Clipboard size={14} />}
            </button>
          </div>
        </section>

        <section className="mcp-card mcp-permission-card">
          <header><div><strong>当前权限</strong><small>{access?.role === "admin" ? "平台管理员" : "当前创作账号"}</small></div><ShieldCheck size={18} /></header>
          <div className="mcp-tool-list">
            {(access?.tools || []).map((tool) => (
              <span key={tool.name} className={tool.name.startsWith("admin_") ? "admin-tool" : ""} title={tool.description}>
                <code>{tool.name}</code><small>{tool.title}</small>
              </span>
            ))}
          </div>
        </section>
      </div>

      {createdSecret && (
        <section className="mcp-secret-card">
          <header>
            <div><strong>新令牌已生成</strong><small>关闭或刷新后无法再次查看，请立即复制或导出</small></div>
            <span>仅显示一次</span>
          </header>
          <div className="mcp-secret-value">
            <code>{createdSecret}</code>
            <button onClick={() => void flashCopied("secret", createdSecret)}>
              {copied === "secret" ? <Check size={14} /> : <Clipboard size={14} />}复制令牌
            </button>
          </div>
          <div className="mcp-codex-command">
            <span>Codex 安装命令</span>
            <pre>{codexCommand}</pre>
          </div>
          <div className="mcp-secret-actions">
            <button className="secondary-button" onClick={() => void flashCopied("command", codexCommand)}>
              {copied === "command" ? <Check size={14} /> : <Clipboard size={14} />}复制 Codex 命令
            </button>
            <button className="primary-button" onClick={exportConfig}>
              <Download size={14} />下载含密钥配置
            </button>
          </div>
        </section>
      )}

      <section className="mcp-card mcp-token-list-card">
        <header>
          <div><strong>访问令牌</strong><small>令牌撤销后立即失效；服务端只保存哈希</small></div>
          <button className="mcp-icon-button" title="刷新" onClick={() => void refresh()}><RefreshCw size={15} /></button>
        </header>
        <div className="mcp-token-list">
          {!access?.tokens?.length && <div className="mcp-empty">尚未创建 MCP 令牌</div>}
          {(access?.tokens || []).map((record) => (
            <article key={record.id} className={record.isActive ? "active" : "inactive"}>
              <span className="mcp-token-state"><i />{record.isActive ? "有效" : record.revokedAt ? "已撤销" : "已过期"}</span>
              <div><strong>{record.name}</strong><code>{record.tokenPrefix}</code></div>
              <small>创建 {formatTime(record.createdAt)}<br />最近使用 {formatTime(record.lastUsedAt)}</small>
              <small>到期 {formatTime(record.expiresAt)}<br />{record.role === "admin" ? "管理员工具" : "个人创作工具"}</small>
              {record.isActive && <button className="mcp-revoke-button" onClick={() => void revoke(record)}><Trash2 size={14} />撤销</button>}
            </article>
          ))}
        </div>
      </section>

      <section className="mcp-card mcp-audit-card">
        <header><div><strong>最近调用审计</strong><small>只记录工具、状态与耗时，不保存提示词或素材正文</small></div></header>
        <div className="mcp-audit-list">
          {!audit.length && <div className="mcp-empty">暂无 MCP 调用记录</div>}
          {audit.slice(0, 30).map((entry) => (
            <article key={entry.id}>
              <span className={entry.ok ? "ok" : "failed"}>{entry.ok ? "成功" : "失败"}</span>
              <code>{entry.toolName || entry.method}</code>
              <small>{entry.tokenName} · {entry.durationMs}ms</small>
              <time>{formatTime(entry.createdAt)}</time>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

