import type { TwitchStream, NewsItem } from "@/types";

export const mockStreams: TwitchStream[] = [
  {
    id: "1",
    streamerName: "Natlink",
    title: "On farm des défis !",
    game: "Arena Returns",
    viewers: 19,
    isVip: true,
    isLive: true,
  },
  {
    id: "2",
    streamerName: "Bg_Gamer_Du_32",
    title: "[Tournois] On est chaud patate !",
    game: "Arena Returns",
    viewers: 220,
    isVip: true,
    isLive: true,
  },
  {
    id: "3",
    streamerName: "CasualGamer123",
    title: "Leveling my new character - Come chat!",
    game: "Whitemane",
    viewers: 847,
    isVip: false,
    isLive: true,
  },
  {
    id: "4",
    streamerName: "StreamerQueen",
    title: "Mount farming and chill vibes",
    game: "Whitemane",
    viewers: 1205,
    isVip: false,
    isLive: true,
  },
  {
    id: "5",
    streamerName: "TopTierGaming",
    title: "Mythic+ Dungeon Speed Runs",
    game: "Whitemane",
    viewers: 3421,
    isVip: false,
    isLive: true,
  },
  {
    id: "6",
    streamerName: "NewbieHelper",
    title: "Helping new players get started!",
    game: "Whitemane",
    viewers: 567,
    isVip: false,
    isLive: true,
  },
];

export const newsItems: NewsItem[] = [
  {
    id: 1,
    type: "AUTRE",
    title: "Ceci est un mock !",
    subtitle: "(Tout ça pour dire que c'est pas fini)",
    gradient: "from-blue-600 to-purple-600",
    featured: true,
  },
  {
    id: 2,
    type: "MISE À JOUR",
    title: "On a ENFIN nerf le craqueleur !",
    gradient: "from-red-600 to-orange-600",
    featured: false,
  },
  {
    id: 3,
    type: "NEWS",
    title: "Barnabé est de retour !",
    gradient: "from-green-600 to-blue-600",
    featured: false,
  },
];
