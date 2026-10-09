import type { ServerProvider, ServerProviderUsageLimits } from "@t3tools/contracts";
import { remainingPercent } from "@t3tools/shared/usageLimits";

import { useNowMinute } from "../hooks/useNowMinute";
import { cn } from "../lib/utils";
import { LimitWindows } from "./usage/UsageLimits";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { UsageRing } from "./ui/usage-ring";

function usageColor(remaining: number): string {
  if (remaining <= 0) return "var(--color-red-500)";
  if (remaining <= 10) return "var(--color-amber-500)";
  return "var(--color-blue-500)";
}

/** The provider's live usage windows, re-rendered each minute so countdowns stay current. */
export function ProviderUsageDetails(props: {
  driver: ServerProvider["driver"];
  limits: ServerProviderUsageLimits;
}) {
  // The minute clock is UTC without a zone suffix.
  const now = Date.parse(`${useNowMinute()}Z`);
  return <LimitWindows compact driver={props.driver} windows={props.limits.windows} now={now} />;
}

export function ProviderUsageMeter(props: {
  driver: ServerProvider["driver"];
  limits: ServerProviderUsageLimits;
  providerDisplayName?: string | null;
}) {
  // The tightest window decides how much is left, matching the "% left" rows.
  let lowestRemaining = 100;
  for (const window of props.limits.windows) {
    lowestRemaining = Math.min(lowestRemaining, remainingPercent(window));
  }
  const providerName = props.providerDisplayName?.trim() || "Provider";

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className={cn(
              "inline-flex size-6 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted-foreground outline-none transition-colors",
              "hover:bg-accent data-[pressed]:bg-accent",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            )}
            aria-label={`${providerName} account usage: ${lowestRemaining}% left`}
          >
            <UsageRing percentage={lowestRemaining} color={usageColor(lowestRemaining)} />
          </button>
        }
      />
      <PopoverPopup tooltipStyle padding="none" side="top" align="end" className="w-80 max-w-none">
        <div className="grid gap-3 p-3">
          <div className="font-medium text-muted-foreground text-xs">{providerName} usage</div>
          <ProviderUsageDetails driver={props.driver} limits={props.limits} />
        </div>
      </PopoverPopup>
    </Popover>
  );
}
