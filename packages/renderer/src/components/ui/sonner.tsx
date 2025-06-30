import * as React from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

const Toaster = ({
  ...props
}: React.ComponentPropsWithoutRef<typeof Sonner>) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as "system" | "light" | "dark"}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
