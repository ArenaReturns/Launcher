import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Eye, RefreshCw, AlertCircle } from "lucide-react";
import { useTwitchStreams } from "@/hooks/useTwitchStreams";
import { system } from "@app/preload";

export const TwitchTab: React.FC = () => {
  const { streams, isLoading, error, refreshStreams } = useTwitchStreams();

  const formatThumbnailUrl = (templateUrl: string) => {
    // Replace {width} and {height} with 720p resolution
    return templateUrl.replace("{width}", "1280").replace("{height}", "720");
  };

  const handleStreamClick = (userLogin: string) => {
    system.openExternal(`https://twitch.tv/${userLogin}`);
  };

  const handleRefresh = async () => {
    await refreshStreams();
  };

  return (
    <div className="animate-in slide-in-from-left-4 duration-300 h-full">
      <div className="flex flex-col space-y-6 h-full">
        {/* Twitch Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-white/90 flex items-center">
            <div className="w-6 h-6 bg-purple-600 rounded mr-2 animate-pulse"></div>
            Streamers en live sur Arena Returns
          </h2>

          <Button
            variant="outline"
            size="sm"
            className="bg-white/5 border-white/20 text-white hover:bg-white/10 cursor-pointer"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Actualiser
          </Button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
              <div>
                <p className="text-red-500 font-medium">
                  Erreur lors du chargement des streams
                </p>
                <p className="text-red-500/80 text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Stream Grid */}
        {!error && streams.length > 0 ? (
          <div className="flex-1 min-h-0 overflow-y-auto pr-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
              {streams.map((stream, index) => (
                <div
                  key={stream.id}
                  className="bg-black/30 border border-white/10 text-white overflow-hidden hover:bg-black/40 transition-all duration-300 cursor-pointer rounded-lg shadow-xl animate-in slide-in-from-bottom-4"
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => handleStreamClick(stream.user_login)}
                >
                  <div className="relative">
                    <div className="aspect-video bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center overflow-hidden">
                      <img
                        src={formatThumbnailUrl(stream.thumbnail_url)}
                        alt={`${stream.user_name} stream thumbnail`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback to gradient if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = "none";
                          target.parentElement!.innerHTML = `
                            <div class="w-full h-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                              <div class="text-center">
                                <div class="text-base opacity-75">
                                  Miniature indisponible
                                </div>
                              </div>
                            </div>
                          `;
                        }}
                        draggable={false}
                      />
                    </div>

                    <div className="absolute top-2 left-2">
                      <Badge
                        variant="destructive"
                        className="bg-red-500 text-white"
                      >
                        <div className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse"></div>
                        LIVE
                      </Badge>
                    </div>

                    {/* VIP/Partner badge - we'll check if they have special tags 
                    {stream.tags.some(
                      (tag) =>
                        tag.toLowerCase().includes("partner") ||
                        tag.toLowerCase().includes("partenaire")
                    ) && (
                      <div className="absolute top-2 right-2">
                        <Badge
                          variant="default"
                          className="bg-yellow-500 text-black animate-pulse"
                        >
                          <Crown className="h-3 w-3 mr-1" />
                          Partenaire
                        </Badge>
                      </div>
                    )}*/}

                    <div className="absolute bottom-2 right-2">
                      <Badge
                        variant="secondary"
                        className="bg-black/50 text-white"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        {stream.viewer_count.toLocaleString()}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-4">
                    <h4 className="font-bold mb-1 truncate text-lg">
                      {stream.title}
                    </h4>
                    <p className="text-base text-white/70 mb-2">
                      {stream.user_name}
                    </p>
                    <p className="text-sm text-white/50">{stream.game_name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : !error && !isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-20 animate-in fade-in duration-500">
              <div className="text-white/50 mb-4">
                <Users className="h-16 w-16 mx-auto mb-4" />
                <h3 className="text-xl font-bold">Aucun streamer en live</h3>
                <p className="text-base">
                  Revenez peut-être plus tard, ou démarrez un stream
                  <br /> sur Twitch pour apparaître ici !
                </p>
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-20 animate-in fade-in duration-500">
              <div className="text-white/50 mb-4">
                <RefreshCw className="h-16 w-16 mx-auto mb-4 animate-spin" />
                <h3 className="text-xl font-bold">Chargement des streams...</h3>
                <p className="text-base">Récupération des streamers en live</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
