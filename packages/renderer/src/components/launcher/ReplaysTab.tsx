import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Video,
  RefreshCw,
  Play,
  Calendar,
  Users,
  FolderOpen,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { gameClient, ipcEvents } from "@/lib/electronAPI";
import log from "@/utils/logger";

interface ReplaysTabProps {
  gameStatus?: GameStatus;
}

export const ReplaysTab: React.FC<ReplaysTabProps> = ({
  gameStatus: initialGameStatus,
}) => {
  const [replays, setReplays] = useState<ReplayFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLaunching, setIsLaunching] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [gameStatus, setGameStatus] = useState<GameStatus | undefined>(
    initialGameStatus
  );
  const [isCheckingGameStatus, setIsCheckingGameStatus] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8; // 2x4 grid for better pagination

  useEffect(() => {
    loadReplays();
    refreshGameStatus();

    // Listen for download events to disable replay launching during downloads
    const handleDownloadStarted = () => {
      setIsDownloading(true);
    };

    const handleDownloadComplete = () => {
      setIsDownloading(false);
      // Refresh game status after download completes
      refreshGameStatus();
    };

    const handleDownloadCancelled = () => {
      setIsDownloading(false);
    };

    const handleDownloadError = () => {
      setIsDownloading(false);
    };

    // Add event listeners
    ipcEvents.on("game:download-started", handleDownloadStarted);
    ipcEvents.on("game:download-complete", handleDownloadComplete);
    ipcEvents.on("game:download-cancelled", handleDownloadCancelled);
    ipcEvents.on("game:download-error", handleDownloadError);

    // Cleanup event listeners on unmount
    return () => {
      ipcEvents.off("game:download-started", handleDownloadStarted);
      ipcEvents.off("game:download-complete", handleDownloadComplete);
      ipcEvents.off("game:download-cancelled", handleDownloadCancelled);
      ipcEvents.off("game:download-error", handleDownloadError);
    };
  }, []);

  // Update gameStatus when initialGameStatus changes
  useEffect(() => {
    setGameStatus(initialGameStatus);
  }, [initialGameStatus]);

  const refreshGameStatus = async () => {
    try {
      setIsCheckingGameStatus(true);
      const currentStatus = await gameClient.getStatus();
      setGameStatus(currentStatus);
    } catch (error) {
      log.error("Failed to refresh game status:", error);
    } finally {
      setIsCheckingGameStatus(false);
    }
  };

  const loadReplays = async () => {
    try {
      setIsLoading(true);
      const replayFiles = await gameClient.listReplays();
      setReplays(replayFiles);
      // Reset to first page when loading new replays
      setCurrentPage(1);
    } catch (error) {
      log.error("Failed to load replays:", error);
      setReplays([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await Promise.all([loadReplays(), refreshGameStatus()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenReplaysFolder = async () => {
    try {
      await gameClient.openReplaysFolder();
    } catch (error) {
      log.error("Failed to open replays folder:", error);
    }
  };

  const handleLaunchReplay = async (replay: ReplayFile) => {
    // Check conditions before setting launching state
    const canLaunch =
      gameStatus?.isInstalled &&
      !gameStatus?.needsUpdate &&
      !isDownloading &&
      !isLaunching;

    if (!canLaunch) {
      return;
    }

    try {
      // Set launching state immediately after validation
      setIsLaunching(replay.filename);

      // Get current settings from localStorage for replay launch
      const savedSettings = localStorage.getItem("arenaReturnsSettings");
      let settings;
      if (savedSettings) {
        try {
          settings = JSON.parse(savedSettings);
        } catch (error) {
          log.error("Failed to parse settings:", error);
        }
      }

      await gameClient.launchReplay(replay.fullPath, settings);
    } catch (error) {
      log.error("Failed to launch replay:", error);
    } finally {
      setIsLaunching(null);
    }
  };

  const canLaunchReplay = () => {
    return (
      gameStatus?.isInstalled &&
      !gameStatus?.needsUpdate &&
      !isDownloading &&
      !isLaunching
    );
  };

  const shouldShowWarning = () => {
    // Don't show warning if we're currently launching a replay or checking game status
    if (isLaunching || isCheckingGameStatus) {
      return false;
    }
    return !canLaunchReplay();
  };

  const shouldShowGameStatusLoading = () => {
    return isCheckingGameStatus && !isLaunching;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getReplayDisplayInfo = (replay: ReplayFile) => {
    if (
      replay.isValidFormat &&
      replay.date &&
      replay.player1 &&
      replay.player2
    ) {
      return {
        title: `${replay.player1} VS ${replay.player2}`,
        subtitle: formatDate(replay.date),
        isValid: true,
      };
    } else {
      return {
        title: replay.filename,
        subtitle: "Replay inconnu",
        isValid: false,
      };
    }
  };

  // Pagination calculations
  const totalPages = Math.ceil(replays.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentReplays = replays.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  return (
    <div className="animate-in slide-in-from-left-4 duration-300 h-full">
      <div className="flex flex-col space-y-6 h-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-white/90 flex items-center">
            <Video className="h-6 w-6 mr-2 text-orange-500" />
            Mes Replays
          </h2>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-white/5 border-white/20 text-white hover:bg-white/10"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Actualiser
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/5 border-white/20 text-white hover:bg-white/10"
              onClick={handleOpenReplaysFolder}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Ouvrir le dossier
            </Button>
          </div>
        </div>

        {/* Game Status Loading */}
        {shouldShowGameStatusLoading() && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="flex items-center">
              <RefreshCw className="h-5 w-5 text-blue-500 mr-3 animate-spin" />
              <div>
                <p className="text-blue-500 font-medium">
                  Vérification de l'état du jeu...
                </p>
                <p className="text-blue-500/80 text-sm">
                  Veuillez patienter pendant la vérification
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Game Status Warning */}
        {shouldShowWarning() && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-yellow-500 mr-3" />
              <div>
                <p className="text-yellow-500 font-medium">
                  Impossible de lancer des replays
                </p>
                <p className="text-yellow-500/80 text-sm">
                  {!gameStatus?.isInstalled
                    ? "Le jeu n'est pas installé"
                    : gameStatus?.needsUpdate
                    ? "Une mise à jour du jeu est requise"
                    : isDownloading
                    ? "Téléchargement en cours"
                    : "Veuillez vérifier l'état du jeu"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-white/50">
              <RefreshCw className="h-16 w-16 mx-auto mb-4 animate-spin" />
              <h3 className="text-xl font-bold">Chargement des replays...</h3>
            </div>
          </div>
        )}

        {/* Replays Grid */}
        {!isLoading && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 overflow-y-auto pr-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                {currentReplays.map((replay, index) => {
                  const displayInfo = getReplayDisplayInfo(replay);
                  const isCurrentlyLaunching = isLaunching === replay.filename;

                  return (
                    <div
                      key={replay.filename}
                      className="bg-black/30 border border-white/10 text-white overflow-hidden hover:bg-black/40 transition-all duration-300 rounded-lg shadow-xl animate-in slide-in-from-bottom-4"
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <div className="relative">
                        <div className="h-12 bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
                          <div className="text-center">
                            <Video className="h-5 w-5 mx-auto opacity-75" />
                          </div>
                        </div>

                        {!displayInfo.isValid && (
                          <div className="absolute top-2 left-2">
                            <Badge
                              variant="secondary"
                              className="bg-gray-500 text-white"
                            >
                              INCONNU
                            </Badge>
                          </div>
                        )}

                        {displayInfo.isValid && replay.date && (
                          <div className="absolute top-2 right-2">
                            <Badge
                              variant="secondary"
                              className="bg-black/50 text-white"
                            >
                              <Calendar className="h-3 w-3 mr-1" />
                              {replay.date.toLocaleDateString("fr-FR")}
                            </Badge>
                          </div>
                        )}
                      </div>

                      <div className="p-3">
                        <h4 className="font-bold mb-1 truncate text-base">
                          {displayInfo.title}
                        </h4>
                        <p className="text-xs text-white/70 mb-2">
                          {displayInfo.subtitle}
                        </p>

                        {displayInfo.isValid &&
                          replay.player1 &&
                          replay.player2 && (
                            <div className="flex items-center text-xs text-white/60 mb-2">
                              <Users className="h-3 w-3 mr-1" />
                              Combat 1vs1
                            </div>
                          )}

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-orange-500/20"
                          onClick={() => handleLaunchReplay(replay)}
                          disabled={!canLaunchReplay() || isCurrentlyLaunching}
                        >
                          {isCurrentlyLaunching ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Lancement...
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Regarder le replay
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pagination - Now outside the scrollable area */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center space-x-2 mt-4 pb-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/5 border-white/20 text-white hover:bg-white/10"
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum =
                      Math.max(1, Math.min(totalPages - 4, currentPage - 2)) +
                      i;
                    if (pageNum > totalPages) return null;

                    return (
                      <Button
                        key={pageNum}
                        variant={
                          pageNum === currentPage ? "default" : "outline"
                        }
                        size="sm"
                        className={
                          pageNum === currentPage
                            ? "bg-orange-500 text-white hover:bg-orange-600"
                            : "bg-white/5 border-white/20 text-white hover:bg-white/10"
                        }
                        onClick={() => handlePageChange(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/5 border-white/20 text-white hover:bg-white/10"
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Page Info */}
            {replays.length > 0 && (
              <div className="text-center text-xs text-white/50 pb-2">
                {totalPages > 1
                  ? `Page ${currentPage} sur ${totalPages} • ${replays.length} replays au total`
                  : `${replays.length} replay${replays.length > 1 ? "s" : ""}`}
              </div>
            )}
          </div>
        )}

        {/* No Replays State */}
        {!isLoading && replays.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-white/50">
              <Video className="h-16 w-16 mx-auto mb-4" />
              <h3 className="text-xl font-bold">Aucun replay trouvé</h3>
              <p className="text-base mb-6">
                Vos replays apparaîtront ici après vos combats.
              </p>
              <Button
                variant="outline"
                className="bg-white/5 border-white/20 text-white hover:bg-white/10"
                onClick={handleOpenReplaysFolder}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Ouvrir le dossier des replays
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
