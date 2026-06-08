import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-sand-100 border border-sand-150 p-6 md:p-8",
        className,
      )}
      {...rest}
    />
  );
}

export function InfoCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-sand-100 border border-sand-150 p-6",
        className,
      )}
      {...rest}
    />
  );
}

export function WarningCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-sunlight/20 border border-sunlight text-bark p-4",
        className,
      )}
      {...rest}
    />
  );
}
