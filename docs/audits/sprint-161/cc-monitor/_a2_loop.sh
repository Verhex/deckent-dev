#!/usr/bin/env bash
# A2 Worker Honesty monitor loop — polls every 180s, terminates on:
#   - .brain/RETRO.md mentions "Sprint 161" / "sprint-161" header
#   - npx deckent status output mentions phase COMPLETE
#   - 6h elapsed (configurable)
set -u
ROOT="/home/alperen/deckent-dev"
CC_DIR="$ROOT/docs/audits/sprint-161/cc-monitor"
HIST="$CC_DIR/_a2_history.jsonl"
LOG="$CC_DIR/_a2_loop.log"
INTERVAL="${A2_INTERVAL:-180}"
MAX_SECONDS="${A2_MAX_SECONDS:-21600}"  # 6h default
START_TS=$(date +%s)
ITER=0

mkdir -p "$CC_DIR"
: > "$LOG"
: > "$HIST" 2>/dev/null || true

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "$LOG"; }

terminate_check() {
  # 1) RETRO header for sprint-161
  if [[ -f "$ROOT/.brain/RETRO.md" ]] && grep -Eqi '^# .*[Ss]print[ -_]?161|^## .*[Ss]print[ -_]?161' "$ROOT/.brain/RETRO.md"; then
    log "TERMINATE: RETRO.md mentions Sprint 161 header"
    return 0
  fi
  # 2) deckent status phase COMPLETE
  local out
  out=$(cd "$ROOT" && timeout 30 npx --no-install deckent status 2>&1 || true)
  if printf '%s\n' "$out" | grep -Eqi 'phase[^a-z]*COMPLETE|status[^a-z]*COMPLETE|sprint[^a-z]*COMPLETE'; then
    log "TERMINATE: deckent status reports COMPLETE phase"
    return 0
  fi
  # 3) Time cap
  local now elapsed
  now=$(date +%s)
  elapsed=$(( now - START_TS ))
  if (( elapsed >= MAX_SECONDS )); then
    log "TERMINATE: time cap reached (${elapsed}s >= ${MAX_SECONDS}s)"
    return 0
  fi
  return 1
}

log "A2 loop starting (interval=${INTERVAL}s, cap=${MAX_SECONDS}s)"

while true; do
  ITER=$((ITER + 1))
  log "iteration $ITER — collecting snapshot"
  if SNAP=$(node "$CC_DIR/_a2_check.mjs" 2>>"$LOG"); then
    # Append as single JSONL line (snapshot is multi-line JSON; compact it)
    printf '%s\n' "$SNAP" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{process.stdout.write(JSON.stringify(JSON.parse(d))+"\n");}catch(e){process.stderr.write("parse-fail: "+e.message+"\n");process.exit(1);}})' >> "$HIST" 2>>"$LOG" || log "snapshot append failed"
    node "$CC_DIR/_a2_render.mjs" >>"$LOG" 2>&1 || log "render failed"
  else
    log "snapshot collection failed (iter $ITER)"
  fi

  if terminate_check; then
    log "loop terminating after iteration $ITER"
    break
  fi

  log "sleeping ${INTERVAL}s"
  sleep "$INTERVAL"
done

# Final render with completion banner
node "$CC_DIR/_a2_render.mjs" >>"$LOG" 2>&1 || true
log "A2 loop complete — $ITER iterations"
