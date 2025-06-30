import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FolderOpen,
  Play,
  Wrench,
  HardDrive,
  Code,
  AlertTriangle,
} from "lucide-react";
import { SimpleSlider, SimpleSelect } from "./common/FormControls";
import type { SettingsState } from "@/types";
import { gameClient, system, ipcEvents } from "@/lib/electronAPI";
import log from "@/utils/logger";

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsState;
  onSettingsChange: (settings: SettingsState) => void;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}) => {
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    filesTotal: 0,
    filesLoaded: 0,
    isDownloading: false,
  });
  const [appVersion, setAppVersion] = useState<string>("");
  const [logDirectory, setLogDirectory] = useState<string>("");
  const [isRepairing, setIsRepairing] = useState(false);

  // Event-driven download progress updates when settings menu is open
  useEffect(() => {
    if (!isOpen) return;

    // Fetch initial download progress state immediately
    const fetchInitialState = async () => {
      try {
        const progress = await gameClient.getDownloadProgress();
        setDownloadProgress(progress);
        setIsRepairing(progress.isDownloading && progress.isRepairing);
      } catch (error) {
        log.error("Failed to get initial download progress:", error);
      }
    };

    fetchInitialState();

    // Event handlers for download progress updates
    const handleDownloadStarted = (progress: DownloadProgress) => {
      setDownloadProgress(progress);
      setIsRepairing(progress.isRepairing || false);
    };

    const handleDownloadProgress = (progress: DownloadProgress) => {
      setDownloadProgress(progress);
      setIsRepairing(progress.isRepairing || false);
    };

    const handleDownloadComplete = (progress: DownloadProgress) => {
      setDownloadProgress(progress);
      setIsRepairing(false);
    };

    const handleDownloadCancelled = (progress: DownloadProgress) => {
      setDownloadProgress(progress);
      setIsRepairing(false);
    };

    const handleDownloadError = (progress: DownloadProgress) => {
      setDownloadProgress(progress);
      setIsRepairing(false);
    };

    // Register event listeners
    ipcEvents.on("game:download-started", handleDownloadStarted);
    ipcEvents.on("game:download-progress", handleDownloadProgress);
    ipcEvents.on("game:download-complete", handleDownloadComplete);
    ipcEvents.on("game:download-cancelled", handleDownloadCancelled);
    ipcEvents.on("game:download-error", handleDownloadError);

    // Cleanup event listeners when menu closes
    return () => {
      ipcEvents.off("game:download-started", handleDownloadStarted);
      ipcEvents.off("game:download-progress", handleDownloadProgress);
      ipcEvents.off("game:download-complete", handleDownloadComplete);
      ipcEvents.off("game:download-cancelled", handleDownloadCancelled);
      ipcEvents.off("game:download-error", handleDownloadError);
    };
  }, [isOpen]);

  // Fetch app version and log directory when settings menu opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchSystemInfo = async () => {
      try {
        const [version, logDir] = await Promise.all([
          system.getAppVersion(),
          system.getLogDirectory(),
        ]);
        setAppVersion(version);
        setLogDirectory(logDir);
      } catch (error) {
        log.error("Failed to get system info:", error);
        setAppVersion("Version inconnue");
        setLogDirectory("");
      }
    };

    fetchSystemInfo();
  }, [isOpen]);

  const updateSetting = (key: keyof SettingsState, value: unknown) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  };

  const handleOpenGameDirectory = async () => {
    try {
      await gameClient.openGameDirectory();
    } catch (error) {
      log.error("Failed to open game directory:", error);
    }
  };

  const handleOpenReplaysFolder = async () => {
    try {
      await gameClient.openReplaysFolder();
    } catch (error) {
      log.error("Failed to open replays folder:", error);
    }
  };

  const handleRepairClient = async () => {
    if (downloadProgress.isDownloading || isRepairing) return;

    try {
      // Set immediate loading state
      setIsRepairing(true);
      await gameClient.repairClient();
      // Progress will be tracked via the polling mechanism
    } catch (error) {
      log.error("Failed to repair client:", error);
      setIsRepairing(false);
      // Show error notification
    }
  };

  const handleOpenLogDirectory = async () => {
    try {
      await system.openLogDirectory();
    } catch (error) {
      log.error("Failed to open log directory:", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="!max-w-none !w-[80vw] max-h-[85vh] overflow-y-auto bg-black/40 backdrop-blur-md border-white/20 text-white [&>button]:text-white [&>button]:hover:bg-white/20 [&>button]:opacity-100 [&>button]:w-8 [&>button]:h-8 [&>button]:rounded-md [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:cursor-pointer"
        style={{ width: "80vw", maxWidth: "none" }}
      >
        <DialogHeader>
          <DialogTitle className="text-white text-2xl">Paramètres</DialogTitle>
          <DialogDescription className="text-white/60">
            Configurez les paramètres du jeu et du launcher
          </DialogDescription>
          {appVersion && (
            <div className="text-white/50 text-sm mt-2">
              Version du launcher: {appVersion}
            </div>
          )}
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Game Management */}
          <Card className="bg-black/30 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <FolderOpen className="h-5 w-5 mr-2" />
                Gestion du jeu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                className="w-full justify-start bg-white/5 border-white/20 text-white hover:bg-white/10 cursor-pointer"
                onClick={handleOpenGameDirectory}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Ouvrir le répertoire du jeu
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start bg-white/5 border-white/20 text-white hover:bg-white/10 cursor-pointer"
                onClick={handleOpenReplaysFolder}
              >
                <Play className="h-4 w-4 mr-2" />
                Ouvrir le dossier des replays
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start bg-white/5 border-white/20 text-white hover:bg-white/10 cursor-pointer"
                onClick={handleRepairClient}
                disabled={downloadProgress.isDownloading || isRepairing}
              >
                <Wrench className="h-4 w-4 mr-2" />
                {downloadProgress.isDownloading || isRepairing
                  ? downloadProgress.isRepairing || isRepairing
                    ? "Réparation en cours..."
                    : "Téléchargement en cours..."
                  : "Réparer le client de jeu"}
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start bg-white/5 border-white/20 text-white hover:bg-white/10 cursor-pointer"
                onClick={handleOpenLogDirectory}
                disabled={!logDirectory}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Ouvrir les logs du launcher
              </Button>
            </CardContent>
          </Card>

          {/* Performance Settings */}
          <Card className="bg-black/30 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <HardDrive className="h-5 w-5 mr-2" />
                Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-white/80 text-base block mb-2">
                  RAM allouée au jeu: {settings.gameRamAllocation} GB
                </label>
                <SimpleSlider
                  value={settings.gameRamAllocation}
                  onChange={(value) =>
                    updateSetting("gameRamAllocation", Math.max(1, value))
                  }
                  max={6}
                  step={1}
                />
                <p className="text-white/60 text-sm mt-2">
                  Le client Dofus Arena fonctionne très bien avec 1 ou 2GB de
                  RAM et il est rare d'avoir besoin de plus.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Developer Mode - Only show if enabled */}
          {settings.devModeEnabled && (
            <Card className="bg-black/30 border-white/10 md:col-span-2">
              <CardHeader>
                <CardTitle className="text-yellow-400 flex items-center">
                  <Code className="h-5 w-5 mr-2" />
                  Mode développeur
                  <AlertTriangle className="h-4 w-4 ml-2 text-yellow-400" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <p className="text-yellow-400 text-sm">
                    ⚠️ Ces paramètres sont destinés aux développeurs. Une
                    mauvaise configuration peut empêcher le jeu de fonctionner.
                  </p>
                </div>

                <div>
                  <label className="text-white/80 text-base block mb-2">
                    Environnement CDN
                  </label>
                  <SimpleSelect
                    value={settings.devCdnEnvironment}
                    onChange={(value) =>
                      updateSetting(
                        "devCdnEnvironment",
                        value as "production" | "staging"
                      )
                    }
                    options={[
                      { value: "production", label: "Production" },
                      { value: "staging", label: "Staging" },
                    ]}
                  />
                </div>

                <div>
                  <label className="text-white/80 text-base block mb-2">
                    Forcer une version spécifique
                  </label>
                  <input
                    type="text"
                    value={settings.devForceVersion}
                    onChange={(e) =>
                      updateSetting("devForceVersion", e.target.value)
                    }
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-md text-white placeholder-white/40"
                    placeholder="ex: 1.2.3 (laisser vide pour la dernière version)"
                  />
                </div>

                <div>
                  <label className="text-white/80 text-base block mb-2">
                    Arguments Java supplémentaires
                  </label>
                  <textarea
                    value={settings.devExtraJavaArgs}
                    onChange={(e) =>
                      updateSetting("devExtraJavaArgs", e.target.value)
                    }
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-md text-white placeholder-white/40 h-24 resize-none"
                    placeholder="ex: -Ddebug=true -Xdebug"
                  />
                  <p className="text-white/60 text-sm mt-1">
                    Arguments additionnels passés à la JVM lors du lancement du
                    jeu.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex justify-end space-x-2 mt-6 pt-4 border-t border-white/10">
          <Button
            variant="outline"
            size="default"
            onClick={onClose}
            className="cursor-pointer"
          >
            Annuler
          </Button>
          <Button
            onClick={onClose}
            size="default"
            className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
          >
            Sauvegarder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
