import {
  CUSTOM_BRAND_BRAND_CATEGORY,
  CUSTOM_BRAND_DETAIL_PAGE_BLUEPRINTS,
  CUSTOM_BRAND_DETAIL_PAGE_TEMPLATE_COUNT,
  createCustomBrandInvocation,
} from "./custom-brand-detail-page-templates.js";
import {
  SOCIAL_DETAIL_BLUEPRINTS,
  SOCIAL_DETAIL_CATEGORY,
  SOCIAL_DETAIL_PAGE_TEMPLATE_COUNT,
  SOCIAL_DETAIL_PLATFORMS,
} from "./social-detail-page-templates.js";

const PRIMARY_CATEGORIES = [
  {
    id: "fashion",
    label: "服装",
    scene: "时尚电商棚拍，准确呈现版型、面料、颜色和穿着效果",
    children: [
      { id: "womenswear", label: "女装", sample: "无品牌米白色女士衬衫与阔腿裤套装，人体模特架完整陈列" },
      { id: "menswear", label: "男装", sample: "无品牌深灰色男士西装套装，人体模特架完整陈列" },
      { id: "underwear", label: "内衣", sample: "无品牌豆沙色女士内衣套装，丝绸背景平铺陈列" },
      { id: "kidswear", label: "童装", sample: "无品牌粉色儿童背带裙、针织上衣和童鞋平铺组合" },
    ],
  },
  {
    id: "shoes-bags-accessories",
    label: "鞋包配饰",
    scene: "商业产品摄影，重点展示材质、结构、五金和细节做工",
    children: [
      { id: "womens-shoes", label: "女鞋", sample: "无品牌裸色尖头高跟鞋一双" },
      { id: "mens-shoes", label: "男鞋", sample: "无品牌棕色真皮系带商务鞋一双" },
      { id: "bags", label: "箱包", sample: "无品牌燕麦色皮革手提包" },
      { id: "jewelry", label: "珠宝配饰", sample: "无品牌金色项链、耳环和戒指首饰组合" },
    ],
  },
  {
    id: "beauty-personal-care",
    label: "美妆个护",
    scene: "高质感美妆广告摄影，产品包装、颜色和质地清晰准确",
    children: [
      { id: "skincare", label: "护肤", sample: "无品牌琥珀色精华滴管瓶和面霜罐" },
      { id: "makeup", label: "彩妆", sample: "无品牌眼影盘、口红、腮红和化妆刷组合" },
      { id: "hair-body", label: "洗护", sample: "无品牌琥珀色与乳白色洗护按压瓶组合" },
      { id: "fragrance", label: "香水", sample: "无品牌方形透明淡粉色香水瓶" },
    ],
  },
  {
    id: "food-beverage",
    label: "食品饮料",
    scene: "食欲感商业摄影，包装信息可辨识，食材和口感表现自然真实",
    children: [
      { id: "snacks", label: "零食", sample: "无品牌曲奇、椒盐脆饼和薯片零食组合" },
      { id: "drinks", label: "冲调饮品", sample: "无品牌绿色冲调饮品袋、玻璃杯和粉末原料" },
      { id: "fresh", label: "生鲜", sample: "西兰花、彩椒、番茄、胡萝卜和绿叶菜组合" },
      { id: "alcohol", label: "酒水", sample: "无品牌红酒瓶与高脚杯组合" },
    ],
  },
  {
    id: "home-digital",
    label: "家居数码",
    scene: "现代商业产品摄影，清楚展示产品结构、功能细节和真实使用场景",
    children: [
      { id: "home-daily", label: "家居日用", sample: "无品牌白色清洁按压瓶、喷雾瓶和毛巾组合" },
      { id: "home-textile", label: "家纺", sample: "无品牌米白色床品四件套完整铺陈" },
      { id: "small-appliance", label: "小家电", sample: "无品牌米白色空气炸锅" },
      { id: "consumer-electronics", label: "3C数码", sample: "无品牌黑色头戴耳机与智能手表组合" },
    ],
  },
];

const PLATFORM_VARIANTS = [
  {
    id: "taobao-main",
    platform: "淘宝",
    imageType: "主图",
    ratio: "1:1",
    brief:
      "淘宝首屏主图，商品占画面约75%，背景干净，卖点层级明确，适合搜索列表快速识别",
    layout:
      "主商品正面完整居中，包装或配件在侧后方形成小型组合，首屏只保留一个强视觉中心",
  },
  {
    id: "taobao-product",
    platform: "淘宝",
    imageType: "产品图",
    ratio: "1:1",
    brief:
      "淘宝详情产品图，白底或浅色背景，完整展示主体和关键细节，保留充足排版留白",
    layout:
      "采用主商品、完整包装、配件与一处材质细节的套图式构图，信息从主体到包装再到细节递进",
  },
  {
    id: "douyin-main",
    platform: "抖音商城",
    imageType: "主图",
    ratio: "1:1",
    brief:
      "抖音商城高点击主图，强视觉中心、清晰明暗对比、移动端第一眼可读，画面有真实消费场景感",
    layout:
      "使用近景大主体和明确使用场景，包装正面或关键结构同时可见，缩略图状态下仍能识别品类",
  },
  {
    id: "douyin-product",
    platform: "抖音商城",
    imageType: "产品图",
    ratio: "3:4",
    brief:
      "抖音商城竖版产品图，主体突出，信息简洁，兼顾细节展示和短视频信息流视觉节奏",
    layout:
      "竖版上部展示完整商品与包装，下部自然带出配件、质地或结构特写，不使用拼贴边框",
  },
  {
    id: "xiaohongshu-seeding",
    platform: "小红书",
    imageType: "种草图",
    ratio: "3:4",
    brief:
      "小红书生活方式种草图，自然光、真实场景、轻 editorial 构图，保留标题和卖点文字安全区",
    layout:
      "把主商品放入可信的真实生活场景，包装和使用状态自然入镜，画面像真实体验分享而非硬广",
  },
];

const DETAIL_PRODUCT_SAMPLES = {
  womenswear: [
    "无品牌奶油白蝴蝶结衬衫与高腰半身裙",
    "无品牌雾蓝针织开衫、吊牌和折叠防尘袋",
    "无品牌黑色通勤西装与同色西裤套装",
    "无品牌焦糖色短款夹克与内搭组合",
    "无品牌碎花吊带连衣裙与草编手提包",
  ],
  menswear: [
    "无品牌浅蓝牛津纺衬衫与深灰西裤",
    "无品牌藏青针织Polo与卡其休闲裤",
    "无品牌炭灰色商务西装三件套",
    "无品牌军绿色工装夹克与白色T恤",
    "无品牌米灰针织上衣与白色直筒裤",
  ],
  underwear: [
    "无品牌豆沙色无痕家居内搭套装",
    "无品牌黑色基础内搭套装与折叠包装袋",
    "无品牌浅灰运动内搭套装与收纳盒",
    "无品牌奶油白舒适家居套装",
    "无品牌柔粉色居家内搭套装与香氛道具",
  ],
  kidswear: [
    "无品牌彩色拼接儿童卫衣与工装裤",
    "无品牌粉色背带裙、针织上衣和童鞋",
    "无品牌黄色儿童雨衣、雨靴和透明雨伞",
    "无品牌蓝色牛仔背带裤与条纹上衣",
    "无品牌米白儿童针织套装与帆布鞋",
  ],
  "womens-shoes": [
    "无品牌酒红色方头乐福鞋一双与鞋盒",
    "无品牌米白芭蕾平底鞋一双与防尘袋",
    "无品牌薰衣草色运动鞋一双与鞋盒",
    "无品牌黑色短靴一双与护理配件",
    "无品牌裸色尖头高跟鞋一双与穿搭道具",
  ],
  "mens-shoes": [
    "无品牌棕色真皮德比鞋一双与鞋盒",
    "无品牌黑色网面运动鞋一双与备用鞋带",
    "无品牌深棕商务乐福鞋一双与鞋撑",
    "无品牌沙色休闲鞋一双与清洁配件",
    "无品牌黑色短靴一双与秋冬穿搭道具",
  ],
  bags: [
    "无品牌奶油白结构感手提包与防尘袋",
    "无品牌橄榄绿旅行托特包与行李箱",
    "无品牌焦糖色半月肩包与收纳袋",
    "无品牌黑色通勤双肩包与内部配件",
    "无品牌草编肩包与咖啡店生活场景",
  ],
  jewelry: [
    "无品牌金色项链耳环戒指套装与首饰盒",
    "无品牌极简银色项链耳扣戒指组合",
    "无品牌珍珠项链耳钉组合与绒布盒",
    "无品牌彩色宝石戒指与手链组合",
    "无品牌细链叠戴首饰组合与梳妆盘",
  ],
  skincare: [
    "无品牌蓝色补水护肤瓶罐与素色外盒套装",
    "无品牌绿色精华滴管瓶、面霜罐和纸盒",
    "无品牌琥珀色精华瓶与泵头乳液包装组合",
    "无品牌白色洁面乳、防晒管和纸盒套装",
    "无品牌温和护肤按压瓶与旅行装包装组合",
  ],
  makeup: [
    "无品牌珊瑚色口红、粉饼、腮红与素色外盒",
    "无品牌黑金眼影盘、睫毛膏和口红包装组合",
    "无品牌裸色底妆瓶、遮瑕和粉饼套装",
    "无品牌莓果色唇釉与腮红产品组合",
    "无品牌自然妆感产品与化妆包梳妆场景",
  ],
  "hair-body": [
    "无品牌琥珀色洗发护发按压瓶与补充袋",
    "无品牌乳白色沐浴露和身体乳瓶袋组合",
    "无品牌绿色植物洗护瓶与替换装组合",
    "无品牌紫色家清洗护瓶、补充袋与毛巾",
    "无品牌极简洗护瓶和旅行分装套装",
  ],
  fragrance: [
    "无品牌透明淡粉香水瓶与素色礼盒",
    "无品牌方形木质调香水瓶与米白外盒",
    "无品牌琥珀色香水瓶、礼袋和试香卡",
    "无品牌磨砂玻璃香水瓶与圆筒礼盒",
    "无品牌清新香水瓶与卧室托盘生活场景",
  ],
  snacks: [
    "无品牌曲奇、坚果和果干袋盒包装组合",
    "无品牌烘焙饼干自立袋与牛皮纸礼盒",
    "无品牌彩色膨化零食袋装组合与实物展示",
    "无品牌健康谷物零食袋与野餐场景",
    "无品牌小份独立包装零食与分享盘",
  ],
  drinks: [
    "无品牌咖啡冲调条、纸盒与成品咖啡",
    "无品牌燕麦饮冲调袋盒与玻璃杯",
    "无品牌绿色茶饮袋、独立小包和茶杯",
    "无品牌可可饮条包、罐装与成品饮料",
    "无品牌早餐冲调饮品与面包生活场景",
  ],
  fresh: [
    "菌菇与莓果透明托盘包装组合",
    "番茄、绿叶菜和彩椒保鲜盒组合",
    "苹果、橙子和葡萄高端水果礼盒",
    "预处理蔬菜分格托盘与厨房场景",
    "有机蔬菜纸盒与可循环保鲜包装",
  ],
  alcohol: [
    "无品牌红酒瓶、高脚杯和酒盒组合",
    "无品牌琥珀色烈酒瓶与圆筒礼盒",
    "无品牌清酒瓶、酒杯和手提礼盒",
    "无品牌果酒瓶与双瓶礼盒组合",
    "无品牌红酒瓶与晚餐桌生活场景",
  ],
  "home-daily": [
    "无品牌厨房清洁喷瓶、按压瓶和补充袋",
    "无品牌洗衣液瓶、补充装和毛巾组合",
    "无品牌浴室清洁瓶刷和收纳盒组合",
    "无品牌香氛清洁套装与牛皮纸外箱",
    "无品牌极简家清瓶袋与明亮厨房场景",
  ],
  "home-textile": [
    "无品牌米白床品四件套与拉链包装袋",
    "无品牌雾蓝床品套装与手提包装盒",
    "无品牌格纹被套枕套组合与吊牌",
    "无品牌暖灰毛毯抱枕套装与礼袋",
    "无品牌白色酒店风床品与卧室场景",
  ],
  "small-appliance": [
    "无品牌米白空气炸锅、配件和运输纸箱",
    "无品牌银色咖啡机、手柄配件和外箱",
    "无品牌白色电煮锅、餐具和素色包装盒",
    "无品牌便携榨汁杯、配件和零售盒",
    "无品牌小型加湿器与书桌生活场景",
  ],
  "consumer-electronics": [
    "无品牌头戴耳机、智能手表与素色零售盒",
    "无品牌相机、耳机和配件包装组合",
    "无品牌无线耳机、充电盒和数据线包装",
    "无品牌便携音箱与纸盒配件组合",
    "无品牌头戴耳机与居家办公桌场景",
  ],
};

const DETAIL_REQUIREMENTS = {
  fashion:
    "若参考图包含吊牌、防尘袋、折叠包装或备用扣件，包装与配件必须完整入镜；同时展示正面版型、面料纹理和关键工艺",
  "shoes-bags-accessories":
    "鞋盒、防尘袋、首饰盒、证书卡或备用配件按参考图完整保留；重点展示五金、走线、开合结构和材质",
  "beauty-personal-care":
    "瓶器、泵头、瓶盖、外盒、补充装和套装数量必须与参考图一致；包装正面可辨但不得改写文字，并展示一处真实质地",
  "food-beverage":
    "袋装、盒装、瓶装、礼盒、独立小包与内容物数量必须与参考图一致；同时展示包装正面和真实食用或饮用状态",
  "home-digital":
    "外箱、零售盒、说明书、线材、替换件和配件按参考图完整保留；清楚展示产品结构、接口、尺寸关系和真实使用场景",
};

const cleanText = (value, limit = 8_000) =>
  String(value || "")
    .trim()
    .slice(0, limit);

const buildPrompt = (primary, secondary, variant) =>
  [
    `根据用户上传的${secondary.label}商品图，生成一张可直接用于${variant.platform}${variant.imageType}的电商图片。`,
    `严格保持商品主体、颜色、材质、Logo、包装、花纹和结构与参考图一致，不新增不存在的部件，不改变品牌文字。`,
    `${DETAIL_REQUIREMENTS[primary.id]}。`,
    `${primary.scene}。${variant.brief}。${variant.layout}。`,
    `画面比例${variant.ratio}，高清商业摄影，主体边缘干净，光影自然，质感真实，避免过度磨皮、畸变、重复商品、乱码和水印。`,
    `输出一张完整成片，不生成拼接边框；如需文案仅预留安全区，不生成价格、功效、促销承诺、虚构参数或不存在的包装文字。`,
  ].join("\n");

const buildCoverPrompt = (primary, secondary, variant) =>
  [
    `生成一张${DETAIL_PRODUCT_SAMPLES[secondary.id]?.[PLATFORM_VARIANTS.indexOf(variant)] || secondary.sample}的真实${variant.platform}${variant.imageType}样片。`,
    `${primary.scene}。${variant.brief}。${variant.layout}。`,
    `${DETAIL_REQUIREMENTS[primary.id]}。`,
    `画面比例${variant.ratio}，主体完整且边缘清晰，材质、结构、比例和光影符合真实商业摄影。`,
    "不出现品牌、Logo、价格、促销文字、水印、乱码、重复主体或虚构功效。",
  ].join("\n");

const buildCustomBrandPrompt = (item, invocation = createCustomBrandInvocation(item)) =>
  [
    `根据自动载入或用户替换的${item.product}三视图，生成一张可直接用于${item.platform}${item.imageType}的品牌详情页图片。`,
    "严格保持用户自有产品瓶器、Logo、包装文字、色彩、材质、比例、外盒和套装数量与三视图一致，不重绘品牌标识，不新增不存在的包装或赠品。",
    `当前公开商品事实：${invocation?.brandSuppliedFacts?.join("；") || "以三视图为准"}。这些事实仅用于主体核验，不扩写为功效承诺。`,
    `产品线色彩：${invocation?.linePalette?.join("、") || "自然米白与产品主色"}。视觉关键词：${invocation?.visualKeywords?.join("、") || "自然、可信、精致"}。`,
    `内容形式：${item.form}。场景方向：${item.scene}。构图要求：${item.composition}。`,
    `版式要求：${item.safeArea}。用户填写的产品信息进入内容模块，营销机制只进入预留活动区；空白时不得自行补写。`,
    `画面比例${item.ratio}，高清商业摄影，移动端缩略图中产品仍清晰可辨。目标人群：${invocation?.audience || "真实护肤消费者"}。`,
    "不生成用户未提供的价格、折扣、赠品、销量、排名、医疗表述、功效数字或虚假前后对比；品牌锁定层在服务端始终优先。",
  ].join("\n");

const buildCustomBrandCoverPrompt = (
  item,
  invocation = createCustomBrandInvocation(item),
) =>
  [
    `基于${item.product}三视图生成${item.platform}${item.imageType}样片，内容形式为${item.form}。`,
    `${item.scene}。${item.composition}。${item.safeArea}。`,
    `产品线视觉严格使用${invocation?.linePalette?.join("、")}，并围绕${invocation?.visualKeywords?.join("、")}建立画面。`,
    "严格保持用户自有瓶器、包装、Logo与三视图一致，并为用户的产品信息和营销机制保留独立区域。",
    `画面比例${item.ratio}，真实商业摄影；不出现未提供的价格、活动、水印、乱码、虚假前后对比或功效承诺。`,
  ].join("\n");

export const DETAIL_PAGE_CATEGORY_TREE = [
  {
    ...SOCIAL_DETAIL_CATEGORY,
    children: SOCIAL_DETAIL_CATEGORY.children.map((child) => ({ ...child })),
  },
  ...(CUSTOM_BRAND_DETAIL_PAGE_BLUEPRINTS.length ? [{ ...CUSTOM_BRAND_BRAND_CATEGORY, children: CUSTOM_BRAND_BRAND_CATEGORY.children.map((child) => ({ ...child })) }] : []),
];

export const DETAIL_PAGE_PLATFORMS = [
  ...new Set([
    ...SOCIAL_DETAIL_PLATFORMS,
    ...CUSTOM_BRAND_DETAIL_PAGE_BLUEPRINTS.map((item) => item.platform),
  ]),
];

export const DETAIL_PAGE_TEMPLATE_COUNT =
  SOCIAL_DETAIL_PAGE_TEMPLATE_COUNT + CUSTOM_BRAND_DETAIL_PAGE_TEMPLATE_COUNT;

export function normalizeDetailPageTemplateOverride(input, current = {}) {
  const tagsInput = input?.tags ?? current.tags;
  const tags = (Array.isArray(tagsInput)
    ? tagsInput
    : String(tagsInput || "").split(/[，,]/)
  )
    .map((item) => cleanText(item, 32))
    .filter(Boolean)
    .slice(0, 12);
  const model = ["gpt-image-2", "vapeur-gpt-image-2"].includes(
    String(input?.model ?? current.model),
  )
    ? String(input?.model ?? current.model)
    : "gpt-image-2";
  const aspectRatio = ["1:1", "3:4", "4:3", "9:16", "16:9"].includes(
    String(input?.aspectRatio ?? current.aspectRatio),
  )
    ? String(input?.aspectRatio ?? current.aspectRatio)
    : "";
  const resolution = ["1k", "2k", "4k"].includes(
    String(input?.resolution ?? current.resolution).toLowerCase(),
  )
    ? String(input?.resolution ?? current.resolution).toLowerCase()
    : "2k";
  const quality = ["low", "medium", "high"].includes(
    String(input?.quality ?? current.quality).toLowerCase(),
  )
    ? String(input?.quality ?? current.quality).toLowerCase()
    : "high";
  const count = [1, 2, 4].includes(Number(input?.count ?? current.count))
    ? Number(input?.count ?? current.count)
    : 1;
  const outputFormat = ["png", "jpeg", "webp"].includes(
    String(input?.outputFormat ?? current.outputFormat).toLowerCase(),
  )
    ? String(input?.outputFormat ?? current.outputFormat).toLowerCase()
    : "png";
  const normalized = {
    ...current,
    promptText: cleanText(input?.promptText ?? current.promptText),
    negativePrompt: cleanText(
      input?.negativePrompt ?? current.negativePrompt,
      2_000,
    ),
    enabled:
      typeof input?.enabled === "boolean"
        ? input.enabled
        : current.enabled !== false,
    generationPath: cleanText(
      input?.generationPath ?? current.generationPath,
      240,
    ),
    tags,
    model,
    aspectRatio,
    resolution,
    quality,
    count,
    outputFormat,
    preserveSubject:
      input?.preserveSubject === undefined
        ? current.preserveSubject !== false
        : Boolean(input.preserveSubject),
    useNegativePrompt:
      input?.useNegativePrompt === undefined
        ? current.useNegativePrompt !== false
        : Boolean(input.useNegativePrompt),
    allowText:
      input?.allowText === undefined
        ? Boolean(current.allowText)
        : Boolean(input.allowText),
  };
  if (input?.title !== undefined || current.title)
    normalized.title = cleanText(input?.title ?? current.title, 120);
  if (input?.coverUrl !== undefined || current.coverUrl)
    normalized.coverUrl = cleanText(input?.coverUrl ?? current.coverUrl, 500);
  if (input?.coverPrompt !== undefined || current.coverPrompt)
    normalized.coverPrompt = cleanText(
      input?.coverPrompt ?? current.coverPrompt,
    );
  return normalized;
}

export function createDetailPageTemplates({ coverUrls = [], overrides = {} } = {}) {
  let index = 0;
  const items = SOCIAL_DETAIL_BLUEPRINTS.map((blueprint) => {
    const override = normalizeDetailPageTemplateOverride(overrides[blueprint.id]);
    const coverUrl = override.coverUrl || blueprint.coverUrl;
    const defaultPrompt = blueprint.promptText;
    const item = {
      ...blueprint,
      productReferenceUrl: "",
      productReferenceUrls: [],
      defaultProductIncluded: false,
      title: override.title || blueprint.title,
      kind: "image",
      mediaType: "image",
      category: SOCIAL_DETAIL_CATEGORY.label,
      primaryCategory: SOCIAL_DETAIL_CATEGORY.label,
      primaryCategoryId: SOCIAL_DETAIL_CATEGORY.id,
      platformVariantId: blueprint.id,
      aspectRatio: override.aspectRatio || blueprint.ratio,
      ratio: override.aspectRatio || blueprint.ratio,
      coverUrl,
      mainImageUrl: coverUrl,
      promptText: override.promptText || defaultPrompt,
      coverPrompt: override.coverPrompt || blueprint.coverPrompt,
      defaultPrompt,
      negativePrompt: override.negativePrompt || blueprint.negativePrompt,
      tags: override.tags?.length ? override.tags : blueprint.tags,
      description: `${SOCIAL_DETAIL_CATEGORY.label} / ${blueprint.secondaryCategory} · ${blueprint.platform}`,
      workflowPreset: "detail-page-brief-image",
      generationPath: override.generationPath || "/api/tasks/image",
      model: override.model || "gpt-image-2",
      resolution: override.resolution || "2k",
      quality: override.quality || "high",
      count: override.count || 1,
      outputFormat: override.outputFormat || "png",
      preserveSubject: override.preserveSubject !== false,
      useNegativePrompt: override.useNegativePrompt !== false,
      allowText: Boolean(override.allowText),
      custom: false,
      system: true,
      featured: true,
      coverGenerated: false,
      coverVerified: false,
      enabled: override.enabled !== false,
      sortOrder: index,
    };
    index += 1;
    return item;
  });
  CUSTOM_BRAND_DETAIL_PAGE_BLUEPRINTS.forEach((blueprint) => {
    const override = normalizeDetailPageTemplateOverride(overrides[blueprint.id]);
    const brandInvocation = createCustomBrandInvocation(blueprint);
    const coverUrl = override.coverUrl || blueprint.coverUrl;
    const defaultPrompt = buildCustomBrandPrompt(blueprint, brandInvocation);
    const promptText = override.promptText || defaultPrompt;
    const item = {
      ...blueprint,
      productReferenceUrl: "",
      productReferenceUrls: [],
      defaultProductIncluded: false,
      title: override.title || blueprint.title,
      kind: "image",
      mediaType: "image",
      category: CUSTOM_BRAND_BRAND_CATEGORY.label,
      primaryCategory: CUSTOM_BRAND_BRAND_CATEGORY.label,
      primaryCategoryId: CUSTOM_BRAND_BRAND_CATEGORY.id,
      platformVariantId: blueprint.id,
      aspectRatio: override.aspectRatio || blueprint.ratio,
      ratio: override.aspectRatio || blueprint.ratio,
      coverUrl,
      mainImageUrl: coverUrl,
      promptText,
      coverPrompt:
        override.coverPrompt || buildCustomBrandCoverPrompt(blueprint, brandInvocation),
      defaultPrompt,
      negativePrompt:
        override.negativePrompt ||
        "瓶器变形，错误Logo，改写包装文字，额外赠品，重复产品，虚构功效，医疗表述，虚假前后对比，价格，折扣，销量，乱码，水印，塑料皮肤，手指畸形",
      tags: override.tags?.length
        ? override.tags
        : [
            "自有品牌",
            "CUSTOM",
            blueprint.secondaryCategory,
            blueprint.platform,
            blueprint.imageType,
            blueprint.form,
            blueprint.ratio,
            "当前热卖",
            "图生图",
          ],
      description: `自有品牌当前热卖 / ${blueprint.secondaryCategory} · ${blueprint.platform}${blueprint.imageType}`,
      workflowPreset: "single-node-detail-image",
      generationPath: override.generationPath || "/api/tasks/image",
      model: override.model || "gpt-image-2",
      resolution: override.resolution || "2k",
      quality: override.quality || "high",
      count: override.count || 1,
      outputFormat: override.outputFormat || "png",
      preserveSubject: override.preserveSubject !== false,
      useNegativePrompt: override.useNegativePrompt !== false,
      allowText: Boolean(override.allowText),
      brand: "CUSTOM",
      brandReady: brandInvocation?.status === "ready",
      brandInvocation,
      custom: false,
      system: true,
      featured: true,
      coverGenerated: false,
      coverVerified: false,
      enabled: override.enabled !== false,
      sortOrder: index,
    };
    index += 1;
    items.push(item);
  });
  return items;
}

