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
  assertMacPlatform,
  installAlphaAppFromDmg,
  launchAlphaApp,
  launchdJobIsActive,
  LOCAL_REBUILD_LAUNCHD_LABEL,
  LOCAL_REBUILD_LOG_PATH,
  validateAlphaDmg,
  renderOneShotLaunchAgentPlist,
  resolveDmgPath,
  runChecked,
  sleepMs,
} from "./lib/desktop-alpha-mac.ts";

const repoRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const scriptPath = NodeURL.fileURLToPath(import.meta.url);
const INSTALL_AFTER_BUILD_FLAG = "--install-after-build";
const DMG_FLAG = "--dmg";

function readFlagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a path`);
  return value;
}

function runBuild(): string {
  const releaseDirectory = NodePath.join(repoRoot, "release");
  NodeFS.mkdirSync(releaseDirectory, { recursive: true });
  // A fresh output directory prevents an old Alpha DMG from masking a failed or incompatible build.
  const outputDirectory = NodeFS.mkdtempSync(NodePath.join(releaseDirectory, "alpha-rebuild-"));
  const result = NodeChildProcess.spawnSync(
    "vp",
    ["run", "dist:desktop:dmg", "--output-dir", outputDirectory],
    { cwd: repoRoot, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`Desktop DMG build failed with exit code ${result.status ?? "unknown"}`);
  }
  const dmgPath = resolveDmgPath(outputDirectory);
  if (!dmgPath) {
    throw new Error("Desktop DMG build completed without producing a matching artifact");
  }
  return dmgPath;
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
    programArguments: [process.execPath, scriptPath, INSTALL_AFTER_BUILD_FLAG, DMG_FLAG, dmgPath],
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
  console.log(`[rebuild-desktop-alpha] Installing from ${dmgPath}`);
  const result = installAlphaAppFromDmg({ dmgPath });
  console.log(`[rebuild-desktop-alpha] Installed ${result.installPath}`);
  launchAlphaApp(result.installPath);
  console.log(`[rebuild-desktop-alpha] Relaunched ${result.installPath}`);
}

export async function rebuildDesktopAlpha(args: readonly string[]): Promise<void> {
  assertMacPlatform();
  const explicitDmgPath = readFlagValue(args, DMG_FLAG);

  if (args.includes(INSTALL_AFTER_BUILD_FLAG)) {
    if (!explicitDmgPath) {
      throw new Error("--install-after-build requires --dmg PATH");
    }
    await completeInstall(NodePath.resolve(explicitDmgPath));
    return;
  }

  const dmgPath = explicitDmgPath ? NodePath.resolve(explicitDmgPath) : runBuild();
  validateAlphaDmg(dmgPath);
  scheduleInstall(dmgPath);
}

if (import.meta.main) {
  rebuildDesktopAlpha(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
