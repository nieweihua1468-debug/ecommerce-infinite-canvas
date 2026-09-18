import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Check,
  Film,
  Flame,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api } from "./api";
import {
  HOT_RANK_AUTOPLAY_EXIT_RATIO,
  HOT_RANK_AUTOPLAY_RATIO,
  selectHotRankAutoplayCandidate,
} from "../shared/hot-rank-playback";
import "./hot-rank.css";

const BOARD_COPY = {
  qianchuan: {
    eyebrow: "QIANCHUAN HOT RANK",
    title: "千川热点",
    subtitle: "真实女装带货视频 TOP20 · 按原始千川榜单顺序展示",
    defaultSort: "standard",
  },
  ocean: {
    eyebrow: "OCEAN CONTENT RANK",
    title: "巨量数据",
    subtitle: "基于同批真实样本，按内容热度与传播潜力重新排序",
    defaultSort: "ai",
  },
};

const formatDuration = (value) => {
  const seconds = Math.round(Number(value || 0));
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes
    ? `${minutes}:${String(rest).padStart(2, "0")}`
    : `${rest}s`;
};

function RankVideoCard({
  item,
  displayRank,
  board,
  remakeButtonLabel,
  remakeEnabled,
  remakeBusy,
  onRemake,
  previewActive,
  onPlaybackCandidate,
  onHoverPreview,
  onManualPreview,
}) {
  const cardRef = useRef(null);
  const mediaRef = useRef(null);
  const videoRef = useRef(null);
  const [source, setSource] = useState(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [sourceRevision, setSourceRevision] = useState(0);
  const retryCountRef = useRef(0);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "160px 0px" },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      onPlaybackCandidate?.(item.id, {
        id: item.id,
        ratio: 1,
        centerDistance: 0,
        rank: displayRank,
      });
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const ratio = entry.isIntersecting
          ? Math.max(0, Number(entry.intersectionRatio || 0))
          : 0;
        const rect = entry.boundingClientRect;
        const viewportCenter = window.innerHeight / 2;
        onPlaybackCandidate?.(item.id, {
          id: item.id,
          ratio,
          centerDistance: Math.abs((rect.top + rect.bottom) / 2 - viewportCenter),
          rank: displayRank,
        });
        if (entry.isIntersecting) setShouldLoad(true);
      },
      {
        rootMargin: "-56px 0px -10% 0px",
        threshold: [
          0,
          HOT_RANK_AUTOPLAY_EXIT_RATIO,
          HOT_RANK_AUTOPLAY_RATIO,
          0.8,
          1,
        ],
      },
    );
    observer.observe(media);
    return () => {
      observer.disconnect();
      onPlaybackCandidate?.(item.id, null);
    };
  }, [displayRank, item.id, onPlaybackCandidate]);

  useEffect(() => {
    if (!shouldLoad) return undefined;
    let active = true;
    setSource(null);
    setReady(false);
    setMediaError(false);
    api
      .hotRankSource(item.id)
      .then((result) => active && setSource(result))
      .catch(() => active && setSource({ available: false }));
    return () => {
      active = false;
    };
  }, [item.id, shouldLoad, sourceRevision]);

  useEffect(() => {
    retryCountRef.current = 0;
    setSourceRevision(0);
    setPlaying(false);
    setWaiting(false);
    setSoundEnabled(false);
    setPlaybackBlocked(false);
  }, [item.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!previewActive || !video || !source?.mediaUrl || mediaError)
      return undefined;
    video.muted = true;
    video.defaultMuted = true;
    setSoundEnabled(false);
    setPlaybackBlocked(false);
    setWaiting(true);
    video
      .play()
      .catch((playError) => {
        if (playError?.name === "AbortError") return;
        setWaiting(false);
        setPlaying(false);
        if (playError?.name === "NotAllowedError") setPlaybackBlocked(true);
      });
    return () => video.pause();
  }, [mediaError, previewActive, source?.mediaUrl]);

  useEffect(() => {
    if (previewActive) {
      setShouldLoad(true);
      return;
    }
    videoRef.current?.pause();
    setReady(false);
    setPlaying(false);
    setWaiting(false);
    setSoundEnabled(false);
    setPlaybackBlocked(false);
  }, [previewActive]);

  const activateSound = () => {
    onManualPreview?.(item.id);
    const video = videoRef.current;
    if (!video || !video.currentSrc) return;
    const enableSound = video.muted;
    video.muted = !enableSound;
    video.defaultMuted = !enableSound;
    setSoundEnabled(enableSound);
    setPlaybackBlocked(false);
    video.play().catch((playError) => {
      if (playError?.name !== "AbortError") setPlaybackBlocked(true);
    });
  };
  const markMediaReady = () => {
    retryCountRef.current = 0;
    setMediaError(false);
    setReady(true);
  };
  const playbackAttached = previewActive;
  const tags = [...item.styleTags, ...item.featureTags].slice(0, 4);
  const mediaMeta = formatDuration(item.durationSec);

  return (
    <article
      ref={cardRef}
      className="rank-video-card"
      aria-label={`${board === "ocean" ? "巨量" : "千川"}第 ${displayRank} 名：${item.productTitle}`}
      onPointerEnter={() => {
        setShouldLoad(true);
        onHoverPreview?.(item.id, true);
      }}
      onPointerLeave={() => {
        onHoverPreview?.(item.id, false);
      }}
    >
      <div
        ref={mediaRef}
        className="rank-video-media"
        role="button"
        tabIndex={0}
        aria-label={
          previewActive
            ? soundEnabled
              ? `第 ${displayRank} 名视频正在有声播放，点击静音`
              : `第 ${displayRank} 名视频正在播放，点击开启声音`
            : `播放第 ${displayRank} 名榜单视频`
        }
        onClick={activateSound}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activateSound();
          }
        }}
      >
        {shouldLoad && source?.available && source.mediaUrl ? (
          <>
            {source.posterUrl && (
              <img
                className="rank-video-poster"
                src={source.posterUrl}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
            )}
            {(!ready && !source.posterUrl) && (
              <div className="rank-video-placeholder">
                <LoaderCircle className="spin" size={24} />
                <span>载入视频</span>
              </div>
            )}
            {playbackAttached && (
              <video
                ref={videoRef}
                aria-label={`播放第 ${displayRank} 名榜单视频`}
                className={!mediaError && ready ? "ready" : ""}
                src={source.mediaUrl}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                onLoadedData={markMediaReady}
                onCanPlay={markMediaReady}
                onPlaying={() => {
                  markMediaReady();
                  setPlaying(true);
                  setWaiting(false);
                  setPlaybackBlocked(false);
                }}
                onWaiting={() => {
                  setWaiting(true);
                  setPlaying(false);
                }}
                onStalled={() => {
                  setWaiting(true);
                  setPlaying(false);
                }}
                onPause={() => setPlaying(false)}
                onError={(event) => {
                  setReady(false);
                  setPlaying(false);
                  setWaiting(false);
                  if (event.currentTarget.error?.code === 1) return;
                  if (retryCountRef.current < 1) {
                    retryCountRef.current += 1;
                    setSourceRevision((current) => current + 1);
                  } else {
                    setMediaError(true);
                  }
                }}
              />
            )}
            {mediaError && (
              <div className="rank-video-placeholder error">
                <Film size={26} />
                <span>视频加载失败</span>
              </div>
            )}
            {previewActive && !mediaError && (
              <span
                className={`rank-playback-status ${playing ? "playing" : ""}`}
                aria-live="polite"
              >
                {playbackBlocked ? (
                  <>点击播放</>
                ) : waiting && !playing ? (
                  <><LoaderCircle className="spin" size={12} />正在缓冲</>
                ) : soundEnabled ? (
                  <><Volume2 size={12} />有声播放</>
                ) : (
                  <><VolumeX size={12} />播放中 · 点击开声音</>
                )}
              </span>
            )}
          </>
        ) : (
          <div className="rank-video-placeholder">
            {!shouldLoad || source === null ? (
              <LoaderCircle className="spin" size={24} />
            ) : (
              <Film size={26} />
            )}
            <span>
              {!shouldLoad || source === null ? "载入视频" : "视频待导入"}
            </span>
          </div>
        )}
        <span className="rank-number">
          {displayRank <= 3 && <Flame size={13} />}
          {displayRank}
        </span>
        {board === "ocean" && (
          <span className="rank-hot-score">热度 {item.hotScore}</span>
        )}
      </div>
      <div className="rank-video-copy">
        <div>
          <span>{item.creatorName}</span>
          <small>{mediaMeta}</small>
        </div>
        <h3>{item.productTitle}</h3>
        <p>{item.videoTitle}</p>
        <footer>
          <div>{tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
          <small>原榜 #{item.rank}</small>
        </footer>
        <button
          type="button"
          className="rank-remake-button"
          disabled={!remakeEnabled || remakeBusy || !item.replicateReady}
          onClick={(event) => {
            event.stopPropagation();
            onRemake?.(item);
          }}
        >
          {remakeBusy ? (
            <LoaderCircle className="spin" size={14} />
          ) : (
            <Sparkles size={14} />
          )}
          {remakeBusy
            ? "正在准备节点流程"
            : !item.replicateReady
              ? "原片待导入"
              : remakeButtonLabel || "一键同款"}
        </button>
      </div>
    </article>
  );
}

export function HotRankPage({ board = "qianchuan", onNavigate, onRun, notify }) {
  const copy = BOARD_COPY[board] || BOARD_COPY.qianchuan;
  const [manifest, setManifest] = useState(null);
  const [filters, setFilters] = useState({
    query: "",
    category: "all",
    contentType: "all",
    availableOnly: true,
    sort: copy.defaultSort,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [remakeConfig, setRemakeConfig] = useState(null);
  const [remakeBusyId, setRemakeBusyId] = useState("");
  const [playbackCandidates, setPlaybackCandidates] = useState({});
  const [activePreviewId, setActivePreviewId] = useState("");
  const [hoverPreviewId, setHoverPreviewId] = useState("");
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );

  const reportPlaybackCandidate = useCallback((id, candidate) => {
    setPlaybackCandidates((current) => {
      if (!candidate) {
        if (!current[id]) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      const previous = current[id];
      if (
        previous &&
        Math.abs(previous.ratio - candidate.ratio) < 0.001 &&
        Math.abs(previous.centerDistance - candidate.centerDistance) < 1
      ) {
        return current;
      }
      return { ...current, [id]: candidate };
    });
  }, []);

  const reportHoverPreview = useCallback((id, active) => {
    setHoverPreviewId((current) => (active ? id : current === id ? "" : current));
  }, []);

  useEffect(() => {
    setActivePreviewId((current) =>
      selectHotRankAutoplayCandidate(
        Object.values(playbackCandidates),
        current,
        pageVisible,
      ),
    );
  }, [pageVisible, playbackCandidates]);

  useEffect(() => {
    const onVisibilityChange = () =>
      setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const previewOwnerId = pageVisible
    ? hoverPreviewId || activePreviewId
    : "";

  useEffect(() => {
    setFilters((current) => ({ ...current, sort: copy.defaultSort }));
  }, [copy.defaultSort]);

  const load = useCallback(async (nextFilters) => {
    setLoading(true);
    try {
      setManifest(
        await api.hotRank({ ...nextFilters, page: 1, pageSize: 60 }),
      );
      setError("");
    } catch (loadError) {
      setError(loadError.message || "排行榜加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(filters), 160);
    return () => window.clearTimeout(timer);
  }, [filters, load]);

  useEffect(() => {
    let active = true;
    api
      .hotRankRemakeConfig()
      .then((result) => active && setRemakeConfig(result))
      .catch((configError) => {
        if (!active) return;
        setRemakeConfig({ enabled: false, buttonLabel: "一键同款" });
        notify?.(configError.message || "排行榜同款配置读取失败", "error");
      });
    return () => {
      active = false;
    };
  }, [notify]);

  const openRemake = async (item) => {
    if (!item || remakeBusyId) return;
    setRemakeBusyId(item.id);
    try {
      const result = await api.hotRankRemakeTemplate(item.id);
      onRun?.({
        ...result.template,
        deferredRuntimeAssets: {
          [result.template.sourceInputNodeId]: [
            { kind: "hot-rank-source", itemId: item.id },
          ],
        },
      });
      notify?.("榜单原片与后台节点流程已就绪，请补充素材和复刻要求", "success");
    } catch (remakeError) {
      notify?.(remakeError.message || "一键同款准备失败", "error");
    } finally {
      setRemakeBusyId("");
    }
  };

  const summary = manifest?.summary || {};
  const items = manifest?.items || [];
  return (
    <div className="hot-rank-page content-width">
      <header className="hot-rank-header">
        <div>
          <h1>{copy.title}</h1>
        </div>
        <div className="hot-rank-header-actions">
          <nav className="rank-board-switch" aria-label="排行榜类型">
            <button
              className={board === "qianchuan" ? "active" : ""}
              onClick={() => onNavigate?.("qianchuan-rank")}
            >
              <Trophy size={15} />千川热点
            </button>
            <button
              className={board === "ocean" ? "active" : ""}
              onClick={() => onNavigate?.("ocean-rank")}
            >
              <BarChart3 size={15} />巨量数据
            </button>
          </nav>
          {remakeConfig && (
            <span
              className={`hot-rank-readiness ${
                !remakeConfig.enabled
                  ? "disabled"
                  : remakeConfig.readiness?.runnable
                    ? "ready"
                    : "configuring"
              }`}
              title={remakeConfig.readiness?.message || ""}
            >
              <i />
              {!remakeConfig.enabled
                ? "同款已停用"
                : remakeConfig.readiness?.runnable
                  ? "生成就绪"
                  : "生成待配置"}
            </span>
          )}
        </div>
      </header>

      <section className="hot-rank-stats" aria-label="排行榜概览">
        <div><strong>{summary.total || 0}</strong><span>榜单视频</span></div>
        <div><strong>{summary.creatorCount || 0}</strong><span>入榜达人</span></div>
        <div><strong>{summary.localVideoCount || 0}</strong><span>本地可播放</span></div>
        <div><strong>{manifest?.weekKey || "—"}</strong><span>数据日期</span></div>
      </section>

      <section className="hot-rank-toolbar" aria-label="排行榜筛选">
        <label className="hot-rank-search">
          <Search size={15} />
          <input
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({ ...current, query: event.target.value }))
            }
            placeholder="搜索标题、商品、创作者或标签"
          />
        </label>
        <select
          aria-label="品类"
          value={filters.category}
          onChange={(event) =>
            setFilters((current) => ({ ...current, category: event.target.value }))
          }
        >
          <option value="all">全部品类</option>
          {(manifest?.categories || []).map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
        <select
          aria-label="内容类型"
          value={filters.contentType}
          onChange={(event) =>
            setFilters((current) => ({ ...current, contentType: event.target.value }))
          }
        >
          <option value="all">全部内容类型</option>
          {(manifest?.contentTypes || []).map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <select
          aria-label="排序"
          value={filters.sort}
          onChange={(event) =>
            setFilters((current) => ({ ...current, sort: event.target.value }))
          }
        >
          <option value="standard">原榜顺序</option>
          <option value="ai">内容热度</option>
        </select>
        <button
          className={filters.availableOnly ? "active" : ""}
          onClick={() =>
            setFilters((current) => ({
              ...current,
              availableOnly: !current.availableOnly,
            }))
          }
        >
          <Check size={14} />本地视频
        </button>
        <button
          className="rank-refresh"
          onClick={() => load(filters)}
          disabled={loading}
          aria-label="刷新排行榜"
        >
          <RefreshCw className={loading ? "spin" : ""} size={15} />
        </button>
      </section>

      {error ? (
        <div className="hot-rank-empty"><strong>排行榜加载失败</strong><p>{error}</p></div>
      ) : loading ? (
        <div className="hot-rank-empty"><LoaderCircle className="spin" size={28} /><strong>正在载入排行榜</strong></div>
      ) : items.length ? (
        <section className="hot-rank-grid" aria-label={copy.title}>
          {items.map((item, index) => (
            <RankVideoCard
              key={item.id}
              item={item}
              board={board}
              displayRank={index + 1}
              remakeButtonLabel={remakeConfig?.buttonLabel}
              remakeEnabled={remakeConfig?.enabled === true}
              remakeBusy={remakeBusyId === item.id}
              onRemake={openRemake}
              previewActive={previewOwnerId === item.id}
              onPlaybackCandidate={reportPlaybackCandidate}
              onHoverPreview={reportHoverPreview}
              onManualPreview={setActivePreviewId}
            />
          ))}
        </section>
      ) : (
        <div className="hot-rank-empty"><Search size={28} /><strong>没有匹配的视频</strong><p>换一个关键词或筛选条件试试。</p></div>
      )}
    </div>
  );
}

