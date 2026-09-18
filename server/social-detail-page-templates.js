const DETAIL_QUICK_WORD_GROUPS = Object.freeze([
  {
    id: "product",
    label: "产品重点",
    options: ["核心卖点", "使用场景", "材质工艺", "尺码规格", "包装清单"],
  },
  {
    id: "audience",
    label: "目标人群",
    options: ["通勤人群", "学生人群", "户外人群", "品质人群", "送礼人群"],
  },
  {
    id: "content",
    label: "内容重点",
    options: ["痛点解决", "真实体验", "上身效果", "细节特写", "选择理由"],
  },
  {
    id: "tone",
    label: "页面语气",
    options: ["真实种草", "专业讲解", "简洁高级", "强视觉", "轻促销"],
  },
]);

const COMMON_RULES = [
  "用户上传的商品图是产品外观、颜色、材质、结构、Logo、包装和数量的唯一事实来源。",
  "用户填写的产品信息只作为本次内容依据；没有填写的价格、参数、功效、赠品、排名和承诺不得编造。",
  "生成一张完整的3:4竖版商品详情页首屏案例，移动端第一眼主体清楚、信息层级明确。",
  "中文文案区域只预留干净安全区，不生成乱码、假Logo、水印、价格或未经确认的促销与功效文字。",
].join("\n");

const blueprint = ({
  id,
  title,
  platform,
  secondaryCategory,
  secondaryCategoryId,
  cover,
  productReferenceUrl,
  strategy,
  composition,
  tags,
}) => ({
  id,
  title,
  platform,
  imageType: platform === "小红书" ? "种草详情页" : "爆款商详",
  ratio: "3:4",
  secondaryCategory,
  secondaryCategoryId,
  coverUrl: "/demo-placeholder.svg",
  productReferenceUrl: "",
  defaultProductIncluded: false,
  promptText: [
    COMMON_RULES,
    `本模版结构：${strategy}。`,
    `版式与画面：${composition}。`,
    "先识别商品主体与用户产品信息，再决定场景、模特、特写和信息模块；产品一致性优先于装饰效果。",
    "只输出最终成片，不输出分析过程。",
  ].join("\n"),
  coverPrompt: [
    `生成一张${platform}${secondaryCategory}商品详情页案例。`,
    strategy,
    composition,
    "使用给定商品作为唯一产品参考，3:4竖版，无可读文字、价格、Logo、水印或虚构信息。",
  ].join("\n"),
  negativePrompt:
    "商品变形，错误颜色，错误Logo，乱码，水印，价格，折扣，虚假功效，虚假参数，虚假排名，额外赠品，重复主体，人物畸形，低清晰度",
  tags: [
    "热门详情页",
    platform,
    secondaryCategory,
    "3:4",
    "产品信息框",
    ...tags,
  ],
  remakeQuickWordGroups: DETAIL_QUICK_WORD_GROUPS,
});

export const SOCIAL_DETAIL_CATEGORY = Object.freeze({
  id: "social-detail",
  label: "热门详情页",
  children: Object.freeze([
    { id: "painpoint-solution", label: "痛点解决" },
    { id: "three-benefits", label: "卖点拆解" },
    { id: "real-scene", label: "真实场景" },
    { id: "material-craft", label: "材质工艺" },
    { id: "wearing-effect", label: "使用效果" },
    { id: "ugc-review", label: "真实体验" },
    { id: "spec-size", label: "规格参数" },
    { id: "unboxing-list", label: "开箱清单" },
    { id: "audience-scene", label: "人群场景" },
    { id: "choice-comparison", label: "选择理由" },
  ]),
});

export const SOCIAL_DETAIL_BLUEPRINTS = Object.freeze([
  blueprint({
    id: "detail-social-01-painpoint-solution",
    title: "通勤痛点解决 · 场景首屏",
    platform: "小红书",
    secondaryCategory: "痛点解决",
    secondaryCategoryId: "painpoint-solution",
    cover: "01-painpoint-solution.png",
    productReferenceUrl:
      "/demo-placeholder.svg",
    strategy: "从目标人群的真实困扰切入，用一个可信场景展示商品如何满足该需求",
    composition: "左侧大场景主体，右侧一处材质细节和两组留白信息卡，先场景后证据",
    tags: ["痛点", "解决方案", "通勤"],
  }),
  blueprint({
    id: "detail-social-02-three-benefits",
    title: "三大卖点 · 信息流拆解",
    platform: "抖音商城",
    secondaryCategory: "卖点拆解",
    secondaryCategoryId: "three-benefits",
    cover: "02-three-benefits.png",
    productReferenceUrl:
      "/demo-placeholder.svg",
    strategy: "围绕用户确认的三个核心卖点形成递进，拒绝空泛形容词和未提供参数",
    composition: "大主体配三张轻量卖点卡和一处商品细节，缩略图状态仍能识别商品",
    tags: ["三卖点", "信息流", "强视觉"],
  }),
  blueprint({
    id: "detail-social-03-real-scene",
    title: "真实使用场景 · 生活种草",
    platform: "小红书",
    secondaryCategory: "真实场景",
    secondaryCategoryId: "real-scene",
    cover: "03-real-scene.png",
    productReferenceUrl:
      "/demo-placeholder.svg",
    strategy: "把商品放进用户填写的真实使用场景，通过动作和环境解释使用价值",
    composition: "自然光生活场景占主画面，保留一处体验卡和一处商品细节安全区",
    tags: ["生活方式", "真实场景", "种草"],
  }),
  blueprint({
    id: "detail-social-04-material-craft",
    title: "材质工艺 · 细节证据页",
    platform: "抖音商城",
    secondaryCategory: "材质工艺",
    secondaryCategoryId: "material-craft",
    cover: "04-material-craft.png",
    productReferenceUrl:
      "/demo-placeholder.svg",
    strategy: "用用户提供的材质、成分与工艺信息组织可视化细节证据",
    composition: "商品效果大图结合两处微距特写，版式克制，细节从材质到做工递进",
    tags: ["材质", "工艺", "细节"],
  }),
  blueprint({
    id: "detail-social-05-wearing-effect",
    title: "上身效果 · 多姿态展示",
    platform: "小红书",
    secondaryCategory: "使用效果",
    secondaryCategoryId: "wearing-effect",
    cover: "05-wearing-effect.png",
    productReferenceUrl:
      "/demo-placeholder.svg",
    strategy: "围绕商品实际穿着或使用状态展示正面、侧面和动态效果",
    composition: "同一人物同一商品的多姿态连续展示，保持身份、商品和光线一致",
    tags: ["上身效果", "多姿态", "版型"],
  }),
  blueprint({
    id: "detail-social-06-ugc-review",
    title: "真实体验 · UGC 测评卡",
    platform: "小红书",
    secondaryCategory: "真实体验",
    secondaryCategoryId: "ugc-review",
    cover: "06-ugc-review.png",
    productReferenceUrl:
      "/demo-placeholder.svg",
    strategy: "将用户提供的真实体验拆成使用感受、适用场景和注意事项，不伪造评价",
    composition: "真实创作者场景为主，搭配两处生活细节和留白测评卡，保留自然质感",
    tags: ["UGC", "真实体验", "测评"],
  }),
  blueprint({
    id: "detail-social-07-spec-size",
    title: "规格尺码 · 参数信息页",
    platform: "抖音商城",
    secondaryCategory: "规格参数",
    secondaryCategoryId: "spec-size",
    cover: "07-spec-size.png",
    productReferenceUrl:
      "/demo-placeholder.svg",
    strategy: "只使用用户填写的规格、尺码、容量或适配信息，形成清晰选择依据",
    composition: "商品主体、平铺结构和三组无文字参数模块组成技术感信息页",
    tags: ["规格", "尺码", "参数"],
  }),
  blueprint({
    id: "detail-social-08-unboxing-list",
    title: "开箱清单 · 包装交付页",
    platform: "抖音商城",
    secondaryCategory: "开箱清单",
    secondaryCategoryId: "unboxing-list",
    cover: "08-unboxing-list.png",
    productReferenceUrl:
      "/demo-placeholder.svg",
    strategy: "按用户提供的信息展示商品、包装、配件与实际交付数量，不新增赠品",
    composition: "开箱动作、完整商品和四组清单模块，包装与产品数量清晰可核对",
    tags: ["开箱", "包装", "清单"],
  }),
  blueprint({
    id: "detail-social-09-audience-scene",
    title: "人群 × 场景 · 适配矩阵",
    platform: "小红书",
    secondaryCategory: "人群场景",
    secondaryCategoryId: "audience-scene",
    cover: "09-audience-scene.png",
    productReferenceUrl:
      "/demo-placeholder.svg",
    strategy: "把用户确认的目标人群与使用场景组合成三个高相关内容单元",
    composition: "同一人物和商品贯穿三个场景，形成统一且可扫读的场景矩阵",
    tags: ["目标人群", "场景矩阵", "适配"],
  }),
  blueprint({
    id: "detail-social-10-choice-comparison",
    title: "选择理由 · 差异化对比",
    platform: "抖音商城",
    secondaryCategory: "选择理由",
    secondaryCategoryId: "choice-comparison",
    cover: "10-choice-comparison.png",
    productReferenceUrl:
      "/demo-placeholder.svg",
    strategy: "从版型、搭配、材质或使用方式解释选择理由，不攻击竞品、不虚构领先结论",
    composition: "左侧使用效果，右侧商品平铺和三组视觉对比模块，理由可视化",
    tags: ["选择理由", "差异化", "对比"],
  }),
]);

export const SOCIAL_DETAIL_PAGE_TEMPLATE_COUNT =
  SOCIAL_DETAIL_BLUEPRINTS.length;

export const SOCIAL_DETAIL_PLATFORMS = Object.freeze([
  ...new Set(SOCIAL_DETAIL_BLUEPRINTS.map((item) => item.platform)),
]);

