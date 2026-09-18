import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Records that must disappear when their owning account is deleted. */
export const ACCOUNT_RECORD_COLLECTIONS = [
  'tasks',
  'workflow_runs',
  'templates',
  'digital_assets',
  'media_analysis_tasks',
  'template_usages',
  'trusted_person_assets',
  'minimax_voices',
  'mcp_tokens',
];

/** Compliance records are retained, but their account identifiers are replaced. */
export const ACCOUNT_AUDIT_COLLECTIONS = [
  'point_ledger',
  'mcp_audit_logs',
];

export function accountRecordOwnerId(record) {
  return String(record?.ownerId || record?.userId || '');
}

export function belongsToAccounts(record, userIds) {
  const ids = userIds instanceof Set ? userIds : new Set([...userIds].map(String));
  return ids.has(accountRecordOwnerId(record));
}

export function removeAccountRecords(records, userIds) {
  const ids = userIds instanceof Set ? userIds : new Set([...userIds].map(String));
  const removed = [];
  const kept = [];
  for (const record of Array.isArray(records) ? records : []) {
    (belongsToAccounts(record, ids) ? removed : kept).push(record);
  }
  return { kept, removed };
}

function pseudonym(value, namespace = 'account') {
  return createHash('sha256')
    .update(`commerce-canvas-deleted-${namespace}-v1\n${String(value || '')}`)
    .digest('hex')
    .slice(0, 24);
}

export function deletedAccountId(userId) {
  return `deleted:${pseudonym(userId)}`;
}

export function anonymizePointLedger(records, userIds, deletedAt) {
  const ids = userIds instanceof Set ? userIds : new Set([...userIds].map(String));
  return (Array.isArray(records) ? records : []).map((record) => {
    const userId = String(record?.userId || '');
    if (!ids.has(userId)) return record;
    return {
      ...record,
      userId: deletedAccountId(userId),
      accountDeletedAt: String(deletedAt || new Date().toISOString()),
    };
  });
}

export function anonymizeMcpAudit(records, userIds, deletedAt) {
  const ids = userIds instanceof Set ? userIds : new Set([...userIds].map(String));
  return (Array.isArray(records) ? records : []).map((record) => {
    const userId = String(record?.userId || '');
    if (!ids.has(userId)) return record;
    return {
      ...record,
      userId: deletedAccountId(userId),
      tokenId: `deleted:${pseudonym(record?.tokenId, 'mcp-token')}`,
      tokenName: '已删除账号令牌',
      accountDeletedAt: String(deletedAt || new Date().toISOString()),
    };
  });
}

export function generatedFileNames(value, names = new Set()) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\/generated\/([A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif|mp4|mov|webm|mp3|wav|m4a|aac))(?:$|[?#'\"])/gi)) {
      names.add(match[1]);
    }
    return names;
  }
  if (Array.isArray(value)) {
    for (const item of value) generatedFileNames(item, names);
    return names;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) generatedFileNames(item, names);
  }
  return names;
}

export function storageBlobIds(value, ids = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) storageBlobIds(item, ids);
    return ids;
  }
  if (value && typeof value === 'object') {
    if (/^[a-f0-9]{64}$/.test(String(value.blobId || ''))) ids.add(String(value.blobId));
    for (const item of Object.values(value)) storageBlobIds(item, ids);
  }
  return ids;
}

function safeStoredFileName(value) {
  const fileName = String(value || '');
  if (!fileName || path.basename(fileName) !== fileName) return '';
  return /^[A-Za-z0-9._-]+$/.test(fileName) ? fileName : '';
}

/**
 * Deletes only regular, non-symlink files inside an expected storage root.
 * Shared files remain when their identifiers are still referenced elsewhere.
 */
export async function removeUnreferencedStoredFiles(
  rootDir,
  candidates,
  retainedReferences = new Set(),
) {
  const root = path.resolve(rootDir);
  const rootStat = await fs.lstat(root).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!rootStat) return { deleted: [], skipped: [] };
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new Error(`拒绝清理不安全的存储目录：${root}`);

  const deleted = [];
  const skipped = [];
  for (const candidate of new Set(candidates || [])) {
    const fileName = safeStoredFileName(candidate);
    if (!fileName || retainedReferences.has(fileName)) {
      skipped.push(String(candidate || ''));
      continue;
    }
    const filePath = path.resolve(root, fileName);
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      skipped.push(fileName);
      continue;
    }
    const entry = await fs.lstat(filePath).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!entry) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) {
      skipped.push(fileName);
      continue;
    }
    await fs.unlink(filePath);
    deleted.push(fileName);
  }
  return { deleted, skipped };
}

