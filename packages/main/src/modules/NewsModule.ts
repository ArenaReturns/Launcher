import { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";
import { ipcMain, BrowserWindow, app } from "electron";
import log from "electron-log";

export interface NewsArticle {
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
      large?: { url: string; width: number; height: number; size: number };
      medium?: { url: string; width: number; height: number; size: number };
      small?: { url: string; width: number; height: number; size: number };
      thumbnail?: { url: string; width: number; height: number; size: number };
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

export interface NewsResponse {
  data: NewsArticle[];
  meta: {
    pagination: {
      start: number;
      limit: number;
      total: number;
    };
  };
}

export interface NewsState {
  articles: NewsArticle[];
  isLoading: boolean;
  error?: string;
  lastFetch?: number;
}

export class NewsModule implements AppModule {
  private apiUrl: string;
  private apiKey: string;
  private newsState: NewsState;
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes
  private refreshInterval: NodeJS.Timeout | null = null;
  private refreshIntervalMs: number = 10 * 60 * 1000; // 10 minutes

  constructor() {
    this.apiUrl =
      "https://strapi.arenareturns.com/api/articles?sort[0]=createdAt:desc&pagination[limit]=3&populate=*";
    this.apiKey =
      "76eddb3f5a761672248072c8f9766181b0fe99c22a09def192e8ba6fa17ae7e030790812e7bccd43b3498ca3ab454096a685530a304fadc1ef211c5578ab31d4c26e3c5231721742f444776652bf263a4f13c405fb4972865f7fb7dda4d5341ba039bec6f67f6385edec2d03641753c91965f2b62e063faa60d43d01dc527b0b";
    this.newsState = {
      articles: [],
      isLoading: false,
    };
  }

  async enable(context: ModuleContext): Promise<void> {
    // Register IPC handlers
    ipcMain.handle("news:getArticles", () => this.getArticles());
    ipcMain.handle("news:refreshArticles", () => this.fetchArticles());

    // Start automatic refresh every 10 minutes
    this.startPeriodicRefresh();
  }

  async disable(): Promise<void> {
    // Clear the refresh interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Remove IPC handlers
    ipcMain.removeHandler("news:getArticles");
    ipcMain.removeHandler("news:refreshArticles");
  }

  async getArticles(): Promise<NewsState> {
    // Return cached articles if they're still fresh
    if (
      this.newsState.lastFetch &&
      Date.now() - this.newsState.lastFetch < this.cacheTimeout &&
      this.newsState.articles.length > 0
    ) {
      return this.newsState;
    }

    // Otherwise fetch fresh articles
    return this.fetchArticles();
  }

  async fetchArticles(): Promise<NewsState> {
    this.newsState.isLoading = true;
    this.newsState.error = undefined;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      const response = await fetch(this.apiUrl, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": `ArenaReturnsLauncher/${app.getVersion()}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch news: ${response.status} ${response.statusText}`
        );
      }

      const data: NewsResponse = await response.json();

      // Check if articles have changed
      const oldArticleIds = this.newsState.articles.map(
        (article) => article.id
      );
      const newArticleIds = (data.data || []).map((article) => article.id);
      const hasNewArticles = newArticleIds.some(
        (id) => !oldArticleIds.includes(id)
      );

      this.newsState = {
        articles: data.data || [],
        isLoading: false,
        lastFetch: Date.now(),
      };

      // Notify renderer if there are new articles
      if (hasNewArticles && oldArticleIds.length > 0) {
        this.notifyRenderer("news-updated", this.newsState);
      }

      return this.newsState;
    } catch (error) {
      this.newsState = {
        ...this.newsState,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to fetch news",
      };

      return this.newsState;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private startPeriodicRefresh(): void {
    // Start the interval for automatic refresh
    this.refreshInterval = setInterval(async () => {
      try {
        await this.fetchArticles();
      } catch (error) {
        log.warn("Failed to auto-refresh news:", error);
      }
    }, this.refreshIntervalMs);
  }

  private notifyRenderer(event: string, data: any): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(`news:${event}`, data);
      }
    });
  }

  // Method to preload news during startup (non-blocking)
  async preloadNews(): Promise<void> {
    try {
      await this.fetchArticles();
    } catch (error) {
      // Silently fail during preload - news will be disabled if this fails
      log.warn("Failed to preload news:", error);
    }
  }
}

export function createNewsModule() {
  return new NewsModule();
}
