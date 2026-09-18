const CHINESE_TEXT = /[\u3400-\u9fff]/;
const STORAGE_PERMISSION_CODES = new Set(['EACCES', 'EPERM', 'EROFS']);
const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE']);

function collectErrorText(value, output = [], seen = new Set(), depth = 0) {
  if (value == null || depth > 4) return output;
  if (typeof value === 'string') {
    if (value.trim()) output.push(value.trim());
    return output;
  }
  if (typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);
  for (const key of ['message', 'msg', 'detail', 'reason', 'type', 'code', 'error_description']) collectErrorText(value[key], output, seen, depth + 1);
  for (const key of ['error', 'cause', 'payload', 'response', 'ResponseMetadata']) collectErrorText(value[key], output, seen, depth + 1);
  return output;
}

function errorStatus(error) {
  const candidates = [error?.status, error?.statusCode, error?.response?.status, error?.payload?.status];
  return candidates.map(Number).find((value) => Number.isInteger(value) && value >= 100 && value <= 599) || null;
}

function errorCode(error) {
  return String(error?.code || error?.cause?.code || error?.payload?.code || '').trim().toUpperCase();
}

function inputLocation(raw) {
  const contentIndex = raw.match(/content\[(\d+)\]/i);
  if (contentIndex) return `第 ${Number(contentIndex[1]) + 1} 项输入素材`;
  const imageIndex = raw.match(/image data\s+(\d+)/i);
  if (imageIndex) return `第 ${Number(imageIndex[1])} 张图片`;
  return '输入素材';
}

function isSpecificChineseMessage(message) {
  return CHINESE_TEXT.test(message)
    && !/(?:请求|生成|服务)失败[（(]?\s*HTTP\s*\d+/i.test(message)
    && !/^[A-Za-z0-9 ._-]+请求失败/.test(message);
}

export function generationErrorMessage(error, fallback = '生成失败，请稍后重试。') {
  const texts = collectErrorText(error);
  const primary = typeof error === 'string' ? error : String(error?.message || texts[0] || '').trim();
  const raw = texts.join(' ').trim();
  const status = errorStatus(error);
  const code = errorCode(error);
  if (!raw && !status && !code) return fallback;

  if (STORAGE_PERMISSION_CODES.has(code) || /(?:EACCES|EPERM|read-only file system).*?(?:data\/generated|generated\/|permission denied)/i.test(raw)) return '生成结果保存失败，请联系管理员检查服务器存储权限。';
  if ((code === 'ENOENT' || /\bENOENT\b/i.test(raw)) && /(?:tasks|workflow_runs)\.json|rename .*\.tmp/i.test(raw)) return '任务记录保存失败，请稍后重试；若持续出现请联系管理员。';
  if (isSpecificChineseMessage(primary)) return primary;

  if (/image exceeds the maximum allowed total pixels|maximum allowed.*pixels|total pixels.*exceed/i.test(raw)) {
    const maximum = raw.match(/maximum allowed:\s*(\d+)\s*pixels/i)?.[1];
    const limit = maximum ? `${Math.round(Number(maximum) / 10_000)} 万` : '模型规定的';
    return `${inputLocation(raw)}总像素超过 ${limit}限制，系统未能自动缩放，请重新上传或降低分辨率。`;
  }
  if (/image pixel is invalid/i.test(raw)) {
    return '首帧或尾帧的尺寸、透明通道或像素编码不符合模型要求。平台会自动放大过小图片并转为标准 JPG；请从失败任务重新生成。';
  }
  if (/invalid image file or mode|invalid image mode|cannot identify image|image file.*(?:invalid|corrupt|unreadable)/i.test(raw)) {
    const numbered = raw.match(/image\s+(\d+)/i)?.[1];
    return `${numbered ? `第 ${numbered} 张参考图片` : '参考图片'}的颜色模式、方向信息或文件编码不兼容。平台会自动转为标准 JPG/PNG；请从失败节点重新生成。`;
  }
  if (/audio duration/i.test(raw) && /less than or equal|must be|exceed|too long/i.test(raw)) {
    const limit = raw.match(/(?:less than or equal to|maximum|max|<=)\s*(\d+(?:\.\d+)?)/i)?.[1] || '模型规定时长';
    return `${inputLocation(raw)}的音频时长超过 ${limit}${limit === '模型规定时长' ? '' : ' 秒'}，系统未能自动裁剪，请裁短后重试。`;
  }
  if (/entity\.too\.large|payload too large|request entity too large|body exceeded|HTTP\s*413/i.test(raw) || status === 413) return '上传素材超过 API 请求限制，请压缩后再提交。';
  if (/copyright|intellectual property|trademark/i.test(raw)) return `${inputLocation(raw)}可能涉及版权限制，请更换为自有版权或已获授权的图片、视频后重试。`;
  if (/(?:input\s+video|video\s*['"]?content\[\d+\])/i.test(raw) && /real person|real-person|photorealistic person|face verification|identity verification/i.test(raw)) {
    return `${inputLocation(raw)}中的动作参考视频检测到真人。Seedance 真人资产只认证人物图片；舞蹈动作模仿请把视频节点切换为“Kling 3.0 动作控制”，再连接人物图和舞蹈视频。`;
  }
  if (/real person|real-person|photorealistic person|face verification|identity verification/i.test(raw)) return `${inputLocation(raw)}检测到真人，请改用“已认证真人”模式并完成授权，或更换为非真人素材。`;
  if (/minor|underage|child safety/i.test(raw)) return '素材可能涉及未成年人安全限制，请更换合规素材后重试。';
  if (/failure to pass the risk control|risk control system/i.test(raw)) return '内容未通过模型安全审核，请调整提示词或更换素材后重试。';
  if (/content policy|safety|moderation|blocked|sensitive|\brisk\b|violate|policy restriction|nsfw|sexual|violent/i.test(raw)) return '内容触发模型安全策略，请调整提示词或素材后重试。';
  if (/abort|timeout|timed out|etimedout|gateway timeout|HTTP\s*504/i.test(raw) || status === 408 || status === 504) return '生成接口响应超时，任务额度已自动退回；请稍后重试。';
  if (NETWORK_CODES.has(code) || /failed to fetch|fetch failed|network|load failed|econnreset|econnrefused|enotfound|socket|dns/i.test(raw)) return '模型接口连接失败，请检查网络或稍后重试。';
  if (/rate limit|too many requests|throttle/i.test(raw) || status === 429) return '模型请求过于频繁，请稍后再试。';
  if (/quota|insufficient_quota|billing|balance|credit|payment/i.test(raw) || status === 402) return '模型额度不足或计费配置异常，请联系管理员处理。';
  if (/unsupported (?:file|media|image|video|audio)|invalid (?:file|media) (?:type|format)|file format|media format|mime type/i.test(raw)) return '素材格式不受模型支持，请转换为页面标注的图片、视频或音频格式后重试。';
  if (/unauthorized|invalid api key|api key|apikey|authentication failed|access denied|permission denied/i.test(raw) || status === 401) return '模型密钥或权限配置异常，请联系管理员处理。';
  if (status === 403 || /HTTP\s*403|\bforbidden\b/i.test(raw)) return '模型请求被拒绝，但供应商未返回明确原因，请联系管理员核查模型权限和内容安全记录。';
  if (/invalid|unsupported|bad request|validation|malformed|HTTP\s*400/i.test(raw) || status === 400 || status === 422) return '生成参数不符合模型要求，请调整素材或参数后重试。';
  if (/not found|HTTP\s*404/i.test(raw) || status === 404 || status === 410) return '生成资源不存在或已过期，请重新提交任务。';
  if (/server error|internal server error|bad gateway|service unavailable|HTTP\s*50[023]/i.test(raw) || (status && status >= 500)) return '模型服务暂时不可用，请稍后重试。';
  return fallback;
}

export function generationErrorDetails(error, fallback = '生成失败，请稍后重试。') {
  const raw = collectErrorText(error).join(' ').trim();
  const status = errorStatus(error);
  const code = errorCode(error);
  const message = generationErrorMessage(error, fallback);
  let category = 'unknown';
  let retryable = false;

  if (/rate limit|too many requests|throttle/i.test(raw) || status === 429) {
    category = 'rate_limit';
    retryable = true;
  } else if (/abort|timeout|timed out|etimedout|gateway timeout/i.test(raw) || status === 408 || status === 504) {
    category = 'timeout';
    retryable = true;
  } else if (NETWORK_CODES.has(code) || /failed to fetch|fetch failed|network|econnreset|econnrefused|enotfound|socket|dns/i.test(raw)) {
    category = 'network';
    retryable = true;
  } else if (/server error|internal server error|bad gateway|service unavailable/i.test(raw) || (status && status >= 500)) {
    category = 'provider_unavailable';
    retryable = true;
  } else if (/quota|insufficient_quota|billing|balance|credit|payment/i.test(raw) || status === 402) {
    category = 'quota';
  } else if (STORAGE_PERMISSION_CODES.has(code) || /read-only file system|tasks|workflow_runs|rename .*\.tmp/i.test(raw)) {
    category = 'storage';
  } else if (/copyright|intellectual property|trademark|content policy|safety|moderation|blocked|sensitive|risk control|violate|nsfw|sexual|violent|real person|face verification|identity verification|minor|underage|child safety/i.test(raw)) {
    category = 'policy';
  } else if (/unauthorized|invalid api key|api key|apikey|authentication failed|access denied|permission denied/i.test(raw) || status === 401 || status === 403) {
    category = 'authorization';
  } else if (/not found|expired/i.test(raw) || status === 404 || status === 410) {
    category = 'missing_resource';
  } else if (/invalid|unsupported|bad request|validation|malformed|payload too large|maximum allowed|duration/i.test(raw) || status === 400 || status === 413 || status === 422) {
    category = 'validation';
  }

  return {
    category,
    retryable,
    status,
    code,
    message,
  };
}

