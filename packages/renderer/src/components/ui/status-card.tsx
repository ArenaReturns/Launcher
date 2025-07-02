import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

const statusCardVariants = cva("rounded-lg p-4 border", {
  variants: {
    variant: {
      default: "bg-blue-500/10 border-blue-500/20 text-blue-400",
      success: "bg-green-500/10 border-green-500/20 text-green-400",
      warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-500",
      error: "bg-red-600/20 border-red-500/30 text-red-400",
      info: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const iconMap = {
  default: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
};

interface StatusCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusCardVariants> {
  title?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
}

const StatusCard = React.forwardRef<HTMLDivElement, StatusCardProps>(
  (
    {
      className,
      variant = "default",
      title,
      description,
      icon,
      children,
      ...props
    },
    ref
  ) => {
    const Icon = icon || iconMap[variant || "default"];

    return (
      <div
        ref={ref}
        className={cn(statusCardVariants({ variant }), className)}
        {...props}
      >
        <div className="flex items-start">
          <Icon className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            {title && <p className="font-medium mb-1">{title}</p>}
            {description && <p className="text-sm opacity-80">{description}</p>}
            {children}
          </div>
        </div>
      </div>
    );
  }
);
StatusCard.displayName = "StatusCard";

export { StatusCard };
