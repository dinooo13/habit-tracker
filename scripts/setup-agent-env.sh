#!/usr/bin/env bash
#
# Provision an environment for working on habit-tracker.
#
# Callers: cloud routine setup, .devcontainer postCreateCommand, the Claude Code
# SessionStart hook (.claude/settings.json), and humans on a fresh checkout.
#
# Contract:
#   exit 0        the repo is installable and the gates in docs/WORKFLOW.md §5 can run
#   exit non-zero required setup failed — do not start work, report the failure
#
# Browser tooling is best-effort. If it cannot be provisioned the script prints
# PLAYWRIGHT_UNAVAILABLE and still exits 0; agents key off that marker (see
# .claude/agents/implementer.md §5 and .claude/agents/qa-tester.md §2).
#
# Usage: scripts/setup-agent-env.sh [--no-browser]

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

WANT_BROWSER=1
[ "${1:-}" = "--no-browser" ] && WANT_BROWSER=0

log() { printf '[setup] %s\n' "$*"; }
fail() { printf '[setup] FATAL: %s\n' "$*" >&2; exit 1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo -n "$@"
  else return 1
  fi
}

# ---------------------------------------------------------------------------
# Required: node toolchain and repo dependencies
# ---------------------------------------------------------------------------

command -v node >/dev/null 2>&1 || fail "node not found — the environment is broken"
command -v npm >/dev/null 2>&1 || fail "npm not found — the environment is broken"

node_major="$(node --version | sed 's/^v\([0-9]*\).*/\1/')"
[ "$node_major" -ge 22 ] || fail "node $(node --version) is too old — package.json requires >=22 <23"
log "node $(node --version), npm $(npm --version)"

# npm ci writes node_modules/.package-lock.json; if it is not older than the
# lockfile, the tree is already in sync and a reinstall is wasted time.
if [ -f node_modules/.package-lock.json ] && [ ! package-lock.json -nt node_modules/.package-lock.json ]; then
  log "dependencies already in sync — skipping npm ci"
else
  log "installing dependencies (npm ci)"
  npm ci || fail "npm ci failed — cannot build or test this repo"
fi

# ---------------------------------------------------------------------------
# Best-effort: browser tooling for qa-tester and npm run test:e2e
# ---------------------------------------------------------------------------

provision_browser() {
  # Refresh the apt index only when we may need it to satisfy browser system
  # libraries. Non-fatal: unprivileged and image-pinned environments skip it.
  if command -v apt-get >/dev/null 2>&1; then
    as_root apt-get -o Acquire::AllowReleaseInfoChange::Label=true update >/dev/null 2>&1 \
      || log "apt index refresh skipped (no root or no network)"
  fi

  if ! command -v playwright-cli >/dev/null 2>&1; then
    log "installing @playwright/cli"
    npm install -g @playwright/cli@latest >/dev/null 2>&1 || return 1
  fi

  # Installs the playwright-cli skill that .claude/agents/qa-tester.md declares.
  playwright-cli install --skills >/dev/null 2>&1 || return 1

  # Prefer a browser the image already ships; otherwise download one matched to
  # the repo's own playwright version so npm run test:e2e uses the same binary.
  if [ -z "$(find_browser)" ]; then
    log "downloading chromium"
    npx --no-install playwright install chromium >/dev/null 2>&1 || return 1
  fi

  write_cli_config
}

find_browser() {
  local candidate
  for candidate in \
    "${PLAYWRIGHT_BROWSERS_PATH:-}/chromium" \
    /opt/pw-browsers/chromium \
    /opt/pw-browsers/chrome; do
    [ -n "$candidate" ] && [ -x "$candidate" ] && printf '%s' "$candidate" && return 0
  done
  return 1
}

# .playwright/ is gitignored as container-generated config.
write_cli_config() {
  local cfg="$REPO_ROOT/.playwright/cli.config.json"
  local exec_path
  exec_path="$(find_browser)"
  mkdir -p "$(dirname "$cfg")"

  if [ -n "$exec_path" ]; then
    log "using preinstalled browser at $exec_path"
    cat > "$cfg" <<EOF
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": {
      "executablePath": "$exec_path",
      "chromiumSandbox": false,
      "args": ["--ssl-version-max=tls1.2"]
    }
  }
}
EOF
  else
    # No pinned binary: let playwright-cli resolve the browser it downloaded.
    log "using playwright-managed browser"
    cat > "$cfg" <<'EOF'
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": {
      "chromiumSandbox": false,
      "args": ["--ssl-version-max=tls1.2"]
    }
  }
}
EOF
  fi
}

if [ "$WANT_BROWSER" -eq 1 ]; then
  if provision_browser; then
    log "browser tooling ready"
  else
    log "PLAYWRIGHT_UNAVAILABLE — browser tooling could not be provisioned"
    log "  e2e runs and preview QA are not possible in this environment;"
    log "  CI's e2e job covers the committed suite."
  fi
else
  log "skipping browser tooling (--no-browser)"
fi

log "environment ready"
