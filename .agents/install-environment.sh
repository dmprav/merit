#!/usr/bin/env bash
set -eo pipefail

# Strip any interactive-only early return so non-interactive shells load Vite+.
if [ -f "$HOME/.bashrc" ]; then
  sed -i '/case \$- in/,/esac/d' "$HOME/.bashrc"
fi

if ! command -v vp >/dev/null 2>&1 && [ ! -x "$HOME/.vite-plus/bin/vp" ]; then
  curl -fsSL https://vite.plus | VP_NODE_MANAGER=yes bash
fi

if [ -f "$HOME/.vite-plus/env" ]; then
  . "$HOME/.vite-plus/env"
  if ! grep -qF '.vite-plus/env' "$HOME/.bashrc" 2>/dev/null; then
    printf '\n. "$HOME/.vite-plus/env"\n' >> "$HOME/.bashrc"
  fi
fi

vp env install
vp install --frozen-lockfile
pnpm --filter @merit/test-support exec playwright install chromium
