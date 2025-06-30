import React from "react";
import { Gamepad2, Trophy, Tv, Video } from "lucide-react";

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

interface TabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  disabled?: boolean;
}

const tabs: TabConfig[] = [
  { id: "game", label: "JOUER", icon: Gamepad2, color: "bg-orange-900" },
  {
    id: "replays",
    label: "REPLAYS",
    icon: Video,
    color: "bg-orange-900",
  },
  {
    id: "ladder",
    label: "LADDER",
    icon: Trophy,
    color: "bg-yellow-700",
    disabled: true,
  },
  {
    id: "twitch",
    label: "TWITCH",
    icon: Tv,
    color: "bg-purple-600",
    disabled: true,
  },
];

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  const handleTabClick = (tabId: string, disabled?: boolean) => {
    if (!disabled) {
      onTabChange(tabId);
    }
  };

  return (
    <div className="w-full pt-4 pb-8">
      <div className="flex justify-center">
        <div className="relative">
          {/* Navigation tabs with dark background */}
          <div className="flex bg-black/30 backdrop-blur-sm rounded-lg border border-white/10 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id, tab.disabled)}
                className={`flex flex-col items-center px-8 py-3 rounded-md transition-all duration-200 ${
                  tab.disabled
                    ? "text-white/30 cursor-not-allowed"
                    : activeTab === tab.id
                    ? `${tab.color} text-white shadow-lg cursor-pointer`
                    : "text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
                }`}
                disabled={tab.disabled}
              >
                <tab.icon className="h-5 w-5 mb-1" />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* "Coming soon" text positioned below specific tabs */}
          <div className="absolute top-full mt-1 left-0 right-0 flex">
            {tabs.map((tab) => (
              <div
                key={`text-${tab.id}`}
                className="flex-1 flex justify-center -ml-2"
              >
                {tab.disabled && (
                  <span className="text-sm text-white/40">Coming soon !</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
