import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-2xl border border-sand-150 bg-sand-50 text-bark placeholder:text-text-tertiary px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sunlight/60 focus:border-bark/20 transition-shadow";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={cn(fieldBase, className)} {...rest} />
  ),
);
Input.displayName = "BrcInput";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn(fieldBase, "leading-relaxed resize-y", className)}
      {...rest}
    />
  ),
);
Textarea.displayName = "BrcTextarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...rest }, ref) => (
    <select ref={ref} className={cn(fieldBase, "appearance-none pr-10", className)} {...rest}>
      {children}
    </select>
  ),
);
Select.displayName = "BrcSelect";

export function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "block text-xs font-medium uppercase tracking-wide text-text-secondary mb-1.5",
        className,
      )}
      {...rest}
    />
  );
}
