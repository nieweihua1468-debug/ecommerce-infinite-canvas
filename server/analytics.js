import { mutateCollection, readCollection } from './store.js';

let trafficWriteQueue = Promise.resolve();
let trafficFlushTimer = null;
let pendingTraffic = [];
const TRAFFIC_FLUSH_DELAY_MS = 1_000;
const TRAFFIC_FLUSH_BATCH_SIZE = 100;

export function normalizeRoute(pathname) {
  return String(pathname || '/')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/tasks\/[^/]+/g, '/tasks/:id')
    .replace(/\/templates\/[^/]+/g, '/templates/:id')
    .replace(/\/users\/[^/]+/g, '/users/:id');
}

export function flushTraffic() {
  if (!pendingTraffic.length) return trafficWriteQueue;
  if (trafficFlushTimer) clearTimeout(trafficFlushTimer);
  trafficFlushTimer = null;
  const batch = pendingTraffic;
  pendingTraffic = [];
  trafficWriteQueue = trafficWriteQueue
    .then(() => mutateCollection('traffic', (events) => [...events, ...batch].slice(-5000)))
    .catch((error) => console.error('Traffic metrics write failed:', error.message));
  return trafficWriteQueue;
}

export function recordTraffic(event) {
  pendingTraffic.push({
    timestamp: new Date().toISOString(),
    method: String(event.method || 'GET').toUpperCase(),
    route: normalizeRoute(event.route),
    status: Number(event.status || 0),
    durationMs: Math.max(0, Math.round(Number(event.durationMs || 0))),
  });
  if (pendingTraffic.length >= TRAFFIC_FLUSH_BATCH_SIZE) return flushTraffic();
  if (!trafficFlushTimer) {
    trafficFlushTimer = setTimeout(() => void flushTraffic(), TRAFFIC_FLUSH_DELAY_MS);
    trafficFlushTimer.unref?.();
  }
  return Promise.resolve();
}

export async function readTraffic() {
  await flushTraffic();
  return readCollection('traffic', []);
}

const percentChange = (current, previous) => previous ? Math.round(((current - previous) / previous) * 1000) / 10 : (current ? 100 : 0);

export function summarizeTraffic(events, now = Date.now()) {
  const hour = 3_600_000;
  const currentStart = now - 24 * hour;
  const previousStart = now - 48 * hour;
  const current = events.filter((event) => new Date(event.timestamp).getTime() >= currentStart);
  const previous = events.filter((event) => {
    const time = new Date(event.timestamp).getTime();
    return time >= previousStart && time < currentStart;
  });
  const failures = current.filter((event) => event.status >= 400);
  const avgLatency = current.length ? Math.round(current.reduce((sum, event) => sum + Number(event.durationMs || 0), 0) / current.length) : 0;
  const routeMap = new Map();
  current.forEach((event) => {
    const key = `${event.method} ${event.route}`;
    const value = routeMap.get(key) || { route: key, requests: 0, failures: 0, latencyTotal: 0 };
    value.requests += 1;
    value.failures += event.status >= 400 ? 1 : 0;
    value.latencyTotal += Number(event.durationMs || 0);
    routeMap.set(key, value);
  });
  const routes = [...routeMap.values()]
    .map((item) => ({ ...item, avgLatency: Math.round(item.latencyTotal / item.requests), errorRate: Math.round((item.failures / item.requests) * 1000) / 10 }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 8)
    .map(({ latencyTotal: _latencyTotal, failures: _failures, ...item }) => item);
  const series = Array.from({ length: 12 }, (_, index) => {
    const start = currentStart + index * 2 * hour;
    const end = start + 2 * hour;
    const bucket = current.filter((event) => {
      const time = new Date(event.timestamp).getTime();
      return time >= start && time < end;
    });
    return {
      label: new Date(start).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      requests: bucket.length,
      failures: bucket.filter((event) => event.status >= 400).length,
    };
  });
  return {
    total24h: current.length,
    change24h: percentChange(current.length, previous.length),
    active5m: current.filter((event) => new Date(event.timestamp).getTime() >= now - 5 * 60_000).length,
    successRate: current.length ? Math.round(((current.length - failures.length) / current.length) * 1000) / 10 : 100,
    errorRate: current.length ? Math.round((failures.length / current.length) * 1000) / 10 : 0,
    avgLatency,
    series,
    routes,
  };
}

