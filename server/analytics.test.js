import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoute, summarizeTraffic } from './analytics.js';

test('normalizes dynamic identifiers in monitored routes', () => {
  assert.equal(normalizeRoute('/api/tasks/254c446a-689a-4d7c-9d82-964f51e302a1/refresh'), '/api/tasks/:id/refresh');
  assert.equal(normalizeRoute('/api/admin/users/workspace-owner/points'), '/api/admin/users/:id/points');
});

test('summarizes current traffic, latency and failures', () => {
  const now = new Date('2026-07-10T12:00:00.000Z').getTime();
  const events = [
    { timestamp: '2026-07-10T11:55:00.000Z', method: 'GET', route: '/api/health', status: 200, durationMs: 20 },
    { timestamp: '2026-07-10T11:50:00.000Z', method: 'GET', route: '/api/health', status: 500, durationMs: 80 },
    { timestamp: '2026-07-09T11:00:00.000Z', method: 'GET', route: '/api/health', status: 200, durationMs: 40 },
  ];
  const summary = summarizeTraffic(events, now);
  assert.equal(summary.total24h, 2);
  assert.equal(summary.active5m, 1);
  assert.equal(summary.successRate, 50);
  assert.equal(summary.errorRate, 50);
  assert.equal(summary.avgLatency, 50);
  assert.equal(summary.routes[0].requests, 2);
  assert.equal(summary.routes[0].errorRate, 50);
});

