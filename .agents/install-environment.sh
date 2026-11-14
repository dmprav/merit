#!/usr/bin/env bash
# Prepares a cloud agent VM. The image provides Node.js and pnpm, so the global
# Vite+ CLI, which only adds runtime management, is not installed. The workspace's
# vite-plus dependency supplies `vp` for every other command.
set -eo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

expected_node="v$(tr -d '[:space:]' < .node-version)"
actual_node="$(node --version 2>/dev/null || echo missing)"
if [ "$actual_node" != "$expected_node" ]; then
  echo "Node.js $expected_node is required by .node-version; found $actual_node." >&2
  echo "Update the environment image or install the pinned version first." >&2
  exit 1
fi

# pnpm switches to the version pinned in package.json devEngines.
pnpm install --frozen-lockfile
pnpm --filter @merit/test-support exec playwright install chromium

# Strip any interactive-only early return so non-interactive shells load the PATH.
if [ -f "$HOME/.bashrc" ]; then
  sed -i '/case \$- in/,/esac/d' "$HOME/.bashrc"
fi
path_line="export PATH=\"$repo/node_modules/.bin:\$PATH\""
if ! grep -qxF "$path_line" "$HOME/.bashrc" 2>/dev/null; then
  printf '\n%s\n' "$path_line" >> "$HOME/.bashrc"
fi
# Cloud sandboxes inherit a seccomp user-notify listener, so Vite Task caching
# fails with EBUSY (voidzero-dev/vite-plus#1643).
if [ -f "$HOME/.bashrc" ] && ! grep -qxF 'export MERIT_TASK_CACHE=off' "$HOME/.bashrc" 2>/dev/null; then
  printf '\nexport MERIT_TASK_CACHE=off\n' >> "$HOME/.bashrc"
fi
