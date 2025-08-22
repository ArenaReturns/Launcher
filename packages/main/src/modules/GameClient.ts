import { ipcMain, app } from "electron";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { chmodSync } from "fs";
import { stat, chmod, readdir, readFile, appendFile } from "fs/promises";
import { exec } from "child_process";
import log from "electron-log";
import { GameUpdater, GameSettings, ReplayFile } from "./GameUpdater.js";
import type { AppModule } from "../AppModule.js";
import type { ModuleContext } from "../ModuleContext.js";

export class GameClient implements AppModule {
  private gameUpdater: GameUpdater | null = null;
  private gameClientPath: string;
  private currentSettings: GameSettings | null = null;

  constructor(environment?: string) {
    this.gameClientPath = join(app.getPath("appData"), "ArenaReturnsClient");
  }

  setGameUpdater(gameUpdater: GameUpdater): void {
    this.gameUpdater = gameUpdater;
  }

  async enable(context: ModuleContext): Promise<void> {
    log.info("GameClient module enabled with settings:", context.settings);

    // Store current settings
    this.currentSettings = context.settings;

    // Register GameClient-specific IPC handlers
    ipcMain.handle("gameClient:launchGame", () => this.launchGame());
    ipcMain.handle("gameClient:openReplaysFolder", () =>
      this.openReplaysFolder()
    );
    ipcMain.handle("gameClient:listReplays", () => this.listReplays());
    ipcMain.handle("gameClient:launchReplayOffline", (_e, path) =>
      this.launchReplayOffline(path)
    );
  }

  onSettingsUpdate(settings: GameSettings): void {
    log.debug("GameClient received settings update:", settings);
    this.currentSettings = settings;
  }

  getCurrentSettings(): GameSettings | null {
    return this.currentSettings;
  }

  async launchGame(): Promise<void> {
    if (!this.gameUpdater) {
      throw new Error("GameUpdater not available");
    }

    const gameStatus = await this.gameUpdater.getGameStatus();

    if (!gameStatus.isInstalled) {
      throw new Error("Game is not installed");
    }

    if (gameStatus.needsUpdate) {
      throw new Error("Game needs to be updated before launching");
    }

    if (gameStatus.error) {
      throw new Error(`Cannot launch game: ${gameStatus.error}`);
    }

    // Check if dev mode is enabled and update config.properties if needed
    if (this.currentSettings?.devModeEnabled) {
      await this.ensureDevModeProxy();
    }

    await this.startJavaProcess({
      mainClass: "com.ankamagames.dofusarena.client.DofusArenaClient",
      settings: this.currentSettings || undefined,
      extraArgs: [
        "-ONLY_ALLOWED_TEAM_TAB=1",
        "-ONLY_ALLOWED_LADDER_TAB=ONE_VS_ONE",
      ],
    });
  }

  async openReplaysFolder(): Promise<void> {
    const { shell } = await import("electron");
    const replaysPath = join(this.gameClientPath, "game", "replays");

    mkdirSync(replaysPath, { recursive: true });

    try {
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
    const { readdir } = await import("fs/promises");
    mkdirSync(replaysPath, { recursive: true });

    try {
      const files = await readdir(replaysPath);
      const replayFiles: ReplayFile[] = [];

      for (const filename of files) {
        if (!filename.toLowerCase().endsWith(".rda")) continue;
        const fullPath = join(replaysPath, filename);
        replayFiles.push(this.parseReplayFilename(filename, fullPath));
      }

      replayFiles.sort((a, b) => {
        if (a.date && b.date) return b.date.getTime() - a.date.getTime();
        if (a.date) return -1;
        if (b.date) return 1;
        return a.filename.localeCompare(b.filename);
      });

      return replayFiles;
    } catch (error) {
      log.error("Failed to list replays:", error);
      return [];
    }
  }

  async launchReplayOffline(replayPath: string): Promise<void> {
    // Only check if game is installed locally, no CDN check
    const gameDir = join(this.gameClientPath, "game");
    const coreJarPath = join(gameDir, "core.jar");

    if (!existsSync(gameDir) || !existsSync(coreJarPath)) {
      throw new Error("Game is not installed");
    }

    if (!existsSync(replayPath)) {
      throw new Error("Replay file not found");
    }

    await this.startJavaProcess({
      mainClass: "com.ankamagames.dofusarena.client.DofusArenaReplayPlayer",
      settings: this.currentSettings || undefined,
      extraArgs: [`-REPLAY_FILE_PATH=${replayPath}`],
    });
  }

  // ---------------- Private helpers ----------------
  private async ensureDevModeProxy(): Promise<void> {
    const gameConfigPath = join(
      this.gameClientPath,
      "game",
      "config.properties"
    );

    try {
      // Check if config.properties exists
      if (!existsSync(gameConfigPath)) {
        return;
      }

      // Read the file contents
      const configContent = await readFile(gameConfigPath, "utf-8");

      // Check if it already contains "localhost"
      if (configContent.includes("localhost")) {
        return;
      }

      // Append the dev mode proxy settings
      log.info("Adding dev mode proxy settings to config.properties");
      await appendFile(
        gameConfigPath,
        "\nproxyGroup_2=Localhost\nproxyAddresses_2=localhost:5555\n"
      );
      await appendFile(
        gameConfigPath,
        "\nproxyGroup_3=Staging\nproxyAddresses_3=minuit-staging.arenareturns.com:6666\n"
      );
    } catch (error) {
      log.error("Failed to update config.properties for dev mode:", error);
      // Don't throw error as this shouldn't prevent game launch
    }
  }

  private async startJavaProcess(options: {
    mainClass: string;
    settings?: GameSettings;
    extraArgs?: string[];
  }): Promise<void> {
    const { mainClass, settings, extraArgs = [] } = options;
    const gameDir = join(this.gameClientPath, "game");
    const libDir = join(this.gameClientPath, "lib");
    const jreDir = join(this.gameClientPath, "jre");
    const nativesDir = join(this.gameClientPath, "natives");

    if (!existsSync(gameDir)) throw new Error("Game directory not found");
    if (!existsSync(libDir)) throw new Error("Library directory not found");
    if (!existsSync(jreDir)) throw new Error("JRE directory not found");
    if (!existsSync(nativesDir)) throw new Error("Natives directory not found");

    const libFiles = (await readdir(libDir)).filter((f) => f.endsWith(".jar"));
    // FIXME: Gigahack since darwin relies on wine
    const classpath = libFiles
      .map((jar) => join(libDir, jar))
      .join(
        process.platform === "win32" || process.platform === "darwin"
          ? ";"
          : ":"
      );
    const coreJarPath = join(gameDir, "core.jar");
    // FIXME: Gigahack since darwin relies on wine
    const fullClasspath =
      classpath +
      (process.platform === "win32" || process.platform === "darwin"
        ? ";"
        : ":") +
      coreJarPath;

    let nativesPath: string;
    switch (process.platform) {
      case "win32":
        nativesPath = join(nativesDir, "win32", "x64");
        break;
      case "darwin":
        nativesPath = join(nativesDir, "win32", "x64");
        // FIXME: Native macos build not yet available
        // nativesPath = join(nativesDir, "darwin", "universal");
        break;
      case "linux":
        nativesPath = join(nativesDir, "linux", "x64");
        break;
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }

    let javaExecutable: string;
    switch (process.platform) {
      case "win32":
        javaExecutable = join(jreDir, "bin", "java.exe");
        break;
      case "darwin":
        javaExecutable = join(jreDir, "bin", "java.exe");
        // FIXME: Native macos build not yet available
        // javaExecutable = join(jreDir, "Contents", "Home", "bin", "java");
        break;
      default:
        javaExecutable = join(jreDir, "bin", "java");
        break;
    }

    if (!existsSync(javaExecutable)) {
      throw new Error(`Java executable not found at ${javaExecutable}`);
    }

    await this.ensureExecutablePermissions(javaExecutable);
    await this.ensureJrePermissions(jreDir);

    const ramAllocation = settings?.gameRamAllocation || 2;
    const maxHeap = `${ramAllocation * 1024}m`;
    const minHeap = Math.min(512, ramAllocation * 512) + "m";

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
      "-Dsun.java2d.dpiaware=false",
      "-Dsun.java2d.uiScale=1.0",
      "-Djogl.disable.openglarbcontext",
      `-Djava.library.path="${nativesPath}"`,
    ];

    if (settings?.devModeEnabled && settings?.devExtraJavaArgs) {
      javaArgs.push(
        ...settings.devExtraJavaArgs
          .split(" ")
          .map((arg) => arg.trim())
          .filter((arg) => arg.length > 0)
      );
    }

    javaArgs.push("-cp", `"${fullClasspath}"`, mainClass, ...extraArgs);

    switch (process.platform) {
      case "win32":
        await this.launchJavaProcessWindows(javaExecutable, javaArgs, gameDir);
        break;
      case "linux":
        await this.launchJavaProcessLinux(javaExecutable, javaArgs, gameDir);
        break;
      case "darwin":
        await this.launchJavaProcessDarwin(javaExecutable, javaArgs, gameDir);
        break;
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }

  private async ensureExecutablePermissions(filePath: string): Promise<void> {
    try {
      await chmod(filePath, 0o755);
    } catch {
      /* ignore */
    }
  }

  private async ensureJrePermissions(jreDir: string): Promise<void> {
    let binDir: string;
    if (process.platform === "darwin") {
      return;
      // FIXME: Native macos build not yet available
      // binDir = join(jreDir, "Contents", "Home", "bin");
    } else {
      binDir = join(jreDir, "bin");
    }

    if (!existsSync(binDir)) return;
    const binFiles = await readdir(binDir);
    for (const file of binFiles) {
      const filePath = join(binDir, file);
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) {
        try {
          await this.ensureExecutablePermissions(filePath);
        } catch (error) {
          log.warn(`Failed to set permissions on ${filePath}:`, error);
        }
      }
    }
  }

  private async launchJavaProcessWindows(
    javaExecutable: string,
    args: string[],
    cwd: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = exec(
        `"${javaExecutable}" ${args.join(" ")}`,
        { cwd },
        (error) => {
          if (error && !error.killed) {
            log.error("Java process error:", error);
          }
        }
      );
      if (child.pid) {
        resolve();
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
      try {
        chmodSync(javaExecutable, 0o755);
      } catch (error) {
        log.warn(
          `Failed to set permissions on Java executable ${javaExecutable}:`,
          error
        );
      }
      const child = exec(
        `"${javaExecutable}" ${args.join(" ")}`,
        { cwd },
        (error) => {
          if (error && !error.killed) {
            log.error("Java process error:", error);
          }
        }
      );
      if (child.pid) {
        resolve();
      } else {
        reject(new Error("Failed to start Java process"));
      }
    });
  }

  private async launchJavaProcessDarwin(
    javaExecutable: string,
    args: string[],
    cwd: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        chmodSync(javaExecutable, 0o755);
      } catch (error) {
        log.warn(
          `Failed to set permissions on Java executable ${javaExecutable}:`,
          error
        );
      }

      // Ensure we have the full system PATH for finding wine
      const env = { ...process.env };
      if (!env.PATH?.includes("/opt/homebrew/bin")) {
        env.PATH = `${
          env.PATH || ""
        }:/opt/homebrew/bin:/usr/local/bin:/opt/local/bin`;
      }

      const child = exec(
        `wine "${javaExecutable}" ${args.join(" ")}`,
        { cwd, env },
        (error) => {
          if (error && !error.killed) {
            log.error("Java process error:", error);
          }
        }
      );
      if (child.pid) {
        resolve();
      } else {
        reject(new Error("Failed to start Java process"));
      }
    });
  }

  private parseReplayFilename(filename: string, fullPath: string): ReplayFile {
    const replayFile: ReplayFile = {
      filename,
      fullPath,
      isValidFormat: false,
    } as ReplayFile;

    try {
      const nameWithoutExt = filename.replace(/\.rda$/i, "");
      const parts = nameWithoutExt.split("_");

      if (parts.length >= 3) {
        let datePartIndex = -1;
        let datePart = "";
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].length === 10 && /^\d{10}$/.test(parts[i])) {
            datePartIndex = i;
            datePart = parts[i];
            break;
          }
        }
        if (datePartIndex >= 0 && datePart.length === 10) {
          const year = 2000 + parseInt(datePart.substring(0, 2));
          const month = parseInt(datePart.substring(2, 4)) - 1;
          const day = parseInt(datePart.substring(4, 6));
          const hour = parseInt(datePart.substring(6, 8));
          const minute = parseInt(datePart.substring(8, 10));
          const date = new Date(year, month, day, hour, minute);
          const now = new Date();
          if (!isNaN(date.getTime()) && date <= now) {
            replayFile.date = date;
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
      log.warn(`Failed to parse replay filename ${filename}:`, error);
    }
    return replayFile;
  }
}

export function createGameClientModule(environment?: string) {
  return new GameClient(environment);
}
