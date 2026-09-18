import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canDeleteWorkflowRun,
  isWorkflowRunActive,
  normalizeDirectDigitalAssetIds,
  terminateWorkflowRunRecord,
} from './workflow-run-policy.js';

test('terminates the current step and skips work that has not started', () => {
  const now = '2026-07-14T00:00:00.000Z';
  const run = terminateWorkflowRunRecord({
    id: 'run-1',
    status: 'processing',
    currentNodeId: 'image',
    activeEdgeId: 'edge-1',
    steps: [
      { id: 'a', status: 'succeeded' },
      { id: 'b', status: 'processing' },
      { id: 'c', status: 'queued' },
    ],
  }, now);

  assert.equal(run.status, 'terminated');
  assert.equal(run.currentNodeId, null);
  assert.equal(run.activeEdgeId, null);
  assert.equal(run.steps[0].status, 'succeeded');
  assert.equal(run.steps[1].status, 'terminated');
  assert.equal(run.steps[2].status, 'skipped');
  assert.equal(run.terminatedAt, now);
});

test('only active workflow runs need termination before deletion', () => {
  assert.equal(isWorkflowRunActive({ status: 'queued' }), true);
  assert.equal(isWorkflowRunActive({ status: 'processing' }), true);
  assert.equal(canDeleteWorkflowRun({ status: 'processing' }), false);
  assert.equal(canDeleteWorkflowRun({ status: 'succeeded' }), true);
  assert.equal(canDeleteWorkflowRun({ status: 'failed' }), true);
  assert.equal(canDeleteWorkflowRun({ status: 'terminated' }), true);
});

test('does not rewrite a workflow that already finished', () => {
  const run = { id: 'run-2', status: 'succeeded', steps: [] };
  assert.equal(terminateWorkflowRunRecord(run), run);
});

test('merges saved and runtime digital asset bindings without duplicates', () => {
  assert.deepEqual(
    normalizeDirectDigitalAssetIds(
      ['asset-runtime', 'asset-shared'],
      ['asset-shared', 'asset-node', 'asset-fourth'],
    ),
    ['asset-runtime', 'asset-shared', 'asset-node'],
  );
});

