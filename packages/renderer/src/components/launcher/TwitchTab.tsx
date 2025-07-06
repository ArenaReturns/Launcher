import React from "react";
import { Badge } from "@/components/ui/badge";
import { Users, Eye, Crown } from "lucide-react";
import { mockStreams } from "@/data/mockData";

export const TwitchTab: React.FC = () => {
  const getFilteredStreams = () => {
    return mockStreams.sort((a, b) => b.viewers - a.viewers);
  };

  const allStreams = getFilteredStreams();

  return (
    <div className="animate-in slide-in-from-left-4 duration-300 h-full">
      <div className="flex flex-col space-y-6 h-full">
        {/* Twitch Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-white/90 flex items-center">
            <div className="w-6 h-6 bg-purple-600 rounded mr-2 animate-pulse"></div>
            Streamers en live sur Arena Returns
          </h2>
        </div>

        {/* Stream Grid */}
        {allStreams.length > 0 ? (
          <div className="flex-1 min-h-0 overflow-y-auto pr-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
              {allStreams.map((stream, index) => (
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
                      <Badge
                        variant="secondary"
                        className="bg-black/50 text-white"
                      >
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
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
};
