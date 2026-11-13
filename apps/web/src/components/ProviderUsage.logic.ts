import type { ServerProviderUsageLimits } from "@t3tools/contracts";
import { remainingPercent } from "@t3tools/shared/usageLimits";

export function providerUsageRemaining(limits: ServerProviderUsageLimits | null | undefined) {
  if (!limits || limits.windows.length === 0) return null;
  return Math.min(...limits.windows.map(remainingPercent));
}
