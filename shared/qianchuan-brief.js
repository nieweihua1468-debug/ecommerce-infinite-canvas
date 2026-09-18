const LEGACY_GROUPS = [
  {
    id: "mechanism",
    label: "营销机制",
    options: [
      ["限时优惠", "限时优惠（请补充具体时间与条件）"],
      ["直播专享", "直播间专享（请补充具体价格或权益）"],
      ["满减活动", "满减活动（请补充门槛与金额）"],
      ["买赠福利", "买赠福利（请补充赠品与数量）"],
      ["前 N 名", "前 N 名加赠（请补充名额与赠品）"],
      ["第二件优惠", "第二件优惠（请补充折扣与适用条件）"],
    ],
  },
  {
    id: "benefit",
    label: "品牌福利",
    options: [
      ["新客专享", "新客专享（请补充具体权益）"],
      ["会员福利", "会员福利（请补充具体权益）"],
      ["品牌补贴", "品牌补贴（请补充金额或条件）"],
      ["正品保障", "官方正品保障（请确认后使用）"],
      ["售后保障", "售后保障（请补充服务范围）"],
      ["赠品福利", "赠品福利（请补充赠品名称与数量）"],
    ],
  },
  {
    id: "audience",
    label: "适合人群",
    options: [
      ["通勤人群", "通勤人群"],
      ["学生人群", "学生人群"],
      ["宝妈人群", "宝妈人群"],
      ["初次购买", "初次购买人群"],
      ["品质人群", "注重品质的人群"],
      ["送礼人群", "送礼需求人群"],
    ],
  },
  {
    id: "tone",
    label: "口播语气",
    options: [
      ["自然分享", "自然分享口吻"],
      ["温柔种草", "温柔种草口吻"],
      ["专业讲解", "专业讲解口吻"],
      ["强转化", "直接清晰的转化口吻"],
      ["真实体验", "真实体验分享口吻"],
      ["紧凑节奏", "紧凑有节奏的口播"],
    ],
  },
];

export const QIANCHUAN_BRIEF_GROUPS = Object.freeze(
  LEGACY_GROUPS.map((group) =>
    Object.freeze({
      id: group.id,
      label: group.label,
      options: Object.freeze(group.options.map(([keyword]) => keyword)),
    }),
  ),
);

export const QIANCHUAN_BRIEF_KEYWORDS = Object.freeze(
  QIANCHUAN_BRIEF_GROUPS.flatMap((group) => group.options),
);

const LEGACY_LINE_TO_KEYWORD = new Map(
  LEGACY_GROUPS.flatMap((group) =>
    group.options.flatMap(([keyword, legacyText]) => [
      [legacyText, keyword],
      [`${group.label}：${legacyText}`, keyword],
    ]),
  ),
);

const cleanKeyword = (value) =>
  String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);

export function qianchuanBriefLines(value) {
  return [
    ...new Set(
      String(value || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => LEGACY_LINE_TO_KEYWORD.get(line) || line),
    ),
  ];
}

export function normalizeQianchuanBrief(value) {
  return qianchuanBriefLines(value).join("\n");
}

export function toggleQianchuanBriefKeyword(value, keyword) {
  const clean = cleanKeyword(keyword);
  const lines = qianchuanBriefLines(value);
  if (!clean) return lines.join("\n");
  return (lines.includes(clean)
    ? lines.filter((line) => line !== clean)
    : [...lines, clean]
  ).join("\n");
}

export function appendQianchuanBriefKeyword(value, keyword) {
  const clean = cleanKeyword(keyword);
  const lines = qianchuanBriefLines(value);
  if (!clean || lines.includes(clean)) return lines.join("\n");
  return [...lines, clean].join("\n");
}

export function clearQianchuanBriefKeywords(
  value,
  keywords = QIANCHUAN_BRIEF_KEYWORDS,
) {
  const removable = new Set(keywords.map(cleanKeyword).filter(Boolean));
  return qianchuanBriefLines(value)
    .filter((line) => !removable.has(line))
    .join("\n");
}

