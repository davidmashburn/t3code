import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

export function shouldReserveContextWindowMeter(input: {
  readonly detailLoading: boolean;
  readonly thread: Pick<
    EnvironmentThreadShell,
    "latestRun" | "latestUserMessageAt" | "runtime"
  > | null;
  readonly providerReportsContextWindow: boolean | null;
}) {
  return (
    input.detailLoading &&
    input.thread !== null &&
    (input.thread.latestRun !== null ||
      input.thread.latestUserMessageAt !== null ||
      input.thread.runtime !== null) &&
    input.providerReportsContextWindow !== false
  );
}
