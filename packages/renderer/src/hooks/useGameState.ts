import { useState, useEffect, useCallback, useRef } from "react";
import { gameUpdater, gameClient, ipcEvents } from "@app/preload";
import log from "@/utils/logger";

export interface GameState {
  // Core status
  isInstalled: boolean;
  needsUpdate: boolean;
  localVersion: string | null;
  remoteVersion: string | null;

  // Download/update progress
  isDownloading: boolean;
  isRepairing: boolean;
  downloadProgress: {
    filesTotal: number;
    filesLoaded: number;
    currentFile?: string;
  };

  // Current operations
  isLaunching: boolean;
  isCheckingStatus: boolean;

  // Errors
  error: string | null;

  // Computed properties
  isReady: boolean;
  canLaunch: boolean;
  canStartDownload: boolean;
  statusText: string;
}

export interface GameStateActions {
  refreshStatus: () => Promise<void>;
  startDownload: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  repairClient: () => Promise<void>;
  launchGame: () => Promise<void>;
  launchReplayOffline: (replayPath: string) => Promise<void>;
  clearError: () => void;
}

const initialState: GameState = {
  isInstalled: false,
  needsUpdate: false,
  localVersion: null,
  remoteVersion: null,
  isDownloading: false,
  isRepairing: false,
  downloadProgress: {
    filesTotal: 0,
    filesLoaded: 0,
  },
  isLaunching: false,
  isCheckingStatus: false,
  error: null,
  isReady: false,
  canLaunch: false,
  canStartDownload: false,
  statusText: "Initialisation...",
};

export function useGameState(): [GameState, GameStateActions] {
  const [state, setState] = useState<GameState>(initialState);
  const isInitialized = useRef(false);
  const statusCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const isRefreshing = useRef(false);

  // Compute derived properties
  const computeState = useCallback(
    (baseState: Partial<GameState>): GameState => {
      const computed = { ...state, ...baseState };

      // Core computed properties
      computed.isReady =
        computed.isInstalled &&
        !computed.needsUpdate &&
        !computed.isDownloading &&
        !computed.isLaunching &&
        !computed.isCheckingStatus &&
        !computed.error;

      computed.canLaunch =
        computed.isInstalled &&
        !computed.needsUpdate &&
        !computed.isDownloading &&
        !computed.isLaunching &&
        !computed.error;

      computed.canStartDownload =
        !computed.isDownloading &&
        !computed.isLaunching &&
        !computed.isCheckingStatus;

      // Status text
      if (computed.error) {
        computed.statusText = "Erreur";
      } else if (computed.isLaunching) {
        computed.statusText = "Lancement du jeu...";
      } else if (computed.isDownloading) {
        if (computed.isRepairing) {
          computed.statusText = "Réparation en cours...";
        } else if (computed.downloadProgress.currentFile) {
          const fileName = computed.downloadProgress.currentFile
            .split("/")
            .pop();
          computed.statusText = `Téléchargement: ${fileName}`;
        } else {
          computed.statusText = "Téléchargement...";
        }
      } else if (computed.isCheckingStatus) {
        computed.statusText = "Vérification...";
      } else if (!computed.isInstalled) {
        computed.statusText = "Jeu non installé";
      } else if (computed.needsUpdate) {
        computed.statusText = "Mise à jour disponible";
      } else {
        computed.statusText = "Prêt à jouer";
      }

      return computed;
    },
    [state]
  );

  // Update state with computed properties
  const updateState = useCallback(
    (updates: Partial<GameState>) => {
      setState((prevState) => computeState({ ...prevState, ...updates }));
    },
    [computeState]
  );

  // Refresh game status
  const refreshStatus = useCallback(async () => {
    if (state.isCheckingStatus || isRefreshing.current) {
      return;
    }

    isRefreshing.current = true;
    try {
      updateState({ isCheckingStatus: true, error: null });

      const [gameStatus, downloadProgress] = await Promise.all([
        gameUpdater.getStatus(),
        gameUpdater.getDownloadProgress(),
      ]);

      updateState({
        isInstalled: gameStatus.isInstalled,
        needsUpdate: gameStatus.needsUpdate,
        localVersion: gameStatus.localVersion,
        remoteVersion: gameStatus.remoteVersion,
        isDownloading: downloadProgress.isDownloading,
        isRepairing: downloadProgress.isRepairing || false,
        downloadProgress: {
          filesTotal: downloadProgress.filesTotal,
          filesLoaded: downloadProgress.filesLoaded,
          currentFile: downloadProgress.currentFile,
        },
        error: gameStatus.error || downloadProgress.error || null,
        isCheckingStatus: false,
      });
    } catch (error) {
      log.error("Failed to refresh game status:", error);
      updateState({
        error: error instanceof Error ? error.message : "Erreur inconnue",
        isCheckingStatus: false,
      });
    } finally {
      isRefreshing.current = false;
    }
  }, [state.isCheckingStatus, updateState]);

  // Start download
  const startDownload = useCallback(async () => {
    if (!state.canStartDownload) return;

    try {
      updateState({ error: null });
      await gameUpdater.startDownload();
      // Status will be updated via IPC events
    } catch (error) {
      log.error("Failed to start download:", error);
      updateState({
        error:
          error instanceof Error ? error.message : "Échec du téléchargement",
      });
    }
  }, [state.canStartDownload, updateState]);

  // Cancel download
  const cancelDownload = useCallback(async () => {
    try {
      await gameUpdater.cancelDownload();
      // Status will be updated via IPC events
    } catch (error) {
      log.error("Failed to cancel download:", error);
      updateState({
        error: error instanceof Error ? error.message : "Échec de l'annulation",
      });
    }
  }, [updateState]);

  // Repair client
  const repairClient = useCallback(async () => {
    if (!state.canStartDownload) return;

    try {
      updateState({ error: null });
      await gameUpdater.repairClient();
      // Status will be updated via IPC events
    } catch (error) {
      log.error("Failed to repair client:", error);
      updateState({
        error:
          error instanceof Error ? error.message : "Échec de la réparation",
      });
    }
  }, [state.canStartDownload, updateState]);

  // Launch game
  const launchGame = useCallback(async () => {
    if (!state.canLaunch) return;

    try {
      updateState({ isLaunching: true, error: null });

      // Double-check status before launching
      const currentStatus = await gameUpdater.checkForUpdates();
      if (currentStatus.needsUpdate) {
        updateState({
          needsUpdate: true,
          isLaunching: false,
          error: null, // Don't set error - let the button show update state
        });
        return;
      }

      await gameClient.launchGame();

      // Keep launching state for a moment to prevent double-clicks
      setTimeout(() => {
        updateState({ isLaunching: false });
      }, 2000);
    } catch (error) {
      log.error("Failed to launch game:", error);
      updateState({
        isLaunching: false,
        error: error instanceof Error ? error.message : "Échec du lancement",
      });
    }
  }, [state.canLaunch, updateState]);

  // Launch replay offline (no CDN check)
  const launchReplayOffline = useCallback(
    async (replayPath: string) => {
      // Only check if game is locally installed, no network check
      if (!state.isInstalled) return;

      try {
        updateState({ isLaunching: true, error: null });
        await gameClient.launchReplayOffline(replayPath);

        setTimeout(() => {
          updateState({ isLaunching: false });
        }, 2000);
      } catch (error) {
        log.error("Failed to launch replay offline:", error);
        updateState({
          isLaunching: false,
          error:
            error instanceof Error
              ? error.message
              : "Échec du lancement du replay",
        });
      }
    },
    [state.isInstalled, updateState]
  );

  // Clear error
  const clearError = useCallback(() => {
    updateState({ error: null });
  }, [updateState]);

  // Set up IPC event listeners
  useEffect(() => {
    const handleDownloadStarted = (progress: {
      isRepairing?: boolean;
      filesTotal: number;
      filesLoaded: number;
      currentFile?: string;
    }) => {
      updateState({
        isDownloading: true,
        isRepairing: progress.isRepairing || false,
        downloadProgress: {
          filesTotal: progress.filesTotal,
          filesLoaded: progress.filesLoaded,
          currentFile: progress.currentFile,
        },
        error: null,
      });
    };

    const handleDownloadProgress = (progress: {
      filesTotal: number;
      filesLoaded: number;
      currentFile?: string;
    }) => {
      updateState({
        downloadProgress: {
          filesTotal: progress.filesTotal,
          filesLoaded: progress.filesLoaded,
          currentFile: progress.currentFile,
        },
      });
    };

    const handleDownloadComplete = (progress: {
      filesTotal: number;
      filesLoaded: number;
      currentFile?: string;
    }) => {
      updateState({
        isDownloading: false,
        isRepairing: false,
        needsUpdate: false,
        downloadProgress: {
          filesTotal: progress.filesTotal,
          filesLoaded: progress.filesLoaded,
          currentFile: progress.currentFile,
        },
      });
      // Refresh status after download completion
      setTimeout(refreshStatus, 500);
    };

    const handleDownloadCancelled = () => {
      updateState({
        isDownloading: false,
        isRepairing: false,
      });
    };

    const handleDownloadError = (progress: { error?: string }) => {
      updateState({
        isDownloading: false,
        isRepairing: false,
        error: progress.error || "Erreur de téléchargement",
      });
    };

    const handleStatusChanged = () => {
      console.warn(
        "🔔 handleStatusChanged: Received status-changed event, calling refreshStatus"
      );
      refreshStatus();
    };

    // Register event listeners
    console.warn("🎧 useGameState: Registering IPC event listeners");
    ipcEvents.on("gameUpdater:download-started", handleDownloadStarted);
    ipcEvents.on("gameUpdater:download-progress", handleDownloadProgress);
    ipcEvents.on("gameUpdater:download-complete", handleDownloadComplete);
    ipcEvents.on("gameUpdater:download-cancelled", handleDownloadCancelled);
    ipcEvents.on("gameUpdater:download-error", handleDownloadError);
    ipcEvents.on("gameUpdater:status-changed", handleStatusChanged);

    return () => {
      console.warn("🎧 useGameState: Cleaning up IPC event listeners");
      ipcEvents.off("gameUpdater:download-started", handleDownloadStarted);
      ipcEvents.off("gameUpdater:download-progress", handleDownloadProgress);
      ipcEvents.off("gameUpdater:download-complete", handleDownloadComplete);
      ipcEvents.off("gameUpdater:download-cancelled", handleDownloadCancelled);
      ipcEvents.off("gameUpdater:download-error", handleDownloadError);
      ipcEvents.off("gameUpdater:status-changed", handleStatusChanged);
    };
  }, [updateState, refreshStatus]);

  // Initialize and set up periodic status checks
  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      console.warn(
        "🚀 useGameState: First initialization, calling refreshStatus"
      );
      refreshStatus();

      // Set up periodic status checks (every 10 minutes when idle)
      statusCheckInterval.current = setInterval(() => {
        if (
          !state.isDownloading &&
          !state.isLaunching &&
          !state.isCheckingStatus
        ) {
          refreshStatus();
        }
      }, 600000);
    }

    return () => {
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
        statusCheckInterval.current = null;
      }
    };
  }, [
    refreshStatus,
    state.isDownloading,
    state.isLaunching,
    state.isCheckingStatus,
  ]);

  const actions: GameStateActions = {
    refreshStatus,
    startDownload,
    cancelDownload,
    repairClient,
    launchGame,
    launchReplayOffline,
    clearError,
  };

  return [state, actions];
}
