#!/bin/bash
# Build upstream sources, verify the package, then install with a rollback copy.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)-$(uname -m)" == Darwin-arm64 ]] || {
  echo 'This script targets Apple Silicon macOS.' >&2
  exit 1
}
if pgrep -f '^/Applications/pi-gui.app/Contents/MacOS/pi-gui' >/dev/null; then
  echo 'Quit the installed pi-gui before rebuilding.' >&2
  exit 1
fi

stamp="$(date +%Y%m%d-%H%M%S)-$$"
evidence="$PWD/.artifacts/local-build/$stamp"
mkdir -p "$evidence"
# Optional host-only workaround for a stale Apple CLT Swift module map.
overlay_bin="$PWD/.artifacts/local-build/swift-overlay/bin"
if [[ -x "$overlay_bin/xcrun" ]]; then
  export PATH="$overlay_bin:$PATH"
  echo "Using local Swift overlay: $overlay_bin"
fi

corepack pnpm install --frozen-lockfile
corepack pnpm --filter @pi-gui/desktop build
# Preserve prior build artifacts rather than letting electron-builder replace them.
if [[ -d apps/desktop/release ]]; then
  mv apps/desktop/release "$evidence/previous-release"
fi
CSC_IDENTITY_AUTO_DISCOVERY=false corepack pnpm --filter @pi-gui/desktop exec \
  electron-builder --mac --dir --publish never -c.mac.identity=- -c.mac.notarize=false
corepack pnpm --filter @pi-gui/desktop verify:packaged-runtime-deps
PI_APP_TEST_MODE=background corepack pnpm exec playwright test \
  -c apps/desktop/playwright.config.ts \
  apps/desktop/tests/production/packaged-smoke.spec.ts \
  apps/desktop/tests/production/packaged-terminal.spec.ts \
  --output="$evidence/packaged-tests"

app='apps/desktop/release/mac-arm64/pi-gui.app'
target='/Applications/pi-gui.app'
codesign --verify --deep --strict "$app"
# Recheck after the build in case the app was opened in the meantime.
if pgrep -f '^/Applications/pi-gui.app/Contents/MacOS/pi-gui' >/dev/null; then
  echo 'Quit pi-gui, then install the verified bundle manually (see LOCAL.md).' >&2
  exit 1
fi
if [[ -e "$target" ]]; then
  mv "$target" "$evidence/previous-pi-gui.app"
  echo "Previous app: $evidence/previous-pi-gui.app"
fi
ditto "$app" "$target"
codesign --verify --deep --strict "$target"
{
  git rev-parse HEAD
  git status --short
} > "$evidence/source.txt"
echo "Installed $target; evidence: $evidence"
echo 'Open with: open /Applications/pi-gui.app'
