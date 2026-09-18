import test from "node:test";
import assert from "node:assert/strict";
import {
  filterHotRankItems,
  normalizeHotRankItem,
  sortHotRankItems,
  summarizeHotRank,
} from "../shared/hot-rank.js";
import {
  createHotRankMediaTicket,
  hotRankPosterFileName,
  hotRankPreviewFileName,
  resolveHotRankMediaPath,
  verifyHotRankMediaTicket,
} from "./hot-rank.js";

test("normalizes, filters, and sorts imported ranking rows", () => {
  const first = normalizeHotRankItem({
    week_key: "2026-07-30",
    source_rank: 2,
    video_id: "video-2",
    primary_category: "女装",
    creator_name: "穿搭达人",
    video_title: "夏日显瘦穿搭",
    style_tags: '["通勤","显瘦"]',
    hot_score: 96,
    local_file_name: "rank-02.mp4",
  });
  const second = normalizeHotRankItem({
    week_key: "2026-07-30",
    source_rank: 1,
    video_id: "video-1",
    primary_category: "男装",
    creator_name: "男装达人",
    video_title: "商务男装",
    hot_score: 80,
  });
  const items = [first, second];
  assert.equal(first.id, "2026-07-30:video-2");
  assert.deepEqual(first.styleTags, ["通勤", "显瘦"]);
  assert.equal(filterHotRankItems(items, { query: "显瘦" }).length, 1);
  assert.equal(sortHotRankItems(items, "standard")[0].rank, 1);
  assert.equal(sortHotRankItems(items, "ai")[0].id, first.id);
  assert.deepEqual(summarizeHotRank(items), {
    total: 2,
    categoryCount: 2,
    creatorCount: 2,
    localVideoCount: 1,
  });
});

test("media tickets are scoped to one file and paths cannot escape the root", () => {
  const ticket = createHotRankMediaTicket("rank-01.mp4", 60);
  assert.equal(verifyHotRankMediaTicket("rank-01.mp4", ticket), true);
  assert.equal(verifyHotRankMediaTicket("rank-02.mp4", ticket), false);
  assert.match(resolveHotRankMediaPath("../rank-01.mp4"), /rank-01\.mp4$/);
  assert.equal(hotRankPosterFileName("rank-01.mp4"), "rank-01.poster.jpg");
  assert.equal(
    hotRankPosterFileName("../rank-02.MP4"),
    "rank-02.poster.jpg",
  );
  assert.equal(hotRankPreviewFileName("rank-01.mp4"), "rank-01.preview.mp4");
  assert.equal(
    hotRankPreviewFileName("../rank-02.MP4"),
    "rank-02.preview.mp4",
  );
});

