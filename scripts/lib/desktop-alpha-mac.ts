// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalDate:off
// @effect-diagnostics globalTimers:off

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export const ALPHA_APP_NAME = "T3 Code (Alpha)";
export const NIGHTLY_APP_NAME = "T3 Code (Nightly)";
export const ALPHA_BUNDLE_ID = "com.t3tools.t3code.alpha";
export const DEFAULT_ALPHA_APP_PATH = `/Applications/${ALPHA_APP_NAME}.app`;
export const LSREGISTER_PATH =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

export function desktopTraceLogPath(homeDirectory = NodeOS.homedir()): string {
  return NodePath.join(homeDirectory, ".t3", "userdata", "logs", "desktop.trace.ndjson");
}

export function buildThreadDeepLinkUrl(threadId: string): string {
  const trimmed = threadId.trim();
  if (trimmed.length === 0) {
    throw new Error("thread id must not be empty");
  }
  return `t3://thread/${trimmed}`;
}

export function resolveDmgFileName(version: string, arch: string): string {
  return `T3-Code-${version}-${arch}.dmg`;
}

export function resolveDefaultDmgPath(
  repoRoot: string,
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone macOS install helper has no Effect runtime.
  arch: string = NodeOS.arch(),
): string | null {
  const releaseDir = NodePath.join(repoRoot, "release");
  if (!NodeFS.existsSync(releaseDir)) {
    return null;
  }

  const candidates = NodeFS.readdirSync(releaseDir)
    .filter((name) => name.endsWith(`-${arch}.dmg`) && name.startsWith("T3-Code-"))
    .map((name) => NodePath.join(releaseDir, name))
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

export function logContainsThreadDeepLink(logContent: string, threadId: string): boolean {
  return (
    logContent.includes("desktop.deeplink.openThread") &&
    logContent.includes('"open thread deep link"') &&
    logContent.includes(threadId)
  );
}

export class CommandFailedError extends Error {
  readonly command: string;
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(input: {
    readonly command: string;
    readonly exitCode: number | null;
    readonly stderr: string;
  }) {
    super(
      `${input.command} failed with exit code ${input.exitCode ?? "unknown"}${input.stderr ? `: ${input.stderr.trim()}` : ""}`,
    );
    this.name = "CommandFailedError";
    this.command = input.command;
    this.exitCode = input.exitCode;
    this.stderr = input.stderr;
  }
}

export function runChecked(command: string, args: readonly string[] = []): string {
  const result = NodeChildProcess.spawnSync(command, args, {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new CommandFailedError({
      command: [command, ...args].join(" "),
      exitCode: result.status,
      stderr: result.stderr ?? result.stdout ?? "",
    });
  }

  return result.stdout ?? "";
}

export function runCheckedIgnoreMissing(command: string, args: readonly string[] = []): void {
  try {
    runChecked(command, args);
  } catch (error) {
    if (error instanceof CommandFailedError) {
      return;
    }
    throw error;
  }
}

export function assertMacPlatform(
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone macOS install helper has no Effect runtime.
  platform: string = NodeOS.platform(),
): void {
  if (platform !== "darwin") {
    throw new Error("desktop alpha install/deep-link scripts require macOS");
  }
}

export function quitDesktopChannelApps(): void {
  runCheckedIgnoreMissing("osascript", ["-e", `tell application "${ALPHA_APP_NAME}" to quit`]);
  runCheckedIgnoreMissing("osascript", ["-e", `tell application "${NIGHTLY_APP_NAME}" to quit`]);
  runCheckedIgnoreMissing("pkill", ["-f", "T3 Code"]);
}

export function mountDmg(dmgPath: string): string {
  const output = runChecked("hdiutil", ["attach", dmgPath, "-nobrowse"]);
  const mountPoint = parseHdiutilAttachMountPoint(output);
  if (!mountPoint) {
    throw new Error(`Failed to parse DMG mount point from hdiutil output:\n${output}`);
  }
  return mountPoint;
}

export function unmountVolume(mountPoint: string): void {
  runCheckedIgnoreMissing("hdiutil", ["detach", mountPoint, "-quiet"]);
}

export function installAlphaAppFromDmg(input: {
  readonly dmgPath: string;
  readonly installPath?: string;
}): { readonly installPath: string; readonly mountPoint: string } {
  const installPath = input.installPath ?? DEFAULT_ALPHA_APP_PATH;
  const mountPoint = mountDmg(input.dmgPath);
  const sourceAppPath = resolveMountedAppPath(mountPoint);

  if (!NodeFS.existsSync(sourceAppPath)) {
    unmountVolume(mountPoint);
    throw new Error(`Expected app bundle at ${sourceAppPath}`);
  }

  NodeFS.rmSync(installPath, { recursive: true, force: true });
  runChecked("ditto", [sourceAppPath, installPath]);
  registerAlphaApp(installPath);
  unmountVolume(mountPoint);

  return { installPath, mountPoint };
}

export function registerAlphaApp(installPath: string = DEFAULT_ALPHA_APP_PATH): void {
  runChecked(LSREGISTER_PATH, ["-f", installPath]);
}

export function readBundleIdentifier(appPath: string = DEFAULT_ALPHA_APP_PATH): string {
  return runChecked("/usr/libexec/PlistBuddy", [
    "-c",
    "Print CFBundleIdentifier",
    NodePath.join(appPath, "Contents", "Info.plist"),
  ]).trim();
}

export function resolveAlphaBinaryPath(installPath: string = DEFAULT_ALPHA_APP_PATH): string {
  return NodePath.join(installPath, "Contents/MacOS", ALPHA_APP_NAME);
}

export function launchAlphaApp(
  installPath: string = DEFAULT_ALPHA_APP_PATH,
  method: "open" | "binary" = "open",
): void {
  if (method === "open") {
    runChecked("open", [installPath]);
    return;
  }

  const child = NodeChildProcess.spawn(resolveAlphaBinaryPath(installPath), [], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export function openThreadDeepLink(threadId: string): void {
  runChecked("open", [buildThreadDeepLinkUrl(threadId)]);
}

export function listAlphaProcessLines(): readonly string[] {
  const pattern = NodePath.join(DEFAULT_ALPHA_APP_PATH, "Contents/MacOS");
  const result = NodeChildProcess.spawnSync("pgrep", ["-fl", pattern], {
    encoding: "utf8",
  });
  if (result.status === 1) {
    return [];
  }
  if (result.status !== 0) {
    throw new CommandFailedError({
      command: `pgrep -fl ${pattern}`,
      exitCode: result.status,
      stderr: result.stderr ?? "",
    });
  }

  return (result.stdout ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function logContainsDeepLinkConfigure(logContent: string): boolean {
  return logContent.includes("desktop.deeplink.configure");
}

export async function waitForAlphaDeepLinkReady(
  input: {
    readonly logPath?: string;
    readonly sinceOffset?: number;
    readonly timeoutMs?: number;
    readonly pollIntervalMs?: number;
    readonly settleMs?: number;
  } = {},
): Promise<readonly string[]> {
  const logPath = input.logPath ?? desktopTraceLogPath();
  const sinceOffset = input.sinceOffset ?? 0;
  const timeoutMs = input.timeoutMs ?? 180_000;
  const pollIntervalMs = input.pollIntervalMs ?? 1_000;
  const settleMs = input.settleMs ?? 20_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const processes = listAlphaProcessLines();
    const logContent = NodeFS.existsSync(logPath)
      ? NodeFS.readFileSync(logPath, "utf8").slice(sinceOffset)
      : "";

    if (processes.length > 0 && logContainsDeepLinkConfigure(logContent)) {
      return processes;
    }

    await sleepMs(pollIntervalMs);
  }

  const processes = listAlphaProcessLines();
  if (processes.length === 0) {
    throw new Error(`Timed out waiting for ${ALPHA_APP_NAME} to start`);
  }

  await sleepMs(settleMs);
  return processes;
}

export async function waitForThreadDeepLinkLog(input: {
  readonly threadId: string;
  readonly logPath?: string;
  readonly sinceOffset?: number;
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}): Promise<string> {
  const logPath = input.logPath ?? desktopTraceLogPath();
  const sinceOffset = input.sinceOffset ?? 0;
  const timeoutMs = input.timeoutMs ?? 15_000;
  const pollIntervalMs = input.pollIntervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (NodeFS.existsSync(logPath)) {
      const content = NodeFS.readFileSync(logPath, "utf8").slice(sinceOffset);
      if (logContainsThreadDeepLink(content, input.threadId)) {
        return content;
      }
    }
    await sleepMs(pollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for deep link log entry for thread ${input.threadId} in ${logPath}`,
  );
}
