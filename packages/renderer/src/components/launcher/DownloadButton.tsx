import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, Play, Pause, AlertCircle, RotateCw } from "lucide-react";
import { useGameStateContext } from "@/contexts/GameStateContext";
import log from "@/utils/logger";

interface DownloadButtonProps {
  onDownloadComplete?: () => void;
  onDownloadStateChange?: (isDownloading: boolean) => void;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  onDownloadComplete,
  onDownloadStateChange,
}) => {
  const { gameState, gameActions } = useGameStateContext();
  const [recentlyLaunched, setRecentlyLaunched] = useState(false);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      // Clear any pending timeout when component unmounts
      setRecentlyLaunched(false);
    };
  }, []);

  // Notify parent of download state changes
  useEffect(() => {
    if (onDownloadStateChange) {
      onDownloadStateChange(gameState.isDownloading);
    }
  }, [gameState.isDownloading, onDownloadStateChange]);

  // Notify parent when download completes
  useEffect(() => {
    if (onDownloadComplete && !gameState.isDownloading && gameState.isReady) {
      onDownloadComplete();
    }
  }, [gameState.isDownloading, gameState.isReady, onDownloadComplete]);

  const handleStartDownload = async () => {
    try {
      await gameActions.startDownload();
    } catch (error) {
      log.error("Failed to start download:", error);
    }
  };

  const handleCancelDownload = async () => {
    try {
      await gameActions.cancelDownload();
    } catch (error) {
      log.error("Failed to cancel download:", error);
    }
  };

  const handleRetryDownload = async () => {
    gameActions.clearError();
    await handleStartDownload();
  };

  const handleLaunchGame = async () => {
    try {
      await gameActions.launchGame();

      // Set recently launched state to prevent double-clicking
      setRecentlyLaunched(true);

      // Re-enable button after game has time to start
      setTimeout(() => {
        setRecentlyLaunched(false);
      }, 1500);
    } catch (error) {
      log.error("Failed to launch game:", error);
    }
  };

  const getButtonContent = () => {
    // If download is in progress or loading (but not just checking for updates)
    if (gameState.isDownloading) {
      const progressPercent =
        gameState.downloadProgress.filesTotal > 0
          ? (gameState.downloadProgress.filesLoaded /
              gameState.downloadProgress.filesTotal) *
            100
          : 0;

      const getStatusText = () => {
        if (gameState.downloadProgress.currentFile) {
          // If it's a verification phase or repair verification
          if (
            gameState.downloadProgress.currentFile.includes("Vérification") ||
            gameState.downloadProgress.currentFile.includes("vérification") ||
            gameState.downloadProgress.currentFile.includes("intégrité")
          ) {
            return gameState.downloadProgress.currentFile;
          }

          // If we're at the beginning with 0 progress and no specific verification text,
          // we're likely verifying files
          if (
            progressPercent === 0 &&
            gameState.downloadProgress.filesTotal > 0
          ) {
            return "Vérification des fichiers...";
          }

          // Regular file download/repair
          const fileName = gameState.downloadProgress.currentFile
            .split("/")
            .pop();
          return gameState.isRepairing
            ? `Réparation: ${fileName}`
            : `Téléchargement: ${fileName}`;
        }

        // Default states
        return gameState.isRepairing
          ? "Réparation en cours..."
          : "Téléchargement en cours...";
      };

      return (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-white/70">
            <span>{getStatusText()}</span>
            <span>
              {gameState.downloadProgress.filesTotal > 0
                ? `${gameState.downloadProgress.filesLoaded}/${gameState.downloadProgress.filesTotal}`
                : "Initialisation..."}
            </span>
          </div>
          <Progress
            value={
              gameState.downloadProgress.filesTotal > 0 ? progressPercent : 0
            }
            className="w-full h-3"
          />
          <Button
            onClick={handleCancelDownload}
            variant="outline"
            size="lg"
            className="w-full h-14 border-white/20 text-white hover:bg-white/10 transition-all duration-200 text-lg font-bold cursor-pointer"
          >
            <Pause className="h-5 w-5 mr-3" />
            {gameState.isRepairing ? "ANNULER LA RÉPARATION" : "ANNULER"}
          </Button>
        </div>
      );
    }

    // If there's a download error
    if (gameState.error) {
      return (
        <Button
          onClick={handleRetryDownload}
          variant="destructive"
          size="lg"
          className="w-full h-14 transition-all duration-200 text-lg font-bold cursor-pointer"
          disabled={
            !gameState.canStartDownload ||
            recentlyLaunched ||
            gameState.isDownloading
          }
        >
          <AlertCircle className="h-5 w-5 mr-3" />
          RÉESSAYER
        </Button>
      );
    }

    // If game is not installed
    if (!gameState.isInstalled) {
      return (
        <Button
          onClick={handleStartDownload}
          size="lg"
          className="w-full h-14 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold text-lg transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer"
          disabled={
            !gameState.canStartDownload ||
            recentlyLaunched ||
            gameState.isDownloading
          }
        >
          {gameState.isCheckingStatus ||
          recentlyLaunched ||
          gameState.isDownloading ? (
            <RotateCw className="h-5 w-5 mr-3 animate-spin" />
          ) : (
            <Download className="h-5 w-5 mr-3" />
          )}
          TÉLÉCHARGER
        </Button>
      );
    }

    // If game needs update
    if (gameState.needsUpdate) {
      return (
        <Button
          onClick={handleStartDownload}
          size="lg"
          className="w-full h-14 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold text-lg transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer"
          disabled={
            !gameState.canStartDownload ||
            recentlyLaunched ||
            gameState.isDownloading
          }
        >
          {gameState.isCheckingStatus ||
          recentlyLaunched ||
          gameState.isDownloading ? (
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
          !gameState.canLaunch || recentlyLaunched || gameState.isDownloading
        }
      >
        {gameState.isLaunching ||
        recentlyLaunched ||
        gameState.isDownloading ? (
          <RotateCw className="h-5 w-5 mr-3 animate-spin" />
        ) : (
          <Play className="h-5 w-5 mr-3" />
        )}
        {gameState.isDownloading
          ? gameState.isRepairing
            ? "RÉPARATION..."
            : "TÉLÉCHARGEMENT..."
          : gameState.isLaunching
          ? "LANCEMENT..."
          : recentlyLaunched
          ? "DÉMARRAGE..."
          : "JOUER"}
      </Button>
    );
  };

  return getButtonContent();
};
