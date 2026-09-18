import { OUTFIT_PRODUCT_CATALOG } from "./product-catalog.js";

export const OUTFIT_CASE_LIMIT = 30;
const OUTFIT_CASE_PRODUCTS = OUTFIT_PRODUCT_CATALOG.slice(0, OUTFIT_CASE_LIMIT);

const OUTFIT_COMPOSITION_BASE_PROMPT = String.raw`Use the uploaded white-background garment or outfit image as the only reference. Generate exactly ONE photorealistic vertical 2:3 clothing-only outfit composition on a pure seamless white background.

PRIORITY: 1 exact garment detail restoration; 2 exact logo, badge, print and brand-text fidelity; 3 exact garment silhouette and construction; 4 zero visible human/mannequin parts; 5 complete outfit styling and clean premium presentation.

PRODUCT LOCK

Treat the uploaded garment or outfit image as a locked commercial product reference. Preserve every intended garment, shoe, bag and accessory exactly: category, original color, color distribution, silhouette, fit, volume, intended length, fabric, texture, thickness, sheen, neckline, collar, hood, straps, sleeves, cuffs, hem, waistband, pockets, seams, panels, quilting, pleats, gathers, ruching, buttons, zippers, hardware, logos, prints, text and decorations.

Do not redesign, recolor, simplify, beautify, slim, flatten, tighten, loosen, shorten, lengthen, reshape, replace or reinterpret any selected item. Reproduce the exact product, not a generic similar item. Use only clearly visible evidence and do not invent hidden construction.

LOGO, BADGE AND BRAND-TEXT LOCK

Any visible logo, badge, graphic, symbol, embroidery, print or brand text on the garment must be restored with maximum fidelity.

Preserve exactly:
- logo or badge shape
- logo or badge size
- logo or badge color
- logo or badge position
- logo or badge orientation
- print layout
- text content
- letter case
- brand-name spelling
- spacing and visible line arrangement
- embossed, raised, stitched or printed appearance when visible

Do not miss, move, distort, simplify, replace or rewrite any logo, badge or text. Do not generate approximate spelling. If text is visible, reproduce the same spelling exactly.

If the garment contains separate branding elements, preserve each one independently and exactly. Do not merge them, move them to the same place, replace one with another or invent extra branding.

If there is a sleeve badge, chest logo, printed wordmark or decorative text, preserve the original location, scale and orientation exactly. The badge must remain clearly identifiable as the same badge, not reduced to a generic patch or decorative circle.

SET LOGIC

If both an upper and lower garment share matching color, fabric, texture, pattern, trim or design language, treat them as one coordinated set and preserve both pieces.

INPUT LOGIC

- Single top: add one bottom, shoes and one bag.
- Single bottom: add one top, shoes and one bag.
- Outerwear: add one inner top, one bottom, shoes and one bag.
- Dress: add shoes and one bag.
- Set or one-piece: add shoes and one bag only.
- Complete outfit: preserve the full combination.
- Alternative-item board: choose one coherent outfit only.

Never output an incomplete outfit.

DETAIL RULES

Keep product category and garment proportion independent of canvas occupancy. A bandeau, tube top, camisole or cropped top must remain a top, not a dress.

For strappy garments, preserve exact strap count, width, spacing, direction and attachment points. Do not read folds, shadows, seams or hanger lines as extra straps.

If a garment is loose, straight, boxy or oversized, preserve its original ease, width and silhouette. Do not make it fitted.

For hooded items, preserve only the clearly visible hood-collar structure. Do not add a hidden collar, second hood, throat flap or extra neck panel.

For cuffs, add no ribbing, elastic, inner cuff or double cuff unless clearly visible.

DISPLAY MODE - ZERO BODY

Show garments, shoes, bag and accessories only. Generate no person, skin, anatomy, mannequin, model, ghost mannequin, invisible mannequin, support form or body parts.

The result must look like a premium clothing-only styling arrangement, never like a person wearing clothes.

Give garments natural three-dimensional volume and drape while keeping every opening empty:
- no neck or skin inside necklines
- no hands inside sleeves
- no legs inside skirts or trousers
- no feet inside shoes

Show shoes as separate objects below the outfit, never worn. Show the bag as a separate object beside the outfit, never hand-held or body-worn.

SEASON RULE

Infer the intended season from the uploaded product’s fabric, thickness, sleeve length, coverage and structure. Keep the outfit seasonally appropriate. Do not turn spring or summer items into autumn or winter looks, and do not turn autumn or winter items into summer looks. Added styling pieces must match the original garment’s season and must never overpower or contradict the uploaded product.

STYLING AND OUTPUT

When styling is needed, create a Refined Urban Chic outfit with a polished, mature, clean and structured city-commuter feel. Product fidelity has higher priority than style.

Prefer black, white, charcoal, gray, navy, taupe, camel, beige, cream, chocolate and other muted neutrals. Prefer tailored trousers, refined straight or draped skirts, polished shorts, sleek flats, loafers, elegant sandals, clean pumps, refined ankle boots, and one structured handbag or minimalist shoulder bag. Keep supporting items understated, premium and secondary to the uploaded product.

Avoid sporty styling, distressed denim, chunky sneakers, oversized streetwear, bohemian styling, loud contrast colors, childish details and unnecessary heavy layering.

Show the complete outfit from the highest garment edge to the bottom of the shoes. Keep all garments, sleeves, hems, shoes and bag fully visible, centered, with clean white space above and below. Reduce scale instead of cropping.

Use soft studio light, minimal natural shadows, realistic fabric texture and natural drape. No person, mannequin, collage, multiple outfits, text, watermark or scene background.

Output exactly ONE image.`;

const STYLE_OPTIONS = {
  精致都市通勤: [
    {
      id: "refined-urban",
      label: "精致都市",
      direction: "Refined Urban Chic，剪裁利落、结构清楚，以中性色和质感材质完成成熟城市通勤搭配。",
    },
    {
      id: "quiet-luxury",
      label: "静奢通勤",
      direction: "Quiet Luxury Commuter，降低装饰与色差，用羊毛、真丝、细针织和克制皮具表现静奢质感。",
    },
    {
      id: "modern-french-business",
      label: "法式轻商务",
      direction: "Modern French Business，比例松弛但保持利落，用尖头鞋、流畅下装和小型结构包完成轻商务造型。",
    },
  ],
  高质感运动休闲: [
    {
      id: "premium-athleisure",
      label: "质感运动",
      direction: "Premium Athleisure，强调功能线条、同色层次与高级基础色，鞋包简洁且适合城市穿着。",
    },
    {
      id: "minimal-training",
      label: "极简训练",
      direction: "Minimal Training，以黑白灰和干净训练廓形完成轻量搭配，不添加多余装饰或冲突品牌。",
    },
    {
      id: "city-tennis",
      label: "城市网球",
      direction: "City Tennis Club，使用奶油白、海军蓝和少量酒红，以复古运动鞋和小型运动包形成清爽学院运动感。",
    },
  ],
  趣味学院街头: [
    {
      id: "cream-collegiate",
      label: "奶油学院",
      direction: "Cream Collegiate，以奶油白、藏蓝和复古鞋包衬托主商品趣味图案，轻松但不幼稚。",
    },
    {
      id: "retro-campus",
      label: "复古校园",
      direction: "Retro Campus，使用低饱和复古配色、板鞋与小型腋下包，保持完整比例和清楚层次。",
    },
    {
      id: "soft-street",
      label: "轻街头",
      direction: "Soft Street，加入克制的宽松比例和中性配色，不使用厚重叠穿、破坏感或大面积撞色。",
    },
  ],
  城市轻户外: [
    {
      id: "city-light-outdoor",
      label: "城市轻户外",
      direction: "City Light Outdoor，使用轻量机能单品、自然中性色和低帮户外鞋，保持城市感而非重装登山感。",
    },
    {
      id: "commuter-tech",
      label: "通勤机能",
      direction: "Commuter Tech，以利落直筒裤、轻量内搭和小型功能包表现适合通勤的机能层次。",
    },
    {
      id: "airy-sunwear",
      label: "轻盈防晒",
      direction: "Airy Sunwear，强调春夏轻薄、透气和低饱和浅色，配件小巧，不增加厚重层次。",
    },
  ],
  法式现代优雅: [
    {
      id: "modern-french",
      label: "法式现代",
      direction: "Modern French Elegance，以尖头低跟鞋、结构小包和成熟中性色完成克制优雅搭配。",
    },
    {
      id: "gallery-minimal",
      label: "画廊极简",
      direction: "Gallery Minimal，减少装饰与配色数量，用雕塑感鞋型和小型皮具衬托主商品轮廓。",
    },
    {
      id: "soft-occasion",
      label: "轻熟场合",
      direction: "Soft Occasion，保持轻珠宝感与柔和材质对比，适合日常聚会但不过度礼服化。",
    },
  ],
};

const OUTFIT_VARIANTS = [
  {
    id: "taobao-white",
    platform: "淘宝",
    imageType: "白底搭配图",
    presentation: "极简商品陈列",
    ratio: "2:3",
    brief:
      "竖版白底电商陈列，主商品位于视觉中心，完整搭配围绕主商品展开，轮廓清晰且搜索首屏易识别",
  },
  {
    id: "tmall-editorial",
    platform: "天猫",
    imageType: "品牌搭配图",
    presentation: "高级静物造型",
    ratio: "2:3",
    brief:
      "品牌画册级白底静物造型，使用克制的错落层次、软阴影和留白，呈现高级成套感",
  },
  {
    id: "douyin-vertical",
    platform: "抖音商城",
    imageType: "竖屏爆款搭配图",
    presentation: "高点击竖屏构图",
    ratio: "2:3",
    brief:
      "移动端竖屏强视觉中心，从主商品最高处到鞋底完整展示，搭配单品形成清楚的纵向节奏",
  },
  {
    id: "xiaohongshu-flatlay",
    platform: "小红书",
    imageType: "种草搭配图",
    presentation: "杂志平铺种草",
    ratio: "2:3",
    brief:
      "纯白背景的时尚杂志平铺，轻松但精致，保留自然留白，不放文案、不加入场景道具",
  },
  {
    id: "jd-detail",
    platform: "京东",
    imageType: "品质搭配图",
    presentation: "细节品质展示",
    ratio: "2:3",
    brief:
      "方形白底品质展示，主商品尺寸最大，辅搭单品清楚分离，材质、结构、鞋包细节可信可辨",
  },
];

const clean = (value, limit = 8_000) =>
  String(value || "")
    .trim()
    .slice(0, limit);

const roleInstruction = (role) =>
  ({
    top: "当前商品是单件上衣：只新增一件下装、一双鞋和一只包。",
    bottom: "当前商品是单件下装：只新增一件上衣、一双鞋和一只包。",
    outerwear:
      "当前商品是外套：只新增一件内搭、一件下装、一双鞋和一只包，内搭不得遮挡门襟、领型与肩线。",
    dress: "当前商品是连衣裙：只新增一双鞋和一只包，不增加其他服装。",
    set: "当前商品是成套服装：完整保留套装，只新增一双鞋和一只包。",
  })[role] || "围绕当前主商品补齐一套完整穿搭。";

const styleOptionsFor = (product) =>
  STYLE_OPTIONS[product.styleName] || STYLE_OPTIONS["精致都市通勤"];

const promptFor = (product, variant, styleOption) =>
  [
    OUTFIT_COMPOSITION_BASE_PROMPT,
    "STYLE CHOICE OVERRIDE: The following selected style replaces only the generic Refined Urban Chic styling preference above. All product-lock, logo-lock, input-logic, zero-body, season and output rules remain mandatory.",
    `【本次风格】${styleOption.label}：${styleOption.direction}`,
    `【唯一主商品】使用工作流中已内置的真实白底三视图作为唯一商品参考：${product.brand}，${product.productName}，SKU ${product.sku}，${product.color}，品类为${product.productCategory}。三视图共同定义正面、侧面和背面，不得只参考其中一个角度。`,
    "【商品锁定】逐项保留主商品的原始品类、颜色分布、廓形、松量、长度、面料厚薄与光泽、领口、帽子、肩线、袖口、下摆、腰头、口袋、拼接、褶裥、抽绳、纽扣、拉链、五金、印花、刺绣、Logo、徽章和可见文字。不得重设计、重着色、修身、加长、缩短、简化或替换成相似款；看不见的结构不得臆造。",
    "【品牌细节锁定】任何可见 Logo、徽章、字母、图案和品牌文字必须保持原形状、大小、颜色、位置、朝向、拼写、大小写、间距及工艺表现；不得近似拼写、移动、合并或新增品牌元素。",
    `【搭配逻辑】${roleInstruction(product.heroRole)} 本产品采用“${product.styleName}”：${product.styleDirection}。具体搭配为：${product.stylingFormula}。主商品必须最大、最完整、最醒目，新增单品只能辅助，不得遮挡或复制主商品，也不得出现冲突品牌。`,
    `【配色与季节】原商品颜色固定为${product.color}。辅搭配色：${product.palette}。按${product.season}商品处理，新增单品的面料厚度、露肤度和鞋型必须季节一致。`,
    `【${variant.platform}构图】${variant.brief}。最终比例${variant.ratio}，完整显示从最高衣领或肩带到鞋底的全部商品，宁可缩小整体也不要裁切袖口、下摆、裤脚、鞋或包。`,
    "【零人体陈列】只显示服装、鞋和包，不出现真人、皮肤、人体、模特、人台、隐形人台、支撑体或任何身体部位。衣服保持自然三维体积与垂坠，但领口、袖口、裙裤和鞋内必须为空；鞋独立放在下方，包独立放在侧边，不得被穿着或手持。",
    "【输出】纯净无缝白底，柔和棚拍光，极少自然阴影，真实面料纹理。只生成一张完整成片；不要场景背景、拼贴、多套搭配、文字、价格、促销、水印、乱码或虚构功能。商品还原优先级永远高于风格。",
  ].join("\n\n");

const coverPromptFor = (product, variant) =>
  [
    `以 ${product.brand} ${product.sku} 的真实白底三视图作为唯一商品依据。`,
    `锁定${product.productName}的${product.color}、版型、面料、结构、Logo和全部正侧背细节。`,
    `${roleInstruction(product.heroRole)} ${product.stylingFormula}。`,
    `${product.styleName}，${variant.presentation}，${variant.ratio}，纯白背景，服装鞋包静物陈列，零人体，恰好一张图。`,
  ].join("\n");

const categoryMap = new Map();
for (const product of OUTFIT_CASE_PRODUCTS) {
  if (!categoryMap.has(product.primaryCategoryId))
    categoryMap.set(product.primaryCategoryId, {
      id: product.primaryCategoryId,
      label: product.primaryCategory,
      children: new Map(),
    });
  categoryMap
    .get(product.primaryCategoryId)
    .children.set(product.secondaryCategoryId, {
      id: product.secondaryCategoryId,
      label: product.secondaryCategory,
    });
}

export const OUTFIT_CATEGORY_TREE = [...categoryMap.values()].map((category) => ({
  id: category.id,
  label: category.label,
  children: [...category.children.values()],
}));

export const OUTFIT_PLATFORMS = OUTFIT_VARIANTS.map(
  (variant) => variant.platform,
);

export const OUTFIT_TEMPLATE_COUNT = OUTFIT_CASE_PRODUCTS.length;

export function createOutfitImageTemplates({ overrides = {} } = {}) {
  return OUTFIT_CASE_PRODUCTS.map((product, index) => {
    const variant = OUTFIT_VARIANTS[index % OUTFIT_VARIANTS.length];
    const id = `outfit-${product.id}-${variant.id}`;
    const override = overrides[id] || {};
    const styleOptions = styleOptionsFor(product).map((option) => ({
      ...option,
      promptText: promptFor(product, variant, option),
    }));
    const requestedStyleId = clean(override.selectedStyleId, 64);
    const selectedStyle =
      styleOptions.find((option) => option.id === requestedStyleId) ||
      styleOptions[0];
    const defaultPrompt = selectedStyle.promptText;
    const generatedCoverUrl = "/demo-placeholder.svg";
    const coverUrl = clean(override.coverUrl, 500) || generatedCoverUrl;
    return {
      id,
      title:
        clean(override.title, 120) ||
        `${product.brand} · ${product.productName} · ${product.styleName}`,
      kind: "outfit",
      mediaType: "image",
      category: product.primaryCategory,
      primaryCategory: product.primaryCategory,
      primaryCategoryId: product.primaryCategoryId,
      secondaryCategory: product.secondaryCategory,
      secondaryCategoryId: product.secondaryCategoryId,
      platform: variant.platform,
      platformVariantId: variant.id,
      imageType: variant.imageType,
      style: product.styleName,
      presentationStyle: variant.presentation,
      ratio: override.aspectRatio || variant.ratio,
      aspectRatio: override.aspectRatio || variant.ratio,
      coverUrl,
      mainImageUrl: product.assetUrl,
      productReferenceUrl: product.assetUrl,
      productBrand: product.brand,
      productName: product.productName,
      productSku: product.sku,
      productColor: product.color,
      productCategory: product.productCategory,
      productSeason: product.season,
      stylingFormula: product.stylingFormula,
      promptText: clean(override.promptText) || defaultPrompt,
      styleOptions,
      selectedStyleId: selectedStyle.id,
      coverPrompt: clean(override.coverPrompt) || coverPromptFor(product, variant),
      defaultPrompt,
      negativePrompt:
        clean(override.negativePrompt, 2_000) ||
        "真人，模特，人台，隐形人台，皮肤，身体部位，穿着状态，商品改款，颜色偏差，错误Logo，错误文字，图案漂移，多余衣物，重复商品，缺少鞋包，裁切，场景背景，拼贴，多套搭配，乱码，水印，价格，促销信息",
      tags:
        Array.isArray(override.tags) && override.tags.length
          ? override.tags
          : [
              product.brand,
              product.sku,
              product.primaryCategory,
              product.secondaryCategory,
              product.productCategory,
              product.styleName,
              variant.platform,
              variant.imageType,
              variant.presentation,
              override.aspectRatio || variant.ratio,
              "真实三视图",
              "白底服装搭配",
            ],
      description: `${product.brand} / ${product.productCategory} / ${product.sku} · ${variant.platform}${variant.imageType}`,
      workflowPreset: "single-node-outfit-image",
      generationPath: clean(override.generationPath, 240) || "/api/tasks/image",
      model: clean(override.model, 64) || "gpt-image-2",
      resolution: clean(override.resolution, 8) || "2k",
      quality: clean(override.quality, 16) || "high",
      count: [1, 2, 4].includes(Number(override.count))
        ? Number(override.count)
        : 1,
      outputFormat: clean(override.outputFormat, 16) || "png",
      preserveSubject: override.preserveSubject !== false,
      useNegativePrompt: override.useNegativePrompt !== false,
      allowText: Boolean(override.allowText),
      defaultProductIncluded: true,
      sourceLabel: product.sourceLabel,
      custom: false,
      system: true,
      coverGenerated: true,
      coverVerified: true,
      enabled: override.enabled !== false,
      sortOrder: index,
    };
  });
}

