import { sessionSecret as signingSecret } from "./session-secret.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  filterHotRankItems,
  normalizeHotRankManifest,
  sortHotRankItems,
  summarizeHotRank,
} from "../shared/hot-rank.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultManifestPath = path.join(
  here,
  "..",
  "public",
  "data",
  "hot-rank",
  "manifest.json",
);

export function hotRankManifestPath() {
  return path.resolve(process.env.HOT_RANK_MANIFEST || defaultManifestPath);
}

export async function readHotRankManifest() {
  try {
    const payload = JSON.parse(await fs.readFile(hotRankManifestPath(), "utf8"));
    return normalizeHotRankManifest(payload);
  } catch (error) {
    if (error?.code === "ENOENT") return normalizeHotRankManifest({ items: [] });
    throw error;
  }
}

export function hotRankMediaRoot() {
  return path.resolve(
    process.env.HOT_RANK_MEDIA_ROOT ||
      path.join(here, "..", "data", "hot-rank-media"),
  );
}

export function resolveHotRankMediaPath(fileName) {
  const base = hotRankMediaRoot();
  const safeName = path.basename(String(fileName || ""));
  if (!safeName || safeName === "." || safeName === "..") return null;
  const candidate = path.resolve(base, safeName);
  return candidate.startsWith(`${base}${path.sep}`) ? candidate : null;
}

export function hotRankPosterFileName(fileName) {
  const safeName = path.basename(String(fileName || ""));
  if (!safeName || safeName === "." || safeName === "..") return "";
  const extension = path.extname(safeName);
  const stem = extension ? safeName.slice(0, -extension.length) : safeName;
  return stem ? `${stem}.poster.jpg` : "";
}

export function hotRankPreviewFileName(fileName) {
  const safeName = path.basename(String(fileName || ""));
  if (!safeName || safeName === "." || safeName === "..") return "";
  const extension = path.extname(safeName);
  const stem = extension ? safeName.slice(0, -extension.length) : safeName;
  return stem ? `${stem}.preview.mp4` : "";
}

const mediaPathCache = new Map();
export async function findHotRankMediaPath(fileName) {
  const safeName = path.basename(String(fileName || ""));
  if (!safeName || safeName === "." || safeName === "..") return null;
  const cached = mediaPathCache.get(safeName);
  if (cached) return cached;
  const direct = resolveHotRankMediaPath(safeName);
  if (!direct) return null;
  try {
    await fs.access(direct);
    mediaPathCache.set(safeName, direct);
    return direct;
  } catch {
    return null;
  }
}

export async function getHotRankSnapshot(query = {}) {
  const manifest = await readHotRankManifest();
  const filtered = filterHotRankItems(manifest.items, {
    query: query.query,
    category: query.category,
    contentType: query.contentType,
    availableOnly: String(query.availableOnly || "") === "true",
  });
  const sort = query.sort === "standard" ? "standard" : "ai";
  const ordered = sortHotRankItems(filtered, sort);
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(
    60,
    Math.max(1, Number.parseInt(query.pageSize, 10) || 24),
  );
  const start = (page - 1) * pageSize;
  const categories = [
    ...new Set(manifest.items.map((item) => item.primaryCategory).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const contentTypes = [
    ...new Set(manifest.items.map((item) => item.contentType).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
  return {
    ...manifest,
    total: filtered.length,
    sort,
    page,
    pageSize,
    categories,
    contentTypes,
    summary: summarizeHotRank(manifest.items),
    items: ordered.slice(start, start + pageSize),
  };
}

export function hotRankSource(item = {}) {
  const fileName = String(item.localFileName || "");
  return {
    id: item.id,
    fileName,
    available: Boolean(fileName),
    mediaUrl: fileName
      ? `/api/hot-rank/media/${encodeURIComponent(fileName)}`
      : "",
  };
}

const mediaSecret = () =>
  String(
    process.env.HOT_RANK_MEDIA_SECRET ||
      signingSecret(),
  );

const mediaSignature = (fileName, expiresAt) =>
  createHmac("sha256", mediaSecret())
    .update(`${path.basename(String(fileName || ""))}\n${expiresAt}`)
    .digest("hex");

export function createHotRankMediaTicket(fileName, ttlSeconds = 20 * 60) {
  const expiresAt =
    Math.floor(Date.now() / 1000) + Math.max(30, Number(ttlSeconds) || 0);
  return `${expiresAt}.${mediaSignature(fileName, expiresAt)}`;
}

export function verifyHotRankMediaTicket(fileName, ticket) {
  const [expiresText, signature] = String(ticket || "").split(".");
  const expiresAt = Number(expiresText);
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < Math.floor(Date.now() / 1000)
  )
    return false;
  const expected = mediaSignature(fileName, expiresAt);
  const actualBuffer = Buffer.from(String(signature || ""), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function hotRankMediaUrl(fileName) {
  const safeName = path.basename(String(fileName || ""));
  if (!safeName) return "";
  const ticket = createHotRankMediaTicket(safeName);
  return `/api/hot-rank/media/${encodeURIComponent(safeName)}?ticket=${encodeURIComponent(ticket)}`;
}

