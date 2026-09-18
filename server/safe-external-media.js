import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

const DEFAULT_PUBLIC_MEDIA_PATHS = Object.freeze([
  "/generated/",
  "/inspiration-assets/",
  "/api/hot-rank/media/",
]);

export const EXTERNAL_MEDIA_DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
export const EXTERNAL_MEDIA_DEFAULT_TIMEOUT_MS = 20_000;

export function redactExternalRequestFields(record = {}) {
  const {
    callbackUrl: _callbackUrl,
    providerRequestUrl: _providerRequestUrl,
    externalRequestUrl: _externalRequestUrl,
    targetUrl: _targetUrl,
    ...safe
  } = record || {};
  return safe;
}

class ExternalBoundaryError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "ExternalBoundaryError";
    this.code = code;
    this.status = status;
  }
}

const rejectedMediaUrl = () =>
  new ExternalBoundaryError(
    "外部媒体地址不安全或不受支持",
    "EXTERNAL_MEDIA_URL_REJECTED",
    400,
  );

const rejectedCallbackUrl = () =>
  new ExternalBoundaryError(
    "回调地址不安全或不受支持",
    "EXTERNAL_CALLBACK_URL_REJECTED",
    400,
  );

const mediaTooLarge = () =>
  new ExternalBoundaryError(
    "外部媒体超过允许大小",
    "EXTERNAL_MEDIA_TOO_LARGE",
    413,
  );

const mediaDnsFailed = () =>
  new ExternalBoundaryError(
    "外部媒体地址暂时无法解析",
    "EXTERNAL_MEDIA_DNS_FAILED",
    502,
  );

const mediaTimeout = () =>
  new ExternalBoundaryError(
    "外部媒体读取超时",
    "EXTERNAL_MEDIA_TIMEOUT",
    504,
  );

const mediaFetchFailed = (status) =>
  new ExternalBoundaryError(
    Number.isInteger(status)
      ? `外部媒体读取失败（HTTP ${status}）`
      : "外部媒体读取失败",
    "EXTERNAL_MEDIA_FETCH_FAILED",
    502,
  );

function parseIpv4(address) {
  const parts = String(address).split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  )
    return null;
  return parts.reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function ipv4InCidr(value, base, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) >>> 0 === (base & mask) >>> 0;
}

function isPublicIpv4(address) {
  const value = parseIpv4(address);
  if (value === null) return false;
  const denied = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return !denied.some(([base, bits]) =>
    ipv4InCidr(value, parseIpv4(base), bits),
  );
}

function expandIpv6(address) {
  let value = String(address).toLowerCase().replace(/^\[|\]$/g, "");
  if (value.includes("%")) return null;
  const ipv4Tail = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const ipv4 = parseIpv4(ipv4Tail);
    if (ipv4 === null) return null;
    value = value.slice(0, -ipv4Tail.length) +
      `${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  if ((value.match(/::/g) || []).length > 1) return null;
  const [leftRaw, rightRaw = ""] = value.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  const fill = value.includes("::") ? 8 - left.length - right.length : 0;
  if (fill < 0 || (!value.includes("::") && left.length !== 8)) return null;
  const groups = [...left, ...Array(fill).fill("0"), ...right];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  )
    return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

function ipv6BigInt(address) {
  const groups = expandIpv6(address);
  if (!groups) return null;
  return groups.reduce(
    (value, group) => (value << 16n) | BigInt(group),
    0n,
  );
}

function ipv6InCidr(value, base, bits) {
  const shift = 128n - BigInt(bits);
  return value >> shift === base >> shift;
}

function isPublicIpv6(address) {
  const value = ipv6BigInt(address);
  if (value === null) return false;
  const mappedBase = ipv6BigInt("::ffff:0:0");
  if (ipv6InCidr(value, mappedBase, 96)) {
    const ipv4 = Number(value & 0xffffffffn) >>> 0;
    return isPublicIpv4(
      [24, 16, 8, 0].map((shift) => (ipv4 >>> shift) & 255).join("."),
    );
  }
  const denied = [
    ["::", 128],
    ["::1", 128],
    ["64:ff9b::", 96],
    ["64:ff9b:1::", 48],
    ["100::", 64],
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["3ffe::", 16],
    ["3fff::", 20],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ];
  if (
    denied.some(([base, bits]) =>
      ipv6InCidr(value, ipv6BigInt(base), bits),
    )
  )
    return false;
  return ipv6InCidr(value, ipv6BigInt("2000::"), 3);
}

function isPublicAddress(address) {
  const normalized = String(address || "").replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family === 6) return isPublicIpv6(normalized);
  return false;
}

function normalizedHostname(url) {
  return String(url.hostname || "")
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
}

function parseHttpUrl(input, errorFactory) {
  const value = String(input || "").trim();
  if (!value || value.length > 4096) throw errorFactory();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw errorFactory();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.hostname
  )
    throw errorFactory();
  url.hash = "";
  return url;
}

function configuredBaseUrl(value) {
  if (!String(value || "").trim()) return null;
  try {
    const url = new URL(String(value).trim());
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

function isAllowedSameSiteMedia(url, publicBaseUrl, allowedPaths) {
  const base = configuredBaseUrl(publicBaseUrl);
  if (!base || url.origin !== base.origin) return false;
  if (/%(?:2e|2f|5c|25)/i.test(url.pathname)) return false;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return false;
  }
  if (
    decodedPath.includes("\\") ||
    decodedPath.includes("\0") ||
    decodedPath.split("/").some((segment) => segment === "." || segment === "..")
  )
    return false;
  return allowedPaths.some((prefix) => url.pathname.startsWith(prefix));
}

async function resolveAddresses(hostname, lookup) {
  if (isIP(hostname))
    return [{ address: hostname, family: isIP(hostname) }];
  let values;
  try {
    values = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw mediaDnsFailed();
  }
  const entries = (Array.isArray(values) ? values : [values])
    .map((entry) =>
      typeof entry === "string"
        ? { address: entry, family: isIP(entry) }
        : { address: String(entry?.address || ""), family: Number(entry?.family) },
    )
    .filter((entry) => isIP(entry.address));
  if (!entries.length) throw mediaDnsFailed();
  return entries;
}

export async function validateExternalMediaUrl(input, options = {}) {
  const url = parseHttpUrl(input, rejectedMediaUrl);
  const hostname = normalizedHostname(url);
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  )
    throw rejectedMediaUrl();
  const allowedPaths = Array.isArray(options.allowedSameSitePaths)
    ? options.allowedSameSitePaths
    : DEFAULT_PUBLIC_MEDIA_PATHS;
  const sameSite = isAllowedSameSiteMedia(
    url,
    options.publicBaseUrl ?? process.env.PUBLIC_BASE_URL,
    allowedPaths,
  );
  const lookup = options.lookup || dnsLookup;
  const addresses = await resolveAddresses(hostname, lookup);
  if (!sameSite && addresses.some((entry) => !isPublicAddress(entry.address)))
    throw rejectedMediaUrl();
  return { url, addresses, sameSite };
}

export async function validateExternalCallbackUrl(input, options = {}) {
  const url = parseHttpUrl(input, rejectedCallbackUrl);
  const base = configuredBaseUrl(
    options.publicBaseUrl ?? process.env.PUBLIC_BASE_URL,
  );
  const configuredUrls = new Set(
    (Array.isArray(options.configuredCallbackUrls)
      ? options.configuredCallbackUrls
      : [])
      .map((value) => {
        try {
          return new URL(String(value)).href;
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
  if (configuredUrls.has(url.href)) return url;
  if (
    base &&
    url.origin === base.origin &&
    url.pathname.startsWith("/api/providers/volcengine/callback/")
  )
    return url;
  if (url.protocol !== "https:") throw rejectedCallbackUrl();
  try {
    await validateExternalMediaUrl(url.href, {
      lookup: options.lookup,
      publicBaseUrl: "",
      allowedSameSitePaths: [],
    });
  } catch {
    throw rejectedCallbackUrl();
  }
  return url;
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "");
  const value = headers[String(name).toLowerCase()] ?? headers[name];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function releaseBody(body) {
  try {
    if (typeof body?.destroy === "function") body.destroy();
    else if (typeof body?.cancel === "function") void body.cancel();
    else if (typeof body?.resume === "function") body.resume();
  } catch {
    // Releasing a rejected response is best-effort only.
  }
}

function pinnedHttpRequest({ url, address, family, signal, timeoutMs }) {
  const transport = url.protocol === "https:" ? https : http;
  const hostname = normalizedHostname(url);
  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          Accept: "*/*",
          "Accept-Encoding": "identity",
          Host: url.host,
        },
        lookup: (_name, _options, callback) =>
          callback(null, address, family),
        ...(url.protocol === "https:" && !isIP(hostname)
          ? { servername: hostname }
          : {}),
      },
      (response) =>
        resolve({
          status: Number(response.statusCode || 0),
          headers: response.headers,
          body: response,
        }),
    );
    request.once("error", reject);
    request.setTimeout(timeoutMs, () => request.destroy(mediaTimeout()));
    const abort = () => request.destroy(signal.reason || mediaTimeout());
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    request.once("close", () => signal.removeEventListener("abort", abort));
    request.end();
  });
}

function waitWithSignal(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason || mediaTimeout());
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || mediaTimeout());
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function normalizedLimit(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

export async function readExternalMedia(input, options = {}) {
  const maxBytes = normalizedLimit(
    options.maxBytes,
    EXTERNAL_MEDIA_DEFAULT_MAX_BYTES,
  );
  const timeoutMs = normalizedLimit(
    options.timeoutMs,
    EXTERNAL_MEDIA_DEFAULT_TIMEOUT_MS,
  );
  const maxRedirects = Math.max(
    0,
    Math.min(5, Number.isInteger(options.maxRedirects) ? options.maxRedirects : 2),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(mediaTimeout()), timeoutMs);
  const parentSignal = options.signal;
  const parentAbort = () =>
    controller.abort(
      parentSignal?.reason instanceof Error
        ? parentSignal.reason
        : mediaFetchFailed(),
    );
  if (parentSignal?.aborted) parentAbort();
  else parentSignal?.addEventListener("abort", parentAbort, { once: true });
  const requestImpl = options.requestImpl || pinnedHttpRequest;
  let current = input;
  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      const validated = await waitWithSignal(
        validateExternalMediaUrl(current, options),
        controller.signal,
      );
      const selected = validated.addresses[0];
      let response;
      try {
        response = await waitWithSignal(
          requestImpl({
            url: validated.url,
            address: selected.address,
            family: selected.family,
            signal: controller.signal,
            timeoutMs,
          }),
          controller.signal,
        );
      } catch (error) {
        if (
          controller.signal.aborted ||
          ["AbortError", "TimeoutError"].includes(String(error?.name || "")) ||
          error?.code === "EXTERNAL_MEDIA_TIMEOUT"
        )
          throw mediaTimeout();
        if (error instanceof ExternalBoundaryError) throw error;
        throw mediaFetchFailed();
      }
      const status = Number(response?.status || 0);
      if ([301, 302, 303, 307, 308].includes(status)) {
        releaseBody(response?.body);
        if (redirectCount >= maxRedirects) throw mediaFetchFailed(status);
        const location = headerValue(response?.headers, "location");
        if (!location) throw mediaFetchFailed(status);
        try {
          current = new URL(location, validated.url).href;
        } catch {
          throw mediaFetchFailed(status);
        }
        continue;
      }
      if (status < 200 || status >= 300) {
        releaseBody(response?.body);
        throw mediaFetchFailed(status || undefined);
      }
      const contentLength = headerValue(response?.headers, "content-length");
      if (contentLength) {
        if (!/^\d+$/.test(contentLength)) {
          releaseBody(response?.body);
          throw mediaFetchFailed();
        }
        if (Number(contentLength) > maxBytes) {
          releaseBody(response?.body);
          throw mediaTooLarge();
        }
      }
      const chunks = [];
      let totalBytes = 0;
      try {
        if (!response?.body?.[Symbol.asyncIterator]) throw mediaFetchFailed();
        for await (const rawChunk of response.body) {
          const chunk = Buffer.from(rawChunk);
          totalBytes += chunk.length;
          if (totalBytes > maxBytes) {
            releaseBody(response.body);
            throw mediaTooLarge();
          }
          chunks.push(chunk);
        }
      } catch (error) {
        if (error instanceof ExternalBoundaryError) throw error;
        if (controller.signal.aborted) throw mediaTimeout();
        throw mediaFetchFailed();
      }
      return {
        buffer: Buffer.concat(chunks, totalBytes),
        contentType: headerValue(response.headers, "content-type")
          .split(";")[0]
          .trim()
          .toLowerCase(),
      };
    }
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", parentAbort);
  }
}

