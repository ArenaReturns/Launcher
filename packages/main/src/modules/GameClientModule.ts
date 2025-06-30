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
  chmod,
  unlink,
  rmdir,
} from "fs/promises";
import { chmodSync } from "fs";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { constants } from "fs";
import { createHash } from "crypto";
import { exec } from "child_process";
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
  macos: FileManifest[];
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

interface JavaProcessOptions {
  mainClass: string;
  settings?: GameSettings;
  extraArgs?: string[];
}

export class GameClientModule implements AppModule {
  private gameClientPath: string;
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
    // Register IPC handlers
    ipcMain.handle("game:getStatus", () => this.getGameStatus());
    ipcMain.handle("game:checkForUpdates", () => this.checkForUpdates());
    ipcMain.handle("game:startDownload", () => this.startDownload());
    ipcMain.handle("game:getDownloadProgress", () =>
      this.getDownloadProgress()
    );
    ipcMain.handle("game:cancelDownload", () => this.cancelDownload());
    ipcMain.handle("game:launchGame", (event, settings) =>
      this.launchGame(settings)
    );
    ipcMain.handle("game:repairClient", () => this.repairClient());
    ipcMain.handle("game:openGameDirectory", () => this.openGameDirectory());
    ipcMain.handle("game:openReplaysFolder", () => this.openReplaysFolder());
    ipcMain.handle("game:updateSettings", (event, settings) =>
      this.updateSettings(settings)
    );
    ipcMain.handle("game:listReplays", () => this.listReplays());
    ipcMain.handle("game:launchReplay", (event, replayPath, settings) =>
      this.launchReplay(replayPath, settings)
    );
  }

  async getGameStatus(): Promise<GameStatus> {
    try {
      const [localVersion, remoteVersion] = await Promise.all([
        this.getLocalVersion(),
        this.getRemoteVersion(this.currentSettings),
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
    this.currentSettings = settings;
  }

  private async getLocalVersion(): Promise<string | null> {
    try {
      // Check if game client folder exists
      await access(this.gameClientPath, constants.F_OK);

      // Check if version.dat exists
      await access(this.versionFilePath, constants.F_OK);

      const versionData = await readFile(this.versionFilePath, "utf-8");
      return versionData.trim();
    } catch {
      return null;
    }
  }

  private async getRemoteVersion(settings?: GameSettings): Promise<string> {
    // Use dev environment if specified in settings
    const environment =
      settings?.devModeEnabled && settings?.devCdnEnvironment
        ? settings.devCdnEnvironment
        : this.environment;

    // Use forced version if specified in dev mode
    if (settings?.devModeEnabled && settings?.devForceVersion) {
      return settings.devForceVersion;
    }

    const cdnUrl = `https://launcher.cdn.arenareturns.com/${environment}.json`;

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

  async updateLocalVersion(version: string): Promise<void> {
    try {
      // Create directory if it doesn't exist
      await mkdir(this.gameClientPath, { recursive: true });

      // Write version to file
      await writeFile(this.versionFilePath, version, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to update local version: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

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

      // Get the latest version manifest
      const remoteVersion = await this.getRemoteVersion(this.currentSettings);
      const manifestResponse = await fetch(
        `${this.cdnUrl}/versions/${remoteVersion}.json`
      );

      if (!manifestResponse.ok) {
        throw new Error(
          `Failed to fetch version manifest: ${manifestResponse.status}`
        );
      }

      this.versionManifest = (await manifestResponse.json()) as VersionManifest;

      // Get platform-specific files
      const filesToCheck = this.getPlatformFiles(this.versionManifest);

      // Check which files need to be downloaded
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
    // Stop the current download queue if it exists
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

  async launchGame(settings?: GameSettings): Promise<void> {
    try {
      // First, check for updates before launching
      const gameStatus = await this.getGameStatus();

      if (!gameStatus.isInstalled) {
        throw new Error("Game is not installed");
      }

      if (gameStatus.needsUpdate) {
        throw new Error("Game needs to be updated before launching");
      }

      if (gameStatus.error) {
        throw new Error(`Cannot launch game: ${gameStatus.error}`);
      }

      // Launch the game with settings
      await this.startJavaProcess({
        mainClass: "com.ankamagames.dofusarena.client.DofusArenaClient",
        settings,
      });
    } catch (error) {
      throw new Error(
        `Failed to launch game: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
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

      // Notify immediately to provide instant feedback
      this.notifyRenderer("download-started", this.downloadProgress);

      // Get the latest version manifest
      const remoteVersion = await this.getRemoteVersion(this.currentSettings);
      const manifestResponse = await fetch(
        `${this.cdnUrl}/versions/${remoteVersion}.json`
      );

      if (!manifestResponse.ok) {
        throw new Error(
          `Failed to fetch version manifest: ${manifestResponse.status}`
        );
      }

      this.versionManifest = (await manifestResponse.json()) as VersionManifest;

      // Get platform-specific files
      const filesToCheck = this.getPlatformFiles(this.versionManifest);

      this.downloadProgress.currentFile =
        "Vérification de l'intégrité des fichiers...";
      this.notifyRenderer("download-progress", this.downloadProgress);

      // Check all files and repair any missing or corrupted ones
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

  async openReplaysFolder(): Promise<void> {
    const { shell } = await import("electron");
    const replaysPath = join(this.gameClientPath, "game", "replays");

    try {
      // Create replays directory if it doesn't exist
      await mkdir(replaysPath, { recursive: true });
      await shell.openPath(replaysPath);
    } catch (error) {
      throw new Error(
        `Failed to open replays folder: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async listReplays(): Promise<ReplayFile[]> {
    const replaysPath = join(this.gameClientPath, "game", "replays");

    try {
      // Create replays directory if it doesn't exist
      await mkdir(replaysPath, { recursive: true });

      // Read directory contents
      const files = await readdir(replaysPath);

      // Filter for .rda files and parse them
      const replayFiles: ReplayFile[] = [];

      for (const filename of files) {
        if (!filename.toLowerCase().endsWith(".rda")) {
          continue;
        }

        const fullPath = join(replaysPath, filename);
        const replayInfo = this.parseReplayFilename(filename, fullPath);
        replayFiles.push(replayInfo);
      }

      // Sort by date (newest first) if valid, otherwise by filename
      replayFiles.sort((a, b) => {
        if (a.date && b.date) {
          return b.date.getTime() - a.date.getTime();
        } else if (a.date && !b.date) {
          return -1;
        } else if (!a.date && b.date) {
          return 1;
        } else {
          return a.filename.localeCompare(b.filename);
        }
      });

      return replayFiles;
    } catch (error) {
      throw new Error(
        `Failed to list replays: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async launchReplay(
    replayPath: string,
    settings?: GameSettings
  ): Promise<void> {
    try {
      // First check if game is installed and up to date
      const gameStatus = await this.getGameStatus();

      if (!gameStatus.isInstalled) {
        throw new Error("Game is not installed");
      }

      if (gameStatus.needsUpdate) {
        throw new Error("Game needs to be updated before launching replays");
      }

      if (gameStatus.error) {
        throw new Error(`Cannot launch replay: ${gameStatus.error}`);
      }

      // Check if replay file exists
      if (!existsSync(replayPath)) {
        throw new Error("Replay file not found");
      }

      // Launch the replay with the replay player
      await this.startJavaProcess({
        mainClass: "com.ankamagames.dofusarena.client.DofusArenaReplayPlayer",
        settings,
        extraArgs: [`-REPLAY_FILE_PATH=${replayPath}`],
      });
    } catch (error) {
      throw new Error(
        `Failed to launch replay: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private parseReplayFilename(filename: string, fullPath: string): ReplayFile {
    // Expected formats:
    // 1. 56_1211222137_Wanted-Trash_VS_RaidenThePro.rda (with version prefix)
    // 2. 1211222137_Wanted-Trash_VS_RaidenThePro.rda (without version prefix)
    // Where: [gameVersion_]yyMMddHHmm_Player1_VS_Player2.rda

    const replayFile: ReplayFile = {
      filename,
      fullPath,
      isValidFormat: false,
    };

    try {
      // Remove .rda extension
      const nameWithoutExt = filename.replace(/\.rda$/i, "");

      // Split by underscores
      const parts = nameWithoutExt.split("_");

      if (parts.length >= 3) {
        // Try to find the date part (yyMMddHHmm format)
        let datePartIndex = -1;
        let datePart = "";

        // Check each part to see if it matches the date format
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].length === 10 && /^\d{10}$/.test(parts[i])) {
            // This looks like a date part (10 digits)
            datePartIndex = i;
            datePart = parts[i];
            break;
          }
        }

        if (datePartIndex >= 0 && datePart.length === 10) {
          // Parse date: yyMMddHHmm
          const year = 2000 + parseInt(datePart.substring(0, 2));
          const month = parseInt(datePart.substring(2, 4)) - 1; // Month is 0-indexed
          const day = parseInt(datePart.substring(4, 6));
          const hour = parseInt(datePart.substring(6, 8));
          const minute = parseInt(datePart.substring(8, 10));

          const date = new Date(year, month, day, hour, minute);

          // Check if date is valid and reasonable (not in future)
          const now = new Date();

          if (!isNaN(date.getTime()) && date <= now) {
            replayFile.date = date;

            // Extract player names from parts after the date
            if (datePartIndex + 1 < parts.length) {
              const playersPart = parts.slice(datePartIndex + 1).join("_");
              const playerMatch = playersPart.match(/^(.+)_VS_(.+)$/);

              if (playerMatch) {
                replayFile.player1 = playerMatch[1].replace(/-/g, " ");
                replayFile.player2 = playerMatch[2].replace(/-/g, " ");
                replayFile.isValidFormat = true;
              }
            }
          }
        }
      }
    } catch (error) {
      // If parsing fails, isValidFormat remains false
      log.warn(`Failed to parse replay filename ${filename}:`, error);
    }

    return replayFile;
  }

  private async startJavaProcess(options: JavaProcessOptions): Promise<void> {
    const { mainClass, settings, extraArgs = [] } = options;

    const gameDir = join(this.gameClientPath, "game");
    const libDir = join(this.gameClientPath, "lib");
    const jreDir = join(this.gameClientPath, "jre");
    const nativesDir = join(this.gameClientPath, "natives");

    // Check if required directories exist
    if (!existsSync(gameDir)) {
      throw new Error("Game directory not found");
    }
    if (!existsSync(libDir)) {
      throw new Error("Library directory not found");
    }
    if (!existsSync(jreDir)) {
      throw new Error("JRE directory not found");
    }
    if (!existsSync(nativesDir)) {
      throw new Error("Natives directory not found");
    }

    // Build classpath from lib directory
    const libFiles = await readdir(libDir);
    const jarFiles = libFiles.filter((file) => file.endsWith(".jar"));
    const classpath = jarFiles
      .map((jar) => join(libDir, jar))
      .join(process.platform === "win32" ? ";" : ":");

    // Add core.jar to classpath
    const coreJarPath = join(gameDir, "core.jar");
    const fullClasspath =
      classpath + (process.platform === "win32" ? ";" : ":") + coreJarPath;

    // Determine platform-specific natives path
    let nativesPath: string;
    switch (process.platform) {
      case "win32":
        nativesPath = join(nativesDir, "win32", "x64");
        break;
      case "darwin":
        nativesPath = join(nativesDir, "darwin", "x64");
        break;
      case "linux":
        nativesPath = join(nativesDir, "linux", "x64");
        break;
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }

    // Find Java executable
    const javaExecutable =
      process.platform === "win32"
        ? join(jreDir, "bin", "java.exe")
        : join(jreDir, "bin", "java");

    if (!existsSync(javaExecutable)) {
      throw new Error(`Java executable not found at ${javaExecutable}`);
    }

    // Ensure Java executable has proper permissions
    await this.ensureExecutablePermissions(javaExecutable);
    await this.ensureJrePermissions(jreDir);

    // Calculate RAM allocation (default to 2GB if not specified)
    const ramAllocation = settings?.gameRamAllocation || 2;
    const maxHeap = `${ramAllocation * 1024}m`; // Convert GB to MB
    const minHeap = Math.min(512, ramAllocation * 512) + "m"; // Proportional min heap

    // Base Java arguments
    const javaArgs = [
      "-noverify",
      `-Xms${minHeap}`,
      `-Xmx${maxHeap}`,
      "-XX:+UnlockExperimentalVMOptions",
      "-XX:+UseG1GC",
      "-XX:G1NewSizePercent=20",
      "-XX:G1ReservePercent=20",
      "--add-exports",
      "java.desktop/sun.awt=ALL-UNNAMED",
      "-Djava.net.preferIPv4Stack=true",
      "-Dsun.awt.noerasebackground=true",
      "-Dsun.java2d.noddraw=true",
      "-Djogl.disable.openglarbcontext",
      `-Djava.library.path=${nativesPath}`,
    ];

    // Add developer mode extra arguments if provided
    if (settings?.devModeEnabled && settings?.devExtraJavaArgs) {
      const extraDevArgs = settings.devExtraJavaArgs
        .split(" ")
        .map((arg: string) => arg.trim())
        .filter((arg: string) => arg.length > 0);
      javaArgs.push(...extraDevArgs);
    }

    // Add classpath, main class, and any extra arguments
    javaArgs.push("-cp", fullClasspath, mainClass, ...extraArgs);

    // Use platform-specific launch approach
    switch (process.platform) {
      case "win32":
        await this.launchJavaProcessWindows(javaExecutable, javaArgs, gameDir);
        break;
      case "linux":
        await this.launchJavaProcessLinux(javaExecutable, javaArgs, gameDir);
        break;
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }

  private async launchJavaProcessWindows(
    javaExecutable: string,
    args: string[],
    cwd: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const javaCommand = `"${javaExecutable}" ${args.join(" ")}`;

      // Launch the Java process and immediately resolve (don't wait for process to exit)
      const childProcess = exec(javaCommand, { cwd }, (error) => {
        // Only log errors, don't reject on process exit
        if (error && !error.killed) {
          log.error("Java process error:", error);
        }
      });

      // Check if process started successfully
      if (childProcess.pid) {
        log.info(
          "Java process started successfully with PID:",
          childProcess.pid
        );
        resolve(); // Resolve immediately after successful start
      } else {
        reject(new Error("Failed to start Java process"));
      }
    });
  }

  private async launchJavaProcessLinux(
    javaExecutable: string,
    args: string[],
    cwd: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Ensure Java executable has proper permissions
      try {
        chmodSync(javaExecutable, 0o755);
      } catch (error) {
        log.warn(
          `Failed to set permissions on Java executable ${javaExecutable}:`,
          error
        );
      }

      const javaCommand = `"${javaExecutable}" ${args.join(" ")}`;

      // Launch the Java process and immediately resolve (don't wait for process to exit)
      const childProcess = exec(javaCommand, { cwd }, (error) => {
        // Only log errors, don't reject on process exit
        if (error && !error.killed) {
          log.error("Java process error:", error);
        }
      });

      // Check if process started successfully
      if (childProcess.pid) {
        log.info(
          "Java process started successfully with PID:",
          childProcess.pid
        );
        resolve(); // Resolve immediately after successful start
      } else {
        reject(new Error("Failed to start Java process"));
      }
    });
  }

  private async ensureExecutablePermissions(filePath: string): Promise<void> {
    try {
      // Check if file has execute permissions
      await access(filePath, constants.F_OK | constants.X_OK);
    } catch (error) {
      // File doesn't have execute permissions, set them
      try {
        // Add execute permissions for owner, group, and others
        await chmod(filePath, 0o755);
      } catch (chmodError) {
        throw new Error(
          `Failed to set execute permissions on ${filePath}: ${
            chmodError instanceof Error ? chmodError.message : "Unknown error"
          }`
        );
      }
    }
  }

  private async ensureJrePermissions(jreDir: string): Promise<void> {
    try {
      const binDir = join(jreDir, "bin");
      if (!existsSync(binDir)) {
        return; // No bin directory, skip
      }

      const binFiles = await readdir(binDir);

      // Set execute permissions on all files in bin directory
      for (const file of binFiles) {
        const filePath = join(binDir, file);
        const fileStat = await stat(filePath);

        if (fileStat.isFile()) {
          try {
            await this.ensureExecutablePermissions(filePath);
          } catch (error) {
            // Log error but don't fail the whole process for non-critical executables
            log.warn(`Failed to set permissions on ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      // Log error but don't fail the launch process
      log.warn("Failed to set JRE permissions:", error);
    }
  }

  private async cleanupObsoleteFiles(manifest: VersionManifest): Promise<void> {
    if (!existsSync(this.gameClientPath)) {
      return; // Nothing to clean up
    }

    try {
      // Get all files that should exist according to manifest
      const expectedFiles = this.getPlatformFiles(manifest);
      const expectedFilePaths = new Set(expectedFiles.map((f) => f.path));

      // Get all local files
      const localFiles = await this.getAllLocalFiles();

      // Find files to remove (local files not in manifest and not excluded)
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

      // Remove obsolete files
      for (const fileToRemove of filesToRemove) {
        try {
          const fullPath = join(this.gameClientPath, fileToRemove);
          await unlink(fullPath);
          log.info(`Removed obsolete file: ${fileToRemove}`);
        } catch (error) {
          log.warn(`Failed to remove file ${fileToRemove}:`, error);
        }
      }

      // Remove empty directories (but not excluded ones)
      for (const folder of foldersToCheck) {
        try {
          const fullPath = join(this.gameClientPath, folder);
          const folderContents = await readdir(fullPath);

          if (folderContents.length === 0) {
            await rmdir(fullPath);
            log.info(`Removed empty directory: ${folder}`);
          }
        } catch (error) {
          // Directory might not be empty or other issues - ignore
        }
      }
    } catch (error) {
      log.warn("Failed to cleanup obsolete files:", error);
      // Don't throw - cleanup failure shouldn't stop the download
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
        // Normalize path separators to match manifest format (forward slashes)
        const normalizedPath = relativePath.replace(/\\/g, "/");

        const entryStat = await stat(fullPath);

        if (entryStat.isDirectory()) {
          files.push(normalizedPath);
          // Recursively scan subdirectories
          await this.getAllLocalFiles(fullPath, relativeTo, files);
        } else if (entryStat.isFile()) {
          files.push(normalizedPath);
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible - ignore
    }

    return files;
  }

  private isExcludedFromCleanup(filePath: string): boolean {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, "/");

    for (const excluded of this.excludedFromCleanup) {
      const normalizedExcluded = excluded.replace(/\\/g, "/");

      // Exact match
      if (normalizedPath === normalizedExcluded) {
        return true;
      }

      // Check if file is inside an excluded directory
      if (normalizedPath.startsWith(normalizedExcluded + "/")) {
        return true;
      }
    }

    return false;
  }

  private getPlatformFiles(manifest: VersionManifest): FileManifest[] {
    const files: FileManifest[] = [...manifest.base];

    switch (process.platform) {
      case "win32":
        files.push(...manifest.windows);
        break;
      case "darwin":
        files.push(...manifest.macos);
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
      // Check if download was cancelled during file checking
      if (!this.downloadProgress.isDownloading) {
        return;
      }

      // Only update progress every 10 files to reduce UI spam
      if (i % 10 === 0) {
        this.downloadProgress.filesLoaded = i;
        // Show verification status instead of file path during checking
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

      // Yield control back to event loop every 5 files to prevent system hang
      if (i % 5 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    if (filesToDownload.length > 0) {
      await this.downloadFiles(filesToDownload);
    } else {
      // Even if no files to download, clean up obsolete files
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

    // Use p-queue for optimized concurrent downloads
    const queue = new PQueue({ concurrency: 3 });
    this.currentDownloadQueue = queue;

    // Set up queue event handlers
    queue.on("active", () => {
      // Update progress when a new download starts
      this.notifyRenderer("download-progress", this.downloadProgress);
    });

    queue.on("completed", () => {
      // This fires after each individual file completes
      // The actual file count is updated in downloadAndSaveFile
    });

    queue.on("error", (error) => {
      log.error("Download queue error:", error);
      this.downloadProgress.error = error.message;
      this.notifyRenderer("download-error", this.downloadProgress);
    });

    // Add all download tasks to the queue
    const downloadPromises = files.map((file) =>
      queue.add(() => this.downloadAndSaveFile(file), {
        priority: 1, // All files have same priority
      })
    );

    try {
      // Wait for all downloads to complete
      await Promise.all(downloadPromises);

      // Check if download was cancelled during execution
      if (!this.downloadProgress.isDownloading) {
        this.currentDownloadQueue = null;
        return;
      }

      // Clean up obsolete files after successful download
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
    // Check if download was cancelled before starting
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

      // Check if download was cancelled after fetch
      if (!this.downloadProgress.isDownloading) {
        throw new Error("Download cancelled");
      }

      // Ensure directory exists
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

      // Only notify every few files to reduce UI spam (throttling is also applied in notifyRenderer)
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

    // Write version.dat file
    writeFileSync(this.versionFilePath, this.versionManifest.version);

    this.downloadProgress = {
      filesTotal: this.downloadProgress.filesTotal,
      filesLoaded: this.downloadProgress.filesTotal,
      isDownloading: false,
      isRepairing: false,
    };

    this.notifyRenderer("download-complete", this.downloadProgress);
  }

  private notifyRenderer(event: string, data: any): void {
    // Throttle progress updates to prevent UI spam (max once per 100ms)
    if (event === "download-progress") {
      const now = Date.now();
      if (now - this.lastProgressNotification < 100) {
        return; // Skip this update
      }
      this.lastProgressNotification = now;
    }

    const windows = BrowserWindow.getAllWindows();
    windows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(`game:${event}`, data);
      }
    });
  }
}

export function createGameClientModule(environment?: string) {
  return new GameClientModule(environment);
}
