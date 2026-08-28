import { app, ipcMain } from "electron";
import { join } from "path";
import { chmodSync, existsSync, mkdirSync } from "fs";
import { appendFile, chmod, readdir, readFile, stat } from "fs/promises";
import { spawn } from "child_process";
import log from "electron-log";
import {
  GameSettings,
  GameUpdater,
  ReplayFile,
  getPlatformManifestEntry,
} from "./GameUpdater.js";
import type { AppModule } from "../AppModule.js";
import type { ModuleContext } from "../ModuleContext.js";

const splitCommandLineArgs = (argsString: string): string[] => {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let hasContent = false;

  for (let index = 0; index < argsString.length; index += 1) {
    const character = argsString[index];

    if (quote) {
      if (character === quote) {
        quote = null;
      } else if (
        character === "\\" &&
        argsString[index + 1] !== undefined &&
        (argsString[index + 1] === quote || argsString[index + 1] === "\\")
      ) {
        current += argsString[index + 1];
        index += 1;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      hasContent = true;
    } else if (/\s/.test(character)) {
      if (hasContent) {
        args.push(current);
        current = "";
        hasContent = false;
      }
    } else {
      current += character;
      hasContent = true;
    }
  }

  if (hasContent) args.push(current);
  return args;
};

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
      this.openReplaysFolder(),
    );
    ipcMain.handle("gameClient:listReplays", () => this.listReplays());
    ipcMain.handle("gameClient:launchReplayOffline", (_e, path) =>
      this.launchReplayOffline(path),
    );
    ipcMain.handle("gameClient:getGameArgumentsDescriptor", () =>
      this.getGameArgumentsDescriptor(),
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
        }`,
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
      "config.properties",
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
        "\nproxyGroup_2=Localhost\nproxyAddresses_2=localhost:5555\n",
      );
      await appendFile(
        gameConfigPath,
        "\nproxyGroup_3=Staging\nproxyAddresses_3=minuit-staging.arenareturns.com:6666\n",
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
    const fullGameArgs = [
      ...(this.currentSettings?.devGameArgs
        ? splitCommandLineArgs(this.currentSettings.devGameArgs).map(
            (arg) => `-${arg}`,
          )
        : []),
      ...extraArgs,
    ];
    const gameDir = join(this.gameClientPath, "game");
    const libDir = join(this.gameClientPath, "lib");
    const jreDir = join(this.gameClientPath, "jre");
    const nativesDir = join(this.gameClientPath, "natives");

    if (!existsSync(gameDir)) throw new Error("Game directory not found");
    if (!existsSync(jreDir)) throw new Error("JRE directory not found");

    const coreJarPath = join(gameDir, "core.jar");
    // FIXME: Gigahack since darwin relies on wine
    const classpathSeparator =
      process.platform === "win32" || process.platform === "darwin" ? ";" : ":";
    const libCP = existsSync(libDir)
      ? (await readdir(libDir))
        .filter((file) => file.endsWith(".jar"))
        .map((jar) => join(libDir, jar))
      : [];

    const fullClasspath = [
      ...libCP,

      join(nativesDir, "*"), //pseudo-natives library in jar format; needs to be passed to the cp
      join(nativesDir, getPlatformManifestEntry(), "*"),

      coreJarPath,
    ].join(classpathSeparator);

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
      "-XX:ReservedCodeCacheSize=256m",
      "--add-exports",
      "java.desktop/sun.awt=ALL-UNNAMED",
      "--enable-native-access=ALL-UNNAMED",
      "-Djava.net.preferIPv4Stack=true",
      "-Dsun.java2d.dpiaware=false",
      "-Dsun.java2d.uiScale=1.0",
      "-Djogl.disable.openglarbcontext=1",
      "--sun-misc-unsafe-memory-access=allow"
    ];

    if (settings?.devModeEnabled && settings?.devExtraJavaArgs) {
      javaArgs.push(
        ...splitCommandLineArgs(settings.devExtraJavaArgs),
      );
    }

    javaArgs.push("-cp", fullClasspath, mainClass, ...fullGameArgs);

    log.info("Launching game with ", javaArgs, "in", gameDir, "and exe", javaExecutable)

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
    cwd: string,
  ): Promise<void> {
    return this.spawnJavaProcess(javaExecutable, args, cwd);
  }

  private async launchJavaProcessLinux(
    javaExecutable: string,
    args: string[],
    cwd: string,
  ): Promise<void> {
    try {
      chmodSync(javaExecutable, 0o755);
    } catch (error) {
      log.warn(
        `Failed to set permissions on Java executable ${javaExecutable}:`,
        error,
      );
    }

    return this.spawnJavaProcess(javaExecutable, args, cwd);
  }

  private async launchJavaProcessDarwin(
    javaExecutable: string,
    args: string[],
    cwd: string,
  ): Promise<void> {
    try {
      chmodSync(javaExecutable, 0o755);
    } catch (error) {
      log.warn(
        `Failed to set permissions on Java executable ${javaExecutable}:`,
        error,
      );
    }

    // Ensure we have the full system PATH for finding wine
    const env = { ...process.env };
    if (!env.PATH?.includes("/opt/homebrew/bin")) {
      env.PATH = `${
        env.PATH || ""
      }:/opt/homebrew/bin:/usr/local/bin:/opt/local/bin`;
    }

    return this.spawnJavaProcess("wine", [javaExecutable, ...args], cwd, env);
  }

  private spawnJavaProcess(
    executable: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { cwd, env, stdio: "ignore" });

      child.once("error", reject);
      child.once("spawn", resolve);
      child.once("exit", (code, signal) => {
        if (code !== 0) {
          log.error(
            `Java process exited with code ${code ?? "unknown"}` +
              (signal ? ` (signal: ${signal})` : ""),
          );
        }
      });
    });
  }

  async getGameArgumentsDescriptor(): Promise<any> {
    try {
      let schemaPath = join(this.gameClientPath, "game", "args");
      if (existsSync(schemaPath)) {
        log.info("Loading arguments descriptor from", schemaPath);
        const content = await readFile(schemaPath, "utf-8");
        return JSON.parse(content);
      }
      log.info("Arguments descriptor not found at", schemaPath);
      return null;
    } catch (error) {
      log.error("Failed to load arguments descriptor:", error);
      return null;
    }
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
