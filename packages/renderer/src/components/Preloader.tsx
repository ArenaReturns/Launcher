import React, { useState, useEffect, useCallback } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { StatusCard } from "@/components/ui/status-card";
import { TitleBar } from "./TitleBar";
import { launcherUpdater, ipcEvents, gameUpdater } from "@app/preload";
import log from "@/utils/logger";
import backgroundImage from "@/assets/background.jpg";
import logoImage from "@/assets/logo.webp";

interface PreloaderProps {
  onComplete: (data: { updateStatus: UpdateStatus }) => void;
}

interface PreloaderState {
  step:
    | "launcher-check"
    | "launcher-download"
    | "launcher-install"
    | "game-init"
    | "complete";
  progress: number;
  message: string;
  error: string | null;
  canContinue: boolean;
  isComplete: boolean;
}

const STEPS = {
  "launcher-check": {
    progress: 20,
    message: "Vérification des mises à jour du launcher...",
  },
  "launcher-download": {
    progress: 60,
    message: "Téléchargement de la mise à jour...",
  },
  "launcher-install": {
    progress: 80,
    message: "Installation de la mise à jour...",
  },
  "game-init": {
    progress: 95,
    message: "Vérification des mises à jour du jeu...",
  },
  complete: { progress: 100, message: "Initialisation terminée" },
} as const;

export const Preloader: React.FC<PreloaderProps> = ({ onComplete }) => {
  const [state, setState] = useState<PreloaderState>({
    step: "launcher-check",
    progress: 10,
    message: "Initialisation du launcher...",
    error: null,
    canContinue: false,
    isComplete: false,
  });

  const updateState = useCallback((updates: Partial<PreloaderState>) => {
    setState((prevState) => ({ ...prevState, ...updates }));
  }, []);

  const setStep = useCallback(
    (step: PreloaderState["step"], customMessage?: string) => {
      const stepConfig = STEPS[step];
      updateState({
        step,
        progress: stepConfig.progress,
        message: customMessage || stepConfig.message,
        error: null,
      });
    },
    [updateState]
  );

  const setError = useCallback(
    (error: string, canContinue = true) => {
      log.error("Preloader error:", error);
      updateState({
        error,
        canContinue,
      });
    },
    [updateState]
  );

  const handleLauncherUpdateProgress = useCallback(
    (updateStatus: UpdateStatus) => {
      if (updateStatus.progress) {
        const progressPercent = Math.round(updateStatus.progress.percent);
        const downloadProgress = 20 + progressPercent * 0.4; // Map to 20-60%
        updateState({
          progress: downloadProgress,
          message: `Téléchargement de la mise à jour... ${progressPercent}%`,
        });
      }
    },
    [updateState]
  );

  const handleLauncherUpdateError = useCallback(
    (updateStatus: UpdateStatus) => {
      const errorMessage = `Erreur de mise à jour: ${
        updateStatus.error || "Erreur inconnue"
      }`;
      setError(
        `${errorMessage}\n\nLa mise à jour sera tentée au prochain démarrage.\nVous pouvez continuer à utiliser le launcher.`,
        true
      );
    },
    [setError]
  );

  // Set up event listeners
  useEffect(() => {
    ipcEvents.on(
      "launcherUpdater:download-progress",
      handleLauncherUpdateProgress
    );
    ipcEvents.on("launcherUpdater:update-error", handleLauncherUpdateError);

    return () => {
      ipcEvents.off(
        "launcherUpdater:download-progress",
        handleLauncherUpdateProgress
      );
      ipcEvents.off("launcherUpdater:update-error", handleLauncherUpdateError);
    };
  }, [handleLauncherUpdateProgress, handleLauncherUpdateError]);

  const initializeLauncher = useCallback(async () => {
    try {
      // Step 1: Check for launcher updates
      setStep("launcher-check");
      await new Promise((resolve) => setTimeout(resolve, 500)); // Small delay for UX

      const initialUpdateStatus = await launcherUpdater.getStatus();
      log.info(
        "Preloader: Initial launcher update status:",
        initialUpdateStatus
      );

      const hasUpdate = await launcherUpdater.checkForUpdates();
      log.info("Preloader: Update check result:", { hasUpdate });

      if (hasUpdate) {
        // Step 2: Download update
        setStep("launcher-download");
        await launcherUpdater.downloadUpdate();

        // Wait for download completion
        let downloadComplete = false;
        let currentUpdateStatus = initialUpdateStatus;

        while (!downloadComplete) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          currentUpdateStatus = await launcherUpdater.getStatus();

          if (currentUpdateStatus.downloaded) {
            downloadComplete = true;
            log.info("Preloader: Update download completed successfully");
            break;
          }

          if (currentUpdateStatus.error) {
            log.error(
              "Preloader: Update download failed:",
              currentUpdateStatus.error
            );
            throw new Error(currentUpdateStatus.error);
          }
        }

        // Step 3: Install update
        if (currentUpdateStatus.downloaded) {
          setStep("launcher-install");
          log.info("Preloader: Installing update");

          try {
            await launcherUpdater.installUpdate();
            // This should quit and restart - code after this won't execute
            log.info("Preloader: Install called, app should restart");
            return; // Early return - app will restart
          } catch (installError) {
            const errorMessage =
              installError instanceof Error
                ? installError.message
                : "Erreur inconnue";

            throw new Error(`Échec de l'installation: ${errorMessage}`);
          }
        }
      }

      // Step 4: Initialize game state
      setStep("game-init");
      await new Promise((resolve) => setTimeout(resolve, 500)); // Let UI update

      // Initialize game state to prevent flickering later
      log.info("Preloader: Initializing game state");
      await gameUpdater.getStatus(); // This will trigger the game state initialization

      // Step 5: Complete
      setStep("complete");
      await new Promise((resolve) => setTimeout(resolve, 300)); // Brief pause before completion

      // Finalize with current update status
      const finalUpdateStatus = await launcherUpdater.getStatus();

      updateState({ isComplete: true });

      // Complete initialization after a brief delay
      setTimeout(() => {
        onComplete({ updateStatus: finalUpdateStatus });
      }, 200);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Une erreur inconnue s'est produite";
      setError(errorMessage, true);
    }
  }, [setStep, setError, updateState, onComplete]);

  const handleContinueAnyway = useCallback(async () => {
    log.info("Preloader: User chose to continue despite errors");

    try {
      updateState({
        error: null,
        canContinue: false,
        step: "game-init",
        progress: 95,
        message: "Continuation de l'initialisation...",
      });

      // Initialize game state
      await gameUpdater.getStatus();

      setStep("complete");
      await new Promise((resolve) => setTimeout(resolve, 300));

      updateState({ isComplete: true });

      setTimeout(() => {
        onComplete({
          updateStatus: {
            available: false,
            downloading: false,
            downloaded: false,
            error: "Update installation failed, but launcher continued",
          },
        });
      }, 200);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Une erreur inconnue s'est produite";
      setError(errorMessage, true);
    }
  }, [updateState, setStep, onComplete, setError]);

  // Initialize on mount
  useEffect(() => {
    initializeLauncher();
  }, [initializeLauncher]);

  return (
    <div
      className="h-screen w-full flex flex-col animate-in fade-in duration-1000 relative"
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
        <TitleBar />

        {/* Preloader Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="text-center space-y-8 max-w-md w-full animate-in slide-in-from-bottom-4 duration-1000 delay-300">
            {/* Logo */}
            <div className="space-y-4">
              <img
                src={logoImage}
                alt="Arena Returns Logo"
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>

            {/* Progress Section */}
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-white/80 text-xl transition-all duration-300">
                  {state.message}
                </p>
                <Progress value={state.progress} className="w-full h-2" />
              </div>

              <p className="text-white/60 text-base">
                {Math.round(state.progress)}%
              </p>

              {/* Error Card */}
              {state.error && (
                <StatusCard variant="error" className="mt-4 text-left">
                  <p className="text-sm mb-3 whitespace-pre-line">
                    {state.error}
                  </p>
                  {state.canContinue && (
                    <Button
                      onClick={handleContinueAnyway}
                      variant="outline"
                      size="sm"
                      className="w-full bg-red-600/10 border-red-500/30 text-red-300 hover:bg-red-600/20"
                    >
                      Continuer quand même
                    </Button>
                  )}
                </StatusCard>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
