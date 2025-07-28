import { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";
import { app, ipcMain, BrowserWindow } from "electron";
import { join } from "path";
import {
  readFile,
  writeFile,
  mkdir,
  access,
  readdir,
  stat,
  unlink,
  rmdir,
} from "fs/promises";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { constants } from "fs";
import { createHash } from "crypto";
import PQueue from "p-queue";
import log from "electron-log";

// Get app version from Electron's app metadata (works in both dev and packaged)
function getAppVersion(): string {
  return app.getVersion();
}

export interface GameVersionInfo {
  gameVersion: string;
}

export interface FileManifest {
  path: string;
  hash: string;
}

export interface VersionManifest {
  version: string;
  base: FileManifest[];
  windows: FileManifest[];
  "macos-intel": FileManifest[];
  "macos-arm": FileManifest[];
  linux: FileManifest[];
}

export interface GameStatus {
  isInstalled: boolean;
  needsUpdate: boolean;
  localVersion: string | null;
  remoteVersion: string | null;
  error?: string;
}

export interface DownloadProgress {
  filesTotal: number;
  filesLoaded: number;
  isDownloading: boolean;
  currentFile?: string;
  error?: string;
  isRepairing?: boolean;
}

export interface GameSettings {
  gameRamAllocation: number;
  devModeEnabled: boolean;
  devExtraJavaArgs: string;
  devForceVersion: string;
  devCdnEnvironment: "production" | "staging";
}

export interface ReplayFile {
  filename: string;
  fullPath: string;
  isValidFormat: boolean;
  date?: Date;
  player1?: string;
  player2?: string;
}

export class GameUpdater implements AppModule {
  protected gameClientPath: string;
  private versionFilePath: string;
  private environment: string;
  private cdnUrl: string;
  private downloadProgress: DownloadProgress;
  private versionManifest: VersionManifest | null = null;
  private currentDownloadQueue: PQueue | null = null;
  private currentSettings: GameSettings | undefined = undefined;
  private lastProgressNotification: number = 0;

  // Files and folders to exclude from cleanup (preserve user data)
  private readonly excludedFromCleanup = [
    "version.dat",
    "game/userPreferences.properties",
    "game/saves",
    "game/replays",
    "game/logs",
  ];

  constructor(environment: string = "production") {
    this.environment = environment;
    this.gameClientPath = join(app.getPath("appData"), "ArenaReturnsClient");
    this.versionFilePath = join(this.gameClientPath, "version.dat");
    this.cdnUrl = "https://launcher.cdn.arenareturns.com";
    this.downloadProgress = {
      filesTotal: 0,
      filesLoaded: 0,
      isDownloading: false,
    };
  }

  async enable(context: ModuleContext): Promise<void> {
    log.debug("GameUpdater module enabled with settings:", context.settings);

    // Initialize with settings from context
    this.updateSettings(context.settings);

    // Register IPC handlers for updating/downloading related actions
    ipcMain.handle("gameUpdater:getStatus", () => this.getGameStatus());
    ipcMain.handle("gameUpdater:checkForUpdates", () => this.checkForUpdates());
    ipcMain.handle("gameUpdater:startDownload", () => this.startDownload());
    ipcMain.handle("gameUpdater:getDownloadProgress", () =>
      this.getDownloadProgress()
    );
    ipcMain.handle("gameUpdater:cancelDownload", () => this.cancelDownload());
    ipcMain.handle("gameUpdater:repairClient", () => this.repairClient());
    ipcMain.handle("gameUpdater:openGameDirectory", () =>
      this.openGameDirectory()
    );
  }

  onSettingsUpdate(settings: GameSettings): void {
    log.debug("GameUpdater received settings update:", settings);
    this.updateSettings(settings);
  }

  // ---------------- Version helpers ----------------
  async getGameStatus(): Promise<GameStatus> {
    try {
      const [localVersion, remoteVersion] = await Promise.all([
        this.getLocalVersion(),
        this.getRemoteVersion(),
      ]);

      const isInstalled = localVersion !== null;
      const needsUpdate = isInstalled && localVersion !== remoteVersion;

      return {
        isInstalled,
        needsUpdate,
        localVersion,
        remoteVersion,
      };
    } catch (error) {
      return {
        isInstalled: false,
        needsUpdate: false,
        localVersion: null,
        remoteVersion: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async checkForUpdates(): Promise<GameStatus> {
    return this.getGameStatus();
  }

  updateSettings(settings: GameSettings): void {
    const previousSettings = this.currentSettings;
    this.currentSettings = settings;

    // Check if CDN environment changed
    if (previousSettings) {
      if (previousSettings.devCdnEnvironment !== settings.devCdnEnvironment) {
        log.debug(
          `CDN environment changed from ${previousSettings.devCdnEnvironment} to ${settings.devCdnEnvironment}, notifying UI to refresh status`
        );

        this.notifyRenderer("status-changed", {});
      }
    }
  }

  getGameClientPath(): string {
    return this.gameClientPath;
  }

  private async getLocalVersion(): Promise<string | null> {
    try {
      await access(this.gameClientPath, constants.F_OK);
      await access(this.versionFilePath, constants.F_OK);
      const versionData = await readFile(this.versionFilePath, "utf-8");
      return versionData.trim();
    } catch {
      return null;
    }
  }

  private async getRemoteVersion(): Promise<string> {
    const environment =
      this.currentSettings?.devModeEnabled &&
      this.currentSettings?.devCdnEnvironment
        ? this.currentSettings.devCdnEnvironment
        : this.environment;

    if (
      this.currentSettings?.devModeEnabled &&
      this.currentSettings?.devForceVersion
    ) {
      return this.currentSettings.devForceVersion;
    }

    const cdnUrl = `${this.cdnUrl}/${environment}.json`;
    log.debug(`Fetching version info from ${cdnUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(cdnUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": `ArenaReturnsLauncher/${getAppVersion()}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch version info: ${response.status} ${response.statusText}`
        );
      }

      const data: GameVersionInfo = await response.json();

      if (!data.gameVersion) {
        throw new Error("Invalid version data received from CDN");
      }

      return data.gameVersion;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ---------------- Version file write ----------------
  async updateLocalVersion(version: string): Promise<void> {
    try {
      await mkdir(this.gameClientPath, { recursive: true });
      await writeFile(this.versionFilePath, version, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to update local version: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // ---------------- Download helpers ----------------
  getDownloadProgress(): DownloadProgress {
    return this.downloadProgress;
  }

  async startDownload(): Promise<void> {
    if (this.downloadProgress.isDownloading) {
      throw new Error("Download or repair already in progress");
    }

    try {
      this.downloadProgress = {
        filesTotal: 0,
        filesLoaded: 0,
        isDownloading: true,
      };

      this.notifyRenderer("download-started", this.downloadProgress);

      const remoteVersion = await this.getRemoteVersion();
      const manifestResponse = await fetch(
        `${this.cdnUrl}/versions/${remoteVersion}.json`
      );

      if (!manifestResponse.ok) {
        throw new Error(
          `Failed to fetch version manifest: ${manifestResponse.status}`
        );
      }

      this.versionManifest = (await manifestResponse.json()) as VersionManifest;

      const filesToCheck = this.getPlatformFiles(this.versionManifest);
      await this.checkFiles(filesToCheck);
    } catch (error) {
      this.downloadProgress = {
        ...this.downloadProgress,
        isDownloading: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      this.notifyRenderer("download-error", this.downloadProgress);
      throw error;
    }
  }

  async cancelDownload(): Promise<void> {
    if (this.currentDownloadQueue) {
      this.currentDownloadQueue.clear();
      this.currentDownloadQueue = null;
    }

    this.downloadProgress = {
      ...this.downloadProgress,
      isDownloading: false,
      isRepairing: false,
      currentFile: "Téléchargement annulé",
    };

    this.notifyRenderer("download-cancelled", this.downloadProgress);
  }

  async repairClient(): Promise<void> {
    if (this.downloadProgress.isDownloading) {
      throw new Error("Download or repair already in progress");
    }

    try {
      this.downloadProgress = {
        filesTotal: 0,
        filesLoaded: 0,
        isDownloading: true,
        isRepairing: true,
        currentFile: "Initialisation de la réparation...",
      };

      this.notifyRenderer("download-started", this.downloadProgress);

      const remoteVersion = await this.getRemoteVersion();
      const manifestResponse = await fetch(
        `${this.cdnUrl}/versions/${remoteVersion}.json`
      );

      if (!manifestResponse.ok) {
        throw new Error(
          `Failed to fetch version manifest: ${manifestResponse.status}`
        );
      }

      this.versionManifest = (await manifestResponse.json()) as VersionManifest;

      const filesToCheck = this.getPlatformFiles(this.versionManifest);

      this.downloadProgress.currentFile =
        "Vérification de l'intégrité des fichiers...";
      this.notifyRenderer("download-progress", this.downloadProgress);

      await this.checkFiles(filesToCheck, true);
    } catch (error) {
      this.downloadProgress = {
        ...this.downloadProgress,
        isDownloading: false,
        isRepairing: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      this.notifyRenderer("download-error", this.downloadProgress);
      throw error;
    }
  }

  async openGameDirectory(): Promise<void> {
    const { shell } = await import("electron");
    try {
      await shell.openPath(this.gameClientPath);
    } catch (error) {
      throw new Error(
        `Failed to open game directory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // ---------------- Internal helpers ----------------
  private getPlatformFiles(manifest: VersionManifest): FileManifest[] {
    const files: FileManifest[] = [...manifest.base];

    switch (process.platform) {
      case "win32":
        files.push(...manifest.windows);
        break;
      case "darwin":
        if (process.arch === "x64") {
          files.push(...manifest["macos-intel"]);
        } else {
          files.push(...manifest["macos-arm"]);
        }
        break;
      case "linux":
        files.push(...manifest.linux);
        break;
    }

    return files;
  }

  private async checkFiles(
    files: FileManifest[],
    forceCheck = false
  ): Promise<void> {
    if (!existsSync(this.gameClientPath)) {
      mkdirSync(this.gameClientPath, { recursive: true });
      await this.downloadFiles(files);
      return;
    }

    this.downloadProgress.filesTotal = files.length;
    this.downloadProgress.filesLoaded = 0;
    this.notifyRenderer("download-progress", this.downloadProgress);

    const filesToDownload: FileManifest[] = [];

    for (let i = 0; i < files.length; i++) {
      if (!this.downloadProgress.isDownloading) {
        return;
      }

      if (i % 10 === 0) {
        this.downloadProgress.filesLoaded = i;
        this.downloadProgress.currentFile = this.downloadProgress.isRepairing
          ? `Vérification de l'intégrité: ${files[i].path.split("/").pop()}`
          : `Vérification: ${files[i].path.split("/").pop()}`;
        this.notifyRenderer("download-progress", this.downloadProgress);
      }

      const file = files[i];
      const filePath = join(this.gameClientPath, file.path);

      if (!existsSync(filePath)) {
        filesToDownload.push(file);
        continue;
      }

      try {
        const fileBuffer = readFileSync(filePath);
        const fileHash = createHash("md5").update(fileBuffer).digest("hex");
        if (fileHash !== file.hash) {
          filesToDownload.push(file);
        }
      } catch (error) {
        filesToDownload.push(file);
      }

      if (i % 5 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    if (filesToDownload.length > 0) {
      await this.downloadFiles(filesToDownload);
    } else {
      if (this.versionManifest) {
        this.downloadProgress.currentFile =
          "Nettoyage des fichiers obsolètes...";
        this.notifyRenderer("download-progress", this.downloadProgress);

        await this.cleanupObsoleteFiles(this.versionManifest);
      }

      await this.downloadComplete();
    }
  }

  private async downloadFiles(files: FileManifest[]): Promise<void> {
    this.downloadProgress.filesTotal = files.length;
    this.downloadProgress.filesLoaded = 0;
    this.notifyRenderer("download-progress", this.downloadProgress);

    const queue = new PQueue({ concurrency: 3 });
    this.currentDownloadQueue = queue;

    queue.on("active", () => {
      this.notifyRenderer("download-progress", this.downloadProgress);
    });

    queue.on("error", (error) => {
      log.error("Download queue error:", error);
      this.downloadProgress.error = error.message;
      this.notifyRenderer("download-error", this.downloadProgress);
    });

    const downloadPromises = files.map((file) =>
      queue.add(() => this.downloadAndSaveFile(file), {
        priority: 1,
      })
    );

    try {
      await Promise.all(downloadPromises);

      if (!this.downloadProgress.isDownloading) {
        this.currentDownloadQueue = null;
        return;
      }

      if (this.versionManifest) {
        this.downloadProgress.currentFile =
          "Nettoyage des fichiers obsolètes...";
        this.notifyRenderer("download-progress", this.downloadProgress);

        await this.cleanupObsoleteFiles(this.versionManifest);
      }

      this.currentDownloadQueue = null;
      await this.downloadComplete();
    } catch (error) {
      this.currentDownloadQueue = null;
      this.downloadProgress.error =
        error instanceof Error ? error.message : "Download failed";
      this.notifyRenderer("download-error", this.downloadProgress);
      throw error;
    }
  }

  private async downloadAndSaveFile(file: FileManifest): Promise<void> {
    if (!this.downloadProgress.isDownloading) {
      throw new Error("Download cancelled");
    }

    try {
      const filePath = join(this.gameClientPath, file.path);
      const fileUrl = `${this.cdnUrl}/artifacts/${file.hash.substring(0, 2)}/${
        file.hash
      }`;

      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to download file: ${response.status} ${response.statusText}`
        );
      }

      const fileBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(fileBuffer);

      if (!this.downloadProgress.isDownloading) {
        throw new Error("Download cancelled");
      }

      const dir = join(
        this.gameClientPath,
        file.path.split("/").slice(0, -1).join("/")
      );
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(filePath, buffer);

      this.downloadProgress.filesLoaded++;
      this.downloadProgress.currentFile = file.path;

      if (
        this.downloadProgress.filesLoaded % 3 === 0 ||
        this.downloadProgress.filesLoaded === this.downloadProgress.filesTotal
      ) {
        this.notifyRenderer("download-progress", this.downloadProgress);
      }
    } catch (error) {
      throw new Error(
        `Failed to download file ${file.path}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async downloadComplete(): Promise<void> {
    if (!this.versionManifest) {
      throw new Error("Version manifest not available");
    }

    writeFileSync(this.versionFilePath, this.versionManifest.version);

    this.downloadProgress = {
      filesTotal: this.downloadProgress.filesTotal,
      filesLoaded: this.downloadProgress.filesTotal,
      isDownloading: false,
      isRepairing: false,
    };

    this.notifyRenderer("download-complete", this.downloadProgress);
  }

  private async cleanupObsoleteFiles(manifest: VersionManifest): Promise<void> {
    if (!existsSync(this.gameClientPath)) {
      return;
    }

    try {
      const expectedFiles = this.getPlatformFiles(manifest);
      const expectedFilePaths = new Set(expectedFiles.map((f) => f.path));

      const localFiles = await this.getAllLocalFiles();

      const filesToRemove: string[] = [];
      const foldersToCheck: string[] = [];

      for (const localFile of localFiles) {
        if (
          !expectedFilePaths.has(localFile) &&
          !this.isExcludedFromCleanup(localFile)
        ) {
          const fullPath = join(this.gameClientPath, localFile);
          const fileStat = await stat(fullPath).catch(() => null);

          if (fileStat?.isFile()) {
            filesToRemove.push(localFile);
          } else if (fileStat?.isDirectory()) {
            foldersToCheck.push(localFile);
          }
        }
      }

      for (const fileToRemove of filesToRemove) {
        try {
          const fullPath = join(this.gameClientPath, fileToRemove);
          await unlink(fullPath);
          log.info(`Removed obsolete file: ${fileToRemove}`);
        } catch (error) {
          log.warn(`Failed to remove file ${fileToRemove}:`, error);
        }
      }

      for (const folder of foldersToCheck) {
        try {
          const fullPath = join(this.gameClientPath, folder);
          const folderContents = await readdir(fullPath);

          if (folderContents.length === 0) {
            await rmdir(fullPath);
            log.info(`Removed empty directory: ${folder}`);
          }
        } catch (error) {
          // Ignore non-critical errors
        }
      }
    } catch (error) {
      log.warn("Failed to cleanup obsolete files:", error);
    }
  }

  private async getAllLocalFiles(
    dirPath: string = this.gameClientPath,
    relativeTo: string = this.gameClientPath,
    files: string[] = []
  ): Promise<string[]> {
    try {
      const entries = await readdir(dirPath);

      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const relativePath = fullPath.substring(relativeTo.length + 1);
        const normalizedPath = relativePath.replace(/\\/g, "/");

        const entryStat = await stat(fullPath);

        if (entryStat.isDirectory()) {
          files.push(normalizedPath);
          await this.getAllLocalFiles(fullPath, relativeTo, files);
        } else if (entryStat.isFile()) {
          files.push(normalizedPath);
        }
      }
    } catch {
      /* ignore */
    }

    return files;
  }

  private isExcludedFromCleanup(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, "/");

    for (const excluded of this.excludedFromCleanup) {
      const normalizedExcluded = excluded.replace(/\\/g, "/");

      if (normalizedPath === normalizedExcluded) {
        return true;
      }

      if (normalizedPath.startsWith(normalizedExcluded + "/")) {
        return true;
      }
    }

    return false;
  }

  // ---------------- Renderer notification helper ----------------
  private notifyRenderer(event: string, data: any): void {
    if (event === "download-progress") {
      const now = Date.now();
      if (now - this.lastProgressNotification < 100) {
        return;
      }
      this.lastProgressNotification = now;
    }

    const windows = BrowserWindow.getAllWindows();
    windows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(`gameUpdater:${event}`, data);
      }
    });
  }
}

export function createGameUpdaterModule(environment?: string) {
  return new GameUpdater(environment);
}
