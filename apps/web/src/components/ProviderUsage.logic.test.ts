import type { ServerProviderUsageLimits, ServerProviderUsageWindow } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { providerUsageRemaining } from "./ProviderUsage.logic";

const session: ServerProviderUsageWindow = {
  id: "session",
  kind: "session",
  label: "Session",
  usedPercent: 20,
};
const weekly: ServerProviderUsageWindow = {
  id: "weekly",
  kind: "weekly",
  label: "Weekly",
  usedPercent: 87.6,
};
const limits: ServerProviderUsageLimits = {
  checkedAt: "2026-11-11T12:00:00Z",
  windows: [session, weekly],
};

describe("providerUsageRemaining", () => {
  it("shows the tightest account window using the same rounding as the usage rows", () => {
    expect(providerUsageRemaining(limits)).toBe(12);
    expect(providerUsageRemaining({ ...limits, windows: [weekly, session] })).toBe(12);
    expect(
      providerUsageRemaining({ ...limits, windows: [{ ...session, usedPercent: 95 }, weekly] }),
    ).toBe(5);
  });

  it.each([null, undefined, { ...limits, windows: [] }])(
    "does not report a full account when limits are missing: %j",
    (missing) => expect(providerUsageRemaining(missing)).toBeNull(),
  );

  it.each([
    [0, 100],
    [90, 10],
    [100, 0],
  ])("reports %i%% used as %i%% left", (usedPercent, remaining) => {
    expect(providerUsageRemaining({ ...limits, windows: [{ ...session, usedPercent }] })).toBe(
      remaining,
    );
  });
});
