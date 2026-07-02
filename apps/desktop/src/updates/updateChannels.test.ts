import { describe, expect, it } from "vite-plus/test";

import {
  isNightlyDesktopVersion,
  resolveDefaultDesktopUpdateChannel,
  resolveDesktopAppBundleId,
  resolveDesktopBuildAppId,
} from "./updateChannels.ts";

describe("updateChannels", () => {
  it("keeps preview builds branded as nightly but on the latest update channel", () => {
    expect(isNightlyDesktopVersion("0.0.41-preview.20260911.7")).toBe(true);
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-preview.20260911.7")).toBe("latest");
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-nightly.20260911.7")).toBe("nightly");
  });

  it("only matches the first prerelease identifier", () => {
    expect(isNightlyDesktopVersion("1.2.3-foo-preview.20260911.1")).toBe(false);
    expect(isNightlyDesktopVersion("1.2.3")).toBe(false);
  });

  it("uses dev, nightly, and alpha bundle ids per channel", () => {
    expect(resolveDesktopAppBundleId({ isDevelopment: true, appVersion: "0.0.28" })).toBe(
      "com.t3tools.t3code.dev",
    );
    expect(
      resolveDesktopAppBundleId({
        isDevelopment: false,
        appVersion: "0.0.28-nightly.20260702.1",
      }),
    ).toBe("com.t3tools.t3code.nightly");
    expect(resolveDesktopAppBundleId({ isDevelopment: false, appVersion: "0.0.28" })).toBe(
      "com.t3tools.t3code.alpha",
    );
    expect(resolveDesktopBuildAppId("0.0.28-nightly.20260702.1")).toBe(
      "com.t3tools.t3code.nightly",
    );
    expect(resolveDesktopBuildAppId("0.0.28")).toBe("com.t3tools.t3code.alpha");
  });
});
