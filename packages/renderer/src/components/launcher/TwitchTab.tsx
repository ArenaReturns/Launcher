import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Users, Eye, Crown } from "lucide-react";
import { SimpleSelect } from "@/components/common/FormControls";
import { mockStreams } from "@/data/mockData";
import type { TwitchMode } from "@/types";

export const TwitchTab: React.FC = () => {
  const [twitchMode, setTwitchMode] = useState<TwitchMode>("vip");
  const [selectedGame, setSelectedGame] = useState("whitemane");

  const getFilteredStreams = () => {
    if (twitchMode === "vip") {
      return mockStreams.filter((stream) => stream.isVip && stream.isLive);
    } else {
      return mockStreams
        .filter(
          (stream) =>
            stream.isLive && stream.game.toLowerCase() === selectedGame
        )
        .sort((a, b) => b.viewers - a.viewers)
        .slice(0, 10);
    }
  };

  return (
    <div className="animate-in slide-in-from-left-4 duration-300 h-full">
      <div className="space-y-6 h-full overflow-hidden">
        {/* Twitch Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-white/90 flex items-center">
            <div className="w-6 h-6 bg-purple-600 rounded mr-2 animate-pulse"></div>
            Streamers en live sur Arena Returns
          </h2>

          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-base text-white/70">Filtre :</span>
              <SimpleSelect
                value={twitchMode}
                onChange={(value: TwitchMode) => setTwitchMode(value)}
                options={[
                  { value: "vip", label: "👑 Partenaires" },
                  { value: "standard", label: "👥 Standard" },
                ]}
              />
            </div>

            {twitchMode === "standard" && (
              <div className="flex items-center space-x-2">
                <span className="text-base text-white/70">Game:</span>
                <SimpleSelect
                  value={selectedGame}
                  onChange={setSelectedGame}
                  options={[
                    { value: "whitemane", label: "Whitemane" },
                    { value: "other", label: "Other Games" },
                  ]}
                />
              </div>
            )}
          </div>
        </div>

        {/* Stream Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2">
          {getFilteredStreams().map((stream, index) => (
            <div
              key={stream.id}
              className="bg-black/30 border border-white/10 text-white overflow-hidden hover:bg-black/40 transition-all duration-300 cursor-pointer rounded-lg shadow-xl animate-in slide-in-from-bottom-4"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="relative">
                <div className="aspect-video bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-base opacity-75">
                      Miniature indisponible
                    </div>
                  </div>
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

                {stream.isVip && (
                  <div className="absolute top-2 right-2">
                    <Badge
                      variant="default"
                      className="bg-yellow-500 text-black animate-pulse"
                    >
                      <Crown className="h-3 w-3 mr-1" />
                      Partenaire
                    </Badge>
                  </div>
                )}

                <div className="absolute bottom-2 right-2">
                  <Badge variant="secondary" className="bg-black/50 text-white">
                    <Eye className="h-3 w-3 mr-1" />
                    {stream.viewers.toLocaleString()}
                  </Badge>
                </div>
              </div>

              <div className="p-4">
                <h4 className="font-bold mb-1 truncate text-lg">
                  {stream.title}
                </h4>
                <p className="text-base text-white/70 mb-2">
                  {stream.streamerName}
                </p>
                <p className="text-sm text-white/50">{stream.game}</p>
              </div>
            </div>
          ))}
        </div>

        {getFilteredStreams().length === 0 && (
          <div className="text-center py-20 animate-in fade-in duration-500">
            <div className="text-white/50 mb-4">
              <Users className="h-16 w-16 mx-auto mb-4" />
              <h3 className="text-xl font-bold">No streams available</h3>
              <p className="text-base">
                No live streams found for the selected criteria.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
