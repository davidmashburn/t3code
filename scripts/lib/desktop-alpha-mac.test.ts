// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";
import { assert, afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Plist from "plist";
import { vi } from "vite-plus/test";

const system = vi.hoisted(() => ({
  apps: new Map<string, string>(),
  calls: [] as { command: string; args: readonly string[] }[],
  failCommand: "",
  failRenameFrom: "",
  directories: new Map<string, readonly string[]>(),
  buildArtifacts: [] as string[],
  launchdOutput: null as string | null,
  plists: [] as string[],
  moves: [] as { from: string; to: string }[],
}));

vi.mock("node:fs", () => ({
  existsSync: (path: string) => system.apps.has(path) || system.directories.has(path),
  mkdirSync: (path: string) => system.directories.set(path, []),
  mkdtempSync: (prefix: string) => {
    const path = `${prefix}test`;
    system.directories.set(path, []);
    return path;
  },
  readdirSync: (path: string) => system.directories.get(path) ?? [],
  statSync: () => ({ mtimeMs: 0 }),
  writeFileSync: (_path: string, content: string) => system.plists.push(content),
  renameSync: (from: string, to: string) => {
    system.moves.push({ from, to });
    if (from === system.failRenameFrom) throw new Error("simulated rename failure");
    const bundleId = system.apps.get(from);
    if (bundleId === undefined) throw new Error(`Missing ${from}`);
    system.apps.set(to, bundleId);
    system.apps.delete(from);
  },
  rmSync: (path: string) => {
    system.directories.delete(path);
    for (const key of system.apps.keys()) {
      if (key === path || key.startsWith(`${path}/`)) system.apps.delete(key);
    }
  },
}));

vi.mock("node:os", () => ({
  arch: () => "arm64",
  platform: () => "darwin",
  tmpdir: () => "/tmp",
}));

vi.mock("node:child_process", () => ({
  spawnSync: (command: string, args: readonly string[]) => {
    system.calls.push({ command, args });
    if (command === system.failCommand) {
      return { status: 1, stderr: "simulated failure" };
    }
    let stdout = "";
    if (command === "vp") {
      system.directories.set(args[3]!, system.buildArtifacts);
    } else if (command === "launchctl" && args[0] === "print") {
      return system.launchdOutput === null
        ? { status: 1, stdout: "", stderr: "Service not found" }
        : { status: 0, stdout: system.launchdOutput, stderr: "" };
    } else if (command === "hdiutil" && args[0] === "attach") {
      stdout = "/dev/disk4s1\tApple_HFS\t/Volumes/Alpha Installer\n";
    } else if (command === "/usr/libexec/PlistBuddy") {
      stdout = system.apps.get(args[2]!.replace("/Contents/Info.plist", "")) ?? "";
    } else if (command === "ditto") {
      system.apps.set(args[1]!, system.apps.get(args[0]!)!);
    }
    return { status: 0, stdout, stderr: "" };
  },
}));

import {
  ALPHA_BUNDLE_ID,
  DEFAULT_ALPHA_APP_PATH,
  installAlphaAppFromDmg,
  launchdJobIsActive,
  LSREGISTER_PATH,
  parseHdiutilAttachMountPoint,
  renderOneShotLaunchAgentPlist,
  validateAlphaDmg,
} from "./desktop-alpha-mac.ts";
import { rebuildDesktopAlpha } from "../rebuild-desktop-alpha.ts";

const mountedApp = "/Volumes/Alpha Installer/T3 Code (Alpha).app";

describe("desktop Alpha rebuild safety", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    system.apps.clear();
    system.calls.length = 0;
    system.moves.length = 0;
    system.failCommand = "";
    system.failRenameFrom = "";
    system.directories.clear();
    system.buildArtifacts = ["T3-Code-0.0.0-arm64.dmg"];
    system.launchdOutput = null;
    system.plists.length = 0;
    system.apps.set(mountedApp, ALPHA_BUNDLE_ID);
    system.apps.set(DEFAULT_ALPHA_APP_PATH, ALPHA_BUNDLE_ID);
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders escaped one-shot launch agent arguments without restart behavior", () => {
    const plist = renderOneShotLaunchAgentPlist({
      label: "com.example.rebuild",
      programArguments: ["/node", "/repo/a&b/rebuild.ts", "--install-after-build"],
      workingDirectory: "/repo/a&b",
      logPath: "/tmp/rebuild.log",
    });
    assert.include(plist, "<key>RunAtLoad</key>\n  <true/>");
    assert.include(plist, "<key>KeepAlive</key>\n  <false/>");
    assert.include(plist, "<string>/repo/a&amp;b/rebuild.ts</string>");
    assert.include(plist, "<string>/repo/a&amp;b</string>");
  });

  it("uses job fields rather than nested coalition activity", () => {
    assert.isTrue(launchdJobIsActive("active count = 1\nstate = running"));
    assert.isTrue(launchdJobIsActive("active count = 0\nstate = spawn scheduled"));
    assert.isFalse(launchdJobIsActive("active count = 0\nstate = not running"));
    assert.isFalse(launchdJobIsActive(""));
    assert.isFalse(
      launchdJobIsActive(`gui/501/com.example.rebuild = {
  active count = 0
  state = not running
  resource coalition = {
    state = active
    active count = 1
  }
}`),
    );
  });

  it("parses mount points containing spaces", () => {
    assert.equal(
      parseHdiutilAttachMountPoint("/dev/disk4s1\tApple_HFS\t/Volumes/Alpha Installer\n"),
      "/Volumes/Alpha Installer",
    );
    assert.isNull(parseHdiutilAttachMountPoint("attach failed"));
  });

  it("rejects a regular upstream bundle without quitting or replacing Alpha", () => {
    system.apps.set(mountedApp, "com.t3tools.t3code");
    assert.throws(() => installAlphaAppFromDmg({ dmgPath: "/regular.dmg" }), /Expected bundle id/);
    assert.equal(system.apps.get(DEFAULT_ALPHA_APP_PATH), ALPHA_BUNDLE_ID);
    assert.isFalse(system.calls.some(({ command }) => command === "osascript"));
    assert.deepEqual(system.calls.at(-1), {
      command: "hdiutil",
      args: ["detach", "/Volumes/Alpha Installer", "-quiet"],
    });
  });

  it("rejects a DMG without an Alpha app and still detaches it", () => {
    system.apps.delete(mountedApp);
    assert.throws(() => validateAlphaDmg("/regular.dmg"), /Expected Alpha app bundle/);
    assert.equal(system.calls.at(-1)?.args[0], "detach");
    assert.isFalse(system.calls.some(({ command }) => command === "osascript"));
  });

  it("stages and validates before quitting only Alpha", () => {
    const result = installAlphaAppFromDmg({ dmgPath: "/alpha.dmg" });
    assert.equal(result.installPath, DEFAULT_ALPHA_APP_PATH);
    assert.equal(system.apps.get(DEFAULT_ALPHA_APP_PATH), ALPHA_BUNDLE_ID);
    const quitIndex = system.calls.findIndex(({ command }) => command === "osascript");
    const copyIndex = system.calls.findIndex(({ command }) => command === "ditto");
    assert.isAbove(quitIndex, copyIndex);
    assert.include(system.calls[quitIndex]!.args[1]!, DEFAULT_ALPHA_APP_PATH);
    assert.isFalse(system.calls.some(({ command }) => command === "pkill" || command === "open"));
    assert.isFalse([...system.apps.keys()].some((path) => path.includes(".t3code-alpha-install-")));
  });

  it.each(["ditto", "osascript", "hdiutil"])(
    "leaves the installed app intact when %s fails",
    (failCommand) => {
      system.failCommand = failCommand;
      assert.throws(() => installAlphaAppFromDmg({ dmgPath: "/alpha.dmg" }), /simulated failure/);
      assert.equal(system.apps.get(DEFAULT_ALPHA_APP_PATH), ALPHA_BUNDLE_ID);
      assert.isEmpty(system.moves);
    },
  );

  it("restores the previous app when registration fails", () => {
    system.failCommand = LSREGISTER_PATH;
    assert.throws(() => installAlphaAppFromDmg({ dmgPath: "/alpha.dmg" }), /simulated failure/);
    assert.equal(system.apps.get(DEFAULT_ALPHA_APP_PATH), ALPHA_BUNDLE_ID);
    assert.deepEqual(system.moves.at(-1), {
      from: "/Applications/.t3code-alpha-install-test/previous.app",
      to: DEFAULT_ALPHA_APP_PATH,
    });
    assert.isFalse([...system.apps.keys()].some((path) => path.includes(".t3code-alpha-install-")));
  });

  it("refuses to replace an installed app with the wrong bundle identity", () => {
    system.apps.set(DEFAULT_ALPHA_APP_PATH, "com.example.other");
    assert.throws(() => installAlphaAppFromDmg({ dmgPath: "/alpha.dmg" }), /Expected bundle id/);
    assert.equal(system.apps.get(DEFAULT_ALPHA_APP_PATH), "com.example.other");
    assert.isEmpty(system.moves);
    assert.isFalse(system.calls.some(({ command }) => command === "osascript"));
  });

  it("installs without trying to quit an app that is not installed", () => {
    system.apps.delete(DEFAULT_ALPHA_APP_PATH);
    installAlphaAppFromDmg({ dmgPath: "/alpha.dmg" });
    assert.equal(system.apps.get(DEFAULT_ALPHA_APP_PATH), ALPHA_BUNDLE_ID);
    assert.isFalse(system.calls.some(({ command }) => command === "osascript"));
  });

  it("restores the previous app when the staged replacement cannot be moved", () => {
    system.failRenameFrom = "/Applications/.t3code-alpha-install-test/T3 Code (Alpha).app";
    assert.throws(() => installAlphaAppFromDmg({ dmgPath: "/alpha.dmg" }), /rename failure/);
    assert.equal(system.apps.get(DEFAULT_ALPHA_APP_PATH), ALPHA_BUNDLE_ID);
    assert.equal(system.moves.at(-1)?.to, DEFAULT_ALPHA_APP_PATH);
  });

  it("preserves the backup and reports its location if rollback fails", () => {
    system.failCommand = LSREGISTER_PATH;
    system.failRenameFrom = "/Applications/.t3code-alpha-install-test/previous.app";
    assert.throws(
      () => installAlphaAppFromDmg({ dmgPath: "/alpha.dmg" }),
      /recover the previous app from \/Applications\/\.t3code-alpha-install-test\/previous.app/,
    );
    assert.equal(system.apps.get(system.failRenameFrom), ALPHA_BUNDLE_ID);
  });

  it("validates an explicit DMG and hands off one install without quitting in the caller", async () => {
    await rebuildDesktopAlpha(["--dmg", "/alpha.dmg"]);
    assert.isFalse(system.calls.some(({ command }) => command === "vp" || command === "osascript"));
    assert.deepEqual(
      system.calls.filter(({ command }) => command === "launchctl").map(({ args }) => args[0]),
      ["print", "bootstrap"],
    );
    assert.isEmpty(system.moves);
    assert.lengthOf(system.plists, 1);
    assert.deepEqual(Plist.parse(system.plists[0]!), {
      Label: "com.t3tools.t3code.local-rebuild",
      ProgramArguments: [
        process.execPath,
        NodePath.resolve(import.meta.dirname, "../rebuild-desktop-alpha.ts"),
        "--install-after-build",
        "--dmg",
        "/alpha.dmg",
      ],
      WorkingDirectory: NodePath.resolve(import.meta.dirname, "../.."),
      RunAtLoad: true,
      KeepAlive: false,
      StandardOutPath: "/tmp/t3code-alpha-rebuild.log",
      StandardErrorPath: "/tmp/t3code-alpha-rebuild.log",
    });
  });

  it("does not hand off an incompatible DMG", async () => {
    system.apps.set(mountedApp, "com.t3tools.t3code");
    await expect(rebuildDesktopAlpha(["--dmg", "/regular.dmg"])).rejects.toThrow(
      /Expected bundle id/,
    );
    assert.isFalse(system.calls.some(({ command }) => command === "launchctl"));
    assert.isEmpty(system.moves);
  });

  it("does not replace or stop an active install job", async () => {
    system.launchdOutput = "active count = 1\nstate = running";
    await expect(rebuildDesktopAlpha(["--dmg", "/alpha.dmg"])).rejects.toThrow(/already running/);
    assert.isFalse(
      system.calls.some(({ args }) => args[0] === "bootstrap" || args[0] === "bootout"),
    );
  });

  it("replaces a completed job even when its coalition remains active", async () => {
    system.launchdOutput =
      "active count = 0\nstate = not running\nresource coalition = {\nactive count = 1\n}";
    await rebuildDesktopAlpha(["--dmg", "/alpha.dmg"]);
    assert.deepEqual(
      system.calls.filter(({ command }) => command === "launchctl").map(({ args }) => args[0]),
      ["print", "bootout", "bootstrap"],
    );
  });

  it("builds into a fresh output directory before scheduling the resulting DMG", async () => {
    await rebuildDesktopAlpha([]);
    const buildArgs = system.calls.find(({ command }) => command === "vp")!.args;
    assert.deepEqual(buildArgs.slice(0, 3), ["run", "dist:desktop:dmg", "--output-dir"]);
    assert.include(buildArgs[3]!, "/release/alpha-rebuild-");
    const plist = system.plists[0]!;
    assert.include(plist, `${buildArgs[3]}/T3-Code-0.0.0-arm64.dmg`);
    const buildIndex = system.calls.findIndex(({ command }) => command === "vp");
    const validationIndex = system.calls.findIndex(({ command }) => command === "hdiutil");
    const handoffIndex = system.calls.findIndex(({ command }) => command === "launchctl");
    assert.isBelow(buildIndex, validationIndex);
    assert.isBelow(validationIndex, handoffIndex);
  });

  it("does not schedule installation when the build fails", async () => {
    system.failCommand = "vp";
    await expect(rebuildDesktopAlpha([])).rejects.toThrow(/Desktop DMG build failed/);
    assert.isFalse(
      system.calls.some(({ command }) => command === "launchctl" || command === "osascript"),
    );
  });

  it("does not reuse an old artifact when the build produces no matching DMG", async () => {
    system.buildArtifacts = ["T3-Code-0.0.0-x64.dmg"];
    system.directories.set(NodePath.resolve(import.meta.dirname, "../../release"), [
      "T3-Code-old-arm64.dmg",
    ]);
    await expect(rebuildDesktopAlpha([])).rejects.toThrow(/without producing a matching artifact/);
    assert.isFalse(system.calls.some(({ command }) => command === "launchctl"));
  });

  it("rejects a missing explicit DMG path before building or handing off", async () => {
    await expect(rebuildDesktopAlpha(["--dmg"])).rejects.toThrow(/requires a path/);
    assert.isEmpty(system.calls);
  });
});
