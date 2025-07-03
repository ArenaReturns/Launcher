import React, { useState, useEffect, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { StatusCard } from "@/components/ui/status-card";
import { TitleBar } from "./TitleBar";
import { preloader, updater, ipcEvents } from "@app/preload";
import log from "@/utils/logger";
import backgroundImage from "@/assets/background.jpg";
import logoImage from "@/assets/logo.webp";

interface PreloaderProps {
  onComplete: (data: {
    gameStatus: GameStatus;
    updateStatus: UpdateStatus;
  }) => void;
}

export const Preloader: React.FC<PreloaderProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState(
    "Initialisation du launcher..."
  );
  const [error, setError] = useState<string | null>(null);
  const [canContinue, setCanContinue] = useState(false);
  const shouldStopRef = useRef(false);

  // Listen to update events for progress tracking and errors
  useEffect(() => {
    const handleDownloadProgress = (status: UpdateStatus) => {
      if (status.progress) {
        const progressPercent = Math.round(status.progress.percent);
        setProgress(20 + progressPercent * 0.3); // Map 0-100% to 20-50% of preloader
        setCurrentMessage(
          `Téléchargement de la mise à jour... ${progressPercent}%`
        );
      }
    };

    const handleUpdateError = (status: UpdateStatus) => {
      log.error("Preloader: Update error event received:", status);
      setError(
        `Erreur de mise à jour: ${
          status.error || "Erreur inconnue"
        }\n\nLa mise à jour sera tentée au prochain démarrage.\nVous pouvez continuer à utiliser le launcher.`
      );
      setCanContinue(true);
      setCurrentMessage("Erreur lors de la mise à jour");
      shouldStopRef.current = true; // Stop initialization
    };

    ipcEvents.on("launcherUpdater:download-progress", handleDownloadProgress);
    ipcEvents.on("launcherUpdater:update-error", handleUpdateError);

    return () => {
      ipcEvents.off(
        "launcherUpdater:download-progress",
        handleDownloadProgress
      );
      ipcEvents.off("launcherUpdater:update-error", handleUpdateError);
    };
  }, []);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Step 1: Initialize launcher
        setCurrentMessage("Initialisation du launcher...");
        setProgress(10);

        // Step 2: Check for app updates (BLOCKING)
        setCurrentMessage("Vérification des mises à jour du launcher...");
        setProgress(20);

        let currentUpdateStatus = await updater.getStatus();
        log.info("Preloader: Initial update status:", currentUpdateStatus);

        const hasUpdate = await updater.checkForUpdates();
        log.info("Preloader: Update check result:", { hasUpdate });

        if (hasUpdate) {
          // BLOCKING: Wait for update to be available and start download
          setCurrentMessage("Téléchargement de la mise à jour...");
          setProgress(25);

          await updater.downloadUpdate();

          // BLOCKING: Wait for download to complete by polling status
          log.info("Preloader: Waiting for update download to complete");
          let downloadComplete = false;

          while (!downloadComplete) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            currentUpdateStatus = await updater.getStatus();

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
              break;
            }
          }

          setProgress(50);

          // If update downloaded successfully, show popup and install
          if (currentUpdateStatus.downloaded) {
            setCurrentMessage("Installation de la mise à jour...");
            log.info(
              "Preloader: Update downloaded, showing installation dialog"
            );

            try {
              log.info("Preloader: Calling updater.installUpdate()");
              await updater.installUpdate();

              // This should quit and restart - code after this won't execute
              log.info("Preloader: Install called, app should restart");
            } catch (installError) {
              log.error("Preloader: Failed to install update:", installError);
              const errorMessage =
                installError instanceof Error
                  ? installError.message
                  : "Erreur inconnue";

              setError(
                `Échec de l'installation de la mise à jour: ${errorMessage}\n\nLa mise à jour sera tentée au prochain démarrage.\nVous pouvez continuer à utiliser le launcher.`
              );
              setCanContinue(true);
              setCurrentMessage("Erreur lors de l'installation");

              log.info(
                "Preloader: Install error handled, STOPPING initialization"
              );
              return; // STOP COMPLETELY HERE
            }
          } else if (currentUpdateStatus.error) {
            log.warn(
              "Preloader: Update failed, continuing with launcher initialization"
            );
            // Continue with initialization
          }
        }

        // Step 3: Continue with normal initialization (only if no errors occurred)
        if (shouldStopRef.current || error) {
          log.info("Preloader: Stopping initialization due to update error");
          return;
        }

        setCurrentMessage("Téléchargement des métadonnées du jeu...");
        setProgress(80);

        const initResult = await preloader.initializeApp();

        // Check again after game init in case error occurred during it
        if (shouldStopRef.current || error) {
          log.info(
            "Preloader: Stopping initialization after game init due to error"
          );
          return;
        }

        if (initResult.gameStatus.error) {
          log.warn(
            "Preloader: Game status has error, but continuing",
            initResult.gameStatus.error
          );
        }

        setProgress(95);
        setCurrentMessage("Finalisation de la configuration...");
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Final check before completing
        if (shouldStopRef.current || error) {
          log.info(
            "Preloader: Stopping initialization before completion due to error"
          );
          return;
        }

        setProgress(100);

        // Complete initialization
        const finalResult = {
          ...initResult,
          updateStatus: currentUpdateStatus,
        };

        log.info("Preloader: Initialization complete, proceeding to main app");
        onComplete(finalResult);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Une erreur inconnue s'est produite";
        log.error("Preloader: Fatal initialization error", error);
        setError(errorMessage);
        setCurrentMessage("Erreur lors de l'initialisation");
        setCanContinue(true);
      }
    };

    initializeApp();
  }, [onComplete, error]);

  const handleContinueAnyway = () => {
    log.info(
      "Preloader: User chose to continue despite update errors, resetting state"
    );
    // Reset error states so initialization can continue
    setError(null);
    setCanContinue(false);
    shouldStopRef.current = false;

    // Restart the initialization from Step 3 (game metadata)
    setCurrentMessage("Continuation de l'initialisation...");
    setProgress(80);

    const continueInitialization = async () => {
      try {
        const initResult = await preloader.initializeApp();

        if (initResult.gameStatus.error) {
          log.warn(
            "Preloader: Game status has error, but continuing",
            initResult.gameStatus.error
          );
        }

        setProgress(95);
        setCurrentMessage("Finalisation de la configuration...");
        await new Promise((resolve) => setTimeout(resolve, 500));

        setProgress(100);

        // Complete initialization with update error noted
        const finalResult = {
          ...initResult,
          updateStatus: {
            available: false,
            downloading: false,
            downloaded: false,
            error: "Update installation failed, but launcher continued",
          },
        };

        log.info("Preloader: Initialization complete after continue anyway");
        onComplete(finalResult);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Une erreur inconnue s'est produite";
        log.error(
          "Preloader: Error during continue anyway initialization",
          error
        );
        setError(errorMessage);
        setCurrentMessage("Erreur lors de l'initialisation");
        setCanContinue(true);
      }
    };

    continueInitialization();
  };

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
            <div className="space-y-4">
              <img
                src={logoImage}
                alt="Arena Returns Logo"
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-white/80 text-xl transition-all duration-300">
                  {currentMessage}
                </p>
                <Progress value={progress} className="w-full h-2" />
              </div>
              <p className="text-white/60 text-base">{Math.round(progress)}%</p>

              {error && (
                <StatusCard variant="error" className="mt-4">
                  <p className="text-sm mb-3">{error}</p>
                  {canContinue && (
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
