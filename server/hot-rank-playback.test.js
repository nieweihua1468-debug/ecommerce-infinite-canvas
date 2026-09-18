import assert from "node:assert/strict";
import test from "node:test";
import {
  HOT_RANK_AUTOPLAY_EXIT_RATIO,
  HOT_RANK_AUTOPLAY_RATIO,
  selectHotRankAutoplayCandidate,
  shouldAutoplayHotRankEntry,
} from "../shared/hot-rank-playback.js";

test("hot-rank playback starts only after most of the media is visible", () => {
  assert.equal(
    shouldAutoplayHotRankEntry({
      isIntersecting: true,
      intersectionRatio: HOT_RANK_AUTOPLAY_RATIO - 0.01,
    }),
    false,
  );
  assert.equal(
    shouldAutoplayHotRankEntry({
      isIntersecting: true,
      intersectionRatio: HOT_RANK_AUTOPLAY_RATIO,
    }),
    true,
  );
  assert.equal(
    shouldAutoplayHotRankEntry({
      isIntersecting: false,
      intersectionRatio: 1,
    }),
    false,
  );
});

test("hot-rank playback rejects missing or invalid visibility entries", () => {
  assert.equal(shouldAutoplayHotRankEntry(null), false);
  assert.equal(
    shouldAutoplayHotRankEntry({
      isIntersecting: true,
      intersectionRatio: "not-a-number",
    }),
    false,
  );
});

test("hot-rank playback selects one visible owner closest to the viewport center", () => {
  const candidates = [
    { id: "rank-1", ratio: 0.82, centerDistance: 260, rank: 1 },
    { id: "rank-2", ratio: 0.78, centerDistance: 40, rank: 2 },
    { id: "rank-3", ratio: 0.54, centerDistance: 10, rank: 3 },
  ];

  assert.equal(selectHotRankAutoplayCandidate(candidates, "", true), "rank-2");
  assert.equal(selectHotRankAutoplayCandidate(candidates, "", false), "");
});

test("hot-rank playback keeps its owner until the exit threshold to avoid thrashing", () => {
  const currentVisible = [
    {
      id: "rank-1",
      ratio: HOT_RANK_AUTOPLAY_RATIO,
      centerDistance: 180,
      rank: 1,
    },
    { id: "rank-2", ratio: 0.92, centerDistance: 20, rank: 2 },
  ];
  assert.equal(
    selectHotRankAutoplayCandidate(currentVisible, "rank-1", true),
    "rank-1",
  );

  const currentLeaving = currentVisible.map((candidate) =>
    candidate.id === "rank-1"
      ? { ...candidate, ratio: HOT_RANK_AUTOPLAY_EXIT_RATIO - 0.01 }
      : candidate,
  );
  assert.equal(
    selectHotRankAutoplayCandidate(currentLeaving, "rank-1", true),
    "rank-2",
  );
});

