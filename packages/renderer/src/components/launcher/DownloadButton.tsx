import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, Play, Pause, AlertCircle, RotateCw } from "lucide-react";
import { gameClient, ipcEvents } from "@/lib/electronAPI";
import log from "@/utils/logger";

interface DownloadButtonProps {
  gameStatus?: GameStatus;
  onDownloadComplete?: () => void;
  onDownloadStateChange?: (isDownloading: boolean) => void;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  gameStatus,
  onDownloadComplete,
  onDownloadStateChange,
}) => {
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    filesTotal: 0,
    filesLoaded: 0,
    isDownloading: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [recentlyLaunched, setRecentlyLaunched] = useState(false);
  const [stateConfirmed, setStateConfirmed] = useState(false);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      // Clear any pending timeout when component unmounts
      setRecentlyLaunched(false);
    };
  }, []);

  // Confirm state when gameStatus is received
  useEffect(() => {
    if (gameStatus !== undefined) {
      setStateConfirmed(true);
    }
  }, [gameStatus]);

  // Notify parent of download state changes
  useEffect(() => {
    const isCurrentlyDownloading =
      downloadProgress.isDownloading || (isLoading && !isCheckingForUpdates);
    if (onDownloadStateChange) {
      onDownloadStateChange(isCurrentlyDownloading);
    }
  }, [
    downloadProgress.isDownloading,
    isLoading,
    isCheckingForUpdates,
    onDownloadStateChange,
  ]);

  // Event-driven approach: Listen to IPC events and fetch initial state
  useEffect(() => {
    // Fetch initial download progress state immediately
    const fetchInitialState = async () => {
      try {
        const progress = await gameClient.getDownloadProgress();
        setDownloadProgress(progress);
      } catch (error) {
        log.error("Failed to get initial download progress:", error);
      }
    };

    fetchInitialState();

    // Event handlers for download progress updates
    const handleDownloadStarted = (progress: DownloadProgress) => {
      setDownloadProgress(progress);
    };

    const handleDownloadProgress = (progress: DownloadProgress) => {
      setDownloadProgress(progress);
    };

    const handleDownloadComplete = (progress: DownloadProgress) => {
      setDownloadProgress(progress);
      if (onDownloadComplete) {
        onDownloadComplete();
      }
    };

    const handleDownloadCancelled = (progress: DownloadProgress) => {
      setDownloadProgress(progress);
    };

    const handleDownloadError = (progress: DownloadProgress) => {
      setDownloadProgress(progress);
    };

    // Register event listeners
    ipcEvents.on("game:download-started", handleDownloadStarted);
    ipcEvents.on("game:download-progress", handleDownloadProgress);
    ipcEvents.on("game:download-complete", handleDownloadComplete);
    ipcEvents.on("game:download-cancelled", handleDownloadCancelled);
    ipcEvents.on("game:download-error", handleDownloadError);

    // Cleanup event listeners on unmount
    return () => {
      ipcEvents.off("game:download-started", handleDownloadStarted);
      ipcEvents.off("game:download-progress", handleDownloadProgress);
      ipcEvents.off("game:download-complete", handleDownloadComplete);
      ipcEvents.off("game:download-cancelled", handleDownloadCancelled);
      ipcEvents.off("game:download-error", handleDownloadError);
    };
  }, [onDownloadComplete]);

  const handleStartDownload = async () => {
    try {
      setIsLoading(true);
      await gameClient.startDownload();
    } catch (error) {
      log.error("Failed to start download:", error);
      setDownloadProgress({
        ...downloadProgress,
        error:
          error instanceof Error ? error.message : "Failed to start download",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelDownload = async () => {
    try {
      await gameClient.cancelDownload();
    } catch (error) {
      log.error("Failed to cancel download:", error);
    }
  };

  const handleRetryDownload = async () => {
    setDownloadProgress({
      filesTotal: 0,
      filesLoaded: 0,
      isDownloading: false,
      error: undefined,
    });
    await handleStartDownload();
  };

  const handleLaunchGame = async () => {
    try {
      setIsLoading(true);
      setIsCheckingForUpdates(true);

      // Check for updates before launching
      const updatedStatus = await gameClient.checkForUpdates();

      if (updatedStatus.needsUpdate) {
        // Reset loading states before returning
        setIsLoading(false);
        setIsCheckingForUpdates(false);

        // If update is needed, refresh the parent component
        if (onDownloadComplete) {
          onDownloadComplete();
        }
        return;
      }

      // Keep checking state true during launch to prevent progress bar flash
      // Launch the game
      await gameClient.launchGame();

      // Reset loading states immediately after successful launch
      setIsLoading(false);
      setIsCheckingForUpdates(false);

      // Set recently launched state to prevent double-clicking
      setRecentlyLaunched(true);

      // Re-enable button after game has time to start
      setTimeout(() => {
        setRecentlyLaunched(false);
      }, 1500);
    } catch (error) {
      log.error("Failed to launch game:", error);
      setDownloadProgress({
        ...downloadProgress,
        error: error instanceof Error ? error.message : "Failed to launch game",
      });
    } finally {
      setIsLoading(false);
      setIsCheckingForUpdates(false);
    }
  };

  const getButtonContent = () => {
    // If download is in progress or loading (but not just checking for updates)
    if (
      downloadProgress.isDownloading ||
      (isLoading && !isCheckingForUpdates)
    ) {
      const progressPercent =
        downloadProgress.filesTotal > 0
          ? (downloadProgress.filesLoaded / downloadProgress.filesTotal) * 100
          : 0;

      const getStatusText = () => {
        if (downloadProgress.currentFile) {
          // If it's a verification phase or repair verification
          if (
            downloadProgress.currentFile.includes("Vérification") ||
            downloadProgress.currentFile.includes("vérification") ||
            downloadProgress.currentFile.includes("intégrité")
          ) {
            return downloadProgress.currentFile;
          }

          // If we're at the beginning with 0 progress and no specific verification text,
          // we're likely verifying files
          if (progressPercent === 0 && downloadProgress.filesTotal > 0) {
            return "Vérification des fichiers...";
          }

          // Regular file download/repair
          const fileName = downloadProgress.currentFile.split("/").pop();
          return downloadProgress.isRepairing
            ? `Réparation: ${fileName}`
            : `Téléchargement: ${fileName}`;
        }

        // Loading states
        if (isLoading) {
          return downloadProgress.isRepairing
            ? "Préparation de la réparation..."
            : "Préparation du téléchargement...";
        }

        // Default states
        return downloadProgress.isRepairing
          ? "Réparation en cours..."
          : "Téléchargement en cours...";
      };

      return (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-white/70">
            <span>{getStatusText()}</span>
            <span>
              {downloadProgress.filesTotal > 0
                ? `${downloadProgress.filesLoaded}/${downloadProgress.filesTotal}`
                : "Initialisation..."}
            </span>
          </div>
          <Progress
            value={downloadProgress.filesTotal > 0 ? progressPercent : 0}
            className="w-full h-3"
          />
          <Button
            onClick={handleCancelDownload}
            variant="outline"
            size="lg"
            className="w-full h-14 border-white/20 text-white hover:bg-white/10 transition-all duration-200 text-lg font-bold cursor-pointer"
          >
            <Pause className="h-5 w-5 mr-3" />
            {downloadProgress.isRepairing ? "ANNULER LA RÉPARATION" : "ANNULER"}
          </Button>
        </div>
      );
    }

    // If there's a download error
    if (downloadProgress.error) {
      return (
        <Button
          onClick={handleRetryDownload}
          variant="destructive"
          size="lg"
          className="w-full h-14 transition-all duration-200 text-lg font-bold"
          disabled={
            !stateConfirmed ||
            isLoading ||
            isCheckingForUpdates ||
            recentlyLaunched ||
            downloadProgress.isDownloading
          }
        >
          <AlertCircle className="h-5 w-5 mr-3" />
          RÉESSAYER
        </Button>
      );
    }

    // If game is not installed
    if (!gameStatus?.isInstalled) {
      return (
        <Button
          onClick={handleStartDownload}
          size="lg"
          className="w-full h-14 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold text-lg transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer"
          disabled={
            !stateConfirmed ||
            isLoading ||
            isCheckingForUpdates ||
            recentlyLaunched ||
            downloadProgress.isDownloading
          }
        >
          {isLoading ||
          isCheckingForUpdates ||
          recentlyLaunched ||
          downloadProgress.isDownloading ? (
            <RotateCw className="h-5 w-5 mr-3 animate-spin" />
          ) : (
            <Download className="h-5 w-5 mr-3" />
          )}
          TÉLÉCHARGER
        </Button>
      );
    }

    // If game needs update
    if (gameStatus?.needsUpdate) {
      return (
        <Button
          onClick={handleStartDownload}
          size="lg"
          className="w-full h-14 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold text-lg transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer"
          disabled={
            !stateConfirmed ||
            isLoading ||
            isCheckingForUpdates ||
            recentlyLaunched ||
            downloadProgress.isDownloading
          }
        >
          {isLoading ||
          isCheckingForUpdates ||
          recentlyLaunched ||
          downloadProgress.isDownloading ? (
            <RotateCw className="h-5 w-5 mr-3 animate-spin" />
          ) : (
            <Download className="h-5 w-5 mr-3" />
          )}
          METTRE À JOUR
        </Button>
      );
    }

    // If game is installed and up to date
    return (
      <Button
        onClick={handleLaunchGame}
        size="lg"
        className="w-full h-14 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold text-lg transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer"
        disabled={
          !stateConfirmed ||
          isLoading ||
          isCheckingForUpdates ||
          recentlyLaunched ||
          downloadProgress.isDownloading
        }
      >
        {isLoading ||
        isCheckingForUpdates ||
        recentlyLaunched ||
        downloadProgress.isDownloading ? (
          <RotateCw className="h-5 w-5 mr-3 animate-spin" />
        ) : (
          <Play className="h-5 w-5 mr-3" />
        )}
        {downloadProgress.isDownloading
          ? downloadProgress.isRepairing
            ? "RÉPARATION..."
            : "TÉLÉCHARGEMENT..."
          : recentlyLaunched
          ? "DÉMARRAGE..."
          : "JOUER"}
      </Button>
    );
  };

  return getButtonContent();
};
