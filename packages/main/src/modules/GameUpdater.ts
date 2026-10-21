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
import { getErrorDetails, OperationError } from "../utils/errorDetails.js";

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
  linux_arm64: FileManifest[];
  linux_x64: FileManifest[];
  windows_arm64: FileManifest[];
  windows_x86: FileManifest[];
  windows_x64: FileManifest[];
  macos_x64: FileManifest[];
  macos_arm64: FileManifest[];
}

export type PlatformManifestEntry = Exclude<
  keyof VersionManifest,
  "version" | "base"
>;

export function getPlatformManifestEntry(): PlatformManifestEntry {
  switch (`${process.platform}_${process.arch}`) {
    case "linux_arm64":
      return "linux_arm64";
    case "linux_x64":
      return "linux_x64";
    case "win32_arm64":
      return "windows_arm64";
    // case "win32_ia32": //no jdk to support it \o/
    //   return "windows_x86";
    case "win32_x64":
      return "windows_x64";
    case "darwin_x64":
      return "macos_x64";
    case "darwin_arm64":
      return "macos_arm64";
    default:
      throw new Error(
        `Unsupported platform or architecture: ${process.platform}/${process.arch}`,
      );
  }
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
  devGameArgs: string;
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
  private downloadController: AbortController | null = null;
  private downloadSettled: Promise<void> | null = null;
  private currentSettings: GameSettings | undefined = undefined;
  private lastProgressNotification: number = 0;

  // Files and folders to exclude from cleanup (preserve user data)
  private readonly excludedFromCleanup = [
    "version.dat",
    "game/userPreferences.properties",
    "game/saves",
    "game/replays",
    "game/logs",
    "game/shortcuts.xml",
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
      this.getDownloadProgress(),
    );
    ipcMain.handle("gameUpdater:cancelDownload", () => this.cancelDownload());
    ipcMain.handle("gameUpdater:repairClient", () => this.repairClient());
    ipcMain.handle("gameUpdater:openGameDirectory", () =>
      this.openGameDirectory(),
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
      log.error(
        "GameUpdater: Status check failed",
        JSON.stringify(getErrorDetails(error)),
      );
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
          `CDN environment changed from ${previousSettings.devCdnEnvironment} to ${settings.devCdnEnvironment}, notifying UI to refresh status`,
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

  private getEnvironment(): string {
    return this.currentSettings?.devModeEnabled &&
      this.currentSettings.devCdnEnvironment
      ? this.currentSettings.devCdnEnvironment
      : this.environment;
  }

  private async getRemoteVersion(signal?: AbortSignal): Promise<string> {
    if (
      this.currentSettings?.devModeEnabled &&
      this.currentSettings?.devForceVersion
    ) {
      return this.currentSettings.devForceVersion;
    }

    const data = await this.fetchResource<GameVersionInfo>(
      `${this.cdnUrl}/${this.getEnvironment()}.json`,
      (response) => response.json(),
      "version-info",
      signal,
      5000,
    );
    if (!data.gameVersion) {
      throw new Error("Invalid version data received from CDN");
    }
    return data.gameVersion;
  }

  private async fetchResource<T>(
    url: string,
    readResponse: (response: Response) => Promise<T>,
    resource: string,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<T> {
    const startedAt = Date.now();
    const timeoutSignal = timeoutMs
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
    const signals = [signal, timeoutSignal].filter(
      (entry): entry is AbortSignal => entry !== undefined,
    );
    let phase = "connect";
    let response: Response | undefined;
    try {
      response = await fetch(url, {
        signal: signals.length ? AbortSignal.any(signals) : undefined,
        headers: { "User-Agent": `ArenaReturnsLauncher/${getAppVersion()}` },
      });
      phase = "http-status";
      if (!response.ok) {
        // Release the response body before reporting an HTTP failure.
        await response.body?.cancel().catch(() => {});
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      phase = "read-body";
      return await readResponse(response);
    } catch (error) {
      throw new OperationError(
        `Failed to fetch ${resource}: ${error instanceof Error ? error.message : String(error)}`,
        {
          resource,
          phase,
          url,
          elapsedMs: Date.now() - startedAt,
          status: response?.status,
          statusText: response?.statusText,
          responseUrl: response?.url,
          timeoutMs,
          timedOut: timeoutSignal?.aborted ?? false,
        },
        error,
      );
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
        }`,
        { cause: error },
      );
    }
  }

  // ---------------- Download helpers ----------------
  getDownloadProgress(): DownloadProgress {
    return this.downloadProgress;
  }

  async startDownload(): Promise<void> {
    return this.runDownload(false);
  }

  async repairClient(): Promise<void> {
    return this.runDownload(true);
  }

  private async runDownload(isRepairing: boolean): Promise<void> {
    if (this.downloadProgress.isDownloading) {
      throw new Error("Download or repair already in progress");
    }

    const controller = new AbortController();
    this.downloadController = controller;
    const completion = Promise.withResolvers<void>();
    this.downloadSettled = completion.promise;
    const { signal } = controller;
    const startedAt = Date.now();
    const operation = isRepairing ? "repair" : "install";
    let phase = "resolve-version";
    let remoteVersion: string | undefined;
    this.versionManifest = null;
    this.downloadProgress = {
      filesTotal: 0,
      filesLoaded: 0,
      isDownloading: true,
      isRepairing,
      currentFile: isRepairing
        ? "Initialisation de la réparation..."
        : undefined,
    };
    try {
      log.info("GameUpdater: Operation started", {
        operation,
        environment: this.getEnvironment(),
        forcedVersion: this.currentSettings?.devModeEnabled
          ? this.currentSettings.devForceVersion
          : undefined,
        platform: process.platform,
        architecture: process.arch,
        installPath: this.gameClientPath,
        cdnUrl: this.cdnUrl,
      });
      this.notifyRenderer("download-started", this.downloadProgress);

      remoteVersion = await this.getRemoteVersion(signal);
      signal.throwIfAborted();
      phase = "fetch-manifest";
      const manifestURL = `${this.cdnUrl}/versions/${remoteVersion}.json`;
      log.info("GameUpdater: Fetching manifest", { url: manifestURL });
      const manifest = await this.fetchResource<VersionManifest>(
        manifestURL,
        (response) => response.json(),
        "manifest",
        signal,
      );
      signal.throwIfAborted();
      this.versionManifest = manifest;

      phase = "check-and-download-files";
      const filesToCheck = this.getPlatformFiles(this.versionManifest);
      log.info("GameUpdater: Manifest loaded", {
        requestedVersion: remoteVersion,
        manifestVersion: this.versionManifest.version,
        platform: getPlatformManifestEntry(),
        filesTotal: filesToCheck.length,
      });
      if (isRepairing) {
        this.downloadProgress.currentFile =
          "Vérification de l'intégrité des fichiers...";
        this.notifyRenderer("download-progress", this.downloadProgress);
      }
      await this.checkFiles(filesToCheck, signal);
      signal.throwIfAborted();
      phase = "finalize";
      this.downloadProgress.currentFile = "Nettoyage des fichiers obsolètes...";
      this.notifyRenderer("download-progress", this.downloadProgress);
      await this.cleanupObsoleteFiles(this.versionManifest, signal);
      signal.throwIfAborted();
      await this.downloadComplete();
      log.info("GameUpdater: Operation completed", {
        operation,
        version: remoteVersion,
        elapsedMs: Date.now() - startedAt,
        filesTotal: this.downloadProgress.filesTotal,
      });
    } catch (error) {
      // An old cancelled operation must never overwrite a newer attempt's state.
      if (signal.aborted) return;
      log.error(
        "GameUpdater: Operation failed",
        JSON.stringify({
          operation,
          phase,
          version: remoteVersion,
          elapsedMs: Date.now() - startedAt,
          installPath: this.gameClientPath,
          filesLoaded: this.downloadProgress.filesLoaded,
          filesTotal: this.downloadProgress.filesTotal,
          error: getErrorDetails(error),
        }),
      );
      this.downloadProgress = {
        ...this.downloadProgress,
        isDownloading: false,
        isRepairing: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      this.notifyRenderer("download-error", this.downloadProgress);
      throw error;
    } finally {
      if (this.downloadController === controller) {
        this.downloadController = null;
        this.downloadSettled = null;
      }
      completion.resolve();
    }
  }

  async cancelDownload(): Promise<void> {
    if (!this.downloadController) return;
    log.info("GameUpdater: Cancellation requested", {
      filesLoaded: this.downloadProgress.filesLoaded,
      filesTotal: this.downloadProgress.filesTotal,
    });
    this.downloadController.abort();
    // Finish in-flight filesystem work before allowing a new installation.
    await this.downloadSettled;
    this.downloadProgress = {
      ...this.downloadProgress,
      isDownloading: false,
      isRepairing: false,
      currentFile: "Téléchargement annulé",
    };
    this.notifyRenderer("download-cancelled", this.downloadProgress);
  }

  async openGameDirectory(): Promise<void> {
    const { shell } = await import("electron");
    try {
      await shell.openPath(this.gameClientPath);
    } catch (error) {
      throw new Error(
        `Failed to open game directory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  // ---------------- Internal helpers ----------------
  private getPlatformFiles(manifest: VersionManifest): FileManifest[] {
    return [...manifest.base, ...manifest[getPlatformManifestEntry()]];
  }

  private async checkFiles(
    files: FileManifest[],
    signal: AbortSignal,
  ): Promise<void> {
    if (!existsSync(this.gameClientPath)) {
      mkdirSync(this.gameClientPath, { recursive: true });
      await this.downloadFiles(files, signal);
      return;
    }

    this.downloadProgress.filesTotal = files.length;
    this.downloadProgress.filesLoaded = 0;
    this.notifyRenderer("download-progress", this.downloadProgress);

    const filesToDownload: FileManifest[] = [];

    for (let i = 0; i < files.length; i++) {
      signal.throwIfAborted();

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
        log.warn(
          "GameUpdater: Unable to verify local file",
          JSON.stringify({
            file: file.path,
            localPath: filePath,
            error: getErrorDetails(error),
          }),
        );
        filesToDownload.push(file);
      }

      if (i % 5 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    log.info("GameUpdater: File check completed", {
      filesChecked: files.length,
      filesToDownload: filesToDownload.length,
    });
    if (filesToDownload.length > 0) {
      await this.downloadFiles(filesToDownload, signal);
    }
  }

  private async downloadFiles(
    files: FileManifest[],
    operationSignal: AbortSignal,
  ): Promise<void> {
    operationSignal.throwIfAborted();
    this.downloadProgress.filesTotal = files.length;
    this.downloadProgress.filesLoaded = 0;
    this.notifyRenderer("download-progress", this.downloadProgress);
    log.info("GameUpdater: Downloading files", {
      filesTotal: files.length,
      concurrency: 3,
    });

    const queue = new PQueue({ concurrency: 3 });
    const batchController = new AbortController();
    const signal = AbortSignal.any([operationSignal, batchController.signal]);
    let firstError: unknown;

    // Drain skipped jobs instead of queue.clear(), which leaves their promises pending.
    // Catch inside each job so the queue cannot start another request after a failure.
    await Promise.all(
      files.map((file) =>
        queue.add(async () => {
          if (signal.aborted) return;
          try {
            await this.downloadAndSaveFile(file, signal);
          } catch (error) {
            if (signal.aborted) return;
            firstError = error;
            batchController.abort();
          }
        }),
      ),
    );
    operationSignal.throwIfAborted();
    if (batchController.signal.aborted) throw firstError;
  }

  private async downloadAndSaveFile(
    file: FileManifest,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const startedAt = Date.now();
    const filePath = join(this.gameClientPath, file.path);
    const fileUrl = `${this.cdnUrl}/artifacts/${file.hash.substring(0, 2)}/${file.hash}`;
    let phase = "download";
    try {
      const fileBuffer = await this.fetchResource(
        fileUrl,
        (response) => response.arrayBuffer(),
        "artifact",
        signal,
      );
      signal.throwIfAborted();
      phase = "write-file";
      const dir = join(
        this.gameClientPath,
        file.path.split("/").slice(0, -1).join("/"),
      );
      mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, Buffer.from(fileBuffer));

      this.downloadProgress.filesLoaded++;
      this.downloadProgress.currentFile = file.path;
      if (
        this.downloadProgress.filesLoaded % 3 === 0 ||
        this.downloadProgress.filesLoaded === this.downloadProgress.filesTotal
      ) {
        this.notifyRenderer("download-progress", this.downloadProgress);
      }
    } catch (error) {
      throw new OperationError(
        `Failed to download file ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
        {
          phase,
          file: file.path,
          localPath: filePath,
          url: fileUrl,
          expectedHash: file.hash,
          elapsedMs: Date.now() - startedAt,
        },
        error,
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

  private async cleanupObsoleteFiles(
    manifest: VersionManifest,
    signal: AbortSignal,
  ): Promise<void> {
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
        signal.throwIfAborted();
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
          signal.throwIfAborted();
          await unlink(fullPath);
          log.info(`Removed obsolete file: ${fileToRemove}`);
        } catch (error) {
          if (signal.aborted) throw error;
          log.warn(`Failed to remove file ${fileToRemove}:`, error);
        }
      }

      for (const folder of foldersToCheck) {
        try {
          const fullPath = join(this.gameClientPath, folder);
          const folderContents = await readdir(fullPath);

          if (folderContents.length === 0) {
            signal.throwIfAborted();
            await rmdir(fullPath);
            log.info(`Removed empty directory: ${folder}`);
          }
        } catch (error) {
          if (signal.aborted) throw error;
          // Ignore non-critical errors
        }
      }
    } catch (error) {
      if (signal.aborted) throw error;
      log.warn(
        "Failed to cleanup obsolete files:",
        JSON.stringify(getErrorDetails(error)),
      );
    }
  }

  private async getAllLocalFiles(
    dirPath: string = this.gameClientPath,
    relativeTo: string = this.gameClientPath,
    files: string[] = [],
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
