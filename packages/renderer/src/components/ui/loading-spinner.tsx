import * as React from "react";
import { RotateCw } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const loadingSpinnerVariants = cva("animate-spin", {
  variants: {
    size: {
      default: "h-4 w-4",
      sm: "h-3 w-3",
      lg: "h-6 w-6",
      xl: "h-8 w-8",
      xxl: "h-16 w-16",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

interface LoadingSpinnerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof loadingSpinnerVariants> {
  text?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

const LoadingSpinner = React.forwardRef<HTMLDivElement, LoadingSpinnerProps>(
  ({ className, size, text, icon: Icon = RotateCw, ...props }, ref) => {
    if (text) {
      return (
        <div
          ref={ref}
          className={cn(
            "flex items-center justify-center text-white/50",
            className
          )}
          {...props}
        >
          <div className="text-center">
            <Icon
              className={cn(loadingSpinnerVariants({ size }), "mx-auto mb-4")}
            />
            <p className="text-xl font-bold">{text}</p>
          </div>
        </div>
      );
    }

    return (
      <div ref={ref} className={cn("inline-block", className)} {...props}>
        <Icon className={cn(loadingSpinnerVariants({ size }))} />
      </div>
    );
  }
);
LoadingSpinner.displayName = "LoadingSpinner";

export { LoadingSpinner };
