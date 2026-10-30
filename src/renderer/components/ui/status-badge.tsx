import { cva, type VariantProps } from "class-variance-authority";
import { STATUS_ICON, STATUS_TEXT, statusIntent } from "@/lib/status";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 uppercase [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        text: "",
        pill: "rounded-md border border-current/30 bg-current/10 px-1.5 py-0.5 text-xs leading-none",
      },
    },
    defaultVariants: {
      variant: "text",
    },
  },
);

export type StatusBadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof statusBadgeVariants> & {
    status: string;

    icon?: boolean;

    dot?: boolean;

    label?: boolean;
  };

export function StatusBadge({
  status,
  variant,
  icon,
  dot,
  label = true,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  const intent = statusIntent(status);
  const Icon = STATUS_ICON[intent];

  return (
    <span
      data-slot="status-badge"
      data-status={intent}
      className={cn(statusBadgeVariants({ variant }), STATUS_TEXT[intent], className)}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {icon && !dot && <Icon className="size-3.5" />}
      {label && (children ?? status)}
    </span>
  );
}

export { statusBadgeVariants };
