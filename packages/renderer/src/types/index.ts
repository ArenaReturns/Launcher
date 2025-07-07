export type DownloadState =
  | "idle"
  | "downloading"
  | "paused"
  | "completed"
  | "error";

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tag_ids: string[];
  tags: string[];
  is_mature: boolean;
}

export interface TwitchApiResponse {
  stream_count: number;
  streams: TwitchStream[];
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
