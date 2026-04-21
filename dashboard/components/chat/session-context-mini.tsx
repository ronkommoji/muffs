"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  percentage: number | null;
  totalTokens: number | null;
  maxTokens: number | null;
  className?: string;
};

export function SessionContextMiniRing({
  percentage,
  totalTokens,
  maxTokens,
  className,
}: Props) {
  const hasPct = percentage != null && !Number.isNaN(percentage);
  const hasMax = maxTokens != null && maxTokens > 0;
  const hasTotal = totalTokens != null && totalTokens > 0;
  // Show ring when we have a real max, or when we have usage + percentage (SDK quirks)
  const hasData = hasPct && (hasMax || (hasTotal && (percentage ?? 0) >= 0));

  const pct = hasData
    ? Math.min(100, Math.max(0, Number(percentage)))
    : null;

  const r = 12;
  const stroke = 3;
  const pad = stroke + 1;
  const size = (r + pad) * 2;
  const c = 2 * Math.PI * r;
  const dashOffset = pct != null ? c * (1 - pct / 100) : c;

  const total = totalTokens ?? 0;
  const max = maxTokens ?? 0;

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
        aria-label="Context usage for this chat"
        onClick={(e) => e.stopPropagation()}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="shrink-0 -rotate-90"
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className={cn(hasData ? "stroke-muted" : "stroke-muted-foreground/30")}
            strokeWidth={stroke}
          />
          {hasData && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              className="stroke-primary transition-[stroke-dashoffset] duration-300"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={dashOffset}
            />
          )}
        </svg>
        <span
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums leading-none",
            hasData ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {hasData && pct != null ? `${Math.round(pct)}%` : "—"}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs">
        {hasData ? (
          <p>
            {total.toLocaleString()} /{" "}
            {max > 0 ? max.toLocaleString() : "—"} tokens (
            {pct != null ? pct.toFixed(1) : "0"}%)
          </p>
        ) : (
          <p className="text-muted-foreground">
            No context snapshot yet. Send a message in this chat while the agent
            is running to update usage.
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
