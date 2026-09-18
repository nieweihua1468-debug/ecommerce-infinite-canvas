export const HOT_RANK_AUTOPLAY_RATIO = 0.55;
export const HOT_RANK_AUTOPLAY_EXIT_RATIO = 0.3;

export function shouldAutoplayHotRankEntry(
  entry,
  minimumRatio = HOT_RANK_AUTOPLAY_RATIO,
) {
  const ratio = Number(entry?.intersectionRatio);
  return Boolean(
    entry?.isIntersecting &&
      Number.isFinite(ratio) &&
      ratio >= minimumRatio,
  );
}

export function selectHotRankAutoplayCandidate(
  candidates,
  currentId = "",
  pageVisible = true,
) {
  if (!pageVisible) return "";

  const normalized = Array.isArray(candidates)
    ? candidates
        .map((candidate) => ({
          id: String(candidate?.id || ""),
          ratio: Number(candidate?.ratio || 0),
          centerDistance: Number(candidate?.centerDistance ?? Infinity),
          rank: Number(candidate?.rank ?? Infinity),
        }))
        .filter(
          (candidate) =>
            candidate.id &&
            Number.isFinite(candidate.ratio) &&
            Number.isFinite(candidate.centerDistance) &&
            Number.isFinite(candidate.rank),
        )
    : [];

  const current = normalized.find((candidate) => candidate.id === currentId);
  if (current && current.ratio >= HOT_RANK_AUTOPLAY_RATIO) return current.id;

  const next = normalized
    .filter((candidate) => candidate.ratio >= HOT_RANK_AUTOPLAY_RATIO)
    .sort(
      (left, right) =>
        left.centerDistance - right.centerDistance ||
        right.ratio - left.ratio ||
        left.rank - right.rank,
    )[0];

  if (next) return next.id;
  if (current && current.ratio > HOT_RANK_AUTOPLAY_EXIT_RATIO) return current.id;
  return "";
}

