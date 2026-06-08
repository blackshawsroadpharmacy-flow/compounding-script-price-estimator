import { cn } from "@/lib/cn";

export interface StepDef {
  id: number;
  label: string;
}

interface StepperProps {
  steps: StepDef[];
  current: number;
  onSelect?: (id: number) => void;
}

export function Stepper({ steps, current, onSelect }: StepperProps) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s) => {
        const state =
          s.id === current ? "current" : s.id < current ? "done" : "todo";
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect?.(s.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                state === "current" && "bg-bark text-text-inverted",
                state === "done" && "bg-forest text-text-inverted",
                state === "todo" &&
                  "bg-sand-100 text-text-secondary border border-sand-150 hover:bg-sand-150",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                  state === "current" && "bg-text-inverted/15",
                  state === "done" && "bg-text-inverted/15",
                  state === "todo" && "bg-sand-150",
                )}
              >
                {s.id}
              </span>
              {s.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
