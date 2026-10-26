import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

type SwitchProps = SwitchPrimitive.Root.Props & {
  label: string;
};

export function Switch({ className, label, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      aria-label={label}
      className={cn(
        "flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-muted p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-5 rounded-full bg-background shadow-sm transition-transform data-checked:translate-x-5" />
    </SwitchPrimitive.Root>
  );
}
