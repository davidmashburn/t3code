#!/usr/bin/env bash

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Refusing to update a dirty worktree. Commit or stash tracked changes first." >&2
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Local desktop installation is currently supported only on macOS." >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) build_arch="arm64" ;;
  x86_64) build_arch="x64" ;;
  *)
    echo "Unsupported macOS architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

echo "Updating $(git branch --show-current) from origin/main..."
git fetch origin main
git merge --no-edit origin/main

echo "Installing dependencies and building the local Alpha app..."
CI=true vp install --frozen-lockfile
vp run dist:desktop:artifact --platform mac --target dmg --arch "$build_arch"

dmg_path="$(find "$repo_root/release" -maxdepth 1 -type f -name "T3-Code-*-${build_arch}.dmg" \
  -exec stat -f '%m %N' {} + \
  | sort -rn \
  | sed -n '1p' \
  | cut -d ' ' -f 2-)"

if [[ -z "$dmg_path" ]]; then
  echo "Build completed without producing an ${build_arch} DMG." >&2
  exit 1
fi

mount_point="$(hdiutil attach "$dmg_path" -nobrowse | awk -F '\t' '/\/Volumes\// { print $NF }' | tail -n 1)"
if [[ -z "$mount_point" ]]; then
  echo "Could not determine the mounted DMG volume." >&2
  exit 1
fi

cleanup() {
  hdiutil detach "$mount_point" -quiet >/dev/null 2>&1 || true
}
trap cleanup EXIT

source_app="$mount_point/T3 Code (Alpha).app"
install_path="/Applications/T3 Code (Alpha).app"
if [[ ! -d "$source_app" ]]; then
  echo "Expected app bundle not found at $source_app" >&2
  exit 1
fi

osascript -e 'tell application "T3 Code (Alpha)" to quit' >/dev/null 2>&1 || true
sleep 1

# Keep the destructive target fixed and explicit.
if [[ "$install_path" != "/Applications/T3 Code (Alpha).app" ]]; then
  echo "Refusing unexpected install path: $install_path" >&2
  exit 1
fi
rm -rf "$install_path"
ditto "$source_app" "$install_path"

lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
"$lsregister" -f "$install_path"

echo "Installed $install_path from $(basename "$dmg_path")."
