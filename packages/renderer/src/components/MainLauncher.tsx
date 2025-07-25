import React, { useState, useEffect } from "react";
import { TitleBar } from "./TitleBar";
import { SettingsMenu } from "./SettingsMenu";
import { Navigation } from "./launcher/Navigation";
import { GameTab } from "./launcher/GameTab";
import { TwitchTab } from "./launcher/TwitchTab";
import { ReplaysTab } from "./launcher/ReplaysTab";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SettingsState } from "@/types";
import { system } from "@app/preload";
import log from "@/utils/logger";
import backgroundImage from "@/assets/background.jpg";

interface MainLauncherProps {
  updateStatus?: UpdateStatus;
  initialSettings: SettingsState;
}

export const MainLauncher: React.FC<MainLauncherProps> = ({
  updateStatus,
  initialSettings,
}) => {
  const [activeTab, setActiveTab] = useState("game");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showDevModeDialog, setShowDevModeDialog] = useState(false);
  const [settings, setSettings] = useState<SettingsState>(initialSettings);

  // Konami code state
  const [konamiSequence, setKonamiSequence] = useState<string>("");
  const targetSequence = "devmode";

  const saveSettings = async (newSettings: SettingsState) => {
    try {
      await system.saveSettings(newSettings);
      setSettings(newSettings); // Update local state with saved settings
    } catch (error) {
      log.error("Failed to save settings:", error);
      throw error; // Re-throw so UI can handle the error
    }
  };

  // Konami code detection
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      const newSequence = konamiSequence + event.key.toLowerCase();

      if (targetSequence.startsWith(newSequence)) {
        setKonamiSequence(newSequence);

        if (newSequence === targetSequence) {
          // Konami code completed
          setShowDevModeDialog(true);
          setSettings((prev) => ({ ...prev, devModeEnabled: true }));
          setKonamiSequence("");
        }
      } else {
        // Reset if sequence doesn't match
        setKonamiSequence(event.key.toLowerCase());
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [konamiSequence]);

  return (
    <div
      className="h-screen w-full text-white flex flex-col overflow-hidden animate-in fade-in duration-500 relative"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/70 z-0"></div>

      {/* Content container */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Title Bar */}
        <TitleBar onSettingsClick={() => setIsSettingsOpen(true)} />

        {/* Navigation */}
        <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Main Content */}
        <div className="flex-1 px-6 pb-6 overflow-hidden">
          {activeTab === "game" && (
            <GameTab updateStatus={updateStatus} settings={settings} />
          )}
          {activeTab === "replays" && <ReplaysTab />}
          {activeTab === "twitch" && <TwitchTab />}
        </div>

        {/* Settings Menu */}
        <SettingsMenu
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onSaveSettings={saveSettings}
        />

        {/* Developer Mode Activation Dialog */}
        <Dialog open={showDevModeDialog} onOpenChange={setShowDevModeDialog}>
          <DialogContent className="bg-black/40 backdrop-blur-md border-white/20 text-white">
            <DialogHeader>
              <DialogTitle className="text-yellow-400 text-xl">
                🎉 Mode développeur activé
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-white/80">
                Le mode développeur a été activé ! Vous pouvez maintenant
                accéder à des paramètres avancés dans le menu des paramètres.
              </p>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <p className="text-yellow-400 text-sm">
                  ⚠️ Attention : Ces paramètres sont destinés aux développeurs
                  et peuvent affecter le fonctionnement du jeu.
                </p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button
                onClick={() => setShowDevModeDialog(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
              >
                Compris
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
