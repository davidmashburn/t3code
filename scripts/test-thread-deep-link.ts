#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalConsole:off

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import {
  ALPHA_APP_NAME,
  ALPHA_BUNDLE_ID,
  assertMacPlatform,
  buildThreadDeepLinkUrl,
  desktopTraceLogPath,
  installAlphaAppFromDmg,
  launchAlphaApp,
  listAlphaProcessLines,
  openThreadDeepLink,
  quitDesktopChannelApps,
  readBundleIdentifier,
  resolveDefaultDmgPath,
  waitForAlphaDeepLinkReady,
  waitForThreadDeepLinkLog,
} from "./lib/desktop-alpha-mac.ts";

const repoRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");

function readFlagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function printUsage(): never {
  console.error(`Usage: node scripts/test-thread-deep-link.ts --thread-id ID [--dmg PATH] [--skip-install] [--launch-method open|binary]

End-to-end macOS test for t3:// thread deep links:
  1. quit Alpha/Nightly
  2. install Alpha from the local DMG (unless --skip-install)
  3. launch Alpha
  4. open t3://thread/<id>
  5. verify desktop trace logs contain a deep-link open event

Defaults:
  --dmg            newest ./release/T3-Code-*-<arch>.dmg
  --launch-method  open (use binary for automation-only environments)
`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
  }

  assertMacPlatform();

  const threadId = readFlagValue("--thread-id");
  if (!threadId) {
    printUsage();
  }

  const skipInstall = hasFlag("--skip-install");
  const explicitDmgPath = readFlagValue("--dmg");
  const launchMethod = readFlagValue("--launch-method") === "binary" ? "binary" : "open";
  const dmgPath = explicitDmgPath ?? resolveDefaultDmgPath(repoRoot);
  const logPath = desktopTraceLogPath();
  const logOffsetBefore = NodeFS.existsSync(logPath) ? NodeFS.statSync(logPath).size : 0;

  console.log(`[test-thread-deep-link] Target URL: ${buildThreadDeepLinkUrl(threadId)}`);
  console.log(`[test-thread-deep-link] Quitting existing desktop apps...`);
  quitDesktopChannelApps();

  if (!skipInstall) {
    if (!dmgPath) {
      throw new Error("No DMG found. Build one first with: bun run dist:desktop:dmg:arm64");
    }

    console.log(`[test-thread-deep-link] Installing Alpha from ${dmgPath}`);
    const installResult = installAlphaAppFromDmg({ dmgPath });
    const bundleId = readBundleIdentifier(installResult.installPath);
    if (bundleId !== ALPHA_BUNDLE_ID) {
      throw new Error(`Expected bundle id ${ALPHA_BUNDLE_ID}, got ${bundleId}`);
    }
    console.log(`[test-thread-deep-link] Installed ${installResult.installPath}`);
  }

  console.log(`[test-thread-deep-link] Launching ${ALPHA_APP_NAME} (${launchMethod})...`);
  launchAlphaApp(undefined, launchMethod);

  const processes = await waitForAlphaDeepLinkReady({
    logPath,
    sinceOffset: logOffsetBefore,
    timeoutMs: 180_000,
  });
  console.log(
    `[test-thread-deep-link] Alpha ready for deep links (${processes.length} process(es))`,
  );

  console.log(`[test-thread-deep-link] Opening deep link...`);
  openThreadDeepLink(threadId);

  await waitForThreadDeepLinkLog({
    threadId,
    logPath,
    sinceOffset: logOffsetBefore,
    timeoutMs: 20_000,
  });

  if (listAlphaProcessLines().length === 0) {
    throw new Error(`${ALPHA_APP_NAME} exited after opening the deep link`);
  }

  console.log(`[test-thread-deep-link] PASS: deep link handled for thread ${threadId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
