import type { ServerProviderUsage } from "@t3tools/contracts";

import { formatRelativeTimeUntilLabel } from "../timestampFormat";
import { cn } from "../lib/utils";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { UsageRing } from "./ui/usage-ring";

function usageColor(percentage: number): string {
  if (percentage >= 100) return "var(--color-red-500)";
  if (percentage >= 90) return "var(--color-amber-500)";
  return "var(--color-blue-500)";
}

function formatLimitReached(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ProviderUsageDetails(props: { usage: ServerProviderUsage; className?: string }) {
  return (
    <div className={cn("grid gap-3", props.className)}>
      {props.usage.limitReached ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] font-medium text-destructive">
          {formatLimitReached(props.usage.limitReached)}
        </p>
      ) : null}
      {props.usage.windows.map((window) => {
        const percentage = Math.max(0, Math.min(100, window.usedPercent));
        return (
          <div key={window.id} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[11px]">
              <span className="min-w-0 truncate font-medium text-muted-foreground">
                {window.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground/70">
                {percentage}% used
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
              role="progressbar"
              aria-label={`${window.label} usage`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percentage}
            >
              <div
                className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${percentage}%`, backgroundColor: usageColor(percentage) }}
              />
            </div>
            {window.resetsAt ? (
              <span className="text-[10px] text-muted-foreground/60">
                Resets {formatRelativeTimeUntilLabel(window.resetsAt)}
              </span>
            ) : null}
          </div>
        );
      })}
      {props.usage.credits ? (
        <div className="flex items-center justify-between gap-3 border-border/60 border-t pt-2 text-[11px]">
          <span className="text-muted-foreground/60">Credits</span>
          <span className="font-medium tabular-nums text-muted-foreground/80">
            {props.usage.credits.unlimited
              ? "Unlimited"
              : (props.usage.credits.balance ??
                (props.usage.credits.hasCredits ? "Available" : "None remaining"))}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function ProviderUsageMeter(props: {
  usage: ServerProviderUsage;
  providerDisplayName?: string | null;
}) {
  let highestUsedPercent = 0;
  for (const window of props.usage.windows) {
    highestUsedPercent = Math.max(highestUsedPercent, window.usedPercent);
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
            aria-label={`${providerName} account usage: ${highestUsedPercent}% used`}
          >
            <UsageRing percentage={highestUsedPercent} color={usageColor(highestUsedPercent)} />
          </button>
        }
      />
      <PopoverPopup tooltipStyle side="top" align="end" className="w-64 max-w-none p-0">
        <div className="grid gap-3 p-3">
          <div className="font-medium text-muted-foreground text-xs">{providerName} usage</div>
          <ProviderUsageDetails usage={props.usage} />
        </div>
      </PopoverPopup>
    </Popover>
  );
}
