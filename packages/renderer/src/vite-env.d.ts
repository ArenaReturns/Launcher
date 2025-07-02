/// <reference types="vite/client" />

interface GameStatus {
  isInstalled: boolean;
  needsUpdate: boolean;
  localVersion: string | null;
  remoteVersion: string | null;
  error?: string;
}

interface DownloadProgress {
  filesTotal: number;
  filesLoaded: number;
  isDownloading: boolean;
  currentFile?: string;
  error?: string;
  isRepairing?: boolean;
}

interface GameSettings {
  gameRamAllocation: number;
  devModeEnabled: boolean;
  devExtraJavaArgs: string;
  devForceVersion: string;
  devCdnEnvironment: "production" | "staging";
}

interface ReplayFile {
  filename: string;
  fullPath: string;
  date?: Date;
  player1?: string;
  player2?: string;
  isValidFormat: boolean;
}

interface NewsArticle {
  id: number;
  documentId: string;
  title: string;
  description: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  cover: {
    id: number;
    documentId: string;
    name: string;
    alternativeText: string | null;
    caption: string | null;
    width: number;
    height: number;
    formats: {
      large?: {
        ext: string;
        url: string;
        hash: string;
        mime: string;
        name: string;
        path: string | null;
        size: number;
        width: number;
        height: number;
        sizeInBytes: number;
      };
      medium?: {
        ext: string;
        url: string;
        hash: string;
        mime: string;
        name: string;
        path: string | null;
        size: number;
        width: number;
        height: number;
        sizeInBytes: number;
      };
      small?: {
        ext: string;
        url: string;
        hash: string;
        mime: string;
        name: string;
        path: string | null;
        size: number;
        width: number;
        height: number;
        sizeInBytes: number;
      };
      thumbnail?: {
        ext: string;
        url: string;
        hash: string;
        mime: string;
        name: string;
        path: string | null;
        size: number;
        width: number;
        height: number;
        sizeInBytes: number;
      };
    };
    hash: string;
    ext: string;
    mime: string;
    size: number;
    url: string;
    previewUrl: string | null;
    provider: string;
    provider_metadata: unknown;
    createdAt: string;
    updatedAt: string;
    publishedAt: string;
  } | null;
  blocks: Array<{
    __component: string;
    id: number;
    body: string;
  }>;
}

interface NewsState {
  articles: NewsArticle[];
  isLoading: boolean;
  error?: string;
  lastFetch?: number;
}

interface UpdateProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

interface UpdateStatus {
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  error?: string;
  progress?: UpdateProgress;
  version?: string;
}

interface PreloaderInitResult {
  gameStatus: GameStatus;
  updateStatus: UpdateStatus;
}
