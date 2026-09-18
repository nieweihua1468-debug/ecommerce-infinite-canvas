import React, { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Film,
  Layers3,
  Link2,
  LoaderCircle,
  Play,
  ScanSearch,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";

const ACTIONS = [
  {
    id: "director",
    label: "搭建视频链路",
    description: "导演 → 视频 → 输出",
    icon: Film,
  },
  {
    id: "sync",
    label: "同步 @ 素材",
    description: "绑定到选中生成节点",
    icon: Link2,
  },
  {
    id: "optimize",
    label: "批量优化节点",
    description: "保留引用并增强提示词",
    icon: WandSparkles,
  },
  {
    id: "batch",
    label: "创建批处理",
    description: "多素材并行视频分支",
    icon: Layers3,
  },
];

const mentionToken = (node) =>
  `@${String(node?.data?.title || "节点").replace(/\s+/g, "")}`;

export function WorkflowAgentPanel({
  open,
  onClose,
  nodes = [],
  selectedNodeIds = [],
  mentionedNodeIds = [],
  onMentionChange,
  instruction,
  onInstructionChange,
  onSubmit,
  onAction,
  messages = [],
  busy = false,
  audit,
  activeRun,
  onRunCanvas,
}) {
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const textareaRef = useRef(null);
  const mentionNodes = useMemo(
    () =>
      nodes.filter(
        (node) =>
          !node?.data?.runtimeResultNode &&
          (!mentionQuery ||
            `${node.data?.title || ""} ${node.data?.subtitle || ""}`.includes(
              mentionQuery,
            )),
      ),
    [mentionQuery, nodes],
  );
  const mentionedNodes = mentionedNodeIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter(Boolean);
  const contextCount = mentionedNodeIds.length || selectedNodeIds.length;

  if (!open) return null;

  const chooseMention = (node) => {
    const token = mentionToken(node);
    const current = String(instruction || "");
    const caret = Number.isFinite(textareaRef.current?.selectionStart)
      ? textareaRef.current.selectionStart
      : current.length;
    const before = current.slice(0, caret);
    const after = current.slice(caret);
    const partial = before.match(/@[^@\s]*$/u);
    const start = partial ? caret - partial[0].length : caret;
    const prefix = start > 0 && !/\s$/u.test(current.slice(0, start)) ? " " : "";
    const next = `${current.slice(0, start)}${prefix}${token} ${after}`;
    onInstructionChange(next);
    if (!mentionedNodeIds.includes(node.id))
      onMentionChange([...mentionedNodeIds, node.id]);
    setMentionOpen(false);
    setMentionQuery("");
    window.requestAnimationFrame(() => {
      const nextCaret = start + prefix.length + token.length + 1;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  return (
    <aside
      className="workflow-agent-panel nodrag nowheel"
      aria-label="画布智能体助手"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="workflow-agent-head">
        <span className="workflow-agent-avatar">
          <Sparkles size={17} />
        </span>
        <div>
          <strong>Commerce Canvas视频智能体</strong>
          <small>
            <i /> 已读取当前画布
          </small>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭智能体助手">
          <X size={16} />
        </button>
      </header>

      <div className="workflow-agent-context">
        <div>
          <span>画布上下文</span>
          <strong>{audit?.stats?.nodes || 0} 节点</strong>
          <strong>{audit?.stats?.materials || 0} 素材</strong>
          <strong>{audit?.stats?.generators || 0} 生成</strong>
        </div>
        <small>
          {mentionedNodeIds.length
            ? `已 @ ${mentionedNodeIds.length} 个指定节点`
            : selectedNodeIds.length
              ? `自动使用画布中选中的 ${selectedNodeIds.length} 个节点`
              : "未指定时自动分析整张画布"}
        </small>
        {mentionedNodes.length > 0 && (
          <div className="workflow-agent-context-chips">
            {mentionedNodes.map((node) => (
              <button
                type="button"
                key={node.id}
                onClick={() =>
                  onMentionChange(mentionedNodeIds.filter((id) => id !== node.id))
                }
                title="移除节点上下文"
              >
                {mentionToken(node)} <X size={10} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="workflow-agent-thread" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} className={message.role || "assistant"}>
            {message.role !== "user" && (
              <span>
                {message.pending ? (
                  <LoaderCircle className="spin" size={13} />
                ) : (
                  <Sparkles size={13} />
                )}
              </span>
            )}
            <div>
              <p>{message.content}</p>
              {message.detail && <small>{message.detail}</small>}
            </div>
          </article>
        ))}
      </div>

      <section className="workflow-agent-actions">
        <header>
          <strong>快速执行</strong>
          <span>{contextCount ? `作用于 ${contextCount} 个节点` : "自动选择上下文"}</span>
        </header>
        <div>
          {ACTIONS.map(({ id, label, description, icon: ActionIcon }) => (
            <button
              type="button"
              key={id}
              disabled={busy}
              onClick={() => onAction(id)}
            >
              <ActionIcon size={15} />
              <span>
                <b>{label}</b>
                <small>{description}</small>
              </span>
              <ArrowRight size={13} />
            </button>
          ))}
        </div>
      </section>

      <section className="workflow-agent-audit">
        <header>
          <span>
            <ScanSearch size={14} /> 画布体检
          </span>
          <strong>{audit?.score ?? 100}</strong>
        </header>
        {audit?.issues?.length ? (
          audit.issues.slice(0, 3).map((issue) => (
            <p key={issue.label} className={issue.level}>
              <i /> {issue.label}
            </p>
          ))
        ) : (
          <p className="ready">
            <Check size={12} /> 当前链路结构完整，可继续优化或运行
          </p>
        )}
      </section>

      <form
        className="workflow-agent-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <textarea
          ref={textareaRef}
          value={instruction}
          onChange={(event) => {
            const next = event.target.value;
            onInstructionChange(next);
            const before = next.slice(0, event.target.selectionStart);
            const partial = before.match(/@([^@\s]*)$/u);
            if (partial) {
              setMentionOpen(true);
              setMentionQuery(partial[1] || "");
            }
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
            if (event.key === "Escape") setMentionOpen(false);
          }}
          placeholder="告诉智能体要制作或优化什么；输入 @ 引用节点…"
          aria-label="智能体指令"
        />
        {mentionOpen && (
          <div className="workflow-agent-mention-picker" role="listbox">
            <header>
              <strong>@ 画布节点</strong>
              <small>{mentionNodes.length} 项</small>
            </header>
            {mentionNodes.length ? (
              mentionNodes.slice(0, 12).map((node) => (
                <button
                  type="button"
                  key={node.id}
                  role="option"
                  aria-selected={mentionedNodeIds.includes(node.id)}
                  onClick={() => chooseMention(node)}
                >
                  <span>{String(node.data?.kind || "NODE").slice(0, 3)}</span>
                  <div>
                    <b>{node.data?.title || "未命名节点"}</b>
                    <small>{node.data?.subtitle || "画布节点"}</small>
                  </div>
                  {mentionedNodeIds.includes(node.id) && <Check size={13} />}
                </button>
              ))
            ) : (
              <p>没有匹配的画布节点</p>
            )}
          </div>
        )}
        <div>
          <button
            type="button"
            className="workflow-agent-mention-button"
            onClick={() => {
              setMentionOpen((current) => !current);
              setMentionQuery("");
              textareaRef.current?.focus();
            }}
            aria-expanded={mentionOpen}
          >
            <b>@</b> 节点
          </button>
          <small>⌘ Enter 执行</small>
          <button
            type="submit"
            className="workflow-agent-send"
            disabled={busy || !String(instruction || "").trim()}
            aria-label="执行智能体指令"
          >
            {busy ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />}
          </button>
        </div>
      </form>

      <footer className="workflow-agent-footer">
        <button type="button" disabled={busy || Boolean(activeRun)} onClick={onRunCanvas}>
          {activeRun ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}
          {activeRun ? "画布运行中" : "确认并运行画布"}
        </button>
        <span>执行前仍可撤销和修改节点</span>
      </footer>
    </aside>
  );
}

