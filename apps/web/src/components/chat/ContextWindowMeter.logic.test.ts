import { describe, expect, it } from "vite-plus/test";
import { shouldReserveContextWindowMeter } from "./ContextWindowMeter.logic";

const emptyThread = {
  latestRun: null,
  latestUserMessageAt: null,
  runtime: null,
};
const startedThread = { ...emptyThread, latestUserMessageAt: "2026-11-11T12:00:00Z" };
const loading = {
  detailLoading: true,
  thread: startedThread,
  providerReportsContextWindow: true,
};

describe("shouldReserveContextWindowMeter", () => {
  it("holds the context slot while a started thread's detail loads", () => {
    expect(shouldReserveContextWindowMeter(loading)).toBe(true);
    expect(
      shouldReserveContextWindowMeter({ ...loading, providerReportsContextWindow: null }),
    ).toBe(true);
  });

  it("does not leave a placeholder after detail loads", () => {
    expect(shouldReserveContextWindowMeter({ ...loading, detailLoading: false })).toBe(false);
  });

  it("does not reserve context for a provider that cannot report it", () => {
    expect(
      shouldReserveContextWindowMeter({ ...loading, providerReportsContextWindow: false }),
    ).toBe(false);
  });

  it("does not reserve context for a missing or unstarted thread", () => {
    expect(shouldReserveContextWindowMeter({ ...loading, thread: null })).toBe(false);
    expect(shouldReserveContextWindowMeter({ ...loading, thread: emptyThread })).toBe(false);
  });
});
