import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Minus, Settings } from "lucide-react";

interface TitleBarProps {
  title?: string;
  className?: string;
  onSettingsClick?: () => void;
}

interface WindowControlsAPI {
  minimize: () => Promise<void>;
  close: () => Promise<void>;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  title = "Arena Returns Launcher",
  className = "",
  onSettingsClick,
}) => {
  const [windowControls, setWindowControls] =
    useState<WindowControlsAPI | null>(null);

  useEffect(() => {
    // Get window controls from the preload script
    const controlsKey = btoa("windowControls");
    const controls = (window as unknown as Record<string, unknown>)[
      controlsKey
    ] as WindowControlsAPI;
    setWindowControls(controls);
  }, []);

  const handleMinimize = () => {
    if (windowControls) {
      windowControls.minimize();
    }
  };

  const handleClose = () => {
    if (windowControls) {
      windowControls.close();
    }
  };

  return (
    <div
      className={`flex items-center justify-between h-8 bg-black/80 backdrop-blur-sm border-b border-white/10 ${className}`}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Title */}
      <div className="flex-1 flex items-center px-4">
        <span className="text-white/80 text-base font-medium select-none">
          {title}
        </span>
      </div>

      {/* Window Controls */}
      <div
        className="flex items-center"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {onSettingsClick && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSettingsClick}
            className="h-8 w-8 p-0 text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200 rounded-none"
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={handleMinimize}
          className="h-8 w-8 p-0 text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200 rounded-none"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleClose}
          className="h-8 w-8 p-0 text-white/70 hover:text-white hover:bg-red-500/50 transition-all duration-200 rounded-none"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
