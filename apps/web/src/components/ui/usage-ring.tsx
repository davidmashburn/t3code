import { cn } from "~/lib/utils";

export function UsageRing(props: {
  percentage: number;
  color: string;
  trackColor?: string;
  className?: string;
}) {
  const normalizedPercentage = Math.max(0, Math.min(100, props.percentage));
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (normalizedPercentage / 100) * circumference;

  return (
    <span className={cn("relative flex size-4 items-center justify-center", props.className)}>
      <svg
        viewBox="0 0 24 24"
        className="-rotate-90 absolute inset-0 size-full transform-gpu"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke={
            props.trackColor ??
            "color-mix(in oklab, var(--color-muted-foreground) 35%, transparent)"
          }
          strokeWidth="3"
        />
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke={props.color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
    </span>
  );
}
