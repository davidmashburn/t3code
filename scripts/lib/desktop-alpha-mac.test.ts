import { assert, describe, it } from "@effect/vitest";
// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalDate:off

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  ALPHA_BUNDLE_ID,
  buildThreadDeepLinkUrl,
  launchdJobIsActive,
  logContainsDeepLinkConfigure,
  logContainsThreadDeepLink,
  parseHdiutilAttachMountPoint,
  renderOneShotLaunchAgentPlist,
  resolveDefaultDmgPath,
  resolveDmgFileName,
  resolveMountedAppPath,
} from "./desktop-alpha-mac.ts";

describe("desktop-alpha-mac", () => {
  it("builds thread deep link URLs", () => {
    assert.equal(
      buildThreadDeepLinkUrl("6c8ed874-c3f5-422c-ae56-82efc31dc743"),
      "t3://thread/6c8ed874-c3f5-422c-ae56-82efc31dc743",
    );
  });

  it("parses hdiutil mount points", () => {
    assert.equal(
      parseHdiutilAttachMountPoint(
        "/dev/disk4s1\tApple_HFS\t/Volumes/T3 Code (Alpha) 0.0.28-arm64\n",
      ),
      "/Volumes/T3 Code (Alpha) 0.0.28-arm64",
    );
  });

  it("resolves packaged app paths from mount points", () => {
    assert.equal(
      resolveMountedAppPath("/Volumes/T3 Code (Alpha) 0.0.28-arm64"),
      "/Volumes/T3 Code (Alpha) 0.0.28-arm64/T3 Code (Alpha).app",
    );
  });

  it("detects deep link log entries", () => {
    const sample = JSON.stringify({
      type: "effect-span",
      name: "desktop.deeplink.openThread",
      events: [{ name: "open thread deep link", attributes: { threadId: "abc" } }],
    });

    assert.isTrue(logContainsThreadDeepLink(sample, "abc"));
    assert.isFalse(logContainsThreadDeepLink(sample, "def"));
    assert.isTrue(logContainsDeepLinkConfigure('{"name":"desktop.deeplink.configure"}'));
  });

  it("selects the newest matching dmg in release/", () => {
    const tempRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-dmg-resolve-"));
    const releaseDir = NodePath.join(tempRoot, "release");
    NodeFS.mkdirSync(releaseDir);

    const older = NodePath.join(releaseDir, resolveDmgFileName("0.0.27", "arm64"));
    const newer = NodePath.join(releaseDir, resolveDmgFileName("0.0.28", "arm64"));
    NodeFS.writeFileSync(older, "old");
    NodeFS.writeFileSync(newer, "new");
    NodeFS.utimesSync(older, new Date("2026-01-01"), new Date("2026-01-01"));
    NodeFS.utimesSync(newer, new Date("2026-07-02"), new Date("2026-07-02"));

    assert.equal(resolveDefaultDmgPath(tempRoot, "arm64"), newer);
    assert.equal(ALPHA_BUNDLE_ID, "com.t3tools.t3code.alpha");

    NodeFS.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("renders a one-shot launch agent without restart behavior", () => {
    const plist = renderOneShotLaunchAgentPlist({
      label: "com.example.rebuild",
      programArguments: ["/path/to/node", "/repo/a&b/rebuild.ts", "--install-after-build"],
      workingDirectory: "/repo/a&b",
      logPath: "/tmp/rebuild.log",
    });

    assert.include(plist, "<key>RunAtLoad</key>\n  <true/>");
    assert.include(plist, "<key>KeepAlive</key>\n  <false/>");
    assert.include(plist, "<string>/repo/a&amp;b/rebuild.ts</string>");
    assert.include(plist, "<string>/repo/a&amp;b</string>");
  });

  it("distinguishes active launchd jobs from completed jobs", () => {
    assert.isTrue(launchdJobIsActive("active count = 1\nstate = running"));
    assert.isTrue(launchdJobIsActive("active count = 0\nstate = spawn scheduled"));
    assert.isFalse(launchdJobIsActive("active count = 0\nstate = not running"));
  });
});
