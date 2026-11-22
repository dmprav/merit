#!/usr/bin/env bash
# Prepares a cloud agent VM. When the image's Node.js or pnpm differs from the
# versions the repository pins, the pinned ones are installed under the home
# directory. The global Vite+ CLI, which only adds runtime management, is not
# installed; the workspace's vite-plus dependency supplies `vp`. The Compose
# services are started, with the Docker daemon if none is running.
#
# Flags:
#   --doctor        Print environment diagnostic summary without modifying setup.
#   --all-browsers  Install chromium, firefox, and webkit (default: chromium).
set -eo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

doctor_only=false
all_browsers=false

for arg in "$@"; do
  case "$arg" in
    --doctor) doctor_only=true ;;
    --all-browsers) all_browsers=true ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: $0 [--doctor] [--all-browsers]" >&2
      exit 1
      ;;
  esac
done

expected_node="v$(tr -d '[:space:]' < .node-version)"
node_dir="$HOME/.local/node-$expected_node"
read_expected_pnpm() {
  if command -v node > /dev/null 2>&1; then
    node -p 'require("./package.json").devEngines.packageManager.version' 2>/dev/null || echo unknown
  else
    echo unknown
  fi
}

browser_status() {
  local cache_dir="$1"
  local pattern="$2"
  local label="$3"
  if compgen -G "$cache_dir/$pattern" > /dev/null 2>&1; then
    echo "ok ($label)"
  else
    echo "missing ($label)"
  fi
}

run_doctor() {
  local actual_node actual_pnpm expected_pnpm hooks_path cache_dir pg_status docker_status mailpit_status services_status
  actual_node="$(node --version 2>/dev/null || echo missing)"
  actual_pnpm="$(pnpm --version 2>/dev/null || echo missing)"
  expected_pnpm="$(read_expected_pnpm)"
  hooks_path="$(git config --get core.hooksPath 2>/dev/null || echo unset)"
  cache_dir="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

  if command -v psql > /dev/null 2>&1 || command -v pg_isready > /dev/null 2>&1; then
    pg_status="client on PATH ($(command -v psql || command -v pg_isready))"
  elif command -v postgres > /dev/null 2>&1; then
    pg_status="server binary present"
  else
    pg_status="not installed locally (uses Docker Compose postgres if Docker is available)"
  fi

  if command -v docker > /dev/null 2>&1; then
    if docker info > /dev/null 2>&1; then
      docker_status="running ($(docker info --format '{{.ServerVersion}}' 2>/dev/null || echo ok))"
    else
      docker_status="installed, daemon not reachable"
    fi
  else
    docker_status="missing"
  fi

  services_status="not running (run: vp run services:start)"
  if [[ "$docker_status" == running* ]]; then
    services_status="$(docker compose ps --format '{{.Service}} {{.Health}}' 2>/dev/null | paste -sd, - | sed 's/,/, /g')"
    services_status="${services_status:-not running (run: vp run services:start)}"
  fi

  if command -v mailpit > /dev/null 2>&1; then
    mailpit_status="installed on PATH"
  elif command -v docker > /dev/null 2>&1 && docker info > /dev/null 2>&1; then
    mailpit_status="not on PATH (available via compose.yaml)"
  else
    mailpit_status="missing"
  fi

  echo "=== Merit environment doctor ==="
  echo "node:               $actual_node (expected $expected_node)"
  echo "pnpm:               $actual_pnpm (expected ${expected_pnpm:-unknown})"
  if [[ "$hooks_path" == .vite-hooks* ]]; then
    echo "git core.hooksPath: $hooks_path (active)"
  else
    echo "git core.hooksPath: $hooks_path (inactive — run: ./node_modules/.bin/vp config --no-agent)"
  fi
  echo "MERIT_TASK_CACHE:   ${MERIT_TASK_CACHE:-unset (cloud seccomp VMs should set off)}"
  echo "postgres:           $pg_status"
  echo "docker:             $docker_status"
  echo "mailpit:            $mailpit_status"
  echo "compose services:   $services_status"
  echo "playwright dir:     $cache_dir"
  echo "playwright bins:    $(browser_status "$cache_dir" 'chromium-*' 'chromium'), $(browser_status "$cache_dir" 'firefox-*' 'firefox'), $(browser_status "$cache_dir" 'webkit-*' 'webkit')"
}

if [ "$doctor_only" = true ]; then
  run_doctor
  exit 0
fi

if [ "$(node --version 2>/dev/null || echo missing)" != "$expected_node" ]; then
  case "$(uname -m)" in
    x86_64) node_arch=x64 ;;
    aarch64 | arm64) node_arch=arm64 ;;
    *)
      echo "No Node.js $expected_node download for $(uname -m)." >&2
      exit 1
      ;;
  esac
  if [ ! -x "$node_dir/bin/node" ]; then
    archive="node-$expected_node-linux-$node_arch.tar.xz"
    download="$(mktemp -d)"
    curl -fsSL -o "$download/$archive" "https://nodejs.org/dist/$expected_node/$archive"
    curl -fsSL -o "$download/SHASUMS256.txt" "https://nodejs.org/dist/$expected_node/SHASUMS256.txt"
    (cd "$download" && grep " $archive\$" SHASUMS256.txt | sha256sum -c -)
    # Extract beside the archive and move into place only once complete, so an
    # interrupted run never leaves a partial install that later runs reuse.
    mkdir -p "$download/node" "$(dirname "$node_dir")"
    tar -xJf "$download/$archive" --strip-components=1 -C "$download/node"
    rm -rf "$node_dir"
    mv "$download/node" "$node_dir"
    rm -rf "$download"
  fi
  export PATH="$node_dir/bin:$PATH"
fi

expected_pnpm="$(read_expected_pnpm)"
if [ "$(pnpm --version 2>/dev/null || echo missing)" != "$expected_pnpm" ]; then
  npm install --global "pnpm@$expected_pnpm"
  hash -r
fi

pnpm install --frozen-lockfile
# Re-apply git hooks explicitly so sandboxes installing with --ignore-scripts
# still enforce .vite-hooks pre-commit and commit-msg checks.
./node_modules/.bin/vp config --no-agent

if [ "$all_browsers" = true ]; then
  pnpm --filter @merit/test-support exec playwright install chromium firefox webkit
else
  pnpm --filter @merit/test-support exec playwright install chromium
fi

# Strip any interactive-only early return so non-interactive shells load the PATH.
if [ -f "$HOME/.bashrc" ]; then
  sed -i '/case \$- in/,/esac/d' "$HOME/.bashrc"
fi
path_line="export PATH=\"$repo/node_modules/.bin:\$PATH\""
if [ -x "$node_dir/bin/node" ]; then
  path_line="export PATH=\"$repo/node_modules/.bin:$node_dir/bin:\$PATH\""
fi
if ! grep -qxF "$path_line" "$HOME/.bashrc" 2>/dev/null; then
  printf '\n%s\n' "$path_line" >> "$HOME/.bashrc"
fi
# Cloud sandboxes inherit a seccomp user-notify listener, so Vite Task caching
# fails with EBUSY (voidzero-dev/vite-plus#1643).
if [ -f "$HOME/.bashrc" ] && ! grep -qxF 'export MERIT_TASK_CACHE=off' "$HOME/.bashrc" 2>/dev/null; then
  printf '\nexport MERIT_TASK_CACHE=off\n' >> "$HOME/.bashrc"
fi

# Database, workspace, and email checks need the Compose services. Cloud images
# ship Docker without a running daemon; the script starts one when it can.
if ! ./node_modules/.bin/vpx tooling/scripts/start-services.ts; then
  echo "Warning: Compose services are not running; database and browser checks will fail." >&2
fi

run_doctor
