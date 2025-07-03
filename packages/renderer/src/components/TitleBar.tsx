import React from "react";
import { Settings, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { windowControls } from "@app/preload";

interface TitleBarProps {
  title?: string;
  className?: string;
  onSettingsClick?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  title = "Arena Returns Launcher",
  className = "",
  onSettingsClick,
}) => {
  const handleMinimize = () => {
    windowControls.minimize();
  };

  const handleClose = () => {
    windowControls.close();
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

      {/* Settings Button */}
      <div className="flex items-center">
        {onSettingsClick && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSettingsClick}
            className="h-6 w-6 p-0 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <Settings className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Window Controls */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleMinimize}
          className="h-8 w-8 p-0 text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded-none"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClose}
          className="h-8 w-8 p-0 text-white/60 hover:text-white hover:bg-red-500/80 transition-colors rounded-none"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};
