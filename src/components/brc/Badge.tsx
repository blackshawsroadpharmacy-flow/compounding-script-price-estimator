import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "ai"
  | "review"
  | "edited"
  | "matched"
  | "lowConfidence"
  | "supplier"
  | "manual"
  | "neutral";

const tones: Record<BadgeTone, string> = {
  ai: "bg-sunlight/30 text-bark",
  review: "bg-sunlight/40 text-bark",
  edited: "bg-forest/15 text-forest",
  matched: "bg-forest/15 text-forest",
  lowConfidence: "bg-sand-150 text-text-secondary",
  supplier: "bg-sky/40 text-bark",
  manual: "bg-[#7a2218]/10 text-[#7a2218]",
  neutral: "bg-sand-150 text-bark",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = "neutral", ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
