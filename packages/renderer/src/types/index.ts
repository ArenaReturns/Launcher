export type DownloadState =
  | "idle"
  | "downloading"
  | "paused"
  | "completed"
  | "error";

export interface TwitchStream {
  id: string;
  streamerName: string;
  title: string;
  game: string;
  viewers: number;
  isVip: boolean;
  isLive: boolean;
}

export interface SettingsState {
  // Game settings
  gameRamAllocation: number; // GB

  // Developer mode
  devModeEnabled: boolean;
  devExtraJavaArgs: string;
  devForceVersion: string;
  devCdnEnvironment: "production" | "staging";
}

export interface NewsItem {
  id: number;
  type: string;
  title: string;
  subtitle?: string;
  gradient: string;
  featured: boolean;
}
