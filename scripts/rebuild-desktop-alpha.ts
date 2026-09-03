#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalConsole:off
// @effect-diagnostics globalProcess:off

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import {
  ALPHA_BUNDLE_ID,
  assertMacPlatform,
  installAlphaAppFromDmg,
  launchAlphaApp,
  launchdJobIsActive,
  LOCAL_REBUILD_LAUNCHD_LABEL,
  LOCAL_REBUILD_LOG_PATH,
  quitDesktopChannelApps,
  readBundleIdentifier,
  renderOneShotLaunchAgentPlist,
  resolveDefaultDmgPath,
  runChecked,
  sleepMs,
} from "./lib/desktop-alpha-mac.ts";

const repoRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const scriptPath = NodeURL.fileURLToPath(import.meta.url);

function readFlagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function runBuild(): void {
  const result = NodeChildProcess.spawnSync("vp", ["run", "dist:desktop:dmg"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Desktop DMG build failed with exit code ${result.status ?? "unknown"}`);
  }
}

function scheduleInstall(dmgPath: string): void {
  const uid = process.getuid?.();
  if (uid === undefined) {
    throw new Error("Unable to determine the current macOS user id");
  }

  const domain = `gui/${uid}`;
  const service = `${domain}/${LOCAL_REBUILD_LAUNCHD_LABEL}`;
  const existing = NodeChildProcess.spawnSync("launchctl", ["print", service], {
    encoding: "utf8",
  });
  if (existing.status === 0) {
    const output = `${existing.stdout ?? ""}\n${existing.stderr ?? ""}`;
    if (launchdJobIsActive(output)) {
      throw new Error(`A local Alpha rebuild is already running (${service})`);
    }
    runChecked("launchctl", ["bootout", service]);
  }

  const tempDirectory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-alpha-rebuild-"));
  const plistPath = NodePath.join(tempDirectory, `${LOCAL_REBUILD_LAUNCHD_LABEL}.plist`);
  const plist = renderOneShotLaunchAgentPlist({
    label: LOCAL_REBUILD_LAUNCHD_LABEL,
    programArguments: [process.execPath, scriptPath, "--install-after-build", "--dmg", dmgPath],
    workingDirectory: repoRoot,
    logPath: LOCAL_REBUILD_LOG_PATH,
  });

  NodeFS.writeFileSync(plistPath, plist, { mode: 0o600 });
  try {
    runChecked("launchctl", ["bootstrap", domain, plistPath]);
  } finally {
    NodeFS.rmSync(tempDirectory, { recursive: true, force: true });
  }

  console.log(`[rebuild-desktop-alpha] One-shot install scheduled from ${dmgPath}`);
  console.log(`[rebuild-desktop-alpha] T3 Code will briefly quit, reinstall, and relaunch`);
  console.log(`[rebuild-desktop-alpha] Install log: ${LOCAL_REBUILD_LOG_PATH}`);
}

async function completeInstall(dmgPath: string): Promise<void> {
  // Let the invoking agent receive the successful command result before its host app quits.
  await sleepMs(2_500);
  console.log(`[rebuild-desktop-alpha] Quitting the installed Alpha app...`);
  quitDesktopChannelApps();
  console.log(`[rebuild-desktop-alpha] Installing from ${dmgPath}`);
  const result = installAlphaAppFromDmg({ dmgPath });
  const bundleId = readBundleIdentifier(result.installPath);
  if (bundleId !== ALPHA_BUNDLE_ID) {
    throw new Error(`Expected bundle id ${ALPHA_BUNDLE_ID}, got ${bundleId}`);
  }
  console.log(`[rebuild-desktop-alpha] Installed ${result.installPath}`);
  launchAlphaApp(result.installPath);
  console.log(`[rebuild-desktop-alpha] Relaunched ${result.installPath}`);
}

async function main(): Promise<void> {
  assertMacPlatform();
  const explicitDmgPath = readFlagValue("--dmg");

  if (process.argv.includes("--install-after-build")) {
    if (!explicitDmgPath) {
      throw new Error("--install-after-build requires --dmg PATH");
    }
    await completeInstall(NodePath.resolve(explicitDmgPath));
    return;
  }

  runBuild();
  const dmgPath = resolveDefaultDmgPath(repoRoot);
  if (!dmgPath) {
    throw new Error("Desktop DMG build completed without producing a matching artifact");
  }
  scheduleInstall(dmgPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
