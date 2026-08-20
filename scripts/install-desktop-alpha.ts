#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalConsole:off

import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import {
  ALPHA_BUNDLE_ID,
  assertMacPlatform,
  installAlphaAppFromDmg,
  quitDesktopChannelApps,
  readBundleIdentifier,
  resolveDefaultDmgPath,
} from "./lib/desktop-alpha-mac.ts";

const repoRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");

function readFlagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function printUsage(): never {
  console.error(`Usage: node scripts/install-desktop-alpha.ts [--dmg PATH] [--install-path PATH]

Installs the packaged Alpha desktop app from a local DMG into /Applications,
refreshes Launch Services registration, and verifies the alpha bundle id.

Defaults:
  --dmg           newest ./release/T3-Code-*-<arch>.dmg
  --install-path  /Applications/T3 Code (Alpha).app
`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
  }

  assertMacPlatform();

  const explicitDmgPath = readFlagValue("--dmg");
  const installPath = readFlagValue("--install-path");
  const dmgPath = explicitDmgPath ?? resolveDefaultDmgPath(repoRoot);
  if (!dmgPath) {
    throw new Error("No DMG found. Build one first with: bun run dist:desktop:dmg:arm64");
  }

  console.log(`[install-desktop-alpha] Quitting existing desktop apps...`);
  quitDesktopChannelApps();

  console.log(`[install-desktop-alpha] Installing from ${dmgPath}`);
  const result = installAlphaAppFromDmg(
    installPath === undefined ? { dmgPath } : { dmgPath, installPath },
  );

  const bundleId = readBundleIdentifier(result.installPath);
  if (bundleId !== ALPHA_BUNDLE_ID) {
    throw new Error(`Expected bundle id ${ALPHA_BUNDLE_ID}, got ${bundleId}`);
  }

  console.log(`[install-desktop-alpha] Installed ${result.installPath}`);
  console.log(`[install-desktop-alpha] Bundle id: ${bundleId}`);
  console.log(`[install-desktop-alpha] Launch Services registration refreshed`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
