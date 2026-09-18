import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ACCOUNT_RECORD_COLLECTIONS,
  anonymizeMcpAudit,
  anonymizePointLedger,
  belongsToAccounts,
  deletedAccountId,
  generatedFileNames,
  removeAccountRecords,
  removeUnreferencedStoredFiles,
  storageBlobIds,
} from './account-cascade.js';

test('matches account records by ownerId or userId', () => {
  const ids = new Set(['account-1']);
  assert.equal(belongsToAccounts({ ownerId: 'account-1' }, ids), true);
  assert.equal(belongsToAccounts({ userId: 'account-1' }, ids), true);
  assert.equal(belongsToAccounts({ ownerId: 'regular-1' }, ids), false);
});

test('removes only records belonging to selected accounts', () => {
  const result = removeAccountRecords([{ id: 1, ownerId: 'account-1' }, { id: 2, userId: 'regular-1' }], new Set(['account-1']));
  assert.deepEqual(result.removed.map((item) => item.id), [1]);
  assert.deepEqual(result.kept.map((item) => item.id), [2]);
});

test('collects generated media names from nested records', () => {
  const names = generatedFileNames({ result: { url: '/generated/output-1.png?x=1' }, video: 'https://example.com/generated/output-2.mp4' });
  assert.deepEqual([...names].sort(), ['output-1.png', 'output-2.mp4']);
});

test('account cascade covers all account-owned business and MCP token records', () => {
  assert.deepEqual(
    new Set(ACCOUNT_RECORD_COLLECTIONS),
    new Set([
      'tasks',
      'workflow_runs',
      'templates',
      'digital_assets',
      'media_analysis_tasks',
      'template_usages',
      'trusted_person_assets',
      'minimax_voices',
      'mcp_tokens',
    ]),
  );
});

test('retains compliance ledgers while replacing deleted account and MCP identifiers', () => {
  const ids = new Set(['account-1']);
  const deletedAt = '2026-08-04T08:00:00.000Z';
  const ledger = anonymizePointLedger(
    [
      { id: 'l1', userId: 'account-1', amount: -2 },
      { id: 'l2', userId: 'account-2', amount: -1 },
    ],
    ids,
    deletedAt,
  );
  const audit = anonymizeMcpAudit(
    [
      { id: 'a1', userId: 'account-1', tokenId: 'token-1', tokenName: '私人令牌', ok: true },
      { id: 'a2', userId: 'account-2', tokenId: 'token-2', tokenName: '保留令牌', ok: true },
    ],
    ids,
    deletedAt,
  );

  assert.equal(ledger[0].userId, deletedAccountId('account-1'));
  assert.equal(ledger[0].accountDeletedAt, deletedAt);
  assert.equal(ledger[1].userId, 'account-2');
  assert.equal(audit[0].userId, deletedAccountId('account-1'));
  assert.match(audit[0].tokenId, /^deleted:[a-f0-9]{24}$/);
  assert.equal(audit[0].tokenName, '已删除账号令牌');
  assert.equal(JSON.stringify(audit[0]).includes('私人令牌'), false);
  assert.equal(audit[1].tokenName, '保留令牌');
});

test('collects content-addressed storage blob identifiers recursively', () => {
  const first = 'a'.repeat(64);
  const second = 'b'.repeat(64);
  const ids = storageBlobIds({ images: [{ blobId: first }], runtime: { upload: [{ blobId: second }] } });
  assert.deepEqual([...ids].sort(), [first, second]);
});

test('deletes only unreferenced regular files within a storage root', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commerce-canvas-account-cascade-'));
  try {
    await fs.writeFile(path.join(root, 'delete.png'), 'delete');
    await fs.writeFile(path.join(root, 'shared.png'), 'shared');
    const result = await removeUnreferencedStoredFiles(
      root,
      new Set(['delete.png', 'shared.png', '../escape.png']),
      new Set(['shared.png']),
    );
    assert.deepEqual(result.deleted, ['delete.png']);
    assert.equal(await fs.stat(path.join(root, 'delete.png')).catch(() => null), null);
    assert.equal((await fs.readFile(path.join(root, 'shared.png'), 'utf8')), 'shared');
    assert.equal(result.skipped.includes('../escape.png'), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

