import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPublicTemplate,
  normalizeTemplateAccess,
  shouldQueueTemplateDeletion,
  templateApprovalStatus,
  templateCreationAccess,
} from './template-policy.js';

test('private templates remain private and require no approval', () => {
  assert.deepEqual(templateCreationAccess('private', '2026-07-14T00:00:00.000Z'), {
    visibility: 'private', public: false, approvalStatus: 'private', requestedAt: null,
  });
});

test('public template uploads wait for administrator approval', () => {
  const access = templateCreationAccess('global', '2026-07-14T00:00:00.000Z');
  assert.equal(access.visibility, 'global');
  assert.equal(access.public, false);
  assert.equal(access.approvalStatus, 'pending_publish');
  assert.equal(access.requestedAt, '2026-07-14T00:00:00.000Z');
  assert.equal(templateApprovalStatus(access), 'pending_publish');
  assert.equal(isPublicTemplate(access), false);
});

test('team workflow uploads wait for a team administrator and remain non-public', () => {
  const access = templateCreationAccess(
    'team',
    '2026-07-14T00:00:00.000Z',
    'team-1',
  );
  assert.deepEqual(access, {
    visibility: 'team',
    public: false,
    approvalStatus: 'pending_publish',
    requestedAt: '2026-07-14T00:00:00.000Z',
    teamId: 'team-1',
  });
  assert.equal(isPublicTemplate(access), false);
  assert.deepEqual(normalizeTemplateAccess(access), access);
});

test('legacy public template fields remain public after an upgrade', () => {
  for (const template of [
    { visibility: 'public' },
    { scope: 'global' },
    { scope: 'shared' },
    { isPublic: true },
    { global: true },
    { approvalStatus: 'approved' },
  ]) {
    assert.equal(isPublicTemplate(template), true);
    assert.deepEqual(normalizeTemplateAccess(template), {
      visibility: 'global',
      public: true,
      approvalStatus: 'approved',
      requestedAt: null,
    });
  }
});

test('public and private templates delete directly without approval', () => {
  assert.equal(shouldQueueTemplateDeletion({ public: true, approvalStatus: 'approved' }), false);
  assert.equal(shouldQueueTemplateDeletion({ public: false, approvalStatus: 'private' }), false);
  assert.equal(shouldQueueTemplateDeletion({ public: false, approvalStatus: 'pending_publish' }), false);
});

test('pending and rejected public submissions stay hidden until approved', () => {
  for (const approvalStatus of ['pending_publish', 'rejected']) {
    const template = { visibility: 'global', public: false, approvalStatus };
    assert.equal(isPublicTemplate(template), false);
    assert.deepEqual(normalizeTemplateAccess(template), {
      visibility: 'global', public: false, approvalStatus, requestedAt: null,
    });
  }
  assert.equal(isPublicTemplate({ visibility: 'global', approvalStatus: 'approved' }), true);
});

