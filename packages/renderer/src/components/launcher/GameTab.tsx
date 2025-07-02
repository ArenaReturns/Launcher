import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, MessageCircle } from "lucide-react";
import { DownloadButton } from "./DownloadButton";
import { news, gameClient, ipcEvents, system } from "@app/preload";
import log from "@/utils/logger";
import logoImage from "@/assets/logo.webp";

interface GameTabProps {
  gameStatus?: GameStatus;
  updateStatus?: UpdateStatus;
}

export const GameTab: React.FC<GameTabProps> = ({
  gameStatus: initialGameStatus,
  updateStatus,
}) => {
  const [gameStatus, setGameStatus] = useState<GameStatus | undefined>(
    initialGameStatus
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [newsState, setNewsState] = useState<NewsState>({
    articles: [],
    isLoading: true,
  });

  useEffect(() => {
    // Update gameStatus when initialGameStatus changes
    setGameStatus(initialGameStatus);
  }, [initialGameStatus]);

  useEffect(() => {
    // Fetch initial download state immediately to sync with current state
    const fetchInitialDownloadState = async () => {
      try {
        const downloadProgress = await gameClient.getDownloadProgress();
        setIsDownloading(downloadProgress.isDownloading);

        // Only refresh game status if not downloading and we need to
        if (!downloadProgress.isDownloading) {
          const shouldRefreshStatus =
            !initialGameStatus ||
            (!initialGameStatus.isInstalled &&
              !initialGameStatus.needsUpdate &&
              !initialGameStatus.error);

          if (shouldRefreshStatus) {
            const currentStatus = await gameClient.getStatus();
            setGameStatus(currentStatus);
          }
        }
      } catch (error) {
        log.error("Failed to fetch initial download state:", error);

        // Only try to fetch game status if we failed to get download progress
        if (
          !initialGameStatus ||
          (!initialGameStatus.isInstalled &&
            !initialGameStatus.needsUpdate &&
            !initialGameStatus.error)
        ) {
          try {
            const currentStatus = await gameClient.getStatus();
            setGameStatus(currentStatus);
          } catch (statusError) {
            log.error("Failed to fetch current game status:", statusError);
            // Fall back to initialGameStatus if both fetches fail
            if (initialGameStatus) {
              setGameStatus(initialGameStatus);
            }
          }
        }
      }
    };

    fetchInitialDownloadState();
  }, []); // Empty dependency array - only run on mount

  useEffect(() => {
    // Load news articles
    const loadNews = async () => {
      try {
        const result = await news.getArticles();
        setNewsState(result);
      } catch (error) {
        log.error("Failed to load news:", error);
        setNewsState({
          articles: [],
          isLoading: false,
          error: "Failed to load news",
        });
      }
    };

    loadNews();

    // Listen for automatic news updates
    const handleNewsUpdate = (newsData: NewsState) => {
      setNewsState(newsData);
    };

    // Listen for game client download events to keep state synchronized
    const handleDownloadStarted = () => {
      setIsDownloading(true);
    };

    const handleDownloadProgress = (progress: DownloadProgress) => {
      setIsDownloading(progress.isDownloading);
    };

    const handleDownloadComplete = () => {
      setIsDownloading(false);
    };

    const handleDownloadCancelled = () => {
      setIsDownloading(false);
    };

    const handleDownloadError = () => {
      setIsDownloading(false);
    };

    // Add event listeners
    ipcEvents.on("news:news-updated", handleNewsUpdate);
    ipcEvents.on("game:download-started", handleDownloadStarted);
    ipcEvents.on("game:download-progress", handleDownloadProgress);
    ipcEvents.on("game:download-complete", handleDownloadComplete);
    ipcEvents.on("game:download-cancelled", handleDownloadCancelled);
    ipcEvents.on("game:download-error", handleDownloadError);

    // Cleanup event listeners on unmount
    return () => {
      ipcEvents.off("news:news-updated", handleNewsUpdate);
      ipcEvents.off("game:download-started", handleDownloadStarted);
      ipcEvents.off("game:download-progress", handleDownloadProgress);
      ipcEvents.off("game:download-complete", handleDownloadComplete);
      ipcEvents.off("game:download-cancelled", handleDownloadCancelled);
      ipcEvents.off("game:download-error", handleDownloadError);
    };
  }, []);

  const handleDownloadComplete = async () => {
    try {
      // Refresh game status after download completes
      const updatedStatus = await gameClient.checkForUpdates();
      setGameStatus(updatedStatus);
    } catch (error) {
      log.error("Failed to refresh game status:", error);
    }
  };

  const handleDownloadStateChange = (downloading: boolean) => {
    setIsDownloading(downloading);
  };

  return (
    <div className="animate-in slide-in-from-right-4 duration-300 h-full">
      <div className="grid grid-cols-12 gap-6 h-full">
        {/* Left Side - Game Info */}
        <div className="col-span-4 space-y-6">
          <div className="text-center space-y-4">
            <div className="mx-auto flex items-center justify-center">
              <img
                src={logoImage}
                alt="Arena Returns Logo"
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>
            {/* <h2 className="text-3xl font-bold">ARENA RETURNS</h2> */}
            <p className="text-white/90 text-base leading-relaxed">
              Le retour de Dofus Arena, par des fans, pour des fans.
              <br />
              Plongez dans l'Hormonde, un univers de combat e-sport dans le
              thème de Dofus !
            </p>
          </div>

          <div className={`space-y-4 ${isDownloading ? "space-y-3" : ""}`}>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="default"
                className="flex-1 cursor-pointer"
                onClick={() =>
                  system.openExternal("https://www.arenareturns.com")
                }
              >
                <Globe className="h-5 w-5 mr-2" />
                Site web
              </Button>
              <Button
                variant="outline"
                size="default"
                className="flex-1 cursor-pointer"
                onClick={() =>
                  system.openExternal("https://discord.gg/SBjdAyNaVM")
                }
              >
                <MessageCircle className="h-5 w-5 mr-2" />
                Discord
              </Button>
            </div>

            <div className={`space-y-2 ${isDownloading ? "space-y-1" : ""}`}>
              {/* Hide version text during downloads to save space */}
              {!isDownloading && (
                <p className="text-base text-white/60">
                  {gameStatus?.remoteVersion
                    ? `Dernière version du client : ${gameStatus.remoteVersion}`
                    : "Vérification de la version..."}
                </p>
              )}
              <DownloadButton
                gameStatus={gameStatus}
                onDownloadComplete={handleDownloadComplete}
                onDownloadStateChange={handleDownloadStateChange}
              />
              {updateStatus?.available && !isDownloading && (
                <p className="text-yellow-400 text-sm">
                  Mise à jour du launcher disponible
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Middle - News */}
        <div className="col-span-6 flex flex-col min-h-0">
          <h2 className="text-2xl font-bold text-white/90 mb-4 flex-shrink-0">
            Dernières nouvelles
          </h2>

          <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4">
            {newsState.isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-white/60">Chargement des actualités...</p>
              </div>
            ) : newsState.error ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-red-400">{newsState.error}</p>
              </div>
            ) : newsState.articles.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-white/60">Aucune actualité disponible</p>
              </div>
            ) : (
              <>
                {/* Display news articles */}
                <div className="flex-1 flex flex-col gap-4">
                  {newsState.articles.slice(0, 1).map((article) => {
                    const imageUrl = article.cover
                      ? `https://strapi.arenareturns.com${
                          article.cover.formats?.medium?.url ||
                          article.cover.url
                        }`
                      : null;

                    return (
                      <div
                        key={article.id}
                        className="bg-black/30 border border-white/10 text-white overflow-hidden hover:bg-black/40 transition-all duration-300 cursor-pointer rounded-lg shadow-xl flex flex-col flex-1 max-h-80"
                        onClick={() =>
                          system.openExternal(
                            `https://www.arenareturns.com/fr/news/${article.slug}`
                          )
                        }
                      >
                        <div className="relative flex items-center justify-center py-8 flex-1">
                          {imageUrl ? (
                            <>
                              <img
                                src={imageUrl}
                                alt={
                                  article.cover?.alternativeText ||
                                  article.title
                                }
                                className="absolute inset-0 w-full h-full object-cover clickable-image"
                                draggable={false}
                              />
                              <div className="absolute inset-0 bg-black/50"></div>
                            </>
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600"></div>
                          )}
                          <div className="relative z-10 text-center p-6">
                            <Badge
                              variant="default"
                              className="mb-2 bg-blue-500 text-white animate-pulse"
                            >
                              ACTUALITÉ
                            </Badge>
                            <h3 className="text-2xl font-bold mb-2">
                              {article.title}
                            </h3>
                            <p className="text-white/80 text-lg">
                              {new Date(article.publishedAt).toLocaleDateString(
                                "fr-FR"
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="p-4">
                          <p className="text-white/70 text-base line-clamp-3">
                            {article.description ||
                              (article.blocks.length > 0
                                ? article.blocks[0].body.substring(0, 150)
                                : "Cliquez pour lire l'article complet")}
                            ...
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Small width news - 2 in a row */}
                {newsState.articles.length > 1 && (
                  <div className="grid grid-cols-2 gap-4 flex-1">
                    {newsState.articles.slice(1, 3).map((article) => {
                      const imageUrl = article.cover
                        ? `https://strapi.arenareturns.com${
                            article.cover.formats?.small?.url ||
                            article.cover.url
                          }`
                        : null;

                      return (
                        <div
                          key={article.id}
                          className="bg-black/30 border border-white/10 text-white overflow-hidden hover:bg-black/40 transition-all duration-300 cursor-pointer rounded-lg shadow-xl flex flex-col max-h-64"
                          onClick={() =>
                            system.openExternal(
                              `https://www.arenareturns.com/fr/news/${article.slug}`
                            )
                          }
                        >
                          <div className="relative flex items-center justify-center py-6 flex-1">
                            {imageUrl ? (
                              <>
                                <img
                                  src={imageUrl}
                                  alt={
                                    article.cover?.alternativeText ||
                                    article.title
                                  }
                                  className="absolute inset-0 w-full h-full object-cover clickable-image"
                                  draggable={false}
                                />
                                <div className="absolute inset-0 bg-black/50"></div>
                              </>
                            ) : (
                              <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-blue-600"></div>
                            )}
                            <div className="relative z-10 text-center">
                              <Badge
                                variant="default"
                                className="mb-1 bg-green-500 text-white"
                              >
                                ACTUALITÉ
                              </Badge>
                            </div>
                          </div>
                          <div className="p-4">
                            <h4 className="font-bold mb-2 text-base leading-tight">
                              {article.title}
                            </h4>
                            <p className="text-white/60 text-sm">
                              {new Date(article.publishedAt).toLocaleDateString(
                                "fr-FR"
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Side - Empty space */}
        <div className="col-span-2">{/* Empty space as requested */}</div>
      </div>
    </div>
  );
};
