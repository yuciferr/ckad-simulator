#!/usr/bin/env bash
#
# CKAD Simulator — one-shot installer.
#
# Preflights the host (Docker, Compose, port, resources), then builds and starts
# the stack with our normal Compose flow and blocks until the kind cluster is
# actually ready. Safe to re-run (docker compose up is idempotent).
#
# Usage:
#   ./install.sh [--port N] [--no-browser] [--help]
# Env:
#   PORT   host port to expose (default 3000); --port overrides this.

set -euo pipefail

# ─── pretty output ──────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
  BLUE=$'\033[0;34m'; CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; CYAN=''; BOLD=''; NC=''
fi
info()  { echo "${CYAN}$*${NC}"; }
ok()    { echo "${GREEN}✓${NC} $*"; }
warn()  { echo "${YELLOW}!${NC} $*"; }
err()   { echo "${RED}✗${NC} $*" >&2; }
step()  { echo; echo "${BLUE}${BOLD}$*${NC}"; }
die()   { err "$@"; exit 1; }

# ─── args ───────────────────────────────────────────────────────────────────
PORT="${PORT:-3000}"
OPEN_BROWSER=1

usage() {
  cat <<EOF
CKAD Simulator installer

Usage: ./install.sh [options]

Options:
  --port N        Host port to expose the app on (default: ${PORT})
  --no-browser    Do not open the browser when ready
  --help          Show this help

The stack is built from source and a kind Kubernetes cluster is created inside
Docker on first run (this can take a few minutes).
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --port) shift; [ $# -gt 0 ] || die "--port needs a value"; PORT="$1" ;;
    --port=*) PORT="${1#*=}" ;;
    --no-browser) OPEN_BROWSER=0 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
  shift
done
case "$PORT" in ''|*[!0-9]*) die "Invalid port: $PORT" ;; esac

command_exists() { command -v "$1" >/dev/null 2>&1; }

print_header() {
  echo "${BLUE}${BOLD}"
  echo "  CKAD Simulator"
  echo "${NC}${CYAN}  Local, browser-based CKAD practice on a real kind cluster${NC}"
  echo "${CYAN}  ============================================================${NC}"
}

# ─── preflight ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

preflight() {
  step "Checking prerequisites"

  # Run from the repo root (this script lives there).
  cd "$SCRIPT_DIR"
  [ -f docker-compose.yml ] && [ -d exams ] \
    || die "Run this from the ckad-simulator repo root (docker-compose.yml + exams/ not found)."
  ok "Repo root: $SCRIPT_DIR"

  command_exists docker || die "Docker is not installed — see https://docs.docker.com/get-docker/"
  ok "Docker is installed"

  if ! docker info >/dev/null 2>&1; then
    err "Docker is installed but not running."
    warn "Start Docker Desktop (or the docker daemon) and re-run this script."
    exit 1
  fi
  ok "Docker daemon is running"

  if ! docker compose version >/dev/null 2>&1; then
    die "Docker Compose v2 is not available (need 'docker compose') — https://docs.docker.com/compose/install/"
  fi
  ok "Docker Compose v2 is available"

  if command_exists curl; then HTTP_CLIENT=curl
  elif command_exists wget; then HTTP_CLIENT=wget
  else die "Need either curl or wget to check service health."; fi
  ok "HTTP client: $HTTP_CLIENT"

  # Architecture → TARGETARCH (matches the Makefile).
  case "$(uname -m)" in
    arm64|aarch64) TARGETARCH=arm64 ;;
    *) TARGETARCH=amd64 ;;
  esac
  ok "Architecture: $(uname -m) → TARGETARCH=$TARGETARCH"

  check_port
  check_memory
}

port_in_use() {
  local p="$1"
  if command_exists lsof; then
    lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
  elif command_exists ss; then
    ss -ltn 2>/dev/null | grep -q ":${p} "
  elif command_exists nc; then
    nc -z localhost "$p" >/dev/null 2>&1
  else
    (exec 3<>"/dev/tcp/localhost/${p}") >/dev/null 2>&1
  fi
}

check_port() {
  if port_in_use "$PORT"; then
    # If our own stack already holds the port, that's fine — this is an
    # idempotent re-run, not a conflict. Our /health payload always has "mode".
    if our_app_responding; then
      ok "CKAD Simulator already responding on ${PORT} (idempotent re-run)"
      return 0
    fi
    err "Port ${PORT} is already in use by another process."
    warn "Free it, or pick another port:  ./install.sh --port 3001"
    exit 1
  fi
  ok "Port ${PORT} is available"
}

our_app_responding() {
  fetch_body "http://localhost:${PORT}/health" | grep -q '"mode"'
}

check_memory() {
  # Non-fatal: kind + backend want ~8 GB available to Docker.
  local gib=""
  if [ "$(uname -s)" = "Darwin" ] && command_exists sysctl; then
    local bytes; bytes="$(sysctl -n hw.memsize 2>/dev/null || echo 0)"
    gib=$(( bytes / 1024 / 1024 / 1024 ))
  elif [ -r /proc/meminfo ]; then
    local kb; kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
    gib=$(( kb / 1024 / 1024 ))
  fi
  if [ -n "$gib" ] && [ "$gib" -gt 0 ]; then
    if [ "$gib" -lt 8 ]; then
      warn "Detected ~${gib} GB RAM; 8 GB is recommended. On Docker Desktop, ensure enough memory is allocated to the VM."
    else
      ok "Memory: ~${gib} GB"
    fi
  fi
}

# ─── bring up ───────────────────────────────────────────────────────────────
bring_up() {
  step "Building and starting the stack"
  info "First run builds images and creates the kind cluster — this can take a few minutes."
  PORT="$PORT" TARGETARCH="$TARGETARCH" docker compose up --build -d
  ok "Containers started"
}

http_status() {
  local url="$1"
  if [ "$HTTP_CLIENT" = curl ]; then
    curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || echo 000
  else
    if wget -q -T 5 -O /dev/null "$url" 2>/dev/null; then echo 200; else echo 000; fi
  fi
}

fetch_body() {
  local url="$1"
  if [ "$HTTP_CLIENT" = curl ]; then
    curl -s --max-time 5 "$url" 2>/dev/null || true
  else
    wget -q -T 5 -O - "$url" 2>/dev/null || true
  fi
}

health_ready() {
  # Ready = HTTP 200 and cluster.ready true. /health returns 503 while the
  # kind cluster is still coming up.
  local url="http://localhost:${PORT}/health" body
  [ "$(http_status "$url")" = "200" ] || return 1
  body="$(fetch_body "$url")"
  if command_exists jq; then
    [ "$(printf '%s' "$body" | jq -r '.cluster.ready // false' 2>/dev/null)" = "true" ]
  else
    printf '%s' "$body" | grep -q '"ready":[[:space:]]*true'
  fi
}

wait_for_ready() {
  step "Waiting for the cluster to be ready"
  local timeout=420 waited=0 spin='|/-\' i=0
  while [ "$waited" -lt "$timeout" ]; do
    if health_ready; then
      echo
      ok "Cluster is ready"
      return 0
    fi
    i=$(( (i + 1) % 4 ))
    printf '\r  %s  still initializing… (%ss)   ' "${spin:$i:1}" "$waited"
    sleep 3; waited=$(( waited + 3 ))
  done
  echo
  err "Timed out after ${timeout}s waiting for the cluster."
  warn "Check the logs:  docker compose logs -f backend"
  exit 1
}

open_browser() {
  local url="$1"
  [ "$OPEN_BROWSER" = 1 ] || return 0
  if command_exists open; then open "$url" >/dev/null 2>&1 && return 0; fi
  if command_exists xdg-open; then xdg-open "$url" >/dev/null 2>&1 && return 0; fi
  if command_exists python3; then python3 -m webbrowser "$url" >/dev/null 2>&1 && return 0; fi
  return 0
}

main() {
  print_header
  preflight
  bring_up
  wait_for_ready

  local url="http://localhost:${PORT}"
  step "Done"
  ok "CKAD Simulator is running at ${GREEN}${BOLD}${url}${NC}"
  open_browser "$url"

  echo
  info "Useful commands:"
  echo "  ${BOLD}make down${NC}          stop the stack"
  echo "  ${BOLD}make logs${NC}          follow backend logs"
  echo "  ${BOLD}make reset-q Q=3${NC}   reset mock exam question 3"
  echo "  ${BOLD}./install.sh${NC}       re-run (idempotent)"
  echo
}

main "$@"
