// @effect-diagnostics globalTimers:off
// @effect-diagnostics nodeBuiltinImport:off

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export const ALPHA_APP_NAME = "T3 Code (Alpha)";
export const ALPHA_BUNDLE_ID = "com.t3tools.t3code.alpha";
export const DEFAULT_ALPHA_APP_PATH = `/Applications/${ALPHA_APP_NAME}.app`;
export const LOCAL_REBUILD_LAUNCHD_LABEL = "com.t3tools.t3code.local-rebuild";
export const LOCAL_REBUILD_LOG_PATH = "/tmp/t3code-alpha-rebuild.log";
export const LSREGISTER_PATH =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

function escapePlistString(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderOneShotLaunchAgentPlist(input: {
  readonly label: string;
  readonly programArguments: readonly string[];
  readonly workingDirectory: string;
  readonly logPath: string;
}): string {
  const argumentsXml = input.programArguments
    .map((argument) => `    <string>${escapePlistString(argument)}</string>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapePlistString(input.label)}</string>
  <key>ProgramArguments</key>
  <array>
${argumentsXml}
  </array>
  <key>WorkingDirectory</key>
  <string>${escapePlistString(input.workingDirectory)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${escapePlistString(input.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapePlistString(input.logPath)}</string>
</dict>
</plist>
`;
}

const LaunchdJobState = {
  Running: "running",
  SpawnScheduled: "spawn scheduled",
} as const;

export function launchdJobIsActive(output: string): boolean {
  // The job fields precede nested coalition fields, whose active counts can stay nonzero.
  const state = output.match(/\bstate = ([^\r\n]+)/u)?.[1]?.trim();
  const activeCount = Number(output.match(/\bactive count = (\d+)/u)?.[1] ?? 0);
  return (
    state === LaunchdJobState.Running || state === LaunchdJobState.SpawnScheduled || activeCount > 0
  );
}

export function resolveDmgPath(
  outputDirectory: string,
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone macOS install helper has no Effect runtime.
  arch: string = NodeOS.arch(),
): string | null {
  if (!NodeFS.existsSync(outputDirectory)) {
    return null;
  }

  const candidates = NodeFS.readdirSync(outputDirectory)
    .filter((name) => name.endsWith(`-${arch}.dmg`) && name.startsWith("T3-Code-"))
    .map((name) => NodePath.join(outputDirectory, name))
    .sort((left, right) => NodeFS.statSync(right).mtimeMs - NodeFS.statSync(left).mtimeMs);

  return candidates[0] ?? null;
}

export function resolveMountedAppPath(mountPoint: string): string {
  return NodePath.join(mountPoint, `${ALPHA_APP_NAME}.app`);
}

export function parseHdiutilAttachMountPoint(output: string): string | null {
  for (const line of output.split(/\r?\n/u)) {
    const match = line.match(/\/Volumes\/(.+)$/u);
    if (match) {
      return `/Volumes/${match[1]}`;
    }
  }
  return null;
}

export function runChecked(command: string, args: readonly string[] = []): string {
  const result = NodeChildProcess.spawnSync(command, args, {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const detail = result.stderr || result.error?.message || result.stdout || "";
    throw new Error(
      `${[command, ...args].join(" ")} failed with exit code ${result.status ?? "unknown"}${detail ? `: ${detail.trim()}` : ""}`,
      { cause: result.error },
    );
  }

  return result.stdout ?? "";
}

export function assertMacPlatform(
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone macOS install helper has no Effect runtime.
  platform: string = NodeOS.platform(),
): void {
  if (platform !== "darwin") {
    throw new Error("desktop alpha rebuild requires macOS");
  }
}

function withAlphaDmg<T>(dmgPath: string, useApp: (appPath: string) => T): T {
  const output = runChecked("hdiutil", ["attach", dmgPath, "-readonly", "-nobrowse"]);
  const mountPoint = parseHdiutilAttachMountPoint(output);
  if (!mountPoint) {
    throw new Error(`Failed to parse DMG mount point from hdiutil output:\n${output}`);
  }
  try {
    const appPath = resolveMountedAppPath(mountPoint);
    assertAlphaBundle(appPath);
    return useApp(appPath);
  } finally {
    runChecked("hdiutil", ["detach", mountPoint, "-quiet"]);
  }
}

export function readBundleIdentifier(appPath: string): string {
  return runChecked("/usr/libexec/PlistBuddy", [
    "-c",
    "Print CFBundleIdentifier",
    NodePath.join(appPath, "Contents", "Info.plist"),
  ]).trim();
}

function assertAlphaBundle(appPath: string): void {
  if (!NodeFS.existsSync(appPath)) {
    throw new Error(`Expected Alpha app bundle at ${appPath}`);
  }
  const bundleId = readBundleIdentifier(appPath);
  if (bundleId !== ALPHA_BUNDLE_ID) {
    throw new Error(`Expected bundle id ${ALPHA_BUNDLE_ID}, got ${bundleId}`);
  }
}

export function validateAlphaDmg(dmgPath: string): void {
  withAlphaDmg(dmgPath, () => undefined);
}

export function installAlphaAppFromDmg(input: { readonly dmgPath: string }): {
  readonly installPath: string;
} {
  const installPath = DEFAULT_ALPHA_APP_PATH;
  // Stage beside the destination so replacing the app uses same-volume renames.
  const stagingDirectory = NodeFS.mkdtempSync(
    NodePath.join(NodePath.dirname(installPath), ".t3code-alpha-install-"),
  );
  const stagedAppPath = NodePath.join(stagingDirectory, `${ALPHA_APP_NAME}.app`);
  const backupPath = NodePath.join(stagingDirectory, "previous.app");
  try {
    withAlphaDmg(input.dmgPath, (sourceAppPath) => {
      runChecked("ditto", [sourceAppPath, stagedAppPath]);
      assertAlphaBundle(stagedAppPath);
    });
    const hadInstalledApp = NodeFS.existsSync(installPath);
    if (hadInstalledApp) {
      assertAlphaBundle(installPath);
      // Address only Alpha, and do not launch it merely to ask it to quit.
      runChecked("osascript", [
        "-e",
        `if application "${installPath}" is running then
  tell application "${installPath}" to quit
end if
repeat 100 times
  if application "${installPath}" is not running then return
  delay 0.1
end repeat
error "Alpha did not quit; leaving the installed app unchanged"`,
      ]);
    }
    if (hadInstalledApp) {
      NodeFS.renameSync(installPath, backupPath);
    }
    try {
      NodeFS.renameSync(stagedAppPath, installPath);
      runChecked(LSREGISTER_PATH, ["-f", installPath]);
    } catch (error) {
      try {
        NodeFS.rmSync(installPath, { recursive: true, force: true });
        if (hadInstalledApp) {
          NodeFS.renameSync(backupPath, installPath);
        }
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Alpha replacement failed; recover the previous app from ${backupPath}`,
          { cause: rollbackError },
        );
      }
      throw error;
    }
    NodeFS.rmSync(backupPath, { recursive: true, force: true });
    return { installPath };
  } finally {
    // A failed rollback must leave the previous app available for manual recovery.
    if (!NodeFS.existsSync(backupPath)) {
      NodeFS.rmSync(stagingDirectory, { recursive: true, force: true });
    }
  }
}

export function launchAlphaApp(installPath: string): void {
  runChecked("open", [installPath]);
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
