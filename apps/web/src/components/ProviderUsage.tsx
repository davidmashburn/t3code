import type { ServerProvider, ServerProviderUsageLimits } from "@t3tools/contracts";

import { useNowMinute } from "../hooks/useNowMinute";
import { composerFloatingLayerProps } from "./chat/composerEventScope";
import { providerUsageRemaining } from "./ProviderUsage.logic";
import { LimitWindows } from "./usage/UsageLimits";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { UsageRing } from "./ui/usage-ring";

function usageColor(remaining: number): string {
  if (remaining <= 0) return "var(--color-red-500)";
  if (remaining <= 10) return "var(--color-amber-500)";
  return "var(--color-blue-500)";
}

function ProviderUsageDetails(props: {
  driver: ServerProvider["driver"];
  limits: ServerProviderUsageLimits;
  accentColor: ServerProvider["accentColor"];
}) {
  // The shared minute clock omits the UTC zone suffix.
  const now = Date.parse(`${useNowMinute()}Z`);
  return (
    <LimitWindows
      compact
      driver={props.driver}
      accentColor={props.accentColor}
      windows={props.limits.windows}
      now={now}
    />
  );
}

export function ProviderUsageMeter({ provider }: { provider: ServerProvider | null }) {
  const limits = provider?.usageLimits;
  const remaining = providerUsageRemaining(limits);
  if (!provider || !limits || remaining === null) return null;
  const providerName = provider.displayName?.trim() || "Provider";

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted-foreground outline-none transition-colors hover:bg-accent data-pressed:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-label={`${providerName} account usage: ${remaining}% left`}
          >
            <UsageRing percentage={remaining} color={usageColor(remaining)} />
          </button>
        }
      />
      <PopoverPopup
        {...composerFloatingLayerProps}
        tooltipStyle
        padding="none"
        side="top"
        align="end"
        width="md"
      >
        <div className="grid gap-3 p-3">
          <div className="font-medium text-muted-foreground text-xs">{providerName} usage</div>
          <ProviderUsageDetails
            driver={provider.driver}
            limits={limits}
            accentColor={provider.accentColor}
          />
        </div>
      </PopoverPopup>
    </Popover>
  );
}
