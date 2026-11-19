#!/usr/bin/env bash
# Prepares a cloud agent VM. When the image's Node.js or pnpm differs from the
# versions the repository pins, the pinned ones are installed under the home
# directory. The global Vite+ CLI, which only adds runtime management, is not
# installed; the workspace's vite-plus dependency supplies `vp`.
set -eo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

expected_node="v$(tr -d '[:space:]' < .node-version)"
node_dir="$HOME/.local/node-$expected_node"
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

expected_pnpm="$(node -p 'require("./package.json").devEngines.packageManager.version')"
if [ "$(pnpm --version 2>/dev/null || echo missing)" != "$expected_pnpm" ]; then
  npm install --global "pnpm@$expected_pnpm"
  hash -r
fi

pnpm install --frozen-lockfile
pnpm --filter @merit/test-support exec playwright install chromium

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
