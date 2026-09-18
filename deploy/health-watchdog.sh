#!/usr/bin/env bash
set -u

SERVICE="commerce-canvas"
HEALTH_URL="http://127.0.0.1:8791/api/health"
STATE_FILE="/run/commerce-canvas-health-watchdog.failures"
MEMORY_WARN_BYTES="$((950 * 1024 * 1024))"

failures="$(cat "$STATE_FILE" 2>/dev/null || printf '0')"
[[ "$failures" =~ ^[0-9]+$ ]] || failures=0
health="$(curl -fsS --max-time 8 "$HEALTH_URL" 2>/dev/null || true)"
healthy=0
if [[ -n "$health" ]] && node -e 'const h=JSON.parse(process.argv[1]); process.exit(h.ok === true ? 0 : 1)' "$health" 2>/dev/null; then
  healthy=1
fi
memory="$(systemctl show "$SERVICE" --property=MemoryCurrent --value 2>/dev/null || printf '0')"
[[ "$memory" =~ ^[0-9]+$ ]] || memory=0

if (( healthy == 1 && memory < MEMORY_WARN_BYTES )); then
  printf '0' > "$STATE_FILE"
  exit 0
fi

failures=$((failures + 1))
printf '%s' "$failures" > "$STATE_FILE"
logger -t commerce-canvas-watchdog "health failure=$failures healthy=$healthy memory_bytes=$memory"

# One missed probe can happen during a normal release. Restart only after two
# consecutive unhealthy/minimum-headroom probes so the watchdog does not fight
# the deploy process.
if (( failures < 2 )); then
  exit 0
fi

logger -t commerce-canvas-watchdog "restarting $SERVICE after $failures consecutive unhealthy probes"
systemctl restart "$SERVICE"
for _ in $(seq 1 30); do
  health="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
  if [[ -n "$health" ]] && node -e 'const h=JSON.parse(process.argv[1]); process.exit(h.ok === true ? 0 : 1)' "$health" 2>/dev/null; then
    printf '0' > "$STATE_FILE"
    logger -t commerce-canvas-watchdog "$SERVICE recovered successfully"
    exit 0
  fi
  sleep 1
done

logger -t commerce-canvas-watchdog "$SERVICE did not recover within 30 seconds"
exit 1

